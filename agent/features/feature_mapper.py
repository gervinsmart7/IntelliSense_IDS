"""Map live CICFlowMeter column names to the model's training feature names."""
from __future__ import annotations

import re
from typing import Any, Iterable, Mapping


METADATA_COLUMNS = {
    "flow id", "source ip", "src ip", "destination ip", "dst ip",
    "source port", "src port", "destination port", "dst port",
    "protocol", "timestamp", "label", "prediction", "confidence",
}


def normalize_feature_name(name: str) -> str:
    text = str(name).strip().lower()
    text = text.replace("forward", "fwd").replace("backward", "bwd")
    text = text.replace("destination", "dst").replace("source", "src")
    text = text.replace("packet", "pkt").replace("packets", "pkts")
    text = text.replace("length", "len").replace("average", "avg")
    return re.sub(r"[^a-z0-9]+", "", text)


class FeatureMapper:
    def __init__(self, required_features: Iterable[str]) -> None:
        self.required_features = [str(item) for item in required_features]
        self.required_by_normalized = {
            normalize_feature_name(name): name for name in self.required_features
        }

    def map_flow(self, flow: Mapping[str, Any]) -> dict[str, Any]:
        mapped: dict[str, Any] = {}
        for live_name, value in flow.items():
            normalized = normalize_feature_name(live_name)
            target = self.required_by_normalized.get(normalized)
            if target is not None:
                mapped[target] = value
        return mapped

    def missing_features(self, mapped_flow: Mapping[str, Any]) -> list[str]:
        return [name for name in self.required_features if name not in mapped_flow]