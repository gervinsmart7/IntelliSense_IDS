import pandas as pd
import numpy as np
import joblib
import os
import hashlib
import json
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score,
    accuracy_score,
    classification_report,
    confusion_matrix
)
from imblearn.over_sampling import SMOTE

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
    """
    Loads and validates dataset
    """
    print(f"Loading dataset from {dataset_path}...")

    if not os.path.exists(dataset_path):
        raise FileNotFoundError(
            f"Dataset not found: {dataset_path}"
        )

    df = pd.read_csv(dataset_path)
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

    return df

# ─────────────────────────────────────────
# DATA CLEANING
# ─────────────────────────────────────────

def clean_dataset(df):
    """
    Full cleaning pipeline for training data
    """
    print("\nCleaning dataset...")
    original = len(df)

    # Clean column names
    df.columns = df.columns.str.strip()

    # Replace infinite values
    df = df.replace([np.inf, -np.inf], np.nan)

    # Drop nulls
    df = df.dropna()

    # Remove duplicates
    df = df.drop_duplicates()

    # Fix negative values in numeric columns
    feature_cols = [
        c for c in df.columns
        if c not in METADATA_COLS
    ]

    for col in feature_cols:
        try:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            df[col] = df[col].clip(lower=0)
        except Exception:
            pass

    # Drop nulls again after type conversion
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
    Handles class imbalance with SMOTE
    """
    print("\nPreparing features...")

    # Get label column
    label_col = None
    for col in ['Label', 'label']:
        if col in df.columns:
            label_col = col
            break

    if label_col is None:
        raise ValueError("No label column found in dataset")

    # Get feature columns
    feature_cols = [
        c for c in df.columns
        if c not in METADATA_COLS
    ]

    X = df[feature_cols]
    y = df[label_col]

    print(f"Features: {len(feature_cols)}")
    print(f"Samples: {len(X)}")
    print(f"\nClass distribution:")
    print(y.value_counts())

    # Encode labels
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)

    print(f"\nEncoded classes: {list(le.classes_)}")

    # Handle class imbalance with SMOTE
    # Only if minority class has enough samples
    min_samples = y.value_counts().min()

    if min_samples >= 6:
        print("\nApplying SMOTE for class balancing...")
        try:
            smote = SMOTE(
                random_state=42,
                k_neighbors=min(5, min_samples - 1)
            )
            X_resampled, y_resampled = smote.fit_resample(
                X, y_encoded
            )
            print(f"After SMOTE: {len(X_resampled)} samples")
        except Exception as e:
            print(f"SMOTE failed: {e} — using original data")
            X_resampled = X
            y_resampled = y_encoded
    else:
        print("Not enough samples for SMOTE — using original data")
        X_resampled = X
        y_resampled = y_encoded

    return X_resampled, y_resampled, le, feature_cols

# ─────────────────────────────────────────
# MODEL TRAINING
# ─────────────────────────────────────────

def train_model(X_train, y_train):
    """
    Trains Random Forest classifier
    """
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
    """
    Evaluates model performance
    Returns metrics dictionary
    """
    print("\nEvaluating model...")

    y_pred = model.predict(X_test)

    metrics = {
        'accuracy': float(accuracy_score(y_test, y_pred)),
        'f1': float(f1_score(
            y_test, y_pred, average='weighted'
        )),
        'precision': float(precision_score(
            y_test, y_pred,
            average='weighted',
            zero_division=0
        )),
        'recall': float(recall_score(
            y_test, y_pred,
            average='weighted',
            zero_division=0
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

    # Detailed classification report
    print("\nDetailed Classification Report:")
    print(classification_report(
        y_test, y_pred,
        target_names=le.classes_,
        zero_division=0
    ))

    return metrics

# ─────────────────────────────────────────
# MODEL SAVING
# ─────────────────────────────────────────

def compute_checksum(filepath):
    """
    Computes SHA256 checksum of model file
    Used for integrity verification
    when agents download the model
    """
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def get_next_version():
    """
    Generates next model version number
    Checks existing versions in directory
    """
    existing = [
        d for d in os.listdir(MODELS_DIR)
        if os.path.isdir(os.path.join(MODELS_DIR, d))
        and d.startswith('v')
    ]

    if not existing:
        return 'v1.0'

    versions = []
    for v in existing:
        try:
            num = float(v[1:])
            versions.append(num)
        except Exception:
            pass

    if not versions:
        return 'v1.0'

    next_num = max(versions) + 1.0
    return f'v{next_num:.1f}'

def save_model(model, le, feature_cols, metrics, version):
    """
    Saves model and metadata to disk
    """
    version_dir = os.path.join(MODELS_DIR, version)
    os.makedirs(version_dir, exist_ok=True)

    # Save model
    model_path = os.path.join(
        version_dir,
        f'ids_model_{version}.pkl'
    )
    joblib.dump(model, model_path)

    # Save label encoder
    encoder_path = os.path.join(
        version_dir,
        'label_encoder.pkl'
    )
    joblib.dump(le, encoder_path)

    # Save feature columns
    features_path = os.path.join(
        version_dir,
        'feature_columns.json'
    )
    with open(features_path, 'w') as f:
        json.dump(feature_cols, f)

    # Compute checksum
    checksum = compute_checksum(model_path)

    # Save metadata
    metadata = {
        'version': version,
        'trained_at': datetime.utcnow().isoformat(),
        'metrics': metrics,
        'feature_count': len(feature_cols),
        'checksum': checksum,
        'model_path': model_path,
        'encoder_path': encoder_path,
        'features_path': features_path
    }

    metadata_path = os.path.join(
        version_dir,
        'metadata.json'
    )
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nModel saved to {version_dir}")
    print(f"Checksum: {checksum}")

    return model_path, checksum, metadata

# ─────────────────────────────────────────
# MAIN TRAINING PIPELINE
# ─────────────────────────────────────────

def run_training_pipeline(
    dataset_path=DATASET_PATH,
    version=None
):
    """
    Full training pipeline
    Load → Clean → Prepare → Train → Evaluate → Save
    """
    print("=" * 50)
    print("IntelliSense IDS — Model Training Pipeline")
    print("=" * 50)

    start_time = datetime.utcnow()

    # Step 1 — Load dataset
    df = load_dataset(dataset_path)

    # Step 2 — Clean dataset
    df = clean_dataset(df)

    if len(df) == 0:
        raise ValueError("No data remaining after cleaning")

    # Step 3 — Prepare features
    X, y, le, feature_cols = prepare_features(df)

    # Step 4 — Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    print(f"\nTrain samples: {len(X_train)}")
    print(f"Test samples:  {len(X_test)}")

    # Step 5 — Train model
    model = train_model(X_train, y_train)

    # Step 6 — Evaluate model
    metrics = evaluate_model(model, X_test, y_test, le)

    # Step 7 — Generate version
    if version is None:
        version = get_next_version()

    print(f"\nModel version: {version}")

    # Step 8 — Save model
    model_path, checksum, metadata = save_model(
        model, le, feature_cols, metrics, version
    )

    # Step 9 — Calculate duration
    duration = (datetime.utcnow() - start_time).seconds

    print("\n" + "=" * 50)
    print("Training Pipeline Complete")
    print("=" * 50)
    print(f"Version:   {version}")
    print(f"F1 Score:  {metrics['f1']:.4f}")
    print(f"Accuracy:  {metrics['accuracy']:.4f}")
    print(f"Duration:  {duration} seconds")
    print(f"Saved to:  {model_path}")
    print("=" * 50)

    return {
        'version': version,
        'metrics': metrics,
        'model_path': model_path,
        'checksum': checksum,
        'duration': duration
    }

if __name__ == "__main__":
    # Generate sample dataset first
    from ml.create_sample_dataset import create_sample_dataset
    create_sample_dataset(
        n_samples=5000,
        output_path=DATASET_PATH
    )

    # Run training pipeline
    result = run_training_pipeline()
    print(f"\nTraining result: {result}")
