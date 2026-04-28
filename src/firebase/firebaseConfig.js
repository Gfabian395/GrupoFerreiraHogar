import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth"; // 👈 FALTA ESTO

const firebaseConfig = {
  apiKey: "AIzaSyC0HbSUzBydOw_xmLAosPhH6tzSUXRsXvs",
  authDomain: "gfh2-0-42d45.firebaseapp.com",
  projectId: "gfh2-0-42d45",
  storageBucket: "gfh2-0-42d45.firebasestorage.app",
  messagingSenderId: "307822228388",
  appId: "1:307822228388:web:05af42c71ac0bfd5a58731"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app); // 👈 AHORA SÍ

export { db, storage, auth };