import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion } from "firebase/firestore";
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

// 🛠️ Helper universal para convertir cualquier formato de fecha de venta a milisegundos para ordenar
const obtenerMilisegundosFecha = (fecha) => {
  if (!fecha) return 0;
  if (typeof fecha === "object" && typeof fecha.toDate === "function") {
    return fecha.toDate().getTime();
  }
  if (typeof fecha === "string" && fecha.includes("-")) {
    const [year, month, day] = fecha.split("-");
    return new Date(year, month - 1, day).getTime();
  }
  const parsed = new Date(fecha).getTime();
  return isNaN(parsed) ? 0 : parsed;
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
  return `${year}-${month}-${day}`;
};

// ===============================
// 📈 CÁLCULO DE RECARGO POR ATRASO
// ===============================
const calcularRecargoAtraso = (venta) => {
  const fechaInicio = venta.fecha?.toDate ? venta.fecha.toDate() : new Date(venta.fecha);
  if (isNaN(fechaInicio.getTime())) return { diasAtraso: 0, porcentajeRecargo: 0, montoRecargo: 0 };

  const cuotasPagadas = venta.pagos?.length || 0;
  const proximoVencimiento = new Date(fechaInicio);
  proximoVencimiento.setMonth(proximoVencimiento.getMonth() + cuotasPagadas);

  const hoy = new Date();
  const diferenciaMs = hoy - proximoVencimiento;
  const diasAtraso = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));

  if (diasAtraso < 30) {
    return { diasAtraso: Math.max(diasAtraso, 0), porcentajeRecargo: 0, montoRecargo: 0 };
  }

  const bloquesAdicionales = Math.floor((diasAtraso - 30) / 10);
  let porcentajeRecargo = 10 + (bloquesAdicionales * 10);
  
  if (porcentajeRecargo > 200) porcentajeRecargo = 200;

  const valorCuota = Number(venta.valorCuota || 0);
  const montoRecargo = Math.round((valorCuota * porcentajeRecargo) / 100);

  return {
    diasAtraso,
    porcentajeRecargo,
    montoRecargo,
  };
};

const normalizarVenta = (venta, usuariosMap = {}) => {
  const productosNormalizados = (venta.productos || []).map((p) => ({
    nombre: p.nombre ?? p.name ?? "Producto",
    cantidad: p.cantidad ?? p.qty ?? 1,
    precio: p.precio ?? p.price ?? 0,
  }));

  const pagosNormalizados = [];

  if (venta.pago?.montoPagado > 0) {
    pagosNormalizados.push({
      numero: 1,
      fecha: venta.fecha || venta.createdAt || "—",
      monto: venta.pago.montoPagado,
      montoBase: venta.pago.montoPagado,
      montoRecargoAtraso: 0,
      montoRecargoMetodo: 0,
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
    montoBase: Number(pago.montoBase ?? pago.monto ?? 0),
    montoRecargoAtraso: Number(pago.montoRecargoAtraso ?? 0),
    montoRecargoMetodo: Number(pago.montoRecargoMetodo ?? 0),
    metodo: pago.metodo ?? "—",
    estado: "Pagado",
    firma: pago.firma ?? pago.usuario ?? "—",
  }));

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

  const [selectedVentaId, setSelectedVentaId] = useState(null);

  const auth = getAuth();
  const usuarioActual = auth.currentUser;

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

  useEffect(() => {
    const fetchUsuarios = async () => {
      try {
        const snap = await getDocs(collection(db, "usuarios"));
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.activo) {
            if (data.email) map[data.email] = data.nombre;
            if (data.nombre) map[d.id] = data.nombre;
          }
        });
        setUsuariosMap(map);
      } catch (e) {
        console.error("Error cargando usuarios", e);
      }
    };
    fetchUsuarios();
  }, []);

  const fetchVentas = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "ventas"), where("clienteId", "==", id))
      );
      setVentas(
        snap.docs.map((d) =>
          normalizarVenta({ id: d.id, ...d.data() }, usuariosMap)
        )
      );
    } finally {
      setLoadingVentas(false);
    }
  };

  useEffect(() => {
    fetchVentas();
  }, [id, usuariosMap]);

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

    const montoBaseInput = Number(nuevoPago.monto);
    const metodoSeleccionado = nuevoPago.metodo;
    const metodosConRecargo = ["Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "QR", "Link de Pago"];

    const { montoRecargo: recargoAtrasoMonto } = calcularRecargoAtraso(venta);
    
    let recargoMetodoMonto = 0;
    if (metodosConRecargo.includes(metodoSeleccionado)) {
      recargoMetodoMonto = Math.round((montoBaseInput * 0.05));
    }

    const montoFinalPago = montoBaseInput + recargoMetodoMonto;

    const pagoAGuardar = {
      numero: (venta.pagos?.length || 0) + 1,
      fecha: nuevoPago.fecha,
      monto: montoFinalPago,
      montoBase: montoBaseInput,
      montoRecargoAtraso: recargoAtrasoMonto,
      montoRecargoMetodo: recargoMetodoMonto,
      metodo: metodoSeleccionado || "—",
      estado: "Pagado",
      firma,
    };

    try {
      await updateDoc(doc(db, "ventas", ventaId), {
        pagos: arrayUnion(pagoAGuardar),
      });

      const ventaActual = ventas.find((v) => v.id === ventaId);

      setVentas((prev) =>
        prev.map((v) =>
          v.id === ventaId
            ? { ...v, pagos: [...(v.pagos || []), pagoAGuardar] }
            : v
        )
      );

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

  const estaPagado = (venta) => {
    const totalPagado = (venta.pagos || []).reduce(
      (sum, p) => {
        const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
        return sum + Number(montoLimpio || 0);
      },
      0
    );

    const totalCredito =
      venta.totalCredito ||
      (venta.valorCuota || 0) * (venta.cuotas || 0);

    return Math.round(totalPagado) >= Math.round(totalCredito);
  };

  const ventasAtrasadasIds = useMemo(() => {
    const hoy = new Date();
    return ventas
      .filter((v) => {
        const totalCredito = v.totalCredito || (v.valorCuota * v.cuotas);
        const totalPagado = (v.pagos || []).reduce((sum, p) => {
          const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
          return sum + Number(montoLimpio || 0);
        }, 0);

        if (Math.round(totalPagado) >= Math.round(totalCredito)) return false;

        const fechaInicio = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha);
        const cuotasPagadas = v.pagos?.length || 0;
        const proximoVencimiento = new Date(fechaInicio);
        proximoVencimiento.setMonth(proximoVencimiento.getMonth() + cuotasPagadas);

        const diasAtraso = (hoy - proximoVencimiento) / (1000 * 60 * 60 * 24);
        return diasAtraso > 30;
      })
      .map((v) => v.id);
  }, [ventas]);

  useEffect(() => {
    if (!selectedVentaId) return;

    const elem = document.getElementById(`venta-${selectedVentaId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedVentaId]);

  const ventasPendientes = ventas.filter((v) => !estaPagado(v));
  
  const ventasPagadas = useMemo(() => {
    return ventas
      .filter((v) => estaPagado(v))
      .sort((a, b) => obtenerMilisegundosFecha(b.fecha) - obtenerMilisegundosFecha(a.fecha));
  }, [ventas]);

  if (loadingCliente || loadingVentas) return <Loader />;
  if (!cliente) return null;

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
    const { diasAtraso, porcentajeRecargo, montoRecargo } = calcularRecargoAtraso(venta);

    let mensajeRecargo = "";
    if (diasAtraso >= 30) {
      mensajeRecargo = `\n⚠️ Su cuota registra ${diasAtraso} días de atraso, aplicándose un recargo del ${porcentajeRecargo}% ($${montoRecargo.toLocaleString("es-AR")}).`;
    }

    const mensajeTransferencia = `\n💳 Recuerde que abonando por Transferencia, Tarjeta, QR o Link de Pago cuenta con un recargo adicional del +5%.`;

    const mensaje = `Estimado/a ${cliente.nombre},

Le informamos que se encuentra pendiente el pago de su cuota N° ${numeroCuota}.

Monto de la cuota: $${valorCuota.toLocaleString("es-AR")}${mensajeRecargo}${mensajeTransferencia}

Le solicitamos regularizar la misma a la brevedad.

Si usted ya realizó el pago, por favor desestime este mensaje.

Este es un mensaje automático generado por nuestro sistema.`;

    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;

    window.open(url, "_blank");
  };

  const reenviarComprobante = (venta) => {
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

    const productosTexto = venta.productos
      ?.map((p) => `* ${p.nombre} x${p.cantidad} —`)
      .join("\n");

    const valorCuota = Number(venta.valorCuota || 0);
    const todosLosPagos = venta.pagos || [];

    const totalPagadoHistorico = todosLosPagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    const ultimoPago = todosLosPagos.length > 0 ? todosLosPagos[todosLosPagos.length - 1] : null;
    const montoUltimoPago = ultimoPago ? Number(ultimoPago.monto || 0) : 0;
    const valorPagadoTexto = montoUltimoPago.toLocaleString("es-AR");

    const totalAntesDeEstePago = totalPagadoHistorico - montoUltimoPago;
    const cuotasCompletasAntes = Math.floor(totalAntesDeEstePago / valorCuota);
    const cuotasCompletasAhora = Math.floor(totalPagadoHistorico / valorCuota);

    let detalleCuota = "";

    if (cuotasCompletasAhora > cuotasCompletasAntes) {
      detalleCuota = `cuota n°${cuotasCompletasAhora} (completa)`;
      const saldoSobrante = totalPagadoHistorico % valorCuota;
      if (saldoSobrante > 0 && cuotasCompletasAhora < Number(venta.cuotas)) {
        detalleCuota += ` y saldo a cuenta de cuota n°${cuotasCompletasAhora + 1}`;
      }
    } else {
      const cuotaEnProceso = cuotasCompletasAhora + 1;
      detalleCuota = `a cuenta de cuota n°${cuotaEnProceso} (pago parcial)`;
    }

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

    const url = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(
      mensaje
    )}`;

    window.open(url, "_blank");
  };

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

    let textoRecargosWhatsApp = "";
    const montoBaseVal = Number(pago.montoBase || pago.monto || 0);
    const recargoMetodoVal = Number(pago.montoRecargoMetodo || 0);
    const recargoAtrasoVal = Number(pago.montoRecargoAtraso || 0);

    if (recargoAtrasoVal > 0) {
      textoRecargosWhatsApp += `\nRecargo por atraso: $${recargoAtrasoVal.toLocaleString("es-AR")}`;
    }
    if (recargoMetodoVal > 0) {
      textoRecargosWhatsApp += `\nRecargo por ${pago.metodo} (+5%): $${recargoMetodoVal.toLocaleString("es-AR")}`;
    }

    const mensaje = `COMPROBANTE DE PAGO

Cliente: ${cliente.nombre}
DNI: ${cliente.dni}

Venta ID: ${venta.id}
Fecha de pago: ${formatearFecha(pago.fecha)}
Monto base: $${montoBaseVal.toLocaleString("es-AR")}${textoRecargosWhatsApp}
Monto total abonado: $${Number(pago.monto).toLocaleString("es-AR")}
Método de pago: ${pago.metodo || "—"}

Cobrado por: ${getFirmaTexto(pago.firma, usuariosMap)}

Gracias por su pago.`;

    const url = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(
      mensaje
    )}`;

    window.open(url, "_blank");
  };

  const renderTablePagos = (venta, permitirAgregar) => {
    const valorCuotaSeguro = Number(venta.valorCuota) || 1;
    let acumuladoPagos = 0;

    const pagosConCuota = (venta.pagos || []).map((pago, i) => {
      const monto = Number(typeof pago.monto === "string" ? pago.monto.replace(",", ".") : pago.monto || 0);
      
      const cuotaInicio = Math.floor(acumuladoPagos / valorCuotaSeguro) + 1;
      acumuladoPagos += monto;
      let cuotaFin = Math.ceil(acumuladoPagos / valorCuotaSeguro);
      if (cuotaFin < cuotaInicio) cuotaFin = cuotaInicio;

      const labelCuota = cuotaInicio === cuotaFin 
        ? `Cuota ${cuotaInicio}` 
        : `Cuotas ${cuotaInicio} a ${cuotaFin}`;

      return {
        ...pago,
        indexReal: pago.numero || i + 1,
        labelCuota
      };
    });

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

          {pagosConCuota.map((pago, i) => {
            const montoBaseVal = Number(pago.montoBase || pago.monto || 0);
            const recargoAtrasoVal = Number(pago.montoRecargoAtraso || 0);
            const recargoMetodoVal = Number(pago.montoRecargoMetodo || 0);
            const montoTotalVal = Number(pago.monto || 0);

            return (
              <div key={i} className={`${styles.row} ${styles.paid}`} style={{ alignItems: "flex-start", paddingBottom: "12px", paddingTop: "12px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.2" }}>
                  <strong style={{ color: "#0f172a" }}>{pago.labelCuota}</strong>
                  <small style={{ color: "#64748b", fontSize: "12px" }}>Pago #{pago.indexReal}</small>
                </span>
                
                <span>{formatearFecha(pago.fecha)}</span>
                
                <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <strong>${montoTotalVal.toLocaleString("es-AR")}</strong>
                  <small style={{ color: "#475569", fontSize: "11px", lineHeight: "1.3" }}>
                    Base: ${montoBaseVal.toLocaleString("es-AR")}
                    {recargoAtrasoVal > 0 && <><br />Recargo Atraso: +${recargoAtrasoVal.toLocaleString("es-AR")}</>}
                    {recargoMetodoVal > 0 && <><br />Recargo {pago.metodo} (+5%): +${recargoMetodoVal.toLocaleString("es-AR")}</>}
                  </small>
                </span>

                <span>{pago.metodo || "—"}</span>
                <span>Pagado</span>
                <span>{getFirmaTexto(pago.firma, usuariosMap)}</span>
              </div>
            );
          })}

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
                <option value="Transferencia">🏦 Transferencia (+5%)</option>
                <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito (+5%)</option>
                <option value="Tarjeta de Débito">💳 Tarjeta de Débito (+5%)</option>
                <option value="QR">📱 QR (+5%)</option>
                <option value="Link de Pago">🔗 Link de Pago (+5%)</option>
              </select>
              <button onClick={() => handleSavePago(venta.id)}>Guardar</button>
              <button onClick={() => setAddingPagoId(null)}>Cancelar</button>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={styles.paymentWrapper}>
      <article className={styles.paymentCard}>
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
            className={`${styles.status} ${cliente.estado === "Activo" ? styles.ok : styles.blocked}`}
          >
            {cliente.estado}
          </span>
        </header>

        {ventas.length === 0 ? (
          <p style={{ color: "#64748b" }}>No hay ventas registradas</p>
        ) : (
          <>
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
              const { diasAtraso, porcentajeRecargo, montoRecargo } = calcularRecargoAtraso(venta);
              
              const totalConRecargoBase = totalCredito + montoRecargo;
              const saldoConRecargo = Math.max(totalConRecargoBase - totalPagado, 0);

              const recargoTransferencia = Math.round((saldoConRecargo * 1.05) / 100) * 100;

              return (
                <section
                  id={`venta-${venta.id}`}
                  key={venta.id}
                  className={`${styles.saleWrapper} ${ventasAtrasadasIds.includes(venta.id) ? styles.destacado : ""} ${selectedVentaId === venta.id ? styles.resaltado : ""}`}
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

                      {diasAtraso >= 30 && (
                        <div style={{
                          background: "#fef2f2",
                          color: "#991b1b",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          fontSize: "14px",
                          fontWeight: "600",
                          marginTop: "8px",
                          marginBottom: "8px",
                          border: "1px solid #fecaca"
                        }}>
                          ⚠️ Atraso de {diasAtraso} días: recargo sobre la cuota (+${montoRecargo.toLocaleString("es-AR")})
                        </div>
                      )}

                      <div className={styles.saleDebtPending}>
                        <span>Deuda de esta compra {diasAtraso >= 30 ? "(con recargo):" : "(sin recargo):"}</span>
                        <strong>${saldoConRecargo.toLocaleString("es-AR")}</strong>
                      </div>

                      <div style={{
                        background: diasAtraso >= 30 ? "linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)" : "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                        color: "#ffffff",
                        padding: "20px",
                        borderRadius: "12px",
                        marginTop: "16px",
                        marginBottom: "12px",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
                        border: diasAtraso >= 30 ? "3px solid #f87171" : "2px solid #38bdf8"
                      }}>
                        <div style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "1.5px", color: diasAtraso >= 30 ? "#fca5a5" : "#38bdf8", fontWeight: "800", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>🚨</span> CONTROL DE CAJA / VENDEDOR — ESTADO DE CUENTA
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginTop: "12px" }}>
                          <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
                            <span style={{ fontSize: "12px", color: "#cbd5e1", display: "block" }}>Días de Atraso</span>
                            <strong style={{ fontSize: "20px", color: diasAtraso >= 30 ? "#f87171" : "#f8fafc" }}>
                              {diasAtraso} {diasAtraso === 1 ? "día" : "días"}
                            </strong>
                          </div>

                          <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
                            <span style={{ fontSize: "12px", color: "#cbd5e1", display: "block" }}>A Pagar (Efectivo / Contado)</span>
                            <strong style={{ fontSize: "22px", color: "#ffffff" }}>
                              ${saldoConRecargo.toLocaleString("es-AR")}
                            </strong>
                          </div>

                          <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
                            <span style={{ fontSize: "12px", color: "#cbd5e1", display: "block" }}>Transferencia / Tarjeta (+5%)</span>
                            <strong style={{ fontSize: "22px", color: "#4ade80" }}>
                              ${recargoTransferencia.toLocaleString("es-AR")}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>

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

                  {renderTablePagos(venta, true)}
                </section>
              );
            })}
          </>
        )}

        {ventasPagadas.length > 0 && (
          <section className={styles.paidSummary}>
            <h4>Ventas Completamente Pagadas</h4>

            <div className={styles.paidItemsGrid}>
              {ventasPagadas.flatMap((venta) =>
                venta.productos?.map((p, idx) => (
                  <div
                    key={venta.id + idx}
                    className={styles.paidItem}
                    onClick={() => setSelectedVentaId(venta.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {p.nombre} — Completamente pagada
                  </div>
                ))
              )}
            </div>

            {selectedVentaId && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: "100vh",
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  backdropFilter: "blur(5px)",
                  WebkitBackdropFilter: "blur(5px)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  zIndex: 1000,
                  padding: "20px",
                  boxSizing: "border-box",
                }}
                onClick={() => setSelectedVentaId(null)}
              >
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    maxWidth: "700px",
                    width: "100%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
                    padding: "24px",
                    position: "relative",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setSelectedVentaId(null)}
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      background: "transparent",
                      border: "none",
                      fontSize: "24px",
                      cursor: "pointer",
                      color: "#374151",
                    }}
                  >
                    ✕
                  </button>

                  {ventasPagadas
                    .filter((v) => v.id === selectedVentaId)
                    .map((venta) => {
                      const totalCredito =
                        venta.totalCredito || venta.valorCuota * venta.cuotas;

                      return (
                        <div key={venta.id}>
                          <section className={styles.saleWrapper} style={{ margin: 0, boxShadow: "none" }}>
                            <section className={styles.saleInfoCard} style={{ border: "none", padding: 0 }}>
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

                                <div className={styles.saleDebtPaid}>
                                  <span>Deuda de esta compra:</span>
                                  <strong>$0 (Pagada)</strong>
                                </div>
                              </div>

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

                            {renderTablePagos(venta, false)}
                          </section>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </section>
        )}

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

                const { montoRecargo } = calcularRecargoAtraso(venta);
                const saldoConRecargo = Math.max((totalVenta + montoRecargo) - totalPagado, 0);

                return total + saldoConRecargo;
              }, 0)
              .toLocaleString("es-AR")}
          </h3>
        </div>
      </article>
    </div>
  );
}