from features.feature_mapper import FeatureMapper


def test_exact_and_normalized_mapping():
    mapper = FeatureMapper(["Flow Duration", "Total Fwd Packets"])
    mapped = mapper.map_flow({"flow_duration": 10, "Total Forward Packets": 2})
    assert mapped["Flow Duration"] == 10
    assert mapped["Total Fwd Packets"] == 2