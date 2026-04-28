import { useState } from "react";
import styles from "../styles/Drop.module.css";

export default function Drop({
  onPDFStock,
  onGenerateQR,
  onIncreasePrices,
  onDecreasePrices,
  showSinStock,
  onToggleSinStock
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.box}>
      <div
        className={`${styles.dropdown} ${open ? styles.active : ""}`}
        onClick={() => setOpen(!open)}
      >
        <i className="bx bxs-cog"></i>

        <span className={styles.leftIcon}></span>
        <span className={styles.rightIcon}></span>

        <div
          className={styles.items}
          onClick={(e) => e.stopPropagation()}
        >

          {onPDFStock && (
            <button
              style={{ "--i": 1 }}
              onClick={onPDFStock}
              className={styles.item}
            >
              <span></span>
              <i className="bx bxs-file-pdf"></i>
              Descargar PDF Stock
            </button>
          )}

          {onGenerateQR && (
            <button
              style={{ "--i": 2 }}
              onClick={onGenerateQR}
              className={styles.item}
            >
              <span></span>
              <i className="bx bx-qr"></i>
              Generar QR productos
            </button>
          )}

          {onIncreasePrices && (
            <button
              style={{ "--i": 3 }}
              onClick={onIncreasePrices}
              className={styles.item}
            >
              <span></span>
              <i className="bx bx-trending-up"></i>
              Aumentar precios
            </button>
          )}

          {onDecreasePrices && (
            <button
              style={{ "--i": 4 }}
              onClick={onDecreasePrices}
              className={styles.item}
            >
              <span></span>
              <i className="bx bx-trending-down"></i>
              Bajar precios
            </button>
          )}

          {/* 🔥 BOTÓN SIN STOCK */}
          {onToggleSinStock && (
            <button
              style={{ "--i": 5 }}
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