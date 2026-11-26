import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase/firebaseConfig";
import {
  CLASES_MANUALES,
  normalizarClasificacion,
} from "../pages/Clientes";
import styles from "../styles/ClientDetail.module.css";
import { Loader } from "./Loader";

const TELEFONO_JEFE_O_GRUPO = "54911XXXXXXXX";

const parsearMontoSeguro = (val) => {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const limpio = val.replace(/\s+/g, "").replace(",", ".");
    const num = Number(limpio);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
};

const formatearFecha = (fecha) => {
  if (!fecha) return "—";
  let date;

  if (typeof fecha === "object" && typeof fecha.toDate === "function") {
    date = fecha.toDate();
  } else if (typeof fecha === "string") {
    if (fecha.includes("-")) {
      const [year, month, day] = fecha.split("-");
      date = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      date = new Date(fecha);
    }
  } else if (typeof fecha === "number") {
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

const obtenerMilisegundosFecha = (fecha) => {
  if (!fecha) return 0;
  if (typeof fecha === "object" && typeof fecha.toDate === "function") {
    return fecha.toDate().getTime();
  }
  if (typeof fecha === "string" && fecha.includes("-")) {
    const [year, month, day] = fecha.split("-");
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
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

const obtenerTotalVenta = (venta) => {
  const descuento = parsearMontoSeguro(venta.descuento);
  const valorCuota = parsearMontoSeguro(venta.valorCuota);
  const cuotas = Number(venta.cuotas || 0);
  const totalDirecto = parsearMontoSeguro(venta.total || venta.totalCredito);

  if (totalDirecto > 0) {
    return Math.max(totalDirecto - descuento, 0);
  }
  if (cuotas > 0 && valorCuota > 0) {
    return Math.max(valorCuota * cuotas - descuento, 0);
  }
  return 0;
};

// Suma todos los pagos reales (anticipo/pago inicial + pagos parciales o de cuotas)
const calcularTotalPagadoVenta = (venta) => {
  const pagosLista = Array.isArray(venta.pagos) ? venta.pagos : [];
  const sumaArray = pagosLista.reduce((sum, p) => {
    const rawMonto = p.montoBase ?? p.monto ?? 0;
    return sum + parsearMontoSeguro(rawMonto);
  }, 0);

  if (sumaArray > 0) {
    return sumaArray;
  }

  return parsearMontoSeguro(venta.pago?.montoPagado);
};

const obtenerCuotasPagadas = (venta) => {
  const totalCuotas = Number(venta.cuotas) || 0;
  const valorCuota = parsearMontoSeguro(venta.valorCuota);
  const totalPagado = calcularTotalPagadoVenta(venta);
  const totalVenta = obtenerTotalVenta(venta);

  if (totalVenta > 0 && Math.round(totalPagado) >= Math.round(totalVenta)) {
    return totalCuotas > 0 ? totalCuotas : 1;
  }
  if (totalCuotas <= 0 || valorCuota <= 0) return 0;

  return Math.min(Math.floor(totalPagado / valorCuota), totalCuotas);
};

const obtenerSaldoPendienteBase = (venta) => {
  const totalVenta = obtenerTotalVenta(venta);
  const totalPagado = calcularTotalPagadoVenta(venta);
  if (totalVenta > 0 && Math.round(totalPagado) >= Math.round(totalVenta)) {
    return 0;
  }
  return Math.max(totalVenta - totalPagado, 0);
};

const estaPagado = (venta) => {
  const totalVenta = obtenerTotalVenta(venta);
  const totalPagado = calcularTotalPagadoVenta(venta);
  const saldo = obtenerSaldoPendienteBase(venta);

  if (saldo <= 0 && totalVenta > 0 && totalPagado > 0) {
    return true;
  }
  const totalCuotas = Number(venta.cuotas || 0);
  if (totalCuotas > 0 && obtenerCuotasPagadas(venta) >= totalCuotas && totalPagado > 0) {
    return true;
  }
  return false;
};

const calcularRecargoAtraso = (venta) => {
  if (estaPagado(venta)) {
    return { diasAtraso: 0, porcentajeRecargo: 0, montoRecargo: 0 };
  }

  const fechaInicio = venta.fecha?.toDate
    ? venta.fecha.toDate()
    : new Date(venta.fecha);
  if (isNaN(fechaInicio.getTime())) {
    return { diasAtraso: 0, porcentajeRecargo: 0, montoRecargo: 0 };
  }

  const cuotasPagadas = obtenerCuotasPagadas(venta);
  const proximoVencimiento = new Date(fechaInicio);
  proximoVencimiento.setMonth(proximoVencimiento.getMonth() + cuotasPagadas);

  const hoy = new Date();
  const diasAtraso = Math.floor(
    (hoy - proximoVencimiento) / (1000 * 60 * 60 * 24)
  );

  if (diasAtraso < 30) {
    return {
      diasAtraso: Math.max(diasAtraso, 0),
      porcentajeRecargo: 0,
      montoRecargo: 0,
    };
  }

  const bloquesAdicionales = Math.floor((diasAtraso - 30) / 10);
  const porcentajeRecargo = Math.min(10 + bloquesAdicionales * 10, 200);
  const valorCuota = parsearMontoSeguro(venta.valorCuota);
  const montoRecargo = Math.round((valorCuota * porcentajeRecargo) / 100);

  return { diasAtraso, porcentajeRecargo, montoRecargo };
};

const normalizarVenta = (venta, usuariosMap = {}) => {
  const productosNormalizados = (venta.productos || []).map((p) => ({
    nombre: p.nombre ?? p.name ?? "Producto",
    cantidad: p.cantidad ?? p.qty ?? 1,
    precio: p.precio ?? p.price ?? 0,
  }));

  const pagosNormalizados = [];
  const montoPagoAntiguo = parsearMontoSeguro(venta.pago?.montoPagado);
  const tienePagoInicial = montoPagoAntiguo > 0;

  if (tienePagoInicial) {
    pagosNormalizados.push({
      numero: 0,
      fecha: venta.fecha || venta.createdAt || "—",
      monto: montoPagoAntiguo,
      montoBase: montoPagoAntiguo,
      montoRecargoAtraso: 0,
      montoRecargoMetodo: 0,
      metodo: "Anticipo (Pago inicial)",
      estado: "Pagado",
      firma: venta.cargadoPor || "Sistema",
      esPagoInicial: true,
    });
  }

  if (Array.isArray(venta.pagos)) {
    venta.pagos.forEach((pago) => {
      const montoActual = parsearMontoSeguro(pago.monto);
      const metodoLower = String(pago.metodo || "").toLowerCase();

      const esElMismoPagoInicial =
        tienePagoInicial &&
        (pago.esPagoInicial === true ||
          metodoLower.includes("pago inicial") ||
          metodoLower.includes("anticipo") ||
          (pago.numero === 0 && Math.abs(montoPagoAntiguo - montoActual) < 1));

      if (!esElMismoPagoInicial) {
        pagosNormalizados.push({
          numero:
            pago.numero ??
            pagosNormalizados.filter((x) => !x.esPagoInicial).length + 1,
          fecha: pago.fecha ?? "—",
          monto: montoActual,
          montoBase: parsearMontoSeguro(pago.montoBase ?? montoActual),
          montoRecargoAtraso: parsearMontoSeguro(pago.montoRecargoAtraso),
          montoRecargoMetodo: parsearMontoSeguro(pago.montoRecargoMetodo),
          metodo: pago.metodo ?? "—",
          estado: pago.estado ?? "Pagado",
          firma: pago.firma ?? pago.usuario ?? "—",
          esPagoInicial:
            pago.esPagoInicial === true || metodoLower.includes("anticipo"),
        });
      }
    });
  }

  const vendedor =
    usuariosMap[venta.vendedor] ??
    usuariosMap[venta.vendedorReal] ??
    usuariosMap[venta.cargadoPor] ??
    venta.vendedor ??
    venta.vendedorReal ??
    venta.cargadoPor ??
    "—";

  return {
    ...venta,
    productos: productosNormalizados,
    pagos: pagosNormalizados,
    vendedor,
    entrega: venta.entrega ?? venta.tipoEntrega ?? "—",
    sucursal: venta.sucursal ?? venta.productos?.[0]?.branch ?? "—",
    descuento: venta.descuento || 0,
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
  const [nuevoPago, setNuevoPago] = useState({
    fecha: "",
    monto: "",
    metodo: "",
  });

  const [selectedVentaId, setSelectedVentaId] = useState(null);

  const auth = getAuth();
  const usuarioActual = auth.currentUser;

  useEffect(() => {
    const fetchCliente = async () => {
      try {
        const docSnap = await getDoc(doc(db, "clientes", id));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCliente({
            id: docSnap.id,
            ...data,
            clasificacion: normalizarClasificacion(data.clasificacion),
          });
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

  useEffect(() => {
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
    fetchVentas();
  }, [id, usuariosMap]);

  const handleActualizarClasificacionDetalle = async (nuevaClase) => {
    const claseNormalizada = normalizarClasificacion(nuevaClase);
    try {
      await updateDoc(doc(db, "clientes", id), {
        clasificacion: claseNormalizada,
      });
      setCliente((prev) =>
        prev ? { ...prev, clasificacion: claseNormalizada } : prev
      );
    } catch (error) {
      console.error("Error al guardar clasificación:", error);
      alert("No se pudo actualizar la clasificación.");
    }
  };

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
      nombre:
        usuariosMap[usuarioActual.uid] ||
        usuarioActual.nombre ||
        usuarioActual.displayName ||
        "",
      email: usuarioActual.email || "",
      uid: usuarioActual.uid || "",
    };

    const montoBaseInput = parsearMontoSeguro(nuevoPago.monto);
    const metodoSeleccionado = nuevoPago.metodo;
    const metodosConRecargo = [
      "Transferencia",
      "Tarjeta de Crédito",
      "Tarjeta de Débito",
      "QR",
      "Link de Pago",
    ];

    const { montoRecargo: recargoAtrasoMonto } = calcularRecargoAtraso(venta);
    const recargoMetodoMonto = metodosConRecargo.includes(metodoSeleccionado)
      ? Math.round(montoBaseInput * 0.05)
      : 0;

    const montoFinalPago = montoBaseInput + recargoMetodoMonto;
    const cantidadPagosCuotas = (venta.pagos || []).filter(
      (p) => !p.esPagoInicial
    ).length;

    const pagoAGuardar = {
      numero: cantidadPagosCuotas + 1,
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

      setVentas((prev) =>
        prev.map((v) =>
          v.id === ventaId
            ? { ...v, pagos: [...(v.pagos || []), pagoAGuardar] }
            : v
        )
      );

      enviarComprobantePago(venta, pagoAGuardar);
      setAddingPagoId(null);
      setNuevoPago({ fecha: "", monto: "", metodo: "" });
    } catch (error) {
      console.error(error);
      alert("No se pudo guardar el pago");
    }
  };

  const ventasAtrasadasIds = useMemo(() => {
    const hoy = new Date();
    return ventas
      .filter((v) => {
        if (estaPagado(v)) return false;
        const fechaInicio = v.fecha?.toDate
          ? v.fecha.toDate()
          : new Date(v.fecha);
        const cuotasPagadas = obtenerCuotasPagadas(v);
        const proximoVencimiento = new Date(fechaInicio);
        proximoVencimiento.setMonth(proximoVencimiento.getMonth() + cuotasPagadas);
        const diasAtraso =
          (hoy - proximoVencimiento) / (1000 * 60 * 60 * 24);
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
      .sort(
        (a, b) =>
          obtenerMilisegundosFecha(b.fecha) - obtenerMilisegundosFecha(a.fecha)
      );
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
    const totalCuotas = Math.max(Number(venta.cuotas || 0), 1);
    const cuotasPagadas = obtenerCuotasPagadas(venta);
    const numeroCuota = Math.min(cuotasPagadas + 1, totalCuotas);
    const valorCuota = parsearMontoSeguro(venta.valorCuota);
    const { diasAtraso, porcentajeRecargo, montoRecargo } =
      calcularRecargoAtraso(venta);

    const productosDetalle =
      venta.productos && venta.productos.length > 0
        ? venta.productos.map((p) => `${p.nombre} (x${p.cantidad})`).join(", ")
        : "tu compra";

    const montoConTransferencia = Math.round(
      (valorCuota + montoRecargo) * 1.05
    );
    const detalleAtraso =
      diasAtraso >= 30
        ? `\n- Recargo por atraso (${diasAtraso} días, ${porcentajeRecargo}%): +$${montoRecargo.toLocaleString("es-AR")}`
        : "";

    const mensaje = [
      `¡Hola ${cliente.nombre}!`,
      "",
      `Esperamos que tu día vaya de maravilla. Te escribimos de Grupo Ferreira Hogar para recordarte el pago pendiente de tu cuota por la compra de ${productosDetalle}.`,
      "",
      "Detalle de la cuota:",
      `- Cuota: ${numeroCuota}/${totalCuotas}`,
      `- Monto en efectivo: $${valorCuota.toLocaleString("es-AR")}${detalleAtraso}`,
      `- Con Transferencia, Tarjeta, QR o Link de Pago (+5% de recargo): $${montoConTransferencia.toLocaleString("es-AR")}`,
      "",
      "Por favor, avisanos cuando realices el pago o, si ya lo abonaste, desestimá este mensaje.",
      "",
      "¡Gracias por mantenerte al día!",
    ].join("\n");

    window.open(
      `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
      "_blank"
    );
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
      ?.map((p) => `* ${p.nombre} x${p.cantidad}`)
      .join("\n");
    const valorCuota = parsearMontoSeguro(venta.valorCuota);
    const totalPagadoHistorico = calcularTotalPagadoVenta(venta);

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
Total pagado histórico: $${totalPagadoHistorico.toLocaleString("es-AR")}

Gracias por su compra.`;

    window.open(
      `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(mensaje)}`,
      "_blank"
    );
  };

  const enviarComprobanteAlJefe = (venta) => {
    const productosTexto = venta.productos
      ?.map(
        (p) =>
          `• ${p.nombre} (x${p.cantidad}, $${parsearMontoSeguro(p.precio).toLocaleString("es-AR")})`
      )
      .join("\n");
    const valorCuota = parsearMontoSeguro(venta.valorCuota);

    const mensaje = `🧾 *COMPROBANTE DE VENTA*

*ID de Venta:* ${venta.id}
*Cliente:* ${cliente.nombre} (${normalizarClasificacion(cliente.clasificacion).toUpperCase()})
*DNI:* ${cliente.dni}
*Dirección:* ${cliente.direccion || "—"} ${cliente.entreCalles ? `· ${cliente.entreCalles}` : ""}

*Fecha:* ${formatearFecha(venta.fecha)}
*Sucursal:* ${venta.sucursal || "—"}
*Vendedor:* ${getFirmaTexto(venta.vendedor, usuariosMap)}

*Productos:*
${productosTexto}

*Cuotas:* ${venta.cuotas} x $${valorCuota.toLocaleString("es-AR")}
*Total Crédito:* $${obtenerTotalVenta(venta).toLocaleString("es-AR")}`;

    const url =
      TELEFONO_JEFE_O_GRUPO && TELEFONO_JEFE_O_GRUPO !== "54911XXXXXXXX"
        ? `https://api.whatsapp.com/send?phone=${TELEFONO_JEFE_O_GRUPO}&text=${encodeURIComponent(mensaje)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`;

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
    const montoBaseVal = parsearMontoSeguro(pago.montoBase ?? pago.monto);
    const recargoMetodoVal = parsearMontoSeguro(pago.montoRecargoMetodo);
    const recargoAtrasoVal = parsearMontoSeguro(pago.montoRecargoAtraso);

    let textoRecargosWhatsApp = "";
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
Monto total abonado: $${parsearMontoSeguro(pago.monto).toLocaleString("es-AR")}
Método de pago: ${pago.metodo || "—"}

Cobrado por: ${getFirmaTexto(pago.firma, usuariosMap)}

Gracias por su pago.`;

    window.open(
      `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(mensaje)}`,
      "_blank"
    );
  };

  const renderTablePagos = (venta, permitirAgregar) => {
    const valorCuotaSeguro = parsearMontoSeguro(venta.valorCuota) || 1;
    const totalCuotas = Number(venta.cuotas) || 0;
    let acumuladoPagos = 0;
    let contadorCuotasReal = 0;

    const pagosConCuota = (venta.pagos || []).map((pago, i) => {
      const montoBase = parsearMontoSeguro(pago.montoBase ?? pago.monto);

      if (pago.esPagoInicial) {
        acumuladoPagos += montoBase;
        return { ...pago, indexReal: 0, labelCuota: "Anticipo" };
      }

      contadorCuotasReal += 1;
      const cuotaInicio = Math.min(
        Math.floor(acumuladoPagos / valorCuotaSeguro) + 1,
        Math.max(totalCuotas, 1)
      );
      acumuladoPagos += montoBase;
      let cuotaFin = Math.min(
        Math.ceil(acumuladoPagos / valorCuotaSeguro),
        Math.max(totalCuotas, 1)
      );
      if (cuotaFin < cuotaInicio) cuotaFin = cuotaInicio;

      const labelCuota =
        cuotaInicio === cuotaFin
          ? `Cuota ${cuotaInicio}`
          : `Cuotas ${cuotaInicio} a ${cuotaFin}`;

      return {
        ...pago,
        indexReal: pago.numero || contadorCuotasReal || i + 1,
        labelCuota,
      };
    });

    const cuotasPagas = obtenerCuotasPagadas(venta);
    const cuotasRestantes = Math.max(totalCuotas - cuotasPagas, 0);

    return (
      <section className={styles.payments}>
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h4>Historial de pagos</h4>
            {permitirAgregar && (
              <button type="button" onClick={() => handleAddPagoClick(venta.id)}>
                ➕ Agregar pago
              </button>
            )}
          </div>

          <div
            style={{
              background: "#e0f2fe",
              color: "#0369a1",
              padding: "10px 14px",
              borderRadius: "6px",
              fontWeight: "500",
              fontSize: "14px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            ℹ️ Van {cuotasPagas} cuotas pagas de {totalCuotas}, restan{" "}
            {cuotasRestantes} cuotas para terminar.
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
            const montoBaseVal = parsearMontoSeguro(pago.montoBase ?? pago.monto);
            const recargoAtrasoVal = parsearMontoSeguro(pago.montoRecargoAtraso);
            const recargoMetodoVal = parsearMontoSeguro(pago.montoRecargoMetodo);
            const montoTotalVal = parsearMontoSeguro(pago.monto);

            return (
              <div
                key={i}
                className={`${styles.row} ${styles.paid}`}
                style={{
                  alignItems: "flex-start",
                  paddingBottom: "12px",
                  paddingTop: "12px",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    lineHeight: "1.2",
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>{pago.labelCuota}</strong>
                  <small style={{ color: "#64748b", fontSize: "12px" }}>
                    {pago.esPagoInicial
                      ? "Pago inicial"
                      : `Pago #${pago.indexReal}`}
                  </small>
                </span>

                <span>
                  {formatearFecha(pago.esPagoInicial ? venta.fecha : pago.fecha)}
                </span>

                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <strong>${montoTotalVal.toLocaleString("es-AR")}</strong>
                  {!pago.esPagoInicial && (
                    <small
                      style={{
                        color: "#475569",
                        fontSize: "11px",
                        lineHeight: "1.3",
                      }}
                    >
                      Base: ${montoBaseVal.toLocaleString("es-AR")}
                      {recargoAtrasoVal > 0 && (
                        <>
                          <br />
                          Recargo Atraso: +$
                          {recargoAtrasoVal.toLocaleString("es-AR")}
                        </>
                      )}
                      {recargoMetodoVal > 0 && (
                        <>
                          <br />
                          Recargo {pago.metodo} (+5%): +$
                          {recargoMetodoVal.toLocaleString("es-AR")}
                        </>
                      )}
                    </small>
                  )}
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
                onChange={(e) =>
                  setNuevoPago({ ...nuevoPago, fecha: e.target.value })
                }
              />
              <input
                type="number"
                placeholder="Monto"
                value={nuevoPago.monto}
                onChange={(e) =>
                  setNuevoPago({ ...nuevoPago, monto: e.target.value })
                }
              />
              <select
                value={nuevoPago.metodo}
                onChange={(e) =>
                  setNuevoPago({ ...nuevoPago, metodo: e.target.value })
                }
              >
                <option value="" disabled hidden>
                  Método
                </option>
                <option value="Efectivo">💵 Efectivo</option>
                <option value="Transferencia">🏦 Transferencia (+5%)</option>
                <option value="Tarjeta de Crédito">
                  💳 Tarjeta de Crédito (+5%)
                </option>
                <option value="Tarjeta de Débito">
                  💳 Tarjeta de Débito (+5%)
                </option>
                <option value="QR">📱 QR (+5%)</option>
                <option value="Link de Pago">🔗 Link de Pago (+5%)</option>
              </select>
              <button type="button" onClick={() => handleSavePago(venta.id)}>
                Guardar
              </button>
              <button type="button" onClick={() => setAddingPagoId(null)}>
                Cancelar
              </button>
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

            <div
              style={{
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <label
                htmlFor="detalle-clasificacion"
                style={{ fontSize: "13px", fontWeight: 600 }}
              >
                Clasificación:
              </label>
              <select
                id="detalle-clasificacion"
                value={normalizarClasificacion(cliente.clasificacion)}
                onChange={(e) =>
                  handleActualizarClasificacionDetalle(e.target.value)
                }
              >
                {CLASES_MANUALES.map((clase) => (
                  <option key={clase} value={clase}>
                    {clase.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span
            className={`${styles.status} ${
              cliente.estado === "Activo" ? styles.ok : styles.blocked
            }`}
          >
            {cliente.estado}
          </span>
        </header>

        {ventas.length === 0 ? (
          <p style={{ color: "#64748b" }}>No hay ventas registradas</p>
        ) : (
          <>
            {ventasPendientes.map((venta) => {
              const totalCredito = obtenerTotalVenta(venta);
              const saldoPendiente = obtenerSaldoPendienteBase(venta);
              const { diasAtraso, montoRecargo } = calcularRecargoAtraso(venta);
              const saldoConRecargo =
                saldoPendiente > 0 ? saldoPendiente + montoRecargo : 0;
              const recargoTransferencia =
                Math.round((saldoConRecargo * 1.05) / 100) * 100;

              return (
                <section
                  id={`venta-${venta.id}`}
                  key={venta.id}
                  className={`${styles.saleWrapper} ${
                    ventasAtrasadasIds.includes(venta.id)
                      ? styles.destacado
                      : ""
                  } ${selectedVentaId === venta.id ? styles.resaltado : ""}`}
                >
                  <section className={styles.saleInfoCard}>
                    <div className={styles.saleSection}>
                      <h4>Datos de la venta</h4>

                      <p>
                        <span className={styles.badge}>ID de Venta</span>
                        <span
                          className={
                            selectedVentaId === venta.id
                              ? styles.idDestacado
                              : ""
                          }
                        >
                          {venta.id}
                        </span>
                      </p>

                      <p>
                        <span className={styles.badge}>Cliente</span>
                        {cliente.nombre}
                      </p>
                      <p>
                        <span className={styles.badge}>DNI</span>
                        {cliente.dni}
                      </p>
                      <p>
                        <span className={styles.badge}>Dirección</span>
                        {cliente.direccion} · {cliente.entreCalles}
                      </p>
                      <p>
                        <span className={styles.badge}>Vendedor</span>
                        {getFirmaTexto(venta.vendedor, usuariosMap)}
                      </p>
                      <p>
                        <span className={styles.badge}>Sucursal</span>
                        {venta.sucursal || "—"}
                      </p>
                      <p>
                        <span className={styles.badge}>Entrega</span>
                        {venta.entrega || "—"}
                      </p>

                      {venta.chofer && (
                        <p>
                          <span className={styles.badge}>Chofer</span>
                          {venta.chofer.nombre} · Patente:{" "}
                          {venta.chofer.patente || "—"} · Tel:{" "}
                          {venta.chofer.telefono || "—"}
                        </p>
                      )}

                      <p>
                        <span className={styles.badge}>Productos</span>
                        {venta.productos
                          ?.map(
                            (p) =>
                              `${p.nombre} (x${p.cantidad}, $${parsearMontoSeguro(
                                p.precio
                              ).toLocaleString("es-AR")})`
                          )
                          .join(", ")}
                      </p>

                      {parsearMontoSeguro(venta.descuento) > 0 && (
                        <div
                          style={{
                            background: "#dcfce7",
                            color: "#166534",
                            padding: "6px 12px",
                            borderRadius: "4px",
                            fontSize: "14px",
                            fontWeight: "600",
                            marginTop: "8px",
                            marginBottom: "8px",
                            display: "inline-block",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          🎉 Descuento aplicado: $
                          {parsearMontoSeguro(venta.descuento).toLocaleString(
                            "es-AR"
                          )}
                        </div>
                      )}

                      <p>
                        <span className={styles.badge}>Fecha</span>
                        {formatearFecha(venta.fecha)}
                      </p>
                      <p>
                        <span className={styles.badge}>Total Crédito $</span>
                        {totalCredito?.toLocaleString("es-AR")}
                      </p>
                      <p>
                        <span className={styles.badge}>Valor por cuota</span>
                        {parsearMontoSeguro(
                          venta.valorCuota
                        )?.toLocaleString("es-AR")}
                      </p>
                      <p>
                        <span className={styles.badge}>Cantidad de cuotas</span>
                        {venta.cuotas}
                      </p>

                      {diasAtraso >= 30 && (
                        <div
                          style={{
                            background: "#fef2f2",
                            color: "#991b1b",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            fontWeight: "600",
                            marginTop: "8px",
                            marginBottom: "8px",
                            border: "1px solid #fecaca",
                          }}
                        >
                          ⚠️ Atraso de {diasAtraso} días: recargo sobre la
                          cuota (+${montoRecargo.toLocaleString("es-AR")})
                        </div>
                      )}

                      <div className={styles.saleDebtPending}>
                        <span>
                          Deuda de esta compra{" "}
                          {diasAtraso >= 30
                            ? "(con recargo):"
                            : "(sin recargo):"}
                        </span>
                        <strong>
                          ${saldoConRecargo.toLocaleString("es-AR")}
                        </strong>
                      </div>

                      <div
                        style={{
                          background:
                            diasAtraso >= 30
                              ? "linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)"
                              : "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                          color: "#ffffff",
                          padding: "20px",
                          borderRadius: "12px",
                          marginTop: "16px",
                          marginBottom: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "14px",
                            textTransform: "uppercase",
                            letterSpacing: "1.5px",
                            color: diasAtraso >= 30 ? "#fca5a5" : "#38bdf8",
                            fontWeight: "800",
                            marginBottom: "8px",
                          }}
                        >
                          🚨 CONTROL DE CAJA / VENDEDOR — ESTADO DE CUENTA
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: "12px",
                            marginTop: "12px",
                          }}
                        >
                          <div
                            style={{
                              background: "rgba(0, 0, 0, 0.25)",
                              padding: "10px 14px",
                              borderRadius: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#cbd5e1",
                                display: "block",
                              }}
                            >
                              Días de Atraso
                            </span>
                            <strong
                              style={{
                                fontSize: "20px",
                                color: diasAtraso >= 30 ? "#f87171" : "#f8fafc",
                              }}
                            >
                              {diasAtraso} {diasAtraso === 1 ? "día" : "días"}
                            </strong>
                          </div>

                          <div
                            style={{
                              background: "rgba(0, 0, 0, 0.25)",
                              padding: "10px 14px",
                              borderRadius: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#cbd5e1",
                                display: "block",
                              }}
                            >
                              A Pagar (Efectivo / Contado)
                            </span>
                            <strong
                              style={{ fontSize: "22px", color: "#ffffff" }}
                            >
                              ${saldoConRecargo.toLocaleString("es-AR")}
                            </strong>
                          </div>

                          <div
                            style={{
                              background: "rgba(0, 0, 0, 0.25)",
                              padding: "10px 14px",
                              borderRadius: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#cbd5e1",
                                display: "block",
                              }}
                            >
                              Transferencia / Tarjeta (+5%)
                            </span>
                            <strong
                              style={{ fontSize: "22px", color: "#4ade80" }}
                            >
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
                            type="button"
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

                    <div
                      style={{
                        marginTop: "10px",
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
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
                        📩 Reenviar comprobante al cliente
                      </button>

                      <button
                        type="button"
                        onClick={() => enviarComprobanteAlJefe(venta)}
                        style={{
                          background: "#25D366",
                          color: "white",
                          border: "none",
                          padding: "8px 14px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontWeight: "bold",
                        }}
                      >
                        📲 Enviar comprobante al Grupo Ventas
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
                    type="button"
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
                      const totalCredito = obtenerTotalVenta(venta);
                      const saldoReal = obtenerSaldoPendienteBase(venta);

                      return (
                        <div key={venta.id}>
                          <section
                            className={styles.saleWrapper}
                            style={{ margin: 0, boxShadow: "none" }}
                          >
                            <section
                              className={styles.saleInfoCard}
                              style={{ border: "none", padding: 0 }}
                            >
                              <div className={styles.saleSection}>
                                <h4>
                                  Datos de la venta (
                                  {saldoReal <= 0 ? "Completada" : "Pendiente"})
                                </h4>
                                <p>
                                  <span className={styles.badge}>
                                    ID de Venta
                                  </span>
                                  <span className={styles.idDestacado}>
                                    {venta.id}
                                  </span>
                                </p>
                                <p>
                                  <span className={styles.badge}>Cliente</span>
                                  {cliente.nombre}
                                </p>
                                <p>
                                  <span className={styles.badge}>DNI</span>
                                  {cliente.dni}
                                </p>
                                <p>
                                  <span className={styles.badge}>
                                    Dirección
                                  </span>
                                  {cliente.direccion} · {cliente.entreCalles}
                                </p>
                                <p>
                                  <span className={styles.badge}>Vendedor</span>
                                  {getFirmaTexto(venta.vendedor, usuariosMap)}
                                </p>
                                <p>
                                  <span className={styles.badge}>Sucursal</span>
                                  {venta.sucursal || "—"}
                                </p>
                                <p>
                                  <span className={styles.badge}>Entrega</span>
                                  {venta.entrega || "—"}
                                </p>
                                <p>
                                  <span className={styles.badge}>Productos</span>
                                  {venta.productos
                                    ?.map(
                                      (p) =>
                                        `${p.nombre} (x${p.cantidad}, $${parsearMontoSeguro(
                                          p.precio
                                        ).toLocaleString("es-AR")})`
                                    )
                                    .join(", ")}
                                </p>
                                <p>
                                  <span className={styles.badge}>Fecha</span>
                                  {formatearFecha(venta.fecha)}
                                </p>
                                <p>
                                  <span className={styles.badge}>
                                    Total Crédito $
                                  </span>
                                  {totalCredito?.toLocaleString("es-AR")}
                                </p>
                                <p>
                                  <span className={styles.badge}>
                                    Valor por cuota
                                  </span>
                                  {parsearMontoSeguro(
                                    venta.valorCuota
                                  )?.toLocaleString("es-AR")}
                                </p>
                                <p>
                                  <span className={styles.badge}>
                                    Cantidad de cuotas
                                  </span>
                                  {venta.cuotas}
                                </p>

                                <div
                                  className={
                                    saldoReal <= 0
                                      ? styles.saleDebtPaid
                                      : styles.saleDebtPending
                                  }
                                >
                                  <span>Deuda de esta compra:</span>
                                  <strong>
                                    {saldoReal <= 0
                                      ? "$0 (Pagada)"
                                      : `$${saldoReal.toLocaleString("es-AR")}`}
                                  </strong>
                                </div>
                              </div>
                            </section>

                            {renderTablePagos(venta, saldoReal > 0)}
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
            {ventasPendientes
              .reduce((total, venta) => {
                const saldoPendiente = obtenerSaldoPendienteBase(venta);
                const { montoRecargo } = calcularRecargoAtraso(venta);
                const saldoConRecargo =
                  saldoPendiente > 0 ? saldoPendiente + montoRecargo : 0;
                return total + saldoConRecargo;
              }, 0)
              .toLocaleString("es-AR")}
          </h3>
        </div>
      </article>
    </div>
  );
}