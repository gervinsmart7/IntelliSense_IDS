import boto3
from botocore.exceptions import ClientError

s3 = boto3.client('s3', region_name='us-east-1')
BUCKET_NAME = 'intellisense-ids'

def test_s3_connection():
    try:
        # Test 1 — List buckets
        response = s3.list_buckets()
        print("S3 connection successful")
        print(f"Buckets: {[b['Name'] for b in response['Buckets']]}")

        # Test 2 — Upload test file
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key='test/connection-test.txt',
            Body=b'IntelliSense IDS S3 test'
        )
        print("Test file uploaded successfully")

        # Test 3 — Read it back
        response = s3.get_object(
            Bucket=BUCKET_NAME,
            Key='test/connection-test.txt'
        )
        content = response['Body'].read().decode('utf-8')
        print(f"File content: {content}")

        # Test 4 — Delete test file
        s3.delete_object(
            Bucket=BUCKET_NAME,
            Key='test/connection-test.txt'
        )
        print("Test file cleaned up")
        print("S3 setup complete")

    except ClientError as e:
        print(f"S3 error: {e}")

test_s3_connection()
