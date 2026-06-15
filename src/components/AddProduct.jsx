import { useState, useEffect } from "react";
import { storage, db, auth } from "../firebase/firebaseConfig";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import styles from "../styles/AddProduct.module.css";

/* ================= UTIL ================= */
const formatText = (value) => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const createEmptyVariant = () => ({
  attr: "",
  price: "",
  priceJuego: "",
  unidadesPorJuego: "",
  image: "",
  stock4320: 0,
  stock4034: 0,
  stock2440: 0,
});

export default function AddProduct({ onClose, onSave, categoriaId, producto }) {
  const [name, setName] = useState(producto?.name || "");
  const [tag, setTag] = useState(producto?.tag || "");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [variantImages, setVariantImages] = useState({});

  const [variantes, setVariantes] = useState(
    producto?.variantes?.map((v) => ({
      attr: v.attr || "",
      price: v.price ?? "",
      priceJuego: v.priceJuego ?? "",
      unidadesPorJuego: v.unidadesPorJuego ?? "",
      image: v.image || "",
      stock4320: v.stock?.["Los Andes 4320"] ?? 0,
      stock4034: v.stock?.["Los Andes 4034"] ?? 0,
      stock2440:
        v.stock?.["Jofre 2440"] ??
        v.stock?.["Mosconi"] ??
        0,
    })) || [createEmptyVariant()]
  );

  /* ================= ESC PARA CERRAR ================= */
  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  /* ================= VARIANTES ================= */
  const handleAddVariant = () => {
    setVariantes([...variantes, createEmptyVariant()]);
  };

  const handleRemoveVariant = (index) => {
    if (variantes.length === 1) return;
    setVariantes(variantes.filter((_, i) => i !== index));
  };

  const handleVariantChange = (index, field, value) => {
    const newVariantes = [...variantes];
    newVariantes[index][field] = value;
    setVariantes(newVariantes);
  };

  /* ================= NOTIFICACION ================= */
  const sendNotification = async (detail) => {
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
        action: producto ? "editó producto" : "creó producto",
        detail,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error al crear notificación:", err);
    }
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    if (
      !name.trim() ||
      variantes.some((v) => v.attr.trim() === "" || v.price === "")
    ) {
      alert("Completa todos los campos obligatorios.");
      return;
    }

    if (
      variantes.some(
        (v) =>
          (v.priceJuego !== "" && v.unidadesPorJuego === "") ||
          (v.priceJuego === "" && v.unidadesPorJuego !== "")
      )
    ) {
      alert(
        "Si cargás precio por juego/combo, también tenés que indicar las unidades por juego/combo."
      );
      return;
    }

    try {
      setLoading(true);

      let imageURL = producto?.image || "";

      if (imageFile) {
        const fileName = `${Date.now()}-${imageFile.name}`;
        const storageRef = ref(storage, `products/${fileName}`);
        await uploadBytes(storageRef, imageFile);
        imageURL = await getDownloadURL(storageRef);
      }

      const variantesConImagen = await Promise.all(
        variantes.map(async (v, i) => {
          let image = v.image || "";

          if (variantImages[i]) {
            const fileName = `${Date.now()}-${variantImages[i].name}`;
            const storageRef = ref(storage, `variants/${fileName}`);
            await uploadBytes(storageRef, variantImages[i]);
            image = await getDownloadURL(storageRef);
          }

          return {
            attr: v.attr,
            price: Number(v.price),
            priceJuego: v.priceJuego !== "" ? Number(v.priceJuego) : null,
            unidadesPorJuego:
              v.unidadesPorJuego !== "" ? Number(v.unidadesPorJuego) : null,
            image,
            stock: {
              "Los Andes 4320": Number(v.stock4320),
              "Los Andes 4034": Number(v.stock4034),
              "Jofre 2440": Number(v.stock2440),
            },
          };
        })
      );

      const nuevoProducto = {
        name,
        tag,
        image: imageURL,
        variantes: variantesConImagen,
      };

      if (!producto) {
        nuevoProducto.createdAt = serverTimestamp();
      }

      await onSave(nuevoProducto);

      if (producto) {
        if (producto.name !== name) {
          await sendNotification({
            tipo: "nombre",
            producto: producto.name,
            antes: producto.name,
            despues: name,
          });
        }
      } else {
        await sendNotification({
          tipo: "nombre",
          producto: name,
          antes: "",
          despues: name,
        });
      }

      onClose?.();
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error. Revisá la consola.");
    } finally {
      loading(false);
    }
  };

  /* ================= UI ================= */
  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.productForm}
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
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} onClick={onClose}>
          ×
        </button>

        <h2>{producto ? "Editar producto" : "Nuevo producto"}</h2>

        <label>
          Nombre del producto
          <input
            type="text"
            value={name}
            onChange={(e) => setName(formatText(e.target.value))}
          />
        </label>

        <label>
          Badge
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(formatText(e.target.value))}
          />
        </label>

        <label>
          Imagen principal
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />
        </label>

        <fieldset>
          <legend>Variedades</legend>

          {variantes.map((v, i) => (
            <div key={i} className={styles.variant}>
              <label>
                Modelo o Color
                <input
                  type="text"
                  value={v.attr}
                  onChange={(e) =>
                    handleVariantChange(
                      i,
                      "attr",
                      formatText(e.target.value)
                    )
                  }
                />
              </label>

              <label>
                Precio por unidad
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={v.price}
                  onChange={(e) =>
                    handleVariantChange(i, "price", e.target.value)
                  }
                  onWheel={(e) => e.target.blur()}
                />
              </label>

              <label>
                Precio por juego / combo
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={v.priceJuego}
                  onChange={(e) =>
                    handleVariantChange(i, "priceJuego", e.target.value)
                  }
                  onWheel={(e) => e.target.blur()}
                  placeholder="Ej: 120000"
                />
              </label>

              <label>
                Unidades por juego / combo
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={v.unidadesPorJuego}
                  onChange={(e) =>
                    handleVariantChange(i, "unidadesPorJuego", e.target.value)
                  }
                  onWheel={(e) => e.target.blur()}
                  placeholder="Ej: 6"
                />
              </label>

              <label>
                Imagen de la variante
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setVariantImages({
                      ...variantImages,
                      [i]: e.target.files[0],
                    })
                  }
                />
              </label>

              {v.image && (
                <img
                  src={v.image}
                  alt={v.attr}
                  style={{ width: 80, marginTop: 6, borderRadius: 6 }}
                />
              )}

              <label>
                Stock Los Andes 4320
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={v.stock4320}
                  onChange={(e) =>
                    handleVariantChange(i, "stock4320", e.target.value)
                  }
                  onWheel={(e) => e.target.blur()}
                />
              </label>

              <label>
                Stock Los Andes 4034
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={v.stock4034}
                  onChange={(e) =>
                    handleVariantChange(i, "stock4034", e.target.value)
                  }
                  onWheel={(e) => e.target.blur()}
                />
              </label>

              <label>
                Stock Jofre 2440
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={v.stock2440}
                  onChange={(e) =>
                    handleVariantChange(i, "stock2440", e.target.value)
                  }
                  onWheel={(e) => e.target.blur()}
                />
              </label>

              <button type="button" onClick={() => handleRemoveVariant(i)}>
                Eliminar variante
              </button>

              <hr />
            </div>
          ))}

          <button type="button" onClick={handleAddVariant}>
            Agregar variante
          </button>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading
            ? "Guardando..."
            : producto
              ? "Guardar cambios"
              : "Agregar producto"}
        </button>
      </form>
    </div>
  );
}