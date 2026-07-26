import pandas as pd
import numpy as np
import joblib
import os
import hashlib
import json
from datetime import datetime
from firebase_admin import firestore
from services.firebase import get_db
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score,
    accuracy_score,
    classification_report,
    confusion_matrix
)
from imblearn.over_sampling import SMOTE

db = get_db()

# ─────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────
MODELS_DIR = 'ml/trained_models'
DATASET_PATH = 'ml/sample_dataset.csv'

METADATA_COLS = [
    'Flow ID', 'Src IP', 'Dst IP',
    'Src Port', 'Dst Port', 'Protocol',
    'Timestamp', 'Label',
    'src_ip', 'dst_ip', 'src_port',
    'dst_port', 'protocol', 'timestamp',
    'label', 'flow_id'
]

os.makedirs(MODELS_DIR, exist_ok=True)

# ─────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────

def load_dataset(dataset_path):
    print(f"Loading dataset from {dataset_path}...")

    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    df = pd.read_csv(dataset_path)
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

    return df

# ─────────────────────────────────────────
# DATA CLEANING
# ─────────────────────────────────────────

def clean_dataset(df):
    print("\nCleaning dataset...")
    original = len(df)

    df.columns = df.columns.str.strip()
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna()
    df = df.drop_duplicates()

    feature_cols = [c for c in df.columns if c not in METADATA_COLS]

    for col in feature_cols:
        try:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            df[col] = df[col].clip(lower=0)
        except Exception:
            pass

    df = df.dropna()

    print(f"Before: {original} rows")
    print(f"After:  {len(df)} rows")
    print(f"Removed: {original - len(df)} rows")

    return df

# ─────────────────────────────────────────
# FEATURE PREPARATION
# ─────────────────────────────────────────

def prepare_features(df):
    """
    Separates features from labels
    Fits a StandardScaler (saved alongside the model so agent-side
    inference applies the identical transform)
    Handles class imbalance with SMOTE
    """
    print("\nPreparing features...")

    label_col = None
    for col in ['Label', 'label']:
        if col in df.columns:
            label_col = col
            break

    if label_col is None:
        raise ValueError("No label column found in dataset")

    feature_cols = [c for c in df.columns if c not in METADATA_COLS]

    X = df[feature_cols]
    y = df[label_col]

    print(f"Features: {len(feature_cols)}")
    print(f"Samples: {len(X)}")
    print(f"\nClass distribution:")
    print(y.value_counts())

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    X_scaled = pd.DataFrame(X_scaled, columns=feature_cols, index=X.index)

    le = LabelEncoder()
    y_encoded = le.fit_transform(y)

    print(f"\nEncoded classes: {list(le.classes_)}")

    min_samples = y.value_counts().min()

    if min_samples >= 6:
        print("\nApplying SMOTE for class balancing...")
        try:
            smote = SMOTE(
                random_state=42,
                k_neighbors=min(5, min_samples - 1)
            )
            X_resampled, y_resampled = smote.fit_resample(X_scaled, y_encoded)
            print(f"After SMOTE: {len(X_resampled)} samples")
        except Exception as e:
            print(f"SMOTE failed: {e} — using original data")
            X_resampled = X_scaled
            y_resampled = y_encoded
    else:
        print("Not enough samples for SMOTE — using original data")
        X_resampled = X_scaled
        y_resampled = y_encoded

    return X_resampled, y_resampled, le, scaler, feature_cols

# ─────────────────────────────────────────
# MODEL TRAINING
# ─────────────────────────────────────────

def train_model(X_train, y_train):
    print("\nTraining Random Forest model...")
    print("This may take a few minutes...")

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'
    )

    model.fit(X_train, y_train)
    print("Training complete")

    return model

# ─────────────────────────────────────────
# MODEL EVALUATION
# ─────────────────────────────────────────

def evaluate_model(model, X_test, y_test, le):
    print("\nEvaluating model...")

    y_pred = model.predict(X_test)

    metrics = {
        'accuracy': float(accuracy_score(y_test, y_pred)),
        'f1': float(f1_score(y_test, y_pred, average='weighted')),
        'precision': float(precision_score(
            y_test, y_pred, average='weighted', zero_division=0
        )),
        'recall': float(recall_score(
            y_test, y_pred, average='weighted', zero_division=0
        ))
    }

    print("\n" + "=" * 50)
    print("Model Performance")
    print("=" * 50)
    print(f"Accuracy:  {metrics['accuracy']:.4f}")
    print(f"F1 Score:  {metrics['f1']:.4f}")
    print(f"Precision: {metrics['precision']:.4f}")
    print(f"Recall:    {metrics['recall']:.4f}")
    print("=" * 50)

    print("\nDetailed Classification Report:")
    print(classification_report(
        y_test, y_pred, target_names=le.classes_, zero_division=0
    ))

    return metrics

# ─────────────────────────────────────────
# MODEL SAVING
# ─────────────────────────────────────────

def compute_checksum(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def get_next_version(triggered_by='auto'):
    """
    Computes the next model version, its lineage, and its S3 key.

    - 'auto' (periodic system retrain): starts a brand new lineage,
      stored at the top level: models/v{N}.0/bundle.zip
    - 'manual' (admin-triggered retrain): patches the CURRENT lineage,
      nested under it: models/v{N}.0/v{N}.{M}/bundle.zip
    """
    prod = db.collection('model_versions').where(
        filter=firestore.FieldFilter('is_production', '==', True)
    ).get()

    if not prod:
        return {
            'version': 'v1.0',
            'lineage': 'v1.0',
            's3_key': 'models/v1.0/bundle.zip'
        }

    current = prod[0].to_dict()
    lineage = current.get('lineage', current['version'])
    lineage_major = int(lineage.lstrip('v').split('.')[0])

    if triggered_by == 'auto':
        new_lineage = f"v{lineage_major + 1}.0"
        return {
            'version': new_lineage,
            'lineage': new_lineage,
            's3_key': f'models/{new_lineage}/bundle.zip'
        }

    existing = db.collection('model_versions').where(
        filter=firestore.FieldFilter('lineage', '==', lineage)
    ).get()

    minor_nums = [0]
    for doc in existing:
        try:
            minor_nums.append(int(doc.to_dict()['version'].split('.')[-1]))
        except ValueError:
            pass

    next_minor = max(minor_nums) + 1
    new_version = f"v{lineage_major}.{next_minor}"

    return {
        'version': new_version,
        'lineage': lineage,
        's3_key': f'models/{lineage}/{new_version}/bundle.zip'
    }

def save_model(model, le, scaler, feature_cols, metrics, version):
    """
    Saves the full model bundle (model + scaler + label encoder +
    feature names) to disk, using the exact filenames the agent's
    TrafficClassifier.load_bundle() expects.
    """
    version_dir = os.path.join(MODELS_DIR, version)
    os.makedirs(version_dir, exist_ok=True)

    model_path = os.path.join(version_dir, 'ids_model_v1.pkl')
    joblib.dump(model, model_path)

    scaler_path = os.path.join(version_dir, 'scaler.pkl')
    joblib.dump(scaler, scaler_path)

    encoder_path = os.path.join(version_dir, 'label_encoder.pkl')
    joblib.dump(le, encoder_path)

    features_path = os.path.join(version_dir, 'feature_names.npy')
    np.save(features_path, np.array(feature_cols, dtype=str))

    checksum = compute_checksum(model_path)

    metadata = {
        'version': version,
        'trained_at': datetime.utcnow().isoformat(),
        'metrics': metrics,
        'feature_count': len(feature_cols),
        'checksum': checksum,
        'model_path': model_path,
        'scaler_path': scaler_path,
        'encoder_path': encoder_path,
        'features_path': features_path
    }

    metadata_path = os.path.join(version_dir, 'metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nModel bundle saved to {version_dir}")
    print(f"Checksum: {checksum}")

    return version_dir, checksum, metadata

# ─────────────────────────────────────────
# SCHEMA ALIGNMENT (for warm-start on new logs)
# ─────────────────────────────────────────

def align_new_logs_to_bundle_schema(df, feature_names):
    """
    Mirrors agent/features/extractor.py's align_to_model_schema().
    New logs coming from the agent's fallback extractor use 'Dst Port'
    and lack the duplicate 'Fwd Header Length.1' column — align them
    to match the production bundle's exact feature schema.
    """
    df = df.rename(columns={'Dst Port': 'Destination Port'})

    if 'Fwd Header Length' in df.columns and 'Fwd Header Length.1' not in df.columns:
        df['Fwd Header Length.1'] = df['Fwd Header Length']

    missing = [f for f in feature_names if f not in df.columns]
    if missing:
        raise ValueError(f"New logs missing required features: {missing}")

    return df[list(feature_names)]

# ─────────────────────────────────────────
# WARM-START RETRAINING
# ─────────────────────────────────────────

def warm_start_retrain(bundle_dir, new_df, n_new_trees=30):
    """
    Grows the CURRENT production forest with new trees trained only
    on new, cleaned log data. Existing trees are never retouched —
    this is a true "A + B = C" update, not a fresh retrain.

    Reuses the existing scaler/label_encoder/feature_names UNCHANGED,
    since warm-started trees must live in the identical feature/label
    space as the trees already in the forest.
    """
    model = joblib.load(os.path.join(bundle_dir, 'ids_model_v1.pkl'))
    scaler = joblib.load(os.path.join(bundle_dir, 'scaler.pkl'))
    le = joblib.load(os.path.join(bundle_dir, 'label_encoder.pkl'))
    feature_names = np.load(
        os.path.join(bundle_dir, 'feature_names.npy'), allow_pickle=True
    ).astype(str)

    label_col = 'Label' if 'Label' in new_df.columns else 'label'

    known_labels = set(le.classes_)
    unknown = set(new_df[label_col].unique()) - known_labels
    if unknown:
        print(f"WARNING: dropping {len(unknown)} label(s) the current "
              f"model doesn't know: {unknown} — these need a full "
              f"retrain (not warm-start) to be learned")
        new_df = new_df[new_df[label_col].isin(known_labels)]

    if len(new_df) < 20:
        raise ValueError(
            f"Only {len(new_df)} usable new-log rows with known labels "
            f"— not enough to warm-start safely"
        )

    X_new = align_new_logs_to_bundle_schema(new_df, feature_names)
    y_new = new_df[label_col]

    X_scaled = scaler.transform(X_new)
    y_encoded = le.transform(y_new)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_encoded,
        test_size=0.2,
        random_state=42,
        stratify=y_encoded if len(set(y_encoded)) > 1 else None
    )

    print(f"\nWarm-starting: current forest has {model.n_estimators} trees")
    model.set_params(warm_start=True, n_estimators=model.n_estimators + n_new_trees)
    model.fit(X_train, y_train)
    print(f"Forest grown to {model.n_estimators} trees "
          f"(+{n_new_trees} new, existing trees unchanged)")

    metrics = evaluate_model(model, X_test, y_test, le)

    return model, scaler, le, list(feature_names), metrics

# ─────────────────────────────────────────
# MAIN TRAINING PIPELINE (fresh, from-scratch training)
# ─────────────────────────────────────────

def run_training_pipeline(
    dataset_path=DATASET_PATH,
    version=None,
    triggered_by='auto'
):
    """
    Full training pipeline
    Load → Clean → Prepare → Train → Evaluate → Save
    """
    print("=" * 50)
    print("IntelliSense IDS — Model Training Pipeline")
    print("=" * 50)

    start_time = datetime.utcnow()

    df = load_dataset(dataset_path)
    df = clean_dataset(df)

    if len(df) == 0:
        raise ValueError("No data remaining after cleaning")

    X, y, le, scaler, feature_cols = prepare_features(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    print(f"\nTrain samples: {len(X_train)}")
    print(f"Test samples:  {len(X_test)}")

    model = train_model(X_train, y_train)
    metrics = evaluate_model(model, X_test, y_test, le)

    lineage = version
    if version is None:
        version_info = get_next_version(triggered_by=triggered_by)
        version = version_info['version']
        lineage = version_info['lineage']

    print(f"\nModel version: {version}")

    bundle_dir, checksum, metadata = save_model(
        model, le, scaler, feature_cols, metrics, version
    )

    duration = (datetime.utcnow() - start_time).seconds

    print("\n" + "=" * 50)
    print("Training Pipeline Complete")
    print("=" * 50)
    print(f"Version:   {version}")
    print(f"F1 Score:  {metrics['f1']:.4f}")
    print(f"Accuracy:  {metrics['accuracy']:.4f}")
    print(f"Duration:  {duration} seconds")
    print(f"Saved to:  {bundle_dir}")
    print("=" * 50)

    return {
        'version': version,
        'lineage': lineage,
        'metrics': metrics,
        'bundle_dir': bundle_dir,
        'checksum': checksum,
        'duration': duration
    }

if __name__ == "__main__":
    from ml.create_sample_dataset import create_sample_dataset
    create_sample_dataset(n_samples=5000, output_path=DATASET_PATH)

    result = run_training_pipeline()
    print(f"\nTraining result: {result}")