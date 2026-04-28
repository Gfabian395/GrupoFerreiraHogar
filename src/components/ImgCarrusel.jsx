import { useState, useEffect } from "react";
import styles from "../styles/ImgCarrusel.module.css";

const ImgCarrusel = ({ imagenes = [], onClose, indexInicial = 0 }) => {
  // Definir placeholders confiables
  const placeholders = [
    "https://placehold.co/200?text=1",
    "https://placehold.co/200?text=2",
    "https://placehold.co/200?text=3",
    "https://placehold.co/200?text=4",
    "https://placehold.co/200?text=5",
  ];

  // Usar imágenes recibidas o placeholders
  const imgs = imagenes.length > 0 ? imagenes : placeholders;

  // Asegurar indexInicial válido
  const [index, setIndex] = useState(Math.min(indexInicial, imgs.length - 1));

  const siguiente = () => setIndex((prev) => (prev + 1) % imgs.length);
  const anterior = () => setIndex((prev) => (prev - 1 + imgs.length) % imgs.length);

  // 👉 Función para compartir por WhatsApp
  const compartirWhatsApp = async () => {
  const urlImagen = imgs[index];

  try {
    const response = await fetch(urlImagen);
    const blob = await response.blob();

    const file = new File([blob], "imagen.jpg", { type: blob.type });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Imagen",
        text: "Mirá esta imagen 👇",
        files: [file],
      });
    } else {
      // fallback (lo que ya tenías)
      const mensaje = encodeURIComponent(`Mirá esta imagen 👇\n${urlImagen}`);
      window.open(`https://wa.me/?text=${mensaje}`, "_blank");
    }
  } catch (error) {
    console.error("Error al compartir:", error);

    // fallback si algo falla
    const mensaje = encodeURIComponent(`Mirá esta imagen 👇\n${urlImagen}`);
    window.open(`https://wa.me/?text=${mensaje}`, "_blank");
  }
};

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") siguiente();
      if (e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!imgs || imgs.length === 0) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.carrusel} onClick={(e) => e.stopPropagation()}>
        
        <button className={styles.cerrarBtn} onClick={onClose}>✕</button>
        <button className={styles.prevBtn} onClick={anterior}>‹</button>

        <img
          src={imgs[index]}
          alt={`Imagen ${index + 1}`}
          className={styles.carruselImg}
        />

        <button className={styles.nextBtn} onClick={siguiente}>›</button>

        {/* 👉 BOTÓN NUEVO */}
        <button className={styles.shareBtn} onClick={compartirWhatsApp}>
          Compartir por WhatsApp
        </button>

        <div className={styles.indicadores}>
          {imgs.map((_, i) => (
            <span
              key={i}
              className={`${styles.indicador} ${i === index ? styles.activo : ""}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>

      </div>
    </div>
  );
};

export default ImgCarrusel;
