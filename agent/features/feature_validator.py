"""Strict validation for live flow records before machine-learning inference."""
from __future__ import annotations

from typing import Any, Iterable, Mapping

import numpy as np
import pandas as pd


class FeatureValidator:
    def __init__(self, required_features: Iterable[str]) -> None:
        self.required_features = [str(item) for item in required_features]

    def validate(self, flow: Mapping[str, Any]) -> dict[str, float]:
        missing = [name for name in self.required_features if name not in flow]
        if missing:
            raise ValueError(
                f"Live flow is missing {len(missing)} required features. "
                f"First missing features: {missing[:10]}"
            )

        frame = pd.DataFrame(
            [{name: flow[name] for name in self.required_features}],
            columns=self.required_features,
        ).apply(pd.to_numeric, errors="coerce")
        frame.replace([np.inf, -np.inf], np.nan, inplace=True)
        if frame.isna().any().any():
            invalid = frame.columns[frame.isna().any()].tolist()
            raise ValueError(f"Invalid live feature values: {invalid}")
        return {name: float(frame.iloc[0][name]) for name in self.required_features}