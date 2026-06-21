import os
import pandas as pd
import numpy as np
import glob
import tempfile
from config.settings import FLOWS_DIR

class FeatureExtractor:
    def __init__(self):
        self.flows_dir = FLOWS_DIR

    def extract_features(self, pcap_file):
        """
        Uses pure Python cicflowmeter
        No Java required
        Works inside PyInstaller bundle
        """
        try:
            print(f"Extracting features from {pcap_file}...")

            # Output CSV path
            output_csv = os.path.join(
                self.flows_dir,
                os.path.basename(pcap_file).replace('.pcap', '.csv')
            )

            # Use cicflowmeter Python library
            from cicflowmeter.flow_session import generate_session_class
            from scapy.all import sniff, PcapReader

            flows = []

            # Read pcap and extract flows
            try:
                with PcapReader(pcap_file) as reader:
                    for packet in reader:
                        flows.append(packet)
            except Exception as e:
                print(f"PCAP read error: {e}")
                return None

            if not flows:
                print("No packets in capture")
                return None

            # Create flow session and process
            try:
                from cicflowmeter.flow_session import generate_session_class
                from scapy.all import PcapReader
                import subprocess

                # Use cicflowmeter CLI
                result = subprocess.run(
                    [
                        'cicflowmeter',
                        '-f', pcap_file,
                        '-c', self.flows_dir
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120
                )

                csv_files = glob.glob(
                    os.path.join(self.flows_dir, '*.csv')
                )

                if csv_files:
                    latest = max(csv_files, key=os.path.getctime)
                    print(f"Features extracted: {latest}")
                    return latest

            except Exception as e:
                print(f"CICFlowMeter error: {e}")
                return self._fallback_extraction(pcap_file)

        except Exception as e:
            print(f"Feature extraction error: {e}")
            return self._fallback_extraction(pcap_file)

    def _fallback_extraction(self, pcap_file):
        """
        Fallback: extract basic features using scapy directly
        Used when CICFlowMeter is not available
        """
        try:
            print("Using fallback feature extraction...")
            from scapy.all import PcapReader, IP, TCP, UDP

            flows = {}

            with PcapReader(pcap_file) as reader:
                for packet in reader:
                    if not packet.haslayer(IP):
                        continue

                    ip = packet[IP]
                    proto = 'TCP' if packet.haslayer(TCP) else \
                            'UDP' if packet.haslayer(UDP) else 'OTHER'

                    src_port = 0
                    dst_port = 0

                    if packet.haslayer(TCP):
                        src_port = packet[TCP].sport
                        dst_port = packet[TCP].dport
                    elif packet.haslayer(UDP):
                        from scapy.all import UDP as SCAPY_UDP
                        src_port = packet[SCAPY_UDP].sport
                        dst_port = packet[SCAPY_UDP].dport

                    flow_key = f"{ip.src}:{src_port}-{ip.dst}:{dst_port}-{proto}"

                    if flow_key not in flows:
                        flows[flow_key] = {
                            'Src IP': ip.src,
                            'Dst IP': ip.dst,
                            'Src Port': src_port,
                            'Dst Port': dst_port,
                            'Protocol': proto,
                            'packet_count': 0,
                            'total_bytes': 0,
                            'timestamps': []
                        }

                    flows[flow_key]['packet_count'] += 1
                    flows[flow_key]['total_bytes'] += len(packet)
                    flows[flow_key]['timestamps'].append(
                        float(packet.time)
                    )

            if not flows:
                return None

            # Build feature DataFrame
            rows = []
            for flow_key, flow_data in flows.items():
                timestamps = flow_data['timestamps']
                duration = max(timestamps) - min(timestamps) \
                    if len(timestamps) > 1 else 0

                iats = [
                    timestamps[i+1] - timestamps[i]
                    for i in range(len(timestamps)-1)
                ] if len(timestamps) > 1 else [0]

                row = {
                    'Src IP': flow_data['Src IP'],
                    'Dst IP': flow_data['Dst IP'],
                    'Src Port': flow_data['Src Port'],
                    'Dst Port': flow_data['Dst Port'],
                    'Protocol': 6 if flow_data['Protocol'] == 'TCP' else 17,
                    'Flow Duration': duration * 1000000,
                    'Total Fwd Packets': flow_data['packet_count'],
                    'Total Backward Packets': 0,
                    'Total Length of Fwd Packets': flow_data['total_bytes'],
                    'Total Length of Bwd Packets': 0,
                    'Fwd Packet Length Max': flow_data['total_bytes'],
                    'Fwd Packet Length Min': 0,
                    'Fwd Packet Length Mean': flow_data['total_bytes'] / max(flow_data['packet_count'], 1),
                    'Fwd Packet Length Std': 0,
                    'Bwd Packet Length Max': 0,
                    'Bwd Packet Length Min': 0,
                    'Bwd Packet Length Mean': 0,
                    'Bwd Packet Length Std': 0,
                    'Flow Bytes/s': flow_data['total_bytes'] / max(duration, 0.001),
                    'Flow Packets/s': flow_data['packet_count'] / max(duration, 0.001),
                    'Flow IAT Mean': np.mean(iats) * 1000000,
                    'Flow IAT Std': np.std(iats) * 1000000,
                    'Flow IAT Max': max(iats) * 1000000,
                    'Flow IAT Min': min(iats) * 1000000,
                    'Fwd IAT Total': duration * 1000000,
                    'Fwd IAT Mean': np.mean(iats) * 1000000,
                    'Fwd IAT Std': np.std(iats) * 1000000,
                    'Fwd IAT Max': max(iats) * 1000000,
                    'Fwd IAT Min': min(iats) * 1000000,
                    'Bwd IAT Total': 0,
                    'Bwd IAT Mean': 0,
                    'Bwd IAT Std': 0,
                    'Bwd IAT Max': 0,
                    'Bwd IAT Min': 0,
                    'Fwd PSH Flags': 0,
                    'Bwd PSH Flags': 0,
                    'Fwd URG Flags': 0,
                    'Bwd URG Flags': 0,
                    'Fwd Header Length': 20 * flow_data['packet_count'],
                    'Bwd Header Length': 0,
                    'Fwd Packets/s': flow_data['packet_count'] / max(duration, 0.001),
                    'Bwd Packets/s': 0,
                    'Min Packet Length': 0,
                    'Max Packet Length': flow_data['total_bytes'],
                    'Packet Length Mean': flow_data['total_bytes'] / max(flow_data['packet_count'], 1),
                    'Packet Length Std': 0,
                    'Packet Length Variance': 0,
                    'FIN Flag Count': 0,
                    'SYN Flag Count': 0,
                    'RST Flag Count': 0,
                    'PSH Flag Count': 0,
                    'ACK Flag Count': 0,
                    'URG Flag Count': 0,
                    'CWE Flag Count': 0,
                    'ECE Flag Count': 0,
                    'Down/Up Ratio': 0,
                    'Average Packet Size': flow_data['total_bytes'] / max(flow_data['packet_count'], 1),
                    'Avg Fwd Segment Size': flow_data['total_bytes'] / max(flow_data['packet_count'], 1),
                    'Avg Bwd Segment Size': 0,
                    'Fwd Avg Bytes/Bulk': 0,
                    'Fwd Avg Packets/Bulk': 0,
                    'Fwd Avg Bulk Rate': 0,
                    'Bwd Avg Bytes/Bulk': 0,
                    'Bwd Avg Packets/Bulk': 0,
                    'Bwd Avg Bulk Rate': 0,
                    'Subflow Fwd Packets': flow_data['packet_count'],
                    'Subflow Fwd Bytes': flow_data['total_bytes'],
                    'Subflow Bwd Packets': 0,
                    'Subflow Bwd Bytes': 0,
                    'Init_Win_bytes_forward': 0,
                    'Init_Win_bytes_backward': 0,
                    'act_data_pkt_fwd': flow_data['packet_count'],
                    'min_seg_size_forward': 0,
                    'Active Mean': 0,
                    'Active Std': 0,
                    'Active Max': 0,
                    'Active Min': 0,
                    'Idle Mean': 0,
                    'Idle Std': 0,
                    'Idle Max': 0,
                    'Idle Min': 0,
                    'Label': 'UNKNOWN'
                }
                rows.append(row)

            df = pd.DataFrame(rows)
            output_csv = os.path.join(
                self.flows_dir,
                f"fallback_{os.path.basename(pcap_file)}.csv"
            )
            df.to_csv(output_csv, index=False)
            print(f"Fallback extraction complete: {len(rows)} flows")
            return output_csv

        except Exception as e:
            print(f"Fallback extraction error: {e}")
            return None

    def load_features(self, csv_file):
        try:
            df = pd.read_csv(csv_file)
            df.columns = df.columns.str.strip()
            df = df.replace([np.inf, -np.inf], np.nan)
            df = df.dropna()
            df = df.drop_duplicates()

            feature_cols = self.get_feature_columns(df)
            for col in feature_cols:
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    df[col] = df[col].clip(lower=0)
                except Exception:
                    pass

            df = df.dropna()
            print(f"Loaded {len(df)} flows")
            return df

        except Exception as e:
            print(f"Feature loading error: {e}")
            return None

    def get_feature_columns(self, df):
        exclude_cols = [
            'Flow ID', 'Src IP', 'Dst IP',
            'Src Port', 'Dst Port', 'Protocol',
            'Timestamp', 'Label',
            'src_ip', 'dst_ip', 'src_port',
            'dst_port', 'protocol', 'timestamp',
            'label', 'flow_id'
        ]
        return [
            col for col in df.columns
            if col not in exclude_cols
        ]
