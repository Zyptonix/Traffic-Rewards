// lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDW9enOcoowOaJP7AHZLF0K6lhOlINJONE",
  authDomain: "traffic-app-e4ddb.firebaseapp.com",
  projectId: "traffic-app-e4ddb",
  storageBucket: "traffic-app-e4ddb.firebasestorage.app",
  messagingSenderId: "692231975295",
  appId: "1:692231975295:web:3cbd059548a9bce992ea4a",
  measurementId: "G-PDLKNE0Y29"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with React Native persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// Initialize Firestore
const db = getFirestore(app);

export { app, auth, db };