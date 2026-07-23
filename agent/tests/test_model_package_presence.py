from pathlib import Path


def test_model_package_documented():
    model_dir = Path(__file__).resolve().parents[1] / "models" / "current"
    assert (model_dir / "README.md").exists()