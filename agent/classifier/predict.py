import joblib
import numpy as np
import threading
import os


class TrafficClassifier:
    def __init__(self):
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.feature_names = None
        self.model_lock = threading.Lock()
        self.current_version = 'none'

    def load_bundle(self, bundle_dir, version='v1.0'):
        """
        Loads model + scaler + label_encoder + feature_names
        from a single version folder.
        """
        try:
            model_path = os.path.join(bundle_dir, 'ids_model_v1.pkl')
            scaler_path = os.path.join(bundle_dir, 'scaler.pkl')
            encoder_path = os.path.join(bundle_dir, 'label_encoder.pkl')
            features_path = os.path.join(bundle_dir, 'feature_names.npy')

            with self.model_lock:
                self.model = joblib.load(model_path)
                self.scaler = joblib.load(scaler_path)
                self.label_encoder = joblib.load(encoder_path)
                self.feature_names = np.load(
                    features_path, allow_pickle=True
                ).astype(str)
                self.current_version = version

            print(f"Model bundle {version} loaded ({len(self.feature_names)} features)")
            return True
        except Exception as e:
            print(f"Bundle load error: {e}")
            return False

    def is_model_loaded(self):
        return self.model is not None

    def classify(self, df, extractor):
        """
        extractor: your FeatureExtractor instance, used to call
        align_to_model_schema before scaling.
        """
        if self.model is None:
            print("No model loaded, skipping classification")
            return None

        try:
            with self.model_lock:
                aligned = extractor.align_to_model_schema(df, self.feature_names)
                scaled = self.scaler.transform(aligned)
                predictions_encoded = self.model.predict(scaled)
                probabilities = self.model.predict_proba(scaled)
                confidence = np.max(probabilities, axis=1)
                labels = self.label_encoder.inverse_transform(predictions_encoded)

            result_df = df.copy()
            result_df['prediction'] = labels
            result_df['confidence'] = confidence

            benign = int((labels == 'BENIGN').sum())
            attacks = int((labels != 'BENIGN').sum())
            print(f"Classified {len(result_df)} flows — Benign: {benign} Attack: {attacks}")

            return result_df

        except Exception as e:
            print(f"Classification error: {e}")
            return None