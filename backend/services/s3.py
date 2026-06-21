import boto3
from botocore.exceptions import ClientError
import os

# Initialize S3 client
s3_client = boto3.client(
    's3',
    region_name=os.getenv('AWS_REGION', 'us-east-1')
)

BUCKET_NAME = os.getenv('AWS_BUCKET_NAME', 'intellisense-ids')

def upload_file(local_path, s3_key):
    try:
        s3_client.upload_file(local_path, BUCKET_NAME, s3_key)
        return {"status": "success", "key": s3_key}
    except ClientError as e:
        return {"status": "error", "message": str(e)}

def download_file(s3_key, local_path):
    try:
        s3_client.download_file(BUCKET_NAME, s3_key, local_path)
        return {"status": "success"}
    except ClientError as e:
        return {"status": "error", "message": str(e)}

def generate_presigned_url(s3_key, expiry=3600):
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': s3_key},
            ExpiresIn=expiry
        )
        return url
    except ClientError as e:
        return None

def upload_object(data, s3_key, content_type='text/csv'):
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=data,
            ContentType=content_type
        )
        return {"status": "success", "key": s3_key}
    except ClientError as e:
        return {"status": "error", "message": str(e)}

def list_objects(prefix):
    try:
        response = s3_client.list_objects_v2(
            Bucket=BUCKET_NAME,
            Prefix=prefix
        )
        return response.get('Contents', [])
    except ClientError as e:
        return []
