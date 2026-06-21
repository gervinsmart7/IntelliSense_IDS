import requests
import hashlib
import os
import shutil
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

    def download_model(self, url, version):
        try:
            local_path = os.path.join(
                MODELS_DIR,
                f"ids_model_{version}.pkl"
            )

            print(f"Downloading model {version}...")
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()

            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"Model {version} downloaded")
            return local_path

        except Exception as e:
            print(f"Model download error: {e}")
            return None

    def update_model(self, version):
        print(f"Starting model update to {version}...")

        # Get download URL
        url_data = get_model_download_url(version)
        if not url_data:
            confirm_model_update(version, 'url_fetch_failed')
            return False

        url = url_data['url']
        expected_checksum = url_data.get('checksum', '')

        # Download
        local_path = self.download_model(url, version)
        if not local_path:
            confirm_model_update(version, 'download_failed')
            return False

        # Validate checksum
        if expected_checksum:
            actual_checksum = self.compute_checksum(local_path)
            if actual_checksum != expected_checksum:
                print("Checksum validation failed")
                os.remove(local_path)
                confirm_model_update(version, 'checksum_failed')
                return False

        # Hot swap
        success = self.classifier.swap_model(local_path, version)
        if not success:
            confirm_model_update(version, 'swap_failed')
            return False

        # Save as current
        current_path = os.path.join(MODELS_DIR, 'current_model.pkl')
        shutil.copy2(local_path, current_path)

        # Report success
        confirm_model_update(version, 'success')
        print(f"Model updated to {version} successfully")
        return True
