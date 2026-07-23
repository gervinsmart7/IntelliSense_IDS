import sys
sys.path.insert(0, '.')
from classifier.predict import TrafficClassifier
from features.extractor import FeatureExtractor
import pandas as pd

classifier = TrafficClassifier()
classifier.load_bundle('models/v1.0', version='v1.0')

extractor = FeatureExtractor()

# Load any CSV of captured flows you already have from testing capture.py
df = pd.read_csv('flows/synthetic_test_flow.csv')
df.columns = df.columns.str.strip()

result = classifier.classify(df, extractor)
print(result[['prediction', 'confidence']].head(10))
