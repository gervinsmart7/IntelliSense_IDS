def startup() -> bool:
    global current_model_version
    print("=" * 50)
    print("  IntelliSense IDS Agent")
    print("=" * 50)
    if not os.getenv("API_KEY"):
        print("Agent not configured. Run: python setup.py")
        return False
    auth_data = authenticate()
    if not auth_data:
        print("Authentication failed. Check API key and backend connection.")
        return False
    print(f"Organisation: {auth_data['org_name']}")
    print(f"Org Code:     {auth_data['org_code']}")

    # TEMPORARY: load local bundle directly for testing.
    # Replace this block with the real cloud download once
    # the S3/Firestore bundle pipeline (Step 9) is wired up.
    bundle_dir = os.path.join("models", "v1.0")
    if not classifier.is_model_loaded() and os.path.exists(bundle_dir):
        if classifier.load_bundle(bundle_dir, version="v1.0"):
            current_model_version = "v1.0"
            print(f"Model bundle v1.0 loaded locally")
        else:
            print("Local bundle load failed — running without classification")
    else:
        print("No local bundle found at models/v1.0 — running without classification")

    return True