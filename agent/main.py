import time
import os
import threading
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

import config
from config.settings import HEARTBEAT_INTERVAL, ORG_ID
from cloud.api import authenticate, send_heartbeat, upload_logs
from capture.capture import PacketCapture
from features.extractor import FeatureExtractor
from classifier.predict import TrafficClassifier
from alerts.generator import AlertGenerator
from updater.updater import ModelUpdater

# Global state
flows_captured = 0
flows_uploaded = 0
current_model_version = 'none'

# Initialize components
capturer = PacketCapture()
extractor = FeatureExtractor()
classifier = TrafficClassifier()
alert_generator = AlertGenerator()
updater = ModelUpdater(classifier)

def process_pcap(pcap_file):
    global flows_captured, flows_uploaded

    print(f"\n{'='*50}")
    print(f"Processing: {pcap_file}")
    print(f"Time: {datetime.utcnow()}")
    print(f"{'='*50}")

    # Extract features
    csv_file = extractor.extract_features(pcap_file)
    if csv_file is None:
        print("Feature extraction failed — skipping")
        return

    # Load features
    df = extractor.load_features(csv_file)
    if df is None or len(df) == 0:
        print("No flows to process")
        return

    flows_captured += len(df)

    # Classify if model loaded
    if classifier.is_model_loaded():
        feature_cols = extractor.get_feature_columns(df)
        classified_df = classifier.classify(df, feature_cols)

        if classified_df is not None:
            alert_generator.generate_alerts(classified_df)
            classified_df.to_csv(csv_file, index=False)
    else:
        print("No model loaded — uploading raw features")

    # Upload to S3
    success = upload_logs(csv_file)
    if success:
        flows_uploaded += len(df)

    # Clean up pcap
    if os.path.exists(pcap_file):
        os.remove(pcap_file)

    print(f"Batch complete — "
          f"Captured: {flows_captured} "
          f"Uploaded: {flows_uploaded}")

def heartbeat_loop():
    global current_model_version
    while True:
        try:
            result = send_heartbeat(
                model_version=current_model_version,
                status='online',
                flows_captured=flows_captured,
                flows_uploaded=flows_uploaded
            )

            if result and result.get('has_update'):
                pending_version = result.get('pending_version')

                if pending_version and \
                   pending_version != current_model_version:
                    print(f"Update available: {pending_version}")
                    success = updater.update_model(pending_version)
                    if success:
                        current_model_version = pending_version

        except Exception as e:
            print(f"Heartbeat error: {e}")

        time.sleep(HEARTBEAT_INTERVAL)

def startup():
    print("=" * 50)
    print("  IntelliSense IDS Agent")
    print("=" * 50)

    # Check if setup has been run
    api_key = os.getenv('API_KEY')
    if not api_key:
        print("Agent not configured.")
        print("Run 'python3 setup.py' first")
        return False

    # Authenticate
    print("\nAuthenticating...")
    auth_data = authenticate()

    if not auth_data:
        print("Authentication failed")
        print("Check your API key or internet connection")
        return False

    print(f"Organisation: {auth_data['org_name']}")
    print(f"Org Code:     {auth_data['org_code']}")

    # Check for model
    global current_model_version
    if auth_data.get('current_model_version'):
        current_model_version = auth_data['current_model_version']

        if not classifier.is_model_loaded():
            print(f"Downloading model {current_model_version}...")
            success = updater.update_model(current_model_version)
            if success:
                print(f"Model {current_model_version} ready")
            else:
                print("Model download failed — running without classification")
    else:
        print("No model available yet")
        print("Capturing traffic without classification")

    return True

if __name__ == "__main__":
import sys

    # Run setup wizard if --setup flag passed
    # or if API key not configured
    api_key = os.getenv('API_KEY')

    if '--setup' in sys.argv or not api_key:
        from setup import setup_wizard
        if not setup_wizard():
            print("Setup failed. Please try again.")
            exit(1)
        # Reload env after setup
        load_dotenv(override=True)

    # Continue with normal startup

    if not startup():
        exit(1)

    # Start heartbeat thread
    heartbeat_thread = threading.Thread(
        target=heartbeat_loop,
        daemon=True
    )
    heartbeat_thread.start()
    print("\nHeartbeat started")

    # Start capture
    print(f"\nStarting capture...")
    print("Press Ctrl+C to stop\n")

    try:
        capturer.start_continuous_capture(process_pcap)
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nStopping agent...")
        capturer.stop()
        print("Agent stopped")
