import { useState } from "react";
import styles from "../styles/Drop.module.css";

export default function Drop({
  onPDFStock,
  onGenerateQR,
  onIncreasePrices,
  onDecreasePrices,
  showSinStock,
  onToggleSinStock,
  userRole
}) {
  const [open, setOpen] = useState(false);
  const isAdmin = userRole === "admin" || userRole === "jefe" || userRole === "encargado";

  return (
    <div className={styles.box}>
      <div
        className={`${styles.dropdown} ${open ? styles.active : ""}`}
        onClick={() => setOpen(!open)}
      >
        <i className="bx bxs-cog"></i>

        <span className={styles.leftIcon}></span>
        <span className={styles.rightIcon}></span>

        {/* 🟢 Si no es admin, le sumamos la clase styles.vendedorMenu */}
        <div
          className={`${styles.items} ${!isAdmin ? styles.vendedorMenu : ""}`}
          onClick={(e) => e.stopPropagation()}
        >

          {isAdmin && onPDFStock && (
            <button style={{ "--i": 1 }} onClick={onPDFStock} className={styles.item}>
              <span></span>
              <i className="bx bxs-file-pdf"></i> Descargar PDF Stock
            </button>
          )}

          {isAdmin && onGenerateQR && (
            <button style={{ "--i": 2 }} onClick={onGenerateQR} className={styles.item}>
              <span></span>
              <i className="bx bx-qr"></i> Generar QR productos
            </button>
          )}

          {isAdmin && onIncreasePrices && (
            <button style={{ "--i": 3 }} onClick={onIncreasePrices} className={styles.item}>
              <span></span>
              <i className="bx bx-trending-up"></i> Aumentar precios
            </button>
          )}

          {isAdmin && onDecreasePrices && (
            <button style={{ "--i": 4 }} onClick={onDecreasePrices} className={styles.item}>
              <span></span>
              <i className="bx bx-trending-down"></i> Bajar precios
            </button>
          )}

          {/* 🔥 BOTÓN SIN STOCK (Único que ve el vendedor) */}
          {onToggleSinStock && (
            <button
              style={{ "--i": 1 }} // 👈 Le forzamos el índice 1 para que no herede retrasos de animación raros
              onClick={onToggleSinStock}
              className={`${styles.item} ${showSinStock ? styles.activeItem : ""}`}
            >
              <span></span>
              <i className={`bx ${showSinStock ? "bx-hide" : "bx-show"}`}></i>
              {showSinStock ? "Ocultar sin stock" : "Ver sin stock"}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}