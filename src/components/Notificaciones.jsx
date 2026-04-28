import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import styles from "../styles/Notificaciones.module.css";

export default function Notificaciones() {
  const [notificacion, setNotificacion] = useState(null);
  const [shownIds, setShownIds] = useState(new Set());

  useEffect(() => {
    const now = new Date();

    const q = query(
      collection(db, "notificaciones"),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((c) => {
        if (c.type !== "added") return;

        const item = { id: c.doc.id, ...c.doc.data() };

        if (shownIds.has(item.id)) return;
        if (item.timestamp?.toDate() <= now) return;

        setNotificacion(item);
        setShownIds((p) => new Set(p).add(item.id));

        setTimeout(() => setNotificacion(null), 5000);
      });
    });

    return () => unsub();
  }, [shownIds]);

  if (!notificacion) return null;

  const d = notificacion.detail || {};

  const renderTexto = () => {
    const user = notificacion.userName || "Alguien";

    if (!d.tipo) return `${user} ${notificacion.action || "realizó una acción"}`;

    switch (d.tipo) {
      case "nombre":
        return `${user} cambió el nombre del producto`;
      case "precio":
        return `${user} modificó el precio de ${d.producto}`;
      case "stock":
        return `${user} modificó stock de ${d.producto}`;
      case "categoria-nombre":
        return `${user} modificó el nombre de una categoría`;
      case "carrito":
        return `${user} agregó al carrito "${d.producto}" (${d.variante})`;
      case "eliminado":
        return `${user} eliminó "${d.producto}"`;
      default:
        return `${user} ${notificacion.action}`;
    }
  };

  const renderDetalle = () => {
    if (!d.tipo) return null;

    switch (d.tipo) {
      case "nombre":
        return (
          <div className={styles.detail}>
            {d.antes || "—"} → <b>{d.despues}</b>
          </div>
        );
      case "precio":
        return (
          <div className={styles.detail}>
            💲 {d.antes?.toLocaleString("es-AR") || "—"} →{" "}
            <b>{d.despues?.toLocaleString("es-AR")}</b>
          </div>
        );
      case "stock":
        return (
          <div className={styles.detail}>
            📍 {d.sucursal}: <b>{d.antes}</b> → <b>{d.despues}</b>
          </div>
        );
      case "categoria-nombre":
        return (
          <div className={styles.detail}>
            {d.antes || "—"} → <b>{d.despues}</b>
          </div>
        );
      case "carrito":
        return (
          <div className={styles.detail}>
            📍 {d.sucursal} — 💲 {d.precio?.toLocaleString("es-AR")}
          </div>
        );
      case "eliminado":
        return null;
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.notification}>
        <span className={styles.action}>{renderTexto()}</span>
        {renderDetalle()}
      </div>
    </div>
  );
}
