from __future__ import annotations

import csv
import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4


@dataclass
class DetectionEvent:
    event_id: str
    timestamp_utc: str
    source: str
    predicted_class: str
    confidence: float
    status: str
    is_intrusion: bool
    model_version: str
    feature_count: int
    flow_features: dict[str, Any]


class DetectionLogger:
    """Store IDS predictions locally in JSONL and CSV files."""

    CSV_FIELDS = [
        "event_id",
        "timestamp_utc",
        "source",
        "predicted_class",
        "confidence",
        "status",
        "is_intrusion",
        "model_version",
        "feature_count",
    ]

    def __init__(
        self,
        logs_directory: str | Path,
        model_version: str = "ids_model_v1",
        log_benign: bool = False,
    ) -> None:
        self.logs_directory = Path(logs_directory).resolve()
        self.logs_directory.mkdir(parents=True, exist_ok=True)

        self.model_version = model_version
        self.log_benign = log_benign

        self.events_jsonl_path = self.logs_directory / "detection_events.jsonl"
        self.summary_csv_path = self.logs_directory / "detection_summary.csv"
        self.error_log_path = self.logs_directory / "detection_errors.log"

        self.error_logger = logging.getLogger(f"DetectionLogger-{id(self)}")
        self.error_logger.setLevel(logging.ERROR)
        self.error_logger.propagate = False

        self._error_handler = logging.FileHandler(
            self.error_log_path,
            encoding="utf-8",
        )
        self._error_handler.setFormatter(
            logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
        )
        self.error_logger.addHandler(self._error_handler)

    @staticmethod
    def _validate_prediction(
        prediction: Mapping[str, Any],
    ) -> dict[str, Any]:
        required = {
            "predicted_class",
            "confidence",
            "status",
            "is_intrusion",
        }

        missing = required.difference(prediction.keys())

        if missing:
            raise KeyError(
                "Prediction is missing: " + ", ".join(sorted(missing))
            )

        confidence = float(prediction["confidence"])

        if not 0 <= confidence <= 1:
            raise ValueError("Confidence must be between 0 and 1.")

        return {
            "predicted_class": str(prediction["predicted_class"]),
            "confidence": confidence,
            "status": str(prediction["status"]),
            "is_intrusion": bool(prediction["is_intrusion"]),
        }

    def create_event(
        self,
        prediction: Mapping[str, Any],
        flow_features: Mapping[str, Any],
        source: str = "offline_test",
    ) -> DetectionEvent:
        clean_prediction = self._validate_prediction(prediction)

        return DetectionEvent(
            event_id=str(uuid4()),
            timestamp_utc=datetime.now(timezone.utc).isoformat(),
            source=str(source),
            predicted_class=clean_prediction["predicted_class"],
            confidence=round(clean_prediction["confidence"], 6),
            status=clean_prediction["status"],
            is_intrusion=clean_prediction["is_intrusion"],
            model_version=self.model_version,
            feature_count=len(flow_features),
            flow_features=dict(flow_features),
        )

    def log_detection(
        self,
        prediction: Mapping[str, Any],
        flow_features: Mapping[str, Any],
        source: str = "offline_test",
    ) -> DetectionEvent | None:
        try:
            event = self.create_event(
                prediction=prediction,
                flow_features=flow_features,
                source=source,
            )

            if not event.is_intrusion and not self.log_benign:
                return None

            with self.events_jsonl_path.open("a", encoding="utf-8") as file:
                json.dump(asdict(event), file, ensure_ascii=False, default=str)
                file.write("\n")

            file_exists = self.summary_csv_path.exists()

            with self.summary_csv_path.open(
                "a",
                newline="",
                encoding="utf-8",
            ) as file:
                writer = csv.DictWriter(file, fieldnames=self.CSV_FIELDS)

                if not file_exists:
                    writer.writeheader()

                writer.writerow({
                    field: getattr(event, field)
                    for field in self.CSV_FIELDS
                })

            return event

        except Exception as exc:
            self.error_logger.exception("Failed to log event: %s", exc)
            raise

    def close(self) -> None:
        """Close the error log file so Windows can release it."""
        if getattr(self, "_error_handler", None) is not None:
            self._error_handler.flush()
            self._error_handler.close()
            self.error_logger.removeHandler(self._error_handler)
            self._error_handler = None

    def __enter__(self) -> "DetectionLogger":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass