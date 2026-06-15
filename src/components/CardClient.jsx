import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/CardClient.module.css";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export default function CardClient({ cliente, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  if (!cliente) return null;

  const {
    id,
    nombre,
    dni,
    direccion,
    entreCalles,
    telefono1,
    telefono2,
    estado,
    fotoUrl,
  } = cliente;

  // 🔍 CONTROL: Mirá la consola de tu navegador (F12) para ver la estructura real de tu cliente si el ID no aparece.
  console.log("Datos de este cliente:", cliente);

  // ===============================
  // CERRAR MENU (CLICK FUERA / ESC)
  // ===============================
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  // ===============================
  // NAVEGACIÓN A DETALLE DE CLIENTE
  // ===============================
  const handleCardClick = () => {
    navigate(`/clientes/${id}`);
  };

  const limpiarNumero = (numero) => {
    if (!numero) return "";
    return numero.replace(/\D/g, ""); // elimina todo lo que no sea número
  };

  const bloquearCliente = async () => {
    try {
      await updateDoc(doc(db, "clientes", id), {
        estado: "Bloqueado",
      });

      window.location.reload(); // o refrescar clientes
    } catch (error) {
      console.error("Error bloqueando cliente:", error);
    }
  };

  // Variable para manejar la clase de estado dinámicamente
  let cardStatusClass = "";

  if (estado === "Bloqueado") {
    cardStatusClass = styles.cardBlocked;
  } else if (cliente.comprasPagadas > 10) {
    cardStatusClass = styles.cardVip;       // Más de 10 -> Verde
  } else if (cliente.comprasPagadas > 5) {
    cardStatusClass = styles.cardPremium;   // Más de 5 -> Amarillo
  }

  // Intenta capturar el ID usando variantes comunes por si cambia el nombre en Firebase
  const idDeVenta = cliente.idVenta || cliente.id_venta || cliente.idVentaActiva;

  return (
    <div className={styles.clientWrapper}>
      <article
        className={`${styles.clientCard} ${cardStatusClass}`}
        onClick={handleCardClick}
        style={{ cursor: "pointer" }}
      >
        {/* HEADER */}
        <header className={styles.clientHeader}>
          <div className={styles.avatar}>
            <img
              src={
                fotoUrl ||
                "https://cdn-icons-png.flaticon.com/512/149/149071.png"
              }
              alt={nombre}
            />
          </div>

          <div className={styles.identity}>
            <h3>{nombre}</h3>
          </div>

          {/* MENU */}
          <div
            className={styles.clientMenu}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.menuBtn}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(!open);
              }}
            >
              ⋮
            </button>

            {open && (
              <div className={styles.menuDropdown}>
                <button onClick={() => onEdit(cliente)}>✏️ Editar cliente</button>
                <button>📝 Observaciones</button>
                <button
                  className={styles.danger}
                  onClick={(e) => {
                    e.stopPropagation();
                    bloquearCliente();
                  }}
                >
                  🚫 Bloquear cliente
                </button>
                <button className={styles.danger} onClick={() => onDelete(cliente)}>
                  🗑 Eliminar
                </button>
              </div>
            )}
          </div>

          {/* ESTADO */}
          <span
            className={`${styles.status} ${estado === "Activo" ? styles.ok : styles.blocked
              }`}
          >
            {estado}
          </span>
        </header>

        {/* INFO */}
        <div className={styles.clientInfo}>
          {telefono1 && limpiarNumero(telefono1).length > 9 && (
            <div className={styles.row}>
              <span className={styles.label}>📱 WhatsApp</span>
              <span className={styles.value}>
                <a
                  href={`https://wa.me/${limpiarNumero(telefono1)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {telefono1}
                </a>
              </span>
            </div>
          )}

          {telefono2 && limpiarNumero(telefono2).length > 9 && (
            <div className={styles.row}>
              <span className={styles.label}>📱 WhatsApp 2</span>
              <span className={styles.value}>
                <a
                  href={`https://wa.me/${limpiarNumero(telefono2)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {telefono2}
                </a>
              </span>
            </div>
          )}

          {/* 📊 BLOQUE DE MÉTRICAS */}
          <div className={styles.metricsContainer}>
            {/* Total */}
            <div className={`${styles.metricBox} ${styles.boxTotal}`}>
              <span className={styles.metricLabel}>Total de compras</span>
              <strong className={styles.metricValue}>{cliente.comprasTotales || 0}</strong>
            </div>

            {/* Activas */}
            <div className={`${styles.metricBox} ${styles.boxActive}`}>
              <span className={styles.metricLabel}>Esta pagando</span>
              <strong className={styles.metricValue}>
                {cliente.comprasActivas || 0}
                {idDeVenta && (
                  <span style={{ fontSize: "12px", fontWeight: "normal", opacity: 0.6, marginLeft: "6px" }}>
                    (#{String(idDeVenta).slice(-4)})
                  </span>
                )}
              </strong>
            </div>

            {/* Terminadas */}
            <div className={`${styles.metricBox} ${styles.boxCompleted}`}>
              <span className={styles.metricLabel}>Termino</span>
              <strong className={styles.metricValue}>{cliente.comprasTerminadas || 0}</strong>
            </div>
          </div>

        </div>
      </article>
    </div>
  );
}