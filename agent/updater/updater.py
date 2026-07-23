from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

import requests

from cloud.api import confirm_model_update, get_model_download_url
from config.settings import CURRENT_MODEL_DIR, MODELS_DIR


class ModelUpdater:
    REQUIRED_FILES = {"model.pkl", "scaler.pkl", "label_encoder.pkl", "feature_names.npy"}

    def __init__(self, classifier) -> None:
        self.classifier = classifier
        Path(MODELS_DIR).mkdir(parents=True, exist_ok=True)

    @staticmethod
    def compute_checksum(filepath: str | Path) -> str:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as file:
            for chunk in iter(lambda: file.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def download_package(self, url: str, version: str) -> Path | None:
        try:
            destination = Path(MODELS_DIR) / f"ids_model_{version}.zip"
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            with destination.open("wb") as file:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        file.write(chunk)
            return destination
        except Exception as exc:
            print(f"Model package download error: {exc}")
            return None

    def _extract_and_validate(self, package: Path, version: str) -> Path:
        version_dir = Path(MODELS_DIR) / "versions" / version
        staging = Path(tempfile.mkdtemp(prefix="ids_model_", dir=Path(MODELS_DIR)))
        try:
            with zipfile.ZipFile(package) as archive:
                archive.extractall(staging)
            candidates = [staging] + [path for path in staging.rglob("*") if path.is_dir()]
            model_dir = next(
                (path for path in candidates if self.REQUIRED_FILES.issubset({p.name for p in path.iterdir() if p.is_file()})),
                None,
            )
            if model_dir is None:
                raise ValueError(
                    "Downloaded model package must contain model.pkl, scaler.pkl, "
                    "label_encoder.pkl and feature_names.npy in one directory."
                )
            if version_dir.exists():
                shutil.rmtree(version_dir)
            version_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(model_dir, version_dir)
            return version_dir
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def update_model(self, version: str) -> bool:
        url_data = get_model_download_url(version)
        if not url_data:
            confirm_model_update(version, "url_fetch_failed")
            return False

        package = self.download_package(url_data["url"], version)
        if package is None:
            confirm_model_update(version, "download_failed")
            return False

        expected_checksum = url_data.get("checksum", "")
        if expected_checksum and self.compute_checksum(package) != expected_checksum:
            package.unlink(missing_ok=True)
            confirm_model_update(version, "checksum_failed")
            return False

        try:
            version_dir = self._extract_and_validate(package, version)
            if not self.classifier.swap_model(version_dir, version):
                confirm_model_update(version, "validation_failed")
                return False

            current = Path(CURRENT_MODEL_DIR)
            backup = Path(MODELS_DIR) / "previous"
            if backup.exists():
                shutil.rmtree(backup)
            if current.exists():
                shutil.copytree(current, backup)
                shutil.rmtree(current)
            shutil.copytree(version_dir, current)

            # Reload from the canonical current directory after the atomic-style swap.
            if not self.classifier.swap_model(current, version):
                if backup.exists():
                    shutil.rmtree(current, ignore_errors=True)
                    shutil.copytree(backup, current)
                    self.classifier.swap_model(current, "rollback")
                confirm_model_update(version, "swap_failed")
                return False

            confirm_model_update(version, "success")
            print(f"Complete model package updated to {version}")
            return True
        except Exception as exc:
            print(f"Model update error: {exc}")
            confirm_model_update(version, "package_failed")
            return False