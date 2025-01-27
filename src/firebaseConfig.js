import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDVFZ4a-WpIdI91izdKmx1auy5jX7YXKDI",
    authDomain: "ferreirahogar-376dd.firebaseapp.com",
    projectId: "ferreirahogar-376dd",
    storageBucket: "ferreirahogar-376dd.firebasestorage.app",
    messagingSenderId: "820729807208",
    appId: "1:820729807208:web:e9328c90439287cf4356dd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
};

const register = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
};

export { login, register, db };
