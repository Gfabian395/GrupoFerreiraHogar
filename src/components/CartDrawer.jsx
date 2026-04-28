import { useEffect } from "react";
import Carrito from "../pages/Carrito";
import styles from "../styles/CartDrawer.module.css";

export default function CartDrawer({ open, onClose }) {
  useEffect(() => {
    const esc = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />

      <aside className={styles.drawer}>
        <header>
          <h2>🛒 Carrito</h2>
          <button onClick={onClose}>✕</button>
        </header>

        <div className={styles.content}>
          <Carrito />
        </div>
      </aside>
    </>
  );
}
