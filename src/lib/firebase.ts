
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  "projectId": "fluxidocs",
  "appId": "1:789878664580:web:484bd65feab371b5d281d1",
  "storageBucket": "fluxidocs.firebasestorage.app",
  "apiKey": "AIzaSyDOKEMSeFD2qnYxgitFjB4c8yQfvXPsnFE",
  "authDomain": "fluxidocs.firebaseapp.com",
  "messagingSenderId": "789878664580"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
