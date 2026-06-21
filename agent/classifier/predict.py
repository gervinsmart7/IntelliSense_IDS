import joblib
import pandas as pd
import numpy as np
import os
import threading
from config.settings import MODEL_PATH

class TrafficClassifier:
    def __init__(self):
        self.model = None
        self.model_lock = threading.Lock()
        self.current_version = 'none'
        self.model_path = MODEL_PATH

        if os.path.exists(self.model_path):
            self.load_model(self.model_path)

    def load_model(self, model_path):
        try:
            with self.model_lock:
                self.model = joblib.load(model_path)
                print(f"Model loaded from {model_path}")
            return True
        except Exception as e:
            print(f"Model load error: {e}")
            return False

    def swap_model(self, new_model_path, version):
        try:
            new_model = joblib.load(new_model_path)
            with self.model_lock:
                self.model = new_model
                self.current_version = version
            print(f"Model Updated to version {version}")
            return True
        except Exception as e:
            print(f"Model Update error: {e}")
            return False

    def classify(self, df, feature_cols):
        if self.model is None:
            print("No model loaded, skipping classification")
            return None

        try:
            with self.model_lock:
                features = df[feature_cols]
                predictions = self.model.predict(features)

                if hasattr(self.model, 'predict_proba'):
                    probabilities = self.model.predict_proba(features)
                    confidence = np.max(probabilities, axis=1)
                else:
                    confidence = np.ones(len(predictions))

            result_df = df.copy()
            result_df['prediction'] = predictions
            result_df['confidence'] = confidence

            benign = len(result_df[result_df['prediction'] == 'BENIGN'])
            attacks = len(result_df[result_df['prediction'] != 'BENIGN'])

            print(f"Classified {len(result_df)} flows,  "
                  f"Benign: {benign} Attack: {attacks}")

            return result_df

        except Exception as e:
            print(f"Classification error: {e}")
            return None

    def is_model_loaded(self):
        return self.model is not None
