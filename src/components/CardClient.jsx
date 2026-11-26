import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/CardClient.module.css";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import {
  CLASES_MANUALES,
  normalizarClasificacion,
} from "../pages/Clientes";

export default function CardClient({
  cliente,
  resaltado = false,
  onCambiarClasificacion,
  onEdit,
  onDelete,
}) {
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
    motivoBloqueo,
    observaciones,
  } = cliente;

  const clasificacionActual = normalizarClasificacion(cliente.clasificacion);

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

  const handleCardClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      window.open(
        `${window.location.origin}/clientes/${id}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }
    navigate(`/clientes/${id}`);
  };

  const limpiarNumero = (numero) => {
    if (!numero) return "";
    return numero.replace(/\D/g, "");
  };

  const handleSelectClasificacion = async (e) => {
    e.stopPropagation();
    const nuevaClase = normalizarClasificacion(e.target.value);

    if (onCambiarClasificacion) {
      await onCambiarClasificacion(id, nuevaClase);
      return;
    }

    try {
      await updateDoc(doc(db, "clientes", id), {
        clasificacion: nuevaClase,
      });
    } catch (error) {
      console.error("Error actualizando clasificación:", error);
      alert("No se pudo actualizar la clasificación.");
    }
  };

  const editarObservaciones = async () => {
    const nuevaNota = prompt(
      "Ingrese las observaciones para este cliente:",
      observaciones || ""
    );
    if (nuevaNota === null) return;

    try {
      await updateDoc(doc(db, "clientes", id), {
        observaciones: nuevaNota.trim(),
      });
      if (onEdit) onEdit({ ...cliente, observaciones: nuevaNota.trim() });
    } catch (error) {
      console.error("Error guardando observaciones:", error);
      alert("No se pudieron guardar las observaciones.");
    }
  };

  const bloquearCliente = async () => {
    const motivo = prompt("Ingrese el motivo del bloqueo (máximo 50 palabras):");
    if (motivo === null) return;

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
      if (onDelete) onDelete();
    } catch (error) {
      console.error("Error bloqueando cliente:", error);
    }
  };

  const desbloquearCliente = async () => {
    try {
      await updateDoc(doc(db, "clientes", id), {
        estado: "Activo",
        motivoBloqueo: "",
      });
      if (onDelete) onDelete();
    } catch (error) {
      console.error("Error desbloqueando cliente:", error);
    }
  };

  // Estilo según clasificación manual o estado bloqueado
  let cardStatusClass = "";
  if (estado === "Bloqueado") {
    cardStatusClass = styles.cardBlocked;
  } else {
    switch (clasificacionActual) {
      case "excelente":
        cardStatusClass = styles.cardVip;
        break;
      case "pagador":
        cardStatusClass = styles.cardPremium;
        break;
      case "nuevo":
        cardStatusClass = styles.cardNuevo;
        break;
      case "duro":
        cardStatusClass = styles.cardRegular;
        break;
      case "clavo":
        cardStatusClass = styles.cardBadPay;
        break;
      default:
        cardStatusClass = styles.cardSinClasificar || "";
    }
  }

  const idDeVenta =
    cliente.idVenta || cliente.id_venta || cliente.idVentaActiva;
  const deudaTotal = Number(cliente.deudaTotal || 0);

  return (
    <div className={styles.clientWrapper}>
      <article
        className={`${styles.clientCard} ${cardStatusClass} ${
          resaltado ? styles.resaltado : ""
        }`}
        onClick={handleCardClick}
      >
        <header className={styles.clientHeader}>
          <div
            className={styles.clientMenu}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
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
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onEdit && onEdit(cliente);
                  }}
                >
                  ✏️ Editar cliente
                </button>

                <button
                  type="button"
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
                    type="button"
                    style={{ color: "#16a34a", fontWeight: "bold" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      desbloquearCliente();
                    }}
                  >
                    ✅ Desbloquear cliente
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      bloquearCliente();
                    }}
                  >
                    🚫 Bloquear cliente
                  </button>
                )}

                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    setOpen(false);
                    onDelete && onDelete(cliente);
                  }}
                >
                  🗑 Eliminar
                </button>
              </div>
            )}

            <span
              className={`${styles.status} ${
                estado === "Activo" ? styles.ok : styles.blocked
              }`}
            >
              {estado || "Activo"}
            </span>
          </div>

          <div className={styles.identity}>
            <h3>{nombre}</h3>
            {dni && <small className={styles.dniSub}>DNI {dni}</small>}
          </div>
        </header>

        {/* SELECTOR MANUAL DE CLASIFICACIÓN */}
        <div
          className={styles.clasificacionBox}
          onClick={(e) => e.stopPropagation()}
        >
          <label htmlFor={`clase-${id}`} className={styles.label}>
            🏷️ Clasificación
          </label>
          <select
            id={`clase-${id}`}
            value={clasificacionActual}
            onChange={handleSelectClasificacion}
            className={styles.clasificacionSelect}
          >
            {CLASES_MANUALES.map((clase) => (
              <option key={clase} value={clase}>
                {clase.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* INFO DEL CLIENTE */}
        <div className={styles.clientInfo}>
          {(direccion || entreCalles) && (
            <div className={styles.row}>
              <span className={styles.label}>📍 Dirección</span>
              <span className={styles.value}>
                {direccion || "—"} {entreCalles ? `· ${entreCalles}` : ""}
              </span>
            </div>
          )}

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

          {deudaTotal > 0 && (
            <div className={styles.row} style={{ marginTop: "6px" }}>
              <span className={styles.label}>💰 Saldo pendiente</span>
              <span className={styles.value} style={{ fontWeight: "700" }}>
                ${deudaTotal.toLocaleString("es-AR")}
              </span>
            </div>
          )}

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

          {observaciones && (
            <div
              className={styles.row}
              style={{
                marginTop: "8px",
                background: "#f8fafc",
                padding: "6px 8px",
                borderRadius: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <span
                className={styles.label}
                style={{ fontWeight: "600", fontSize: "12px" }}
              >
                📝 Observaciones:
              </span>
              <span
                className={styles.value}
                style={{
                  fontSize: "12px",
                  color: "#334155",
                  wordBreak: "break-word",
                }}
              >
                {observaciones}
              </span>
            </div>
          )}

          {/* MÉTRICAS DE COMPRAS */}
          <div className={styles.metricsContainer}>
            <div className={`${styles.metricBox} ${styles.boxTotal}`}>
              <span className={styles.metricLabel}>Total compras</span>
              <strong className={styles.metricValue}>
                {cliente.comprasTotales || 0}
              </strong>
            </div>

            <div className={`${styles.metricBox} ${styles.boxActive}`}>
              <span className={styles.metricLabel}>Pagando</span>
              <strong className={styles.metricValue}>
                {cliente.comprasActivas || 0}
                {idDeVenta && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "normal",
                      opacity: 0.65,
                      marginLeft: "4px",
                    }}
                  >
                    (#{String(idDeVenta).slice(-4)})
                  </span>
                )}
              </strong>
            </div>

            <div className={`${styles.metricBox} ${styles.boxCompleted}`}>
              <span className={styles.metricLabel}>Terminadas</span>
              <strong className={styles.metricValue}>
                {cliente.comprasTerminadas || 0}
              </strong>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}