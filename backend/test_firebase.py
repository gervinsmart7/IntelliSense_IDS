import firebase_admin
from firebase_admin import credentials, firestore 
cred = credentials.Certificate('intellisense-ids-firebase-adminsdk-fbsvc-57bca2774b.json')
firebase_admin.initialize_app(cred)
db = firestore.client()
db.collection('test').document('connection').set({'status': 'connected', 'message': 'Firebase is working' })
doc = db.collection('test').document('connection').get()
print("Firebase connection successful")
print(f"Data: {doc.to_dict()}")
db.collection('test').document('connection').delete()
print("Test document cleaned up")
print("Firebase setup complete")
