import os

# Create necessary directories on import
dirs = ['captures', 'flows', 'models', 'logs']
for d in dirs:
    os.makedirs(
        os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            d
        ),
        exist_ok=True
    )
