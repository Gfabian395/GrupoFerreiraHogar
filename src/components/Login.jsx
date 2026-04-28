import React, { useState } from "react";
import styles from "../styles/Login.module.css";
import { auth, db } from "../firebase/firebaseConfig";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const Login = ({ onGuestLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const email = username.includes("@")
        ? username.trim()
        : `${username.trim()}@ferreirahogar.com`;

      const cred = await signInWithEmailAndPassword(auth, email, password);

      const ref = doc(db, "usuarios", cred.user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await signOut(auth);
        setError("Usuario no autorizado");
        return;
      }

      if (snap.data().activo === false) {
        await signOut(auth);
        setError("Usuario deshabilitado");
        return;
      }

      // ✅ NO navegar ni setear estado acá (lo hace el App.js con onAuthStateChanged)

    } catch (err) {
      console.error(err);

      if (err.code === "auth/invalid-email") {
        setError("Usuario inválido");
      } else if (err.code === "auth/wrong-password") {
        setError("Contraseña incorrecta");
      } else if (err.code === "auth/user-not-found") {
        setError("Usuario inexistente");
      } else {
        setError("Error al iniciar sesión");
      }
    }
  };

  const handleGuest = () => {
    if (onGuestLogin) onGuestLogin();
  };

  return (
    <div className={styles.loginOverlay}>
      <div className={styles.container}>
        <div className={styles["login-box"]}>
          <h2>Login</h2>

          <form onSubmit={handleSubmit}>
            <div className={styles["input-box"]}>
              <input
                id="username"           // 🔹 id único
                name="username"         // 🔹 nombre del campo
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" // 🔹 ayuda al navegador con autofill
              />
              <label htmlFor="username">Usuario</label>
            </div>

            <div className={styles["input-box"]}>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <label htmlFor="password">Contraseña</label>
            </div>

            {error && (
              <p style={{ color: "red", textAlign: "center" }}>{error}</p>
            )}

            <button type="submit" className={styles.btn}>
              Login
            </button>
          </form>

          <div style={{ display: "flex" }}>
  <button
    type="button"
    onClick={handleGuest}
    style={{
      marginTop: "15px",
      marginLeft: "16%",          // lo empuja a la derecha
      padding: "10px 20px",
      backgroundColor: "transparent",
      color: "#666",
      border: "none",
      cursor: "pointer",
      fontSize: "20px",
      fontWeight: "400",
    }}
  >
    Ingresar como invitado
  </button>
</div>
        </div>

        {[...Array(50)].map((_, i) => (
          <span key={i} style={{ "--i": i }}></span>
        ))}
      </div>
    </div>
  );
};

export default Login;