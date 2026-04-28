import { useState, useEffect } from "react";
import styles from "../styles/AddCombo.module.css";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db, auth } from "../firebase/firebaseConfig";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
} from "firebase/firestore";

/* ================= UTIL ================= */
const formatText = (value) => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

export default function AddCombo({ onClose, onSave, products = [] }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ================= ESC ================= */
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  /* ================= ITEMS ================= */
  const addItem = () => {
    setItems((prev) => [...prev, { productId: "", quantity: 1, variant: "" }]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  /* ================= NOTIFICACIÓN ================= */
  const sendNotification = async (action, newName) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(db, "usuarios", user.uid));
      const userName = userDoc.exists()
        ? userDoc.data().nombre
        : "Desconocido";

      await addDoc(collection(db, "notificaciones"), {
        userId: user.uid,
        userName,
        userEmail: user.email,
        action,           // "creó combo"
        oldName: null,
        categoryName: newName,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error creando notificación:", err);
    }
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    if (!name.trim() || !price || items.length === 0) {
      alert("Completá todos los datos del combo");
      return;
    }

    if (items.some((i) => !i.productId || !i.variant || i.quantity <= 0)) {
      alert("Todos los items deben tener producto, variante y cantidad");
      return;
    }

    try {
      setLoading(true);
      let imageURL = "";

      if (imageFile) {
        const fileName = `${Date.now()}-${imageFile.name}`;
        const imgRef = ref(storage, `combos/${fileName}`);
        await uploadBytes(imgRef, imageFile);
        imageURL = await getDownloadURL(imgRef);
      }

      const combo = {
        type: "combo",
        name,
        price: Number(price),
        image: imageURL,
        items,
        active: true,
        createdAt: serverTimestamp(),
      };

      await onSave(combo);
      await sendNotification("creó combo", name);
      onClose?.();
    } catch (err) {
      console.error(err);
      alert("Error al guardar el combo");
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */
  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.form}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      >
        <button type="button" className={styles.close} onClick={onClose}>
          ×
        </button>

        <h2>Nuevo combo</h2>

        <label>
          Nombre del combo
          <input
            type="text"
            value={name}
            onChange={(e) => setName(formatText(e.target.value))}
          />
        </label>

        <label>
          Precio del combo
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>

        <label>
          Imagen del combo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />
        </label>

        <fieldset>
          <legend>Productos del combo</legend>

          {items.map((item, i) => {
            const product = products.find((p) => p.id === item.productId);
            return (
              <div key={i} className={styles.item}>
                <select
                  value={item.productId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    updateItem(i, "productId", newId);
                    // Resetea la variante al cambiar de producto
                    const firstVariant = products.find((p) => p.id === newId)?.variantes?.[0]?.attr || "";
                    updateItem(i, "variant", firstVariant);
                  }}
                >
                  <option value="">Producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {product?.variantes?.length > 0 && (
                  <select
                    value={item.variant}
                    onChange={(e) => updateItem(i, "variant", e.target.value)}
                  >
                    {product.variantes.map((v) => (
                      <option key={v.attr} value={v.attr}>
                        {v.attr} - {v.price?.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 })}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", e.target.value)}
                />

                <button type="button" onClick={() => removeItem(i)}>
                  ✕
                </button>
              </div>
            );
          })}

          <button type="button" onClick={addItem}>
            + Producto
          </button>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar combo"}
        </button>
      </form>
    </div>
  );
}
