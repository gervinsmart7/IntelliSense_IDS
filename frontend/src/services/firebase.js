import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyC8Y94bfgChg8YWo1jl7hRrRDc15Ltu0jU",
  authDomain: "intellisense-ids.firebaseapp.com",
  projectId: "intellisense-ids",
  storageBucket: "intellisense-ids.firebasestorage.app",
  messagingSenderId: "969292059371",
  appId: "1:969292059371:web:ba6906690814d2abc5a4ae"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export default app
