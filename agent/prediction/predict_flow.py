"""Production prediction engine for the IntelliSense IDS agent.

The predictor loads the complete model package: model, scaler, label encoder,
and ordered feature names. Paths are configurable so downloaded model packages
can be hot-swapped safely.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

import joblib
import numpy as np
import pandas as pd


class FlowPredictor:
    def __init__(self, model_directory: str | Path | None = None) -> None:
        base_dir = Path(model_directory) if model_directory else (
            Path(__file__).resolve().parents[1] / "models" / "current"
        )
        self.model_directory = base_dir.resolve()
        self.model_path = self.model_directory / "model.pkl"
        self.scaler_path = self.model_directory / "scaler.pkl"
        self.encoder_path = self.model_directory / "label_encoder.pkl"
        self.feature_names_path = self.model_directory / "feature_names.npy"

        required = [
            self.model_path,
            self.scaler_path,
            self.encoder_path,
            self.feature_names_path,
        ]
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            raise FileNotFoundError(
                "The IDS model package is incomplete. Missing:\n" + "\n".join(missing)
            )

        self.model = joblib.load(self.model_path)
        self.scaler = joblib.load(self.scaler_path)
        self.label_encoder = joblib.load(self.encoder_path)
        self.feature_names = np.load(
            self.feature_names_path, allow_pickle=True
        ).astype(str)

        expected = getattr(self.model, "n_features_in_", None)
        if expected is not None and expected != len(self.feature_names):
            raise ValueError(
                f"Model expects {expected} features but the package contains "
                f"{len(self.feature_names)} feature names."
            )

    def predict(self, flow_data: Mapping[str, Any]) -> dict[str, Any]:
        missing = [name for name in self.feature_names if name not in flow_data]
        if missing:
            raise ValueError(
                f"Flow is missing {len(missing)} required features. "
                f"First missing features: {missing[:10]}"
            )

        ordered = {name: flow_data[name] for name in self.feature_names}
        frame = pd.DataFrame([ordered], columns=self.feature_names)
        frame = frame.apply(pd.to_numeric, errors="coerce")
        frame.replace([np.inf, -np.inf], np.nan, inplace=True)

        if frame.isna().any().any():
            invalid = frame.columns[frame.isna().any()].tolist()
            raise ValueError(f"Flow has invalid values for features: {invalid}")

        scaled = self.scaler.transform(frame)
        predicted_number = int(self.model.predict(scaled)[0])

        if hasattr(self.model, "predict_proba"):
            confidence = float(np.max(self.model.predict_proba(scaled)[0]))
        else:
            confidence = 1.0

        predicted_class = str(
            self.label_encoder.inverse_transform([predicted_number])[0]
        )
        is_intrusion = predicted_class.strip().upper() != "BENIGN"

        return {
            "predicted_label_number": predicted_number,
            "predicted_class": predicted_class,
            "confidence": confidence,
            "is_intrusion": is_intrusion,
            "status": "INTRUSION" if is_intrusion else "NORMAL",
        }