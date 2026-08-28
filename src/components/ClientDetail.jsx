import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase/firebaseConfig";
import styles from "../styles/ClientDetail.module.css";
import { Loader } from "./Loader";

// ===============================
// FUNCIONES AUXILIARES
// ===============================
const formatearFecha = (fecha) => {
  if (!fecha) return "—";

  let date;

  // 🔥 Caso 1: Timestamp de Firestore
  if (typeof fecha === "object" && typeof fecha.toDate === "function") {
    date = fecha.toDate();
  }
  // 🔥 Caso 2: String tipo "2025-11-15"
  else if (typeof fecha === "string") {
    // Evita problemas de zona horaria
    if (fecha.includes("-")) {
      const [year, month, day] = fecha.split("-");
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(fecha);
    }
  }
  // 🔥 Caso 3: Number (timestamp numérico)
  else if (typeof fecha === "number") {
    date = new Date(fecha);
  } else {
    return "—";
  }

  if (isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const getFirmaTexto = (firma, usuariosMap = {}) => {
  if (typeof firma === "object" && firma !== null) {
    return firma.nombre || usuariosMap[firma.email] || firma.email || "—";
  }
  if (typeof firma === "string") {
    return usuariosMap[firma] || firma;
  }
  return "—";
};

const obtenerFechaHoyInput = () => {
  const hoy = new Date();
  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, "0");
  const day = String(hoy.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`; // formato YYYY-MM-DD
};

const normalizarVenta = (venta, usuariosMap = {}) => {
  // ===============================
  // PRODUCTOS
  // ===============================
  const productosNormalizados = (venta.productos || []).map((p) => ({
    nombre: p.nombre ?? p.name ?? "Producto",
    cantidad: p.cantidad ?? p.qty ?? 1,
    precio: p.precio ?? p.price ?? 0,
  }));

  // ===============================
  // PAGOS
  // ===============================
  const pagosNormalizados = [];

  if (venta.pago?.montoPagado > 0) {
    pagosNormalizados.push({
      numero: 1,
      fecha: venta.fecha || venta.createdAt || "—",
      monto: venta.pago.montoPagado,
      metodo: venta.pago.pagoParcial
        ? "Pago parcial"
        : venta.pago.primerCuotaPaga
          ? "Primera cuota"
          : "Pago inicial",
      estado: "Pagado",
      firma: venta.cargadoPor || "Sistema",
    });
  }

  const pagosExtras = (venta.pagos || []).map((pago, index) => ({
    numero: pago.numero ?? pagosNormalizados.length + index + 1,
    fecha: pago.fecha ?? "—",
    monto: Number(pago.monto ?? 0),
    metodo: pago.metodo ?? "—",
    estado: "Pagado",
    firma: pago.firma ?? pago.usuario ?? "—",
  }));

  // ===============================
  // CAMPOS COMERCIALES
  // ===============================
  const vendedor =
    usuariosMap[venta.vendedor] ??
    usuariosMap[venta.vendedorReal] ??
    usuariosMap[venta.cargadoPor] ??
    venta.vendedor ??
    venta.vendedorReal ??
    venta.cargadoPor ??
    "—";

  const entrega = venta.entrega ?? venta.tipoEntrega ?? "—";
  const sucursal = venta.sucursal ?? venta.productos?.[0]?.branch ?? "—";

  return {
    ...venta,
    productos: productosNormalizados,
    pagos: [...pagosNormalizados, ...pagosExtras],
    vendedor,
    entrega,
    sucursal,
    // Nos aseguramos de capturar el descuento si existe
    descuento: venta.descuento || 0 
  };
};

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [usuariosMap, setUsuariosMap] = useState({});
  const [cliente, setCliente] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [loadingCliente, setLoadingCliente] = useState(true);
  const [loadingVentas, setLoadingVentas] = useState(true);

  const [addingPagoId, setAddingPagoId] = useState(null);
  const [nuevoPago, setNuevoPago] = useState({ fecha: "", monto: "", metodo: "" });

  const [showImportVenta, setShowImportVenta] = useState(false);
  const [ventaPegada, setVentaPegada] = useState("");

  const [selectedVentaId, setSelectedVentaId] = useState(null);
  // ===============================
  // AUTH
  // ===============================
  const auth = getAuth();
  const usuarioActual = auth.currentUser; // ✅ nombre consistente

  // ===============================
  // FETCH CLIENTE
  // ===============================
  useEffect(() => {
    const fetchCliente = async () => {
      try {
        const docSnap = await getDoc(doc(db, "clientes", id));
        if (docSnap.exists()) {
          setCliente({ id: docSnap.id, ...docSnap.data() });
        } else {
          alert("Cliente no encontrado");
          navigate("/clientes");
        }
      } finally {
        setLoadingCliente(false);
      }
    };
    fetchCliente();
  }, [id, navigate]);

  // ===============================
  // FETCH USUARIOS
  // ===============================
  useEffect(() => {
    const fetchUsuarios = async () => {
      try {
        const snap = await getDocs(collection(db, "usuarios"));
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.activo) {
            if (data.email) map[data.email] = data.nombre;
            if (data.nombre) map[d.id] = data.nombre; // 🔥 ACA ESTABA EL ERROR: mapear también el UID
          }
        });
        setUsuariosMap(map);
      } catch (e) {
        console.error("Error cargando usuarios", e);
      }
    };
    fetchUsuarios();
  }, []);

  // ===============================
  // FETCH VENTAS
  // ===============================
  const fetchVentas = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "ventas"), where("clienteId", "==", id))
      );
      setVentas(
        snap.docs.map((d) =>
          normalizarVenta({ id: d.id, ...d.data() }, usuariosMap) // ✅ pasa usuariosMap
        )
      );
    } finally {
      setLoadingVentas(false);
    }
  };

  useEffect(() => {
    fetchVentas();
  }, [id, usuariosMap]); // ✅ depende del map

  // ===============================
  // AGREGAR PAGO
  // ===============================
  const handleAddPagoClick = (ventaId) => {
    setAddingPagoId(ventaId);
    setNuevoPago({
      fecha: obtenerFechaHoyInput(),
      monto: "",
      metodo: "",
    });
  };

  const handleSavePago = async (ventaId) => {
    if (!nuevoPago.fecha || !nuevoPago.monto) {
      alert("Completa fecha y monto");
      return;
    }

    const venta = ventas.find((v) => v.id === ventaId);
    if (!venta) return;

    if (!usuarioActual) {
      alert("Usuario no autenticado");
      return;
    }

    const firma = {
      nombre: usuariosMap[usuarioActual.uid] || usuarioActual.nombre || usuarioActual.displayName || "",
      email: usuarioActual.email || "",
      uid: usuarioActual.uid || ""
    };

    const pagoAGuardar = {
      numero: (venta.pagos?.length || 0) + 1,
      fecha: nuevoPago.fecha,
      monto: Number(nuevoPago.monto),
      metodo: nuevoPago.metodo || "—",
      estado: "Pagado",
      firma,
    };

    try {
      await updateDoc(doc(db, "ventas", ventaId), {
        pagos: arrayUnion(pagoAGuardar),
      });

      // Buscar la venta actualizada
      const ventaActual = ventas.find((v) => v.id === ventaId);

      setVentas((prev) =>
        prev.map((v) =>
          v.id === ventaId
            ? { ...v, pagos: [...(v.pagos || []), pagoAGuardar] }
            : v
        )
      );

      // 🔥 ENVIAR COMPROBANTE AUTOMÁTICO
      if (ventaActual) {
        enviarComprobantePago(ventaActual, pagoAGuardar);
      }

      setAddingPagoId(null);
      setNuevoPago({ fecha: "", monto: "", metodo: "" });

    } catch (error) {
      console.error(error);
      alert("No se pudo guardar el pago");
    }
  };

  // ===============================
  // VERIFICAR SI VENTA ESTÁ PAGADA (CORREGIDA)
  // ===============================
  const estaPagado = (venta) => {
    const totalPagado = (venta.pagos || []).reduce(
      (sum, p) => {
        // Reemplaza comas por puntos por si se cargó como string regional (ej: "1500,50")
        const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
        return sum + Number(montoLimpio || 0);
      },
      0
    );

    const totalCredito =
      venta.totalCredito ||
      (venta.valorCuota || 0) * (venta.cuotas || 0);

    // Usamos Math.round para ignorar diferencias de centavos por divisiones o flotantes
    return Math.round(totalPagado) >= Math.round(totalCredito);
  };

  // ===============================
  // VENTAS ATRASADAS (IDs) (CORREGIDA)
  // ===============================
  const ventasAtrasadasIds = useMemo(() => {
    const hoy = new Date();
    return ventas
      .filter((v) => {
        const totalCredito = v.totalCredito || (v.valorCuota * v.cuotas);
        const totalPagado = (v.pagos || []).reduce((sum, p) => {
          const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
          return sum + Number(montoLimpio || 0);
        }, 0);

        // Aplicar redondeo aquí también para evitar falsos positivos de deuda
        if (Math.round(totalPagado) >= Math.round(totalCredito)) return false; // ya pagada

        const fechaInicio = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
        const cuotasPagadas = v.pagos?.length || 0;
        const proximoVencimiento = new Date(fechaInicio);
        proximoVencimiento.setMonth(proximoVencimiento.getMonth() + cuotasPagadas);

        const diasAtraso = (hoy - proximoVencimiento) / (1000 * 60 * 60 * 24);
        return diasAtraso > 30; // atraso > 30 días
      })
      .map((v) => v.id);
  }, [ventas]);

  // ===============================
  // DOBLE CLICK → RESALTAR Y SCROLL
  // ===============================
  useEffect(() => {
    if (!selectedVentaId) return;

    const elem = document.getElementById(`venta-${selectedVentaId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedVentaId]);

  // ===============================
  // DOBLE CLICK DESDE CLIENTES VENCIDOS
  // ===============================
  const handleDoubleClickCliente = (clienteId) => {
    const clienteVentas = ventas.filter((v) => v.clienteId === clienteId && !estaPagado(v));
    if (clienteVentas.length === 0) return;

    let mayorAtraso = 0;
    let ventaMasAtrasada = null;
    const hoy = new Date();

    clienteVentas.forEach((v) => {
      const fechaInicio = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
      const cuotasPagadas = v.pagos?.length || 0;
      const proximoVencimiento = new Date(fechaInicio);
      proximoVencimiento.setMonth(proximoVencimiento.getMonth() + cuotasPagadas);

      const diferenciaDias = (hoy - proximoVencimiento) / (1000 * 60 * 60 * 24);
      if (diferenciaDias > mayorAtraso) {
        mayorAtraso = diferenciaDias;
        ventaMasAtrasada = v;
      }
    });

    if (ventaMasAtrasada) {
      setSelectedVentaId(ventaMasAtrasada.id);

      const finDelDia = new Date();
      finDelDia.setHours(23, 59, 59, 999);
      localStorage.setItem("clienteVisitadoHoy", clienteId);
      localStorage.setItem("expiraVisita", finDelDia.getTime());
    }
  };

  const ventasPendientes = ventas.filter((v) => !estaPagado(v));
  const ventasPagadas = ventas.filter((v) => estaPagado(v));

  // ===============================
  // LOADING
  // ===============================
  if (loadingCliente || loadingVentas) return <Loader />;
  if (!cliente) return null;

  // ===============================
  // ENVIAR RECORDATORIO WHATSAPP
  // ===============================
  const enviarRecordatorio = (venta) => {
    const telefonoRaw =
      cliente.telefono1?.replace(/\D/g, "") ||
      cliente.telefono2?.replace(/\D/g, "");

    if (!telefonoRaw) {
      alert("El cliente no tiene teléfono cargado");
      return;
    }

    const telefono = telefonoRaw.startsWith("54")
      ? telefonoRaw
      : `54${telefonoRaw}`;

    const cuotasPagadas = venta.pagos?.length || 0;
    const numeroCuota = cuotasPagadas + 1;

    const valorCuota = Number(venta.valorCuota || 0);

    const mensaje = `Estimado/a ${cliente.nombre},

Le informamos que se encuentra pendiente el pago de su cuota N° ${numeroCuota}.

Monto de la cuota: $${valorCuota.toLocaleString("es-AR")}

Le solicitamos regularizar la misma a la brevedad.

Si usted ya realizó el pago, por favor desestime este mensaje.

Este es un mensaje automático generado por nuestro sistema.`;

    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;

    window.open(url, "_blank");
  };

  // ===============================
  // REENVIAR COMPROBANTE
  // ===============================
  const reenviarComprobante = (venta) => {
    const telefonoRaw =
      cliente.telefono1?.replace(/\D/g, "") ||
      cliente.telefono2?.replace(/\D/g, "");

    if (!telefonoRaw) {
      alert("El cliente no tiene teléfono cargado");
      return;
    }

    // Asegurar código país Argentina
    const telefono = telefonoRaw.startsWith("54")
      ? telefonoRaw
      : `54${telefonoRaw}`;

    // Formato de productos
    const productosTexto = venta.productos
      ?.map((p) => `* ${p.nombre} x${p.cantidad} —`)
      .join("\n");

    // =========================================================
    // 🧮 LÓGICA MATEMÁTICA DE CUOTAS (CORREGIDA)
    // =========================================================
    const valorCuota = Number(venta.valorCuota || 0);
    const todosLosPagos = venta.pagos || [];

    // 1. Calcular el total acumulado de dinero pagado hasta hoy
    const totalPagadoHistorico = todosLosPagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);

    // 2. Obtener los datos específicos del último pago realizado
    const ultimoPago = todosLosPagos.length > 0 ? todosLosPagos[todosLosPagos.length - 1] : null;
    const montoUltimoPago = ultimoPago ? Number(ultimoPago.monto || 0) : 0;
    const valorPagadoTexto = montoUltimoPago.toLocaleString("es-AR");

    // 3. Calcular cuántas cuotas se habían completado ANTES de este último pago
    const totalAntesDeEstePago = totalPagadoHistorico - montoUltimoPago;
    const cuotasCompletasAntes = Math.floor(totalAntesDeEstePago / valorCuota);

    // 4. Calcular cuántas cuotas se completan AHORA con este pago
    const cuotasCompletasAhora = Math.floor(totalPagadoHistorico / valorCuota);

    let detalleCuota = "";

    if (cuotasCompletasAhora > cuotasCompletasAntes) {
      // Si este pago logró cerrar una cuota que venía incompleta
      detalleCuota = `cuota n°${cuotasCompletasAhora} (completa)`;

      // Si además de completar la cuota sobró plata para la que sigue
      const saldoSobrante = totalPagadoHistorico % valorCuota;
      if (saldoSobrante > 0 && cuotasCompletasAhora < Number(venta.cuotas)) {
        detalleCuota += ` y saldo a cuenta de cuota n°${cuotasCompletasAhora + 1}`;
      }
    } else {
      // Si el pago no llegó a completar ninguna cuota nueva, sigue siendo un pago parcial
      const cuotaEnProceso = cuotasCompletasAhora + 1;
      detalleCuota = `a cuenta de cuota n°${cuotaEnProceso} (pago parcial)`;
    }
    // =========================================================

    const mensaje = `COMPROBANTE DE COMPRA

Cliente: ${cliente.nombre}
DNI: ${cliente.dni}

Fecha: ${formatearFecha(venta.fecha)}
Sucursal: ${venta.sucursal || "—"}
Vendedor: ${getFirmaTexto(venta.vendedor, usuariosMap)}

Productos:
${productosTexto}

Cantidad de cuotas: ${venta.cuotas}
Valor de la cuota: $${valorCuota.toLocaleString("es-AR")}
Total pagado: $${valorPagadoTexto} ${detalleCuota}

Gracias por su compra.`;

    // Usar endpoint más estable
    const url = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(
      mensaje
    )}`;

    window.open(url, "_blank");
  };

  // ===============================
  // ENVIAR COMPROBANTE DE PAGO
  // ===============================
  const enviarComprobantePago = (venta, pago) => {
    const telefonoRaw =
      cliente.telefono1?.replace(/\D/g, "") ||
      cliente.telefono2?.replace(/\D/g, "");

    if (!telefonoRaw) {
      alert("El cliente no tiene teléfono cargado");
      return;
    }

    const telefono = telefonoRaw.startsWith("54")
      ? telefonoRaw
      : `54${telefonoRaw}`;

    const mensaje = `COMPROBANTE DE PAGO

Cliente: ${cliente.nombre}
DNI: ${cliente.dni}

Venta ID: ${venta.id}
Fecha de pago: ${formatearFecha(pago.fecha)}
Monto abonado: $${Number(pago.monto).toLocaleString("es-AR")}
Método de pago: ${pago.metodo || "—"}

Cobrado por: ${getFirmaTexto(pago.firma, usuariosMap)}

Gracias por su pago.`;

    const url = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(
      mensaje
    )}`;

    window.open(url, "_blank");
  };

  // ===============================
  // RENDER DE TABLA DE PAGOS (NUEVO)
  // ===============================
  const renderTablePagos = (venta, permitirAgregar) => {
    // 1. Calculamos a qué cuota pertenece cada pago
    const valorCuotaSeguro = Number(venta.valorCuota) || 1;
    let acumuladoPagos = 0;

    const pagosConCuota = (venta.pagos || []).map((pago, i) => {
      const monto = Number(typeof pago.monto === "string" ? pago.monto.replace(",", ".") : pago.monto || 0);
      
      const cuotaInicio = Math.floor(acumuladoPagos / valorCuotaSeguro) + 1;
      acumuladoPagos += monto;
      let cuotaFin = Math.ceil(acumuladoPagos / valorCuotaSeguro);
      if (cuotaFin < cuotaInicio) cuotaFin = cuotaInicio; // Evitar desfases si el monto es 0

      // Definimos la etiqueta visual (Ej: "Cuota 1" o "Cuotas 1 a 3")
      const labelCuota = cuotaInicio === cuotaFin 
        ? `Cuota ${cuotaInicio}` 
        : `Cuotas ${cuotaInicio} a ${cuotaFin}`;

      return {
        ...pago,
        indexReal: pago.numero || i + 1,
        labelCuota
      };
    });

    // 2. Calculamos el resumen de cuotas para el mensaje
    const totalPagado = acumuladoPagos;
    const cuotasPagas = Math.floor(totalPagado / valorCuotaSeguro);
    const totalCuotas = Number(venta.cuotas) || 0;
    const cuotasRestantes = Math.max(totalCuotas - cuotasPagas, 0);

    return (
      <section className={styles.payments}>
        <header style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4>Historial de pagos</h4>
            {permitirAgregar && (
              <button onClick={() => handleAddPagoClick(venta.id)}>
                ➕ Agregar pago
              </button>
            )}
          </div>

          {/* 🔥 DETALLE BREVE SOLICITADO */}
          <div style={{
            background: "#e0f2fe",
            color: "#0369a1",
            padding: "10px 14px",
            borderRadius: "6px",
            fontWeight: "500",
            fontSize: "14px",
            width: "100%",
            boxSizing: "border-box"
          }}>
            ℹ️ Van {cuotasPagas} cuotas pagas de {totalCuotas}, restan {cuotasRestantes} cuotas para terminar.
          </div>
        </header>

        <div className={styles.table}>
          <div className={`${styles.row} ${styles.head}`}>
            <span>Cuota / Detalle</span>
            <span>Fecha</span>
            <span>Monto</span>
            <span>Método</span>
            <span>Estado</span>
            <span>Firma</span>
          </div>

          {/* Renderizamos los pagos calculados */}
          {pagosConCuota.map((pago, i) => (
            <div key={i} className={`${styles.row} ${styles.paid}`}>
              {/* Agrupación visual de cuota y n° de pago */}
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.2" }}>
                <strong style={{ color: "#0f172a" }}>{pago.labelCuota}</strong>
                <small style={{ color: "#64748b", fontSize: "12px" }}>Pago #{pago.indexReal}</small>
              </span>
              
              <span>{formatearFecha(pago.fecha)}</span>
              <span>${Number(pago.monto)?.toLocaleString("es-AR")}</span>
              <span>{pago.metodo || "—"}</span>
              <span>Pagado</span>
              <span>{getFirmaTexto(pago.firma, usuariosMap)}</span>
            </div>
          ))}

          {/* Formulario para agregar un nuevo pago */}
          {permitirAgregar && addingPagoId === venta.id && (
            <div className={`${styles.row} ${styles.addPagoRow}`}>
              <input
                type="date"
                value={nuevoPago.fecha}
                onChange={(e) => setNuevoPago({ ...nuevoPago, fecha: e.target.value })}
              />
              <input
                type="number"
                placeholder="Monto"
                value={nuevoPago.monto}
                onChange={(e) => setNuevoPago({ ...nuevoPago, monto: e.target.value })}
              />
              <select
                value={nuevoPago.metodo}
                onChange={(e) => setNuevoPago({ ...nuevoPago, metodo: e.target.value })}
              >
                <option value="" disabled hidden>Método</option>
                <option value="Efectivo">💵 Efectivo</option>
                <option value="Transferencia">🏦 Transferencia</option>
                <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito</option>
                <option value="Tarjeta de Débito">💳 Tarjeta de Débito</option>
                <option value="QR">📱 QR</option>
                <option value="Link de Pago">🔗 Link de Pago</option>
              </select>
              <button onClick={() => handleSavePago(venta.id)}>Guardar</button>
              <button onClick={() => setAddingPagoId(null)}>Cancelar</button>
            </div>
          )}
        </div>
      </section>
    );
  };

  // ===============================
  // RENDER
  // ===============================
  return (
    <div className={styles.paymentWrapper}>
      <article className={styles.paymentCard}>
        {/* ========== CLIENTE ========== */}
        <header className={styles.clientHeader}>
          <div className={styles.avatar}>
            <img
              src={
                cliente.fotoUrl
                  ? cliente.fotoUrl
                  : "https://cdn-icons-png.flaticon.com/512/149/149071.png"
              }
              alt={cliente.nombre}
            />
          </div>

          <div className={styles.identity}>
            <span>ID: {cliente.id}</span>
            <h3>{cliente.nombre}</h3>
            <span>DNI {cliente.dni}</span>
            <span className={styles.address}>
              {cliente.direccion} · {cliente.entreCalles}
            </span>
          </div>

          <span
            className={`${styles.status} ${cliente.estado === "Activo" ? styles.ok : styles.blocked
              }`}
          >
            {cliente.estado}
          </span>
        </header>

        {/* ================= VENTAS ================= */}
        {ventas.length === 0 ? (
          <p style={{ color: "#64748b" }}>No hay ventas registradas</p>
        ) : (
          <>
            {/* ================= VENTAS PENDIENTES ================= */}
            {ventasPendientes.map((venta) => {
              const totalCredito =
                venta.totalCredito || venta.valorCuota * venta.cuotas;

              const totalPagado = (venta.pagos || []).reduce((sum, p) => {
                const montoLimpio =
                  typeof p.monto === "string"
                    ? p.monto.replace(",", ".")
                    : p.monto;
                return sum + Number(montoLimpio || 0);
              }, 0);

              const saldoPendiente = Math.max(totalCredito - totalPagado, 0);

              return (
                <section
                  id={`venta-${venta.id}`}
                  key={venta.id}
                  className={`${styles.saleWrapper} ${ventasAtrasadasIds.includes(venta.id) ? styles.destacado : ""
                    } ${selectedVentaId === venta.id ? styles.resaltado : ""}`}
                >
                  <section className={styles.saleInfoCard}>
                    <div className={styles.saleSection}>
                      <h4>Datos de la venta</h4>

                      <p>
                        <span className={styles.badge}>ID de Venta</span>
                        <span
                          className={
                            selectedVentaId === venta.id ? styles.idDestacado : ""
                          }
                        >
                          {venta.id}
                        </span>
                      </p>

                      <p><span className={styles.badge}>Cliente</span>{cliente.nombre}</p>
                      <p><span className={styles.badge}>DNI</span>{cliente.dni}</p>
                      <p><span className={styles.badge}>Dirección</span>{cliente.direccion} · {cliente.entreCalles}</p>

                      <p>
                        <span className={styles.badge}>Vendedor</span>
                        {getFirmaTexto(venta.vendedor, usuariosMap)}
                      </p>

                      <p><span className={styles.badge}>Sucursal</span>{venta.sucursal || "—"}</p>
                      <p><span className={styles.badge}>Entrega</span>{venta.entrega || "—"}</p>

                      {venta.chofer && (
                        <p>
                          <span className={styles.badge}>Chofer</span>
                          {venta.chofer.nombre} - Patente: {venta.chofer.patente || "—"} - Tel: {venta.chofer.telefono || "—"}
                        </p>
                      )}

                      <p>
                        <span className={styles.badge}>Productos</span>
                        {venta.productos
                          ?.map(
                            (p) =>
                              `${p.nombre} (x${p.cantidad}, $${Number(
                                p.precio
                              ).toLocaleString("es-AR")})`
                          )
                          .join(", ")}
                      </p>

                      {/* 🟢 CARTELCITO DE DESCUENTO 🟢 */}
                      {venta.descuento > 0 && (
                        <div style={{
                          background: "#dcfce7",
                          color: "#166534",
                          padding: "6px 12px",
                          borderRadius: "4px",
                          fontSize: "14px",
                          fontWeight: "600",
                          marginTop: "8px",
                          marginBottom: "8px",
                          display: "inline-block",
                          border: "1px solid #bbf7d0"
                        }}>
                          🎉 Descuento aplicado: ${venta.descuento.toLocaleString("es-AR")}
                        </div>
                      )}

                      <p><span className={styles.badge}>Fecha</span>{formatearFecha(venta.fecha)}</p>
                      <p><span className={styles.badge}>Total Crédito $</span>{totalCredito?.toLocaleString("es-AR")}</p>
                      <p><span className={styles.badge}>Valor por cuota</span>{venta.valorCuota?.toLocaleString("es-AR")}</p>
                      <p><span className={styles.badge}>Cantidad de cuotas</span>{venta.cuotas}</p>

                      {/* 💰 DEUDA INDIVIDUAL DESTACADA DE ESTA COMPRA */}
                      <div className={styles.saleDebtPending}>
                        <span>Deuda de esta compra:</span>
                        <strong>${saldoPendiente.toLocaleString("es-AR")}</strong>
                      </div>
                    </div>

                    {/* 🔔 BOTÓN RECORDAR CUOTA */}
                    {saldoPendiente > 0 &&
                      (cliente.telefono1 || cliente.telefono2) && (
                        <div style={{ marginTop: "12px" }}>
                          <button
                            onClick={() => enviarRecordatorio(venta)}
                            style={{
                              background: "#e53935",
                              color: "white",
                              border: "none",
                              padding: "8px 14px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: "500",
                            }}
                          >
                            🔔 Recordar cuota
                          </button>
                        </div>
                      )}

                    {/* 📩 BOTÓN REENVIAR COMPROBANTE */}
                    <div style={{ marginTop: "8px" }}>
                      <button
                        onClick={() => reenviarComprobante(venta)}
                        style={{
                          background: "#1976d2",
                          color: "white",
                          border: "none",
                          padding: "8px 14px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontWeight: "500",
                        }}
                      >
                        📩 Reenviar comprobante de compra
                      </button>
                    </div>
                  </section>

                  {/* ================= PAGOS ================= */}
                  {renderTablePagos(venta, true)}
                </section>
              );
            })}
          </>
        )}

        {/* ================= VENTAS PAGADAS ================= */}
        {ventasPagadas.length > 0 && (
          <section className={styles.paidSummary}>
            <h4>Ventas Completamente Pagadas</h4>

            <div className={styles.paidItemsGrid}>
              {ventasPagadas.flatMap((venta) =>
                venta.productos?.map((p, idx) => (
                  <div
                    key={venta.id + idx}
                    className={styles.paidItem}
                    onClick={() =>
                      setSelectedVentaId(
                        selectedVentaId === venta.id ? null : venta.id
                      )
                    }
                    style={{ cursor: "pointer" }}
                  >
                    {p.nombre} — Completamente pagada
                  </div>
                ))
              )}
            </div>

            {/* ================= VENTAS PAGADAS (DETALLE) ================= */}
            {selectedVentaId &&
              ventasPagadas
                .filter((v) => v.id === selectedVentaId)
                .map((venta) => {
                  const totalCredito =
                    venta.totalCredito || venta.valorCuota * venta.cuotas;

                  return (
                    <section key={venta.id} className={styles.saleWrapper}>
                      <section className={styles.saleInfoCard}>
                        <div className={styles.saleSection}>
                          <h4>Datos de la venta (Completada)</h4>

                          <p>
                            <span className={styles.badge}>ID de Venta</span>
                            <span className={styles.idDestacado}>{venta.id}</span>
                          </p>

                          <p><span className={styles.badge}>Cliente</span>{cliente.nombre}</p>
                          <p><span className={styles.badge}>DNI</span>{cliente.dni}</p>
                          <p><span className={styles.badge}>Dirección</span>{cliente.direccion} · {cliente.entreCalles}</p>

                          <p>
                            <span className={styles.badge}>Vendedor</span>
                            {getFirmaTexto(venta.vendedor, usuariosMap)}
                          </p>

                          <p><span className={styles.badge}>Sucursal</span>{venta.sucursal || "—"}</p>
                          <p><span className={styles.badge}>Entrega</span>{venta.entrega || "—"}</p>

                          {venta.chofer && (
                            <p>
                              <span className={styles.badge}>Chofer</span>
                              {venta.chofer.nombre} - Patente: {venta.chofer.patente || "—"} - Tel: {venta.chofer.telefono || "—"}
                            </p>
                          )}

                          <p>
                            <span className={styles.badge}>Productos</span>
                            {venta.productos
                              ?.map(
                                (p) =>
                                  `${p.nombre} (x${p.cantidad}, $${Number(
                                    p.precio
                                  ).toLocaleString("es-AR")})`
                              )
                              .join(", ")}
                          </p>
                          
                          {/* 🟢 CARTELCITO DE DESCUENTO EN VENTAS PAGADAS 🟢 */}
                          {venta.descuento > 0 && (
                            <div style={{
                              background: "#dcfce7",
                              color: "#166534",
                              padding: "6px 12px",
                              borderRadius: "4px",
                              fontSize: "14px",
                              fontWeight: "600",
                              marginTop: "8px",
                              marginBottom: "8px",
                              display: "inline-block",
                              border: "1px solid #bbf7d0"
                            }}>
                              🎉 Descuento aplicado: ${venta.descuento.toLocaleString("es-AR")}
                            </div>
                          )}

                          <p><span className={styles.badge}>Fecha</span>{formatearFecha(venta.fecha)}</p>
                          <p><span className={styles.badge}>Total Crédito $</span>{totalCredito?.toLocaleString("es-AR")}</p>
                          <p><span className={styles.badge}>Valor por cuota</span>{venta.valorCuota?.toLocaleString("es-AR")}</p>
                          <p><span className={styles.badge}>Cantidad de cuotas</span>{venta.cuotas}</p>

                          {/* 💰 DEUDA INDIVIDUAL CERO PARA COMPRA COMPLETADA */}
                          <div className={styles.saleDebtPaid}>
                            <span>Deuda de esta compra:</span>
                            <strong>$0 (Pagada)</strong>
                          </div>
                        </div>

                        {/* 📩 BOTÓN REENVIAR COMPROBANTE */}
                        <div style={{ marginTop: "10px" }}>
                          <button
                            onClick={() => reenviarComprobante(venta)}
                            style={{
                              background: "#1976d2",
                              color: "white",
                              border: "none",
                              padding: "8px 14px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: "500",
                            }}
                          >
                            📩 Reenviar comprobante de compra
                          </button>
                        </div>
                      </section>

                      {/* ================= TABLA DE HISTORIAL DE PAGOS REALES ================= */}
                      {renderTablePagos(venta, false)}
                    </section>
                  );
                })}
          </section>
        )}

        {/* ================= DEUDA TOTAL ================= */}
        <div className={styles.totalDebt}>
          <h3>
            Deuda Total: $
            {ventas
              .reduce((total, venta) => {
                const totalPagado = (venta.pagos || []).reduce((a, p) => {
                  const montoLimpio =
                    typeof p.monto === "string"
                      ? p.monto.replace(",", ".")
                      : p.monto;
                  return a + Number(montoLimpio || 0);
                }, 0);

                const totalVenta =
                  venta.totalCredito ||
                  (venta.valorCuota || 0) * (venta.cuotas || 1);

                return total + Math.max(totalVenta - totalPagado, 0);
              }, 0)
              .toLocaleString("es-AR")}
          </h3>
        </div>
      </article>
    </div>
  );
}