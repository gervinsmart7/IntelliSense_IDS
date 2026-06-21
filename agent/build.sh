#!/bin/bash
echo "Building IntelliSense IDS Agent..."

# Activate venv
source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
pip install pyinstaller

# Create necessary directories
mkdir -p captures flows models logs

# Build executable
pyinstaller \
  --onefile \
  --name "intellisense-ids-agent" \
  --hidden-import scapy \
  --hidden-import pyshark \
  --hidden-import firebase_admin \
  --hidden-import sklearn \
  --hidden-import joblib \
  --hidden-import pandas \
  --hidden-import numpy \
  --hidden-import boto3 \
  --hidden-import cicflowmeter \
  --add-data "config:config" \
  main.py

echo ""
echo "Build complete!"
echo "Executable: dist/intellisense-ids-agent"
echo ""
echo "To install on a new machine:"
echo "1. Copy dist/intellisense-ids-agent to target machine"
echo "2. Run: chmod +x intellisense-ids-agent"
echo "3. Run: ./intellisense-ids-agent --setup"
echo "4. Follow the setup wizard"
