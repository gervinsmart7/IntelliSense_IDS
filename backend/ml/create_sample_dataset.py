import pandas as pd
import numpy as np
import os

def create_sample_dataset(
    n_samples=5000,
    output_path='ml/sample_dataset.csv'
):
    """
    Creates a synthetic dataset that mimics
    CICIDS2017 structure and features
    Used for testing the ML pipeline
    before using the real dataset
    """
    np.random.seed(42)
    print(f"Creating sample dataset with {n_samples} samples...")

    # Attack type distribution
    # 60% benign 40% attacks
    attack_types = [
        'BENIGN',
        'DDoS',
        'DoS Hulk',
        'DoS GoldenEye',
        'DoS slowloris',
        'PortScan',
        'FTP-Patator',
        'SSH-Patator',
        'Web Attack XSS',
        'Web Attack SQL Injection',
        'Bot'
    ]

    weights = [
        0.60,  # BENIGN
        0.08,  # DDoS
        0.06,  # DoS Hulk
        0.05,  # DoS GoldenEye
        0.04,  # DoS slowloris
        0.05,  # PortScan
        0.03,  # FTP-Patator
        0.03,  # SSH-Patator
        0.02,  # Web Attack XSS
        0.02,  # Web Attack SQL Injection
        0.02   # Bot
    ]

    labels = np.random.choice(
        attack_types,
        size=n_samples,
        p=weights
    )

    # Generate features based on label
    # Each attack type has different
    # statistical characteristics
    data = []

    for label in labels:
        if label == 'BENIGN':
            row = generate_benign_flow()
        elif label in ['DDoS', 'DoS Hulk', 'DoS GoldenEye']:
            row = generate_dos_flow()
        elif label == 'DoS slowloris':
            row = generate_slowloris_flow()
        elif label == 'PortScan':
            row = generate_portscan_flow()
        elif label in ['FTP-Patator', 'SSH-Patator']:
            row = generate_bruteforce_flow()
        elif label in ['Web Attack XSS', 'Web Attack SQL Injection']:
            row = generate_webattack_flow()
        elif label == 'Bot':
            row = generate_bot_flow()
        else:
            row = generate_benign_flow()

        row['Label'] = label
        data.append(row)

    df = pd.DataFrame(data)

    # Save dataset
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)

    print(f"Dataset saved to {output_path}")
    print(f"Shape: {df.shape}")
    print(f"\nLabel distribution:")
    print(df['Label'].value_counts())

    return df

def generate_benign_flow():
    return {
        'Flow Duration': np.random.randint(1000, 5000000),
        'Total Fwd Packets': np.random.randint(2, 50),
        'Total Backward Packets': np.random.randint(2, 50),
        'Total Length of Fwd Packets': np.random.randint(100, 50000),
        'Total Length of Bwd Packets': np.random.randint(100, 50000),
        'Fwd Packet Length Max': np.random.randint(40, 1500),
        'Fwd Packet Length Min': np.random.randint(20, 100),
        'Fwd Packet Length Mean': np.random.uniform(40, 800),
        'Fwd Packet Length Std': np.random.uniform(0, 400),
        'Bwd Packet Length Max': np.random.randint(40, 1500),
        'Bwd Packet Length Min': np.random.randint(20, 100),
        'Bwd Packet Length Mean': np.random.uniform(40, 800),
        'Bwd Packet Length Std': np.random.uniform(0, 400),
        'Flow Bytes/s': np.random.uniform(100, 100000),
        'Flow Packets/s': np.random.uniform(1, 100),
        'Flow IAT Mean': np.random.uniform(1000, 500000),
        'Flow IAT Std': np.random.uniform(0, 200000),
        'Flow IAT Max': np.random.uniform(1000, 1000000),
        'Flow IAT Min': np.random.uniform(0, 100000),
        'Fwd IAT Total': np.random.uniform(1000, 5000000),
        'Fwd IAT Mean': np.random.uniform(1000, 500000),
        'Fwd IAT Std': np.random.uniform(0, 200000),
        'Fwd IAT Max': np.random.uniform(1000, 1000000),
        'Fwd IAT Min': np.random.uniform(0, 100000),
        'Bwd IAT Total': np.random.uniform(1000, 5000000),
        'Bwd IAT Mean': np.random.uniform(1000, 500000),
        'Bwd IAT Std': np.random.uniform(0, 200000),
        'Bwd IAT Max': np.random.uniform(1000, 1000000),
        'Bwd IAT Min': np.random.uniform(0, 100000),
        'Fwd PSH Flags': np.random.randint(0, 2),
        'Bwd PSH Flags': 0,
        'Fwd URG Flags': 0,
        'Bwd URG Flags': 0,
        'Fwd Header Length': np.random.randint(20, 200),
        'Bwd Header Length': np.random.randint(20, 200),
        'Fwd Packets/s': np.random.uniform(1, 50),
        'Bwd Packets/s': np.random.uniform(1, 50),
        'Min Packet Length': np.random.randint(20, 100),
        'Max Packet Length': np.random.randint(100, 1500),
        'Packet Length Mean': np.random.uniform(40, 800),
        'Packet Length Std': np.random.uniform(0, 400),
        'Packet Length Variance': np.random.uniform(0, 160000),
        'FIN Flag Count': np.random.randint(0, 2),
        'SYN Flag Count': np.random.randint(0, 2),
        'RST Flag Count': 0,
        'PSH Flag Count': np.random.randint(0, 5),
        'ACK Flag Count': np.random.randint(1, 10),
        'URG Flag Count': 0,
        'CWE Flag Count': 0,
        'ECE Flag Count': 0,
        'Down/Up Ratio': np.random.uniform(0.5, 2.0),
        'Average Packet Size': np.random.uniform(40, 800),
        'Avg Fwd Segment Size': np.random.uniform(40, 800),
        'Avg Bwd Segment Size': np.random.uniform(40, 800),
        'Fwd Avg Bytes/Bulk': 0,
        'Fwd Avg Packets/Bulk': 0,
        'Fwd Avg Bulk Rate': 0,
        'Bwd Avg Bytes/Bulk': 0,
        'Bwd Avg Packets/Bulk': 0,
        'Bwd Avg Bulk Rate': 0,
        'Subflow Fwd Packets': np.random.randint(1, 50),
        'Subflow Fwd Bytes': np.random.randint(100, 50000),
        'Subflow Bwd Packets': np.random.randint(1, 50),
        'Subflow Bwd Bytes': np.random.randint(100, 50000),
        'Init_Win_bytes_forward': np.random.randint(0, 65535),
        'Init_Win_bytes_backward': np.random.randint(0, 65535),
        'act_data_pkt_fwd': np.random.randint(0, 50),
        'min_seg_size_forward': np.random.randint(20, 100),
        'Active Mean': np.random.uniform(0, 1000000),
        'Active Std': np.random.uniform(0, 500000),
        'Active Max': np.random.uniform(0, 2000000),
        'Active Min': np.random.uniform(0, 500000),
        'Idle Mean': np.random.uniform(0, 5000000),
        'Idle Std': np.random.uniform(0, 2000000),
        'Idle Max': np.random.uniform(0, 10000000),
        'Idle Min': np.random.uniform(0, 2000000)
    }

def generate_dos_flow():
    """DDoS/DoS has very high packet rates"""
    row = generate_benign_flow()
    row.update({
        'Total Fwd Packets': np.random.randint(1000, 10000),
        'Flow Packets/s': np.random.uniform(1000, 50000),
        'Flow Bytes/s': np.random.uniform(100000, 10000000),
        'Flow Duration': np.random.randint(100, 10000),
        'Fwd Packets/s': np.random.uniform(500, 25000),
        'SYN Flag Count': np.random.randint(100, 5000),
        'RST Flag Count': np.random.randint(0, 100),
        'Flow IAT Mean': np.random.uniform(10, 1000),
        'Flow IAT Min': np.random.uniform(0, 100)
    })
    return row

def generate_slowloris_flow():
    """Slowloris has long duration low rate"""
    row = generate_benign_flow()
    row.update({
        'Flow Duration': np.random.randint(10000000, 120000000),
        'Total Fwd Packets': np.random.randint(1, 10),
        'Flow Packets/s': np.random.uniform(0.001, 0.1),
        'Flow IAT Mean': np.random.uniform(5000000, 30000000),
        'Fwd IAT Mean': np.random.uniform(5000000, 30000000),
        'FIN Flag Count': 0,
        'RST Flag Count': 0
    })
    return row

def generate_portscan_flow():
    """Port scan has many short flows"""
    row = generate_benign_flow()
    row.update({
        'Flow Duration': np.random.randint(0, 1000),
        'Total Fwd Packets': np.random.randint(1, 3),
        'Total Backward Packets': np.random.randint(0, 2),
        'SYN Flag Count': 1,
        'RST Flag Count': np.random.randint(0, 1),
        'Flow Packets/s': np.random.uniform(1000, 10000),
        'Fwd Packet Length Mean': np.random.uniform(20, 60)
    })
    return row

def generate_bruteforce_flow():
    """Brute force has repeated login attempts"""
    row = generate_benign_flow()
    row.update({
        'Total Fwd Packets': np.random.randint(10, 100),
        'Total Backward Packets': np.random.randint(10, 100),
        'Flow Duration': np.random.randint(100000, 5000000),
        'Fwd Packet Length Mean': np.random.uniform(50, 200),
        'Bwd Packet Length Mean': np.random.uniform(50, 200),
        'Flow Packets/s': np.random.uniform(5, 50),
        'PSH Flag Count': np.random.randint(5, 50),
        'ACK Flag Count': np.random.randint(10, 100)
    })
    return row

def generate_webattack_flow():
    """Web attacks have specific payload patterns"""
    row = generate_benign_flow()
    row.update({
        'Total Fwd Packets': np.random.randint(3, 20),
        'Total Backward Packets': np.random.randint(3, 20),
        'Fwd Packet Length Max': np.random.randint(500, 1500),
        'Fwd Packet Length Mean': np.random.uniform(200, 1000),
        'Total Length of Fwd Packets': np.random.randint(1000, 20000),
        'PSH Flag Count': np.random.randint(2, 10),
        'ACK Flag Count': np.random.randint(2, 10)
    })
    return row

def generate_bot_flow():
    """Bot traffic has periodic patterns"""
    row = generate_benign_flow()
    row.update({
        'Flow Duration': np.random.randint(1000000, 10000000),
        'Total Fwd Packets': np.random.randint(5, 30),
        'Flow IAT Std': np.random.uniform(0, 1000),
        'Fwd IAT Std': np.random.uniform(0, 1000),
        'Flow Packets/s': np.random.uniform(0.1, 5),
        'Idle Mean': np.random.uniform(1000000, 5000000),
        'Idle Std': np.random.uniform(0, 100000)
    })
    return row

if __name__ == "__main__":
    create_sample_dataset(
        n_samples=5000,
        output_path='ml/sample_dataset.csv'
    )
