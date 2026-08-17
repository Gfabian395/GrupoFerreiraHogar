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
    motivoBloqueo,
    observaciones, // 👈 Capturamos las observaciones del cliente
  } = cliente;

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

  // ===============================
  // EDITAR OBSERVACIONES
  // ===============================
  const editarObservaciones = async () => {
    const nuevaNota = prompt("Ingrese las observaciones para este cliente:", observaciones || "");

    if (nuevaNota === null) return; // Si cancela, no hace nada

    try {
      await updateDoc(doc(db, "clientes", id), {
        observaciones: nuevaNota.trim(),
      });

      window.location.reload();
    } catch (error) {
      console.error("Error guardando observaciones:", error);
      alert("No se pudieron guardar las observaciones.");
    }
  };

  // ===============================
  // BLOQUEAR CLIENTE CON MOTIVO (<= 50 palabras)
  // ===============================
  const bloquearCliente = async () => {
    const motivo = prompt("Ingrese el motivo del bloqueo (máximo 50 palabras):");

    if (motivo === null) return; // Si cancela, no hace nada

    const palabras = motivo.trim().split(/\s+/);
    if (palabras.length > 50) {
      alert("El motivo no puede superar las 50 palabras.");
      return;
    }

    try {
      await updateDoc(doc(db, "clientes", id), {
        estado: "Bloqueado",
        motivoBloqueo: motivo.trim() || "Sin motivo especificado",
      });

      window.location.reload();
    } catch (error) {
      console.error("Error bloqueando cliente:", error);
    }
  };

  // ===============================
  // DESBLOQUEAR CLIENTE
  // ===============================
  const desbloquearCliente = async () => {
    try {
      await updateDoc(doc(db, "clientes", id), {
        estado: "Activo",
        motivoBloqueo: "", // Limpiamos el motivo al desbloquear
      });

      window.location.reload();
    } catch (error) {
      console.error("Error desbloqueando cliente:", error);
    }
  };

  // Variable para manejar la clase de fondo dinámicamente según su estado o puntuación
  let cardStatusClass = "";

  if (estado === "Bloqueado") {
    cardStatusClass = styles.cardBlocked; // Color gris/bloqueado
  } else if (cliente.score && cliente.score.leyenda !== "Sin historial") {
    switch (cliente.score.leyenda) {
      case "Excelente":
        cardStatusClass = styles.cardVip;
        break;
      case "Bueno":
        cardStatusClass = styles.cardPremium;
        break;
      case "Regular":
        cardStatusClass = styles.cardRegular;
        break;
      case "Mal pagador":
        cardStatusClass = styles.cardBadPay;
        break;
      default:
        cardStatusClass = "";
    }
  }

  const idDeVenta = cliente.idVenta || cliente.id_venta || cliente.idVentaActiva;

  // Verificamos si realmente tiene historial o compras para mostrar puntuación
  const tieneHistorial = cliente.score && cliente.score.leyenda !== "Sin historial";
  const notaDecimal = tieneHistorial ? (cliente.score.puntos / 10).toFixed(1) : null;

  return (
    <div className={styles.clientWrapper}>
      <article className={`${styles.clientCard} ${cardStatusClass}`} onClick={handleCardClick}>
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
                
                {/* 📝 BOTÓN DE OBSERVACIONES ACTIVO */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    editarObservaciones();
                  }}
                >
                  📝 Observaciones
                </button>

                {estado === "Bloqueado" ? (
                  <button
                    style={{ color: "#16a34a", fontWeight: "bold" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      desbloquearCliente();
                    }}
                  >
                    ✅ Desbloquear cliente
                  </button>
                ) : (
                  <button
                    className={styles.danger}
                    onClick={(e) => {
                      e.stopPropagation();
                      bloquearCliente();
                    }}
                  >
                    🚫 Bloquear cliente
                  </button>
                )}

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

          {/* 🌟 INDICADOR DE PUNTUACIÓN (SOLO SI TIENE HISTORIAL REAL Y NO ESTÁ BLOQUEADO) */}
          {estado !== "Bloqueado" && tieneHistorial && (
            <div className={styles.rowPuntuacion}>
              <div className={styles.puntuacionPrincipal}>
                <span className={styles.label}>⭐ Puntuación</span>
                <span className={styles.valuePuntuacion}>
                  {notaDecimal}{" "}
                  <span className={styles.leyendaPuntuacion}>
                    ({cliente.score.leyenda})
                  </span>
                </span>
              </div>

              {cliente.score.detalle && (
                <div className={styles.detallePuntuacion}>
                  {cliente.score.detalle}
                </div>
              )}
            </div>
          )}

          {/* ℹ️ SI ES NUEVO SIN HISTORIAL Y ACTIVO */}
          {estado !== "Bloqueado" && !tieneHistorial && (
            <div className={styles.rowPuntuacion}>
              <div className={styles.puntuacionPrincipal}>
                <span className={styles.label}>⭐ Puntuación</span>
                <span className={styles.valuePuntuacion} style={{ fontSize: "13px", color: "#64748b" }}>
                  Sin calificar (Cliente nuevo)
                </span>
              </div>
              <div className={styles.detallePuntuacion}>
                Cliente nuevo sin compras registradas.
              </div>
            </div>
          )}

          {/* 🚫 AVISO VISUAL DE ALERTA LLAMATIVA SI ESTÁ BLOQUEADO */}
          {estado === "Bloqueado" && (
            <div className={styles.alertaBloqueo}>
              <div className={styles.alertaBloqueoHeader}>
                <span>🚫</span>
                <span>Cliente Bloqueado</span>
              </div>
              <div className={styles.alertaBloqueoTexto}>
                {motivoBloqueo || "Sin motivo especificado"}
              </div>
            </div>
          )}

          {/* 📝 OBSERVACIONES DEL CLIENTE (VISIBLES EN LA TARJETA) */}
          {observaciones && (
            <div className={styles.row} style={{ marginTop: "8px", background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className={styles.label} style={{ fontWeight: "600", fontSize: "12px" }}>📝 Observaciones:</span>
              <span className={styles.value} style={{ fontSize: "12px", color: "#334155", wordBreak: "break-word" }}>
                {observaciones}
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