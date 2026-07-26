import requests
import hashlib
import os
import shutil
import zipfile
import tempfile
from cloud.api import get_model_download_url, confirm_model_update
from config.settings import MODELS_DIR


class ModelUpdater:
    def __init__(self, classifier):
        self.classifier = classifier

    def compute_checksum(self, filepath):
        sha256 = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def download_bundle(self, url, version):
        try:
            tmp_zip = tempfile.NamedTemporaryFile(
                suffix='.zip', delete=False
            ).name

            print(f"Downloading model bundle {version}...")
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()

            with open(tmp_zip, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"Bundle {version} downloaded")
            return tmp_zip

        except Exception as e:
            print(f"Bundle download error: {e}")
            return None

    def update_model(self, version):
        print(f"Starting model update to {version}...")

        url_data = get_model_download_url(version)
        if not url_data:
            confirm_model_update(version, 'url_fetch_failed')
            return False

        url = url_data['url']
        expected_checksum = url_data.get('checksum', '')

        tmp_zip = self.download_bundle(url, version)
        if not tmp_zip:
            confirm_model_update(version, 'download_failed')
            return False

        # Validate checksum of the zip itself
        if expected_checksum:
            actual_checksum = self.compute_checksum(tmp_zip)
            if actual_checksum != expected_checksum:
                print("Checksum validation failed")
                os.remove(tmp_zip)
                confirm_model_update(version, 'checksum_failed')
                return False

        # Extract into a clean version folder
        bundle_dir = os.path.join(MODELS_DIR, version)
        os.makedirs(bundle_dir, exist_ok=True)

        try:
            with zipfile.ZipFile(tmp_zip, 'r') as zf:
                zf.extractall(bundle_dir)
        except Exception as e:
            print(f"Bundle extraction error: {e}")
            os.remove(tmp_zip)
            confirm_model_update(version, 'extraction_failed')
            return False

        os.remove(tmp_zip)

        # Load the full bundle into the classifier
        success = self.classifier.load_bundle(bundle_dir, version=version)
        if not success:
            confirm_model_update(version, 'load_failed')
            return False

        confirm_model_update(version, 'success')
        print(f"Model updated to {version} successfully")
        return True