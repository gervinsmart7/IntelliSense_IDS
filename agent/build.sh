#!/bin/bash
# ─────────────────────────────────────────
# IntelliSense IDS Agent Builder
# Creates a single executable for distribution
# ─────────────────────────────────────────

echo "Building IntelliSense IDS Agent..."

# Install build dependencies
pip install pyinstaller pyshark scapy

# Build single executable
pyinstaller \
  --onefile \
  --name intellisense-agent \
  --add-data "config:config" \
  --hidden-import pyshark \
  --hidden-import firebase_admin \
  --hidden-import sklearn \
  --hidden-import joblib \
  --clean \
  main.py

echo "Build complete: dist/intellisense-agent"
