import React, { useEffect, useState } from "react";
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase/firebaseConfig";
import styles from "../styles/Configuracion.module.css";
import { Loader } from "../components/Loader";

const Configuracion = () => {
  const user = auth.currentUser;

  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [fotoFile, setFotoFile] = useState(null);

  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  /* ===== TRAER DATOS DEL USUARIO ===== */
  useEffect(() => {
    if (!user) return;

    const fetchUserData = async () => {
      try {
        const refUser = doc(db, "usuarios", user.uid);
        const snap = await getDoc(refUser);

        if (snap.exists()) {
          const data = snap.data();
          setNombre(data.nombre || "");
          setRol(data.role || "");
          setFotoUrl(data.fotoUrl || "");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  /* ===== SUBIR FOTO ===== */
  const handleUploadFoto = async () => {
    if (!fotoFile) return;

    setMensaje("");
    setError("");

    try {
      const fotoRef = ref(storage, `usuarios/${user.uid}/perfil.jpg`);
      await uploadBytes(fotoRef, fotoFile);

      const url = await getDownloadURL(fotoRef);

      await updateDoc(doc(db, "usuarios", user.uid), {
        fotoUrl: url,
      });

      setFotoUrl(url);
      setFotoFile(null);
      setMensaje("📸 Foto actualizada correctamente");
    } catch (err) {
      console.error(err);
      setError("Error al subir la foto");
    }
  };

  /* ===== CAMBIAR CONTRASEÑA (CORRECTO) ===== */
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMensaje("");
    setError("");

    if (!passwordActual || !passwordNueva) {
      setError("Completá ambos campos");
      return;
    }

    if (passwordNueva.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordActual
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordNueva);

      setMensaje("✅ Contraseña actualizada correctamente");
      setPasswordActual("");
      setPasswordNueva("");
    } catch (err) {
      console.error(err);

      if (err.code === "auth/wrong-password") {
        setError("La contraseña actual es incorrecta");
      } else {
        setError("Error al cambiar la contraseña");
      }
    }
  };

  if (!user || loading) {
    return <p style={{ padding: 20 }}><Loader/></p>;
  }

  return (
    <div className={styles.configContainer}>
      <div className={styles.configCard}>
        <h2>⚙️ Configuración de usuario</h2>

        {/* FOTO */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img
            src={fotoUrl || "/avatar-default.png"}
            alt="Perfil"
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #38bdf8",
              marginBottom: 10,
            }}
          />

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFotoFile(e.target.files[0])}
          />

          <button
            className={styles.button}
            type="button"
            onClick={handleUploadFoto}
            disabled={!fotoFile}
            style={{ marginTop: 10 }}
          >
            Subir foto
          </button>
        </div>

        {/* INFO */}
        <div className={styles.userInfo}>
          <p><strong>Nombre:</strong> {nombre || "—"}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Rol:</strong> {rol || "—"}</p>
        </div>

        <div className={styles.divider} />

        {/* CONTRASEÑA */}
        <h3>Cambiar contraseña</h3>

        <form onSubmit={handleChangePassword}>
          <input
            className={styles.input}
            type="password"
            placeholder="Contraseña actual"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
          />

          <input
            className={styles.input}
            type="password"
            placeholder="Nueva contraseña"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
          />

          {error && <p className={styles.error}>{error}</p>}
          {mensaje && <p className={styles.success}>{mensaje}</p>}

          <button className={styles.button} type="submit">
            Guardar nueva contraseña
          </button>
        </form>
      </div>
    </div>
  );
};

export default Configuracion;
