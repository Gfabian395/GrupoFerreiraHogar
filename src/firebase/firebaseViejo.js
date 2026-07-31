import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔴 Firebase VIEJO (solo lectura)
const firebaseConfigViejo = {
  apiKey: import.meta.env.VITE_FIREBASE_VIEJO_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_VIEJO_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_VIEJO_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_VIEJO_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_VIEJO_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_VIEJO_APP_ID,
};

// ⚠️ el nombre "viejo" es CLAVE
const appViejo = initializeApp(firebaseConfigViejo, "viejo");

// exportamos SOLO firestore
export const dbViejo = getFirestore(appViejo);