import { useEffect, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db, auth } from "../firebase/firebaseConfig";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import styles from "../styles/AddCategory.module.css";

export default function AddCategory({ onClose, onSave, categoryToEdit }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tag, setTag] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (categoryToEdit) {
      setNombre(categoryToEdit.nombre);
      setDescripcion(categoryToEdit.descripcion);
      setTag(categoryToEdit.tag || "");
    }
  }, [categoryToEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let imagenUrl = categoryToEdit?.imagenUrl || "";
      let imagePath = categoryToEdit?.imagePath || "";

      if (imageFile) {
        imagePath = `categorias/${Date.now()}-${imageFile.name}`;
        const imageRef = ref(storage, imagePath);
        await uploadBytes(imageRef, imageFile);
        imagenUrl = await getDownloadURL(imageRef);
      }

      await onSave({
        id: categoryToEdit?.id,
        nombre,
        descripcion,
        tag,
        imagenUrl,
        imagePath,
      });

      // 🔔 NOTIFICACIÓN UNIFICADA
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        const userName = userDoc.exists()
          ? userDoc.data().nombre
          : "Desconocido";

        // crear
        if (!categoryToEdit) {
          await addDoc(collection(db, "notificaciones"), {
            userId: user.uid,
            userName,
            userEmail: user.email,
            action: "creó categoría",
            detail: {
              tipo: "categoria-nombre",
              antes: "",
              despues: nombre,
            },
            timestamp: serverTimestamp(),
          });
        }

        // editar nombre
        if (
          categoryToEdit &&
          categoryToEdit.nombre !== nombre
        ) {
          await addDoc(collection(db, "notificaciones"), {
            userId: user.uid,
            userName,
            userEmail: user.email,
            action: "editó categoría",
            detail: {
              tipo: "categoria-nombre",
              antes: categoryToEdit.nombre,
              despues: nombre,
            },
            timestamp: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      console.error("Error al guardar categoría:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.categoryForm}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{categoryToEdit ? "Editar categoría" : "Nueva categoría"}</h2>

        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </label>

        <label>
          Descripción
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            required
          />
        </label>

        <label>
          Imagen
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />
        </label>

        <label>
          Tag
          <input value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>

        <div className={styles.actions}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
