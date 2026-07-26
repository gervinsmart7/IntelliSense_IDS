from __future__ import annotations
import os
import sys
import threading
import time
import warnings
warnings.filterwarnings('ignore', category=UserWarning, module='sklearn')
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()
from alerts.generator import AlertGenerator
from capture.capture import PacketCapture
from classifier.predict import TrafficClassifier
from cloud.api import authenticate, send_heartbeat, upload_logs, post_traffic_summary
from config.settings import HEARTBEAT_INTERVAL
from features.extractor import FeatureExtractor
from updater.updater import ModelUpdater
from detection.recon_monitor import ReconMonitor

flows_captured = 0
flows_uploaded = 0
current_model_version = "local-v1"
capturer = PacketCapture()
extractor = FeatureExtractor()
classifier = TrafficClassifier()
alert_generator = AlertGenerator()
updater = ModelUpdater(classifier)
recon_monitor = ReconMonitor()

def process_pcap(pcap_file: str) -> None:
    global flows_captured, flows_uploaded
    print("\n" + "=" * 50)
    print(f"Processing: {pcap_file}")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)
    csv_file = extractor.extract_features(pcap_file)
    if csv_file is None:
        print("Feature extraction failed; skipping batch")
        return
    df = extractor.load_features(csv_file)
    if df is None or df.empty:
        print("No flows to process")
        return
    flows_captured += len(df)
    if classifier.is_model_loaded():
        classified_df = classifier.classify(df, extractor)
        if classified_df is not None:
            alert_generator.generate_alerts(classified_df)
            benign_count = int((classified_df['prediction'] == 'BENIGN').sum())
            attack_count = len(classified_df) - benign_count
            post_traffic_summary(benign_count, attack_count)  # new function in cloud/api.py
            classified_df.to_csv(csv_file, index=False)
    else:
        print("No complete model package loaded; uploading raw flow features")

    recon_alerts = recon_monitor.analyze_pcap(pcap_file)
    for alert in recon_alerts:
        print(f"RECON ALERT [{alert['severity'].upper()}]: {alert['description']}")

    if upload_logs(csv_file):
        flows_uploaded += len(df)
    if os.path.exists(pcap_file):
        os.remove(pcap_file)
    print(f"Batch complete — Captured: {flows_captured}; Uploaded: {flows_uploaded}")

def heartbeat_loop() -> None:
    global current_model_version
    while True:
        try:
            result = send_heartbeat(
                model_version=current_model_version,
                status="online",
                flows_captured=flows_captured,
                flows_uploaded=flows_uploaded,
            )
            if result and result.get("has_update"):
                pending = result.get("pending_version")
                if pending and pending != current_model_version and updater.update_model(pending):
                    current_model_version = pending
        except Exception as exc:
            print(f"Heartbeat error: {exc}")
        time.sleep(HEARTBEAT_INTERVAL)

def startup() -> bool:
    global current_model_version
    print("=" * 50)
    print("  IntelliSense IDS Agent")
    print("=" * 50)
    if not os.getenv("API_KEY"):
        print("Agent not configured. run python setup.py")
        return False
    auth_data = authenticate()
    if not auth_data:
        print("Authentication failed. Check API key and backend connection.")
        return False
    print(f"Organisation: {auth_data['org_name']}")
    print(f"Org Code:     {auth_data['org_code']}")

    current_model_version = auth_data.get("current_model_version") or current_model_version

    if not classifier.is_model_loaded() and auth_data.get("current_model_version"):
        if updater.update_model(auth_data["current_model_version"]):
            print(f"Model bundle {current_model_version} loaded via cloud pipeline")
        else:
            print("Model update failed, system is running without classification")

    return True

if __name__ == "__main__":
    if "--setup" in sys.argv or not os.getenv("API_KEY"):
        from setup import setup_wizard
        if not setup_wizard():
            raise SystemExit(1)
        load_dotenv(override=True)
    if not startup():
        raise SystemExit(1)
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    print("Heartbeat started")
    print("Starting capture. Press Ctrl+C to stop.")
    try:
        capturer.start_continuous_capture(process_pcap)
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        capturer.stop()
        print("Agent stopped")