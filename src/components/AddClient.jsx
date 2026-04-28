import { useState, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/firebaseConfig";
import styles from "../styles/AddClient.module.css";

/* Avatar por defecto */
const DEFAULT_AVATAR =
  "https://cdn-icons-png.flaticon.com/512/149/149071.png";

/* ================= UTIL ================= */
const formatFullName = (value) => {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const EMPTY_FORM = {
  nombre: "",
  dni: "",
  fotoUrl: DEFAULT_AVATAR,
  direccion: "",
  entreCalles: "",
  telefono1: "",
  telefono2: "",
  estado: "Activo",
};

export default function AddClient({ onClose, onSave, clientToEdit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ===== NUEVO: texto crudo pegado ===== */
  const [rawClientText, setRawClientText] = useState("");

  /* ================= CARGAR CLIENTE ================= */
  useEffect(() => {
    if (clientToEdit) {
      setForm({
        ...EMPTY_FORM,
        ...clientToEdit,
        nombre: formatFullName(clientToEdit.nombre || ""),
        fotoUrl: clientToEdit.fotoUrl || DEFAULT_AVATAR,
      });
    }
  }, [clientToEdit]);

  /* ================= PARSER CLIENTE VIEJO ================= */
  useEffect(() => {
    if (!rawClientText.trim()) return;

    try {
      const getValue = (key) => {
        const regex = new RegExp(`${key}\\s+"([^"]+)"`, "i");
        const match = rawClientText.match(regex);
        return match ? match[1].trim() : "";
      };

      const dni = getValue("dni") || getValue("id");
      if (!dni) return;

      setForm((prev) => ({
        ...prev,
        dni,
        nombre: formatFullName(
          getValue("nombreCompleto") || prev.nombre
        ),
        direccion: getValue("direccion"),
        entreCalles: getValue("entrecalles"),
        telefono1: getValue("telefono1"),
        telefono2: getValue("telefono2"),
        fotoUrl: getValue("imagenUrl") || prev.fotoUrl,
      }));
    } catch (e) {
      console.error("Error leyendo cliente viejo:", e);
    }
  }, [rawClientText]);

  /* ================= INPUTS ================= */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  /* ================= IMAGEN ================= */
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({ ...prev, fotoUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    if (!form.nombre.trim() || !form.dni.trim()) {
      alert("Nombre y DNI son obligatorios");
      return;
    }

    try {
      setLoading(true);

      let finalImageUrl = form.fotoUrl;

      if (imageFile) {
        const imageRef = ref(storage, `clientes/${form.dni}`);
        await uploadBytes(imageRef, imageFile);
        finalImageUrl = await getDownloadURL(imageRef);
      }

      await onSave({
        ...form,
        nombre: formatFullName(form.nombre),
        fotoUrl: finalImageUrl || DEFAULT_AVATAR,
      });

      onClose();
    } catch (err) {
      console.error("Error subiendo cliente:", err);
      alert("Error al guardar cliente");
    } finally {
      setLoading(false);
    }
  };

  /* ================= ESC ================= */
  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  /* ================= UI ================= */
  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.clientForm}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <h2>{clientToEdit ? "Editar cliente" : "Nuevo cliente"}</h2>

        {/* FOTO */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src={form.fotoUrl}
            alt="Cliente"
            width={70}
            height={70}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid #ddd",
            }}
            onError={(e) => (e.target.src = DEFAULT_AVATAR)}
          />
        </div>

        <label>
          Foto del cliente
          <input type="file" accept="image/*" onChange={handleImageUpload} />
        </label>

        <label>
          Nombre completo
          <input name="nombre" value={form.nombre} onChange={handleChange} />
        </label>

        <label>
          DNI
          <input name="dni" value={form.dni} onChange={handleChange} />
        </label>

        <label>
          Dirección
          <input
            name="direccion"
            value={form.direccion}
            onChange={handleChange}
          />
        </label>

        <label>
          Entre calles
          <input
            name="entreCalles"
            value={form.entreCalles}
            onChange={handleChange}
          />
        </label>

        <fieldset>
          <legend>WhatsApp</legend>

          <label>
            Teléfono principal
            <input
              name="telefono1"
              value={form.telefono1}
              onChange={handleChange}
            />
          </label>

          <label>
            Teléfono alternativo
            <input
              name="telefono2"
              value={form.telefono2}
              onChange={handleChange}
            />
          </label>
        </fieldset>

        <label>
          Estado del cliente
          <select
            name="estado"
            value={form.estado}
            onChange={handleChange}
          >
            <option value="Activo">Activo</option>
            <option value="Bloqueado">Bloqueado</option>
          </select>
        </label>

        <div className={styles.actions}>
          <button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Agregar cliente"}
          </button>

          <button
            type="button"
            className={styles.cancel}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
