import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔴 Firebase VIEJO (solo lectura)
const firebaseConfigViejo = {
  apiKey: "AIzaSyDVFZ4a-WpIdI91izdKmx1auy5jX7YXKDI",
  authDomain: "ferreirahogar-376dd.firebaseapp.com",
  projectId: "ferreirahogar-376dd",
  storageBucket: "ferreirahogar-376dd.firebasestorage.app",
  messagingSenderId: "820729807208",
  appId: "1:820729807208:web:e9328c90439287cf4356dd",
};

// ⚠️ el nombre "viejo" es CLAVE
const appViejo = initializeApp(firebaseConfigViejo, "viejo");

// exportamos SOLO firestore
export const dbViejo = getFirestore(appViejo);
