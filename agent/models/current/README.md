# Put the tested model artifacts here

Copy these four files from the full `AI_IDS_Project` on the development computer:

- `models/trained_models/ids_model_v1.pkl` -> `agent/models/current/model.pkl`
- `models/scalers/scaler.pkl` -> `agent/models/current/scaler.pkl`
- `models/encoders/label_encoder.pkl` -> `agent/models/current/label_encoder.pkl`
- `datasets/processed/feature_names.npy` -> `agent/models/current/feature_names.npy`

The code-only archive intentionally does not contain the model binaries.