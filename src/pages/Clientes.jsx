import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import AddClient from "../components/AddClient";
import CardClient from "../components/CardClient";
import styles from "../styles/Clientes.module.css";

// ==========================================
// CONSTANTES DE CLASIFICACIÓN MANUAL + BLOQUEADOS
// ==========================================
export const CLASIFICACIONES = [
  { id: "todos", label: "TODOS" },
  { id: "sin clasificar", label: "SIN CLASIFICAR" },
  { id: "excelente", label: "EXCELENTE" },
  { id: "pagador", label: "PAGADOR" },
  { id: "nuevo", label: "NUEVO" },
  { id: "duro", label: "DURO" },
  { id: "bloqueado", label: "BLOQUEADOS" },
];

export const FILTROS_TABLA_PAGO_MES = [
  { id: "todos", label: "TODOS" },
  { id: "pagados_mes", label: "PAGADOS ESTE MES" },
  { id: "no_pagados_mes", label: "NO PAGADOS ESTE MES" },
];

export const CLASES_MANUALES = [
  "sin clasificar",
  "excelente",
  "pagador",
  "nuevo",
  "duro",
];

export const normalizarClasificacion = (valor) => {
  if (!valor) return "sin clasificar";
  const limpia = String(valor).toLowerCase().trim();
  return CLASES_MANUALES.includes(limpia) ? limpia : "sin clasificar";
};

const esClienteBloqueado = (cliente) =>
  String(cliente?.estado || "").toLowerCase().trim() === "bloqueado";

// ==========================================
// HELPERS DE FECHAS Y VENTAS
// ==========================================
const MESES_ES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

const parsearFechaCruda = (fechaObj) => {
  if (!fechaObj) return null;
  if (typeof fechaObj === "object" && typeof fechaObj.toDate === "function") {
    const d = fechaObj.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (fechaObj instanceof Date) {
    return isNaN(fechaObj.getTime()) ? null : fechaObj;
  }
  if (typeof fechaObj === "number") {
    const d = new Date(fechaObj);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof fechaObj === "string") {
    const str = fechaObj.trim();
    if (!str) return null;

    const matchIso = str.match(/^(\d{1,4})-(\d{2})-(\d{2})/);
    if (matchIso) {
      const anio = Number(matchIso[1]);
      const mes = Number(matchIso[2]) - 1;
      const dia = Number(matchIso[3]);
      return new Date(anio, mes, dia);
    }

    const limpio = str.toLowerCase().replace(/de\s/g, "").trim();
    const partes = limpio.split(/\s+/);
    if (partes.length === 3 && MESES_ES[partes[1]] !== undefined) {
      return new Date(Number(partes[2]), MESES_ES[partes[1]], Number(partes[0]));
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

const parsearFechaVentaSegura = (venta) => {
  const fechaPrincipal = parsearFechaCruda(venta?.fecha);
  const fechaCreacion = parsearFechaCruda(venta?.createdAt);

  if (fechaPrincipal && fechaPrincipal.getFullYear() >= 1950) {
    return fechaPrincipal;
  }
  if (fechaCreacion && fechaCreacion.getFullYear() >= 1950) {
    return fechaCreacion;
  }
  return fechaPrincipal;
};

const parsearMontoSeguro = (val) => {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const limpio = val.replace(/\s+/g, "").replace(",", ".");
    const num = Number(limpio);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
};

const obtenerTotalVenta = (venta) => {
  const descuento = parsearMontoSeguro(venta.descuento);
  const cuotas = Number(venta.cuotas || 0);
  const valorCuota = parsearMontoSeguro(venta.valorCuota);
  const totalDirecto = parsearMontoSeguro(venta.total || venta.totalCredito);

  if (totalDirecto > 0) {
    return Math.max(totalDirecto - descuento, 0);
  }
  if (cuotas > 0 && valorCuota > 0) {
    return Math.max(valorCuota * cuotas - descuento, 0);
  }
  return 0;
};

const calcularTotalPagadoVenta = (venta) => {
  const pagosLista = Array.isArray(venta.pagos) ? venta.pagos : [];

  const sumaPagosArray = pagosLista.reduce((sum, p) => {
    const rawMonto = p.montoBase ?? p.monto ?? 0;
    return sum + parsearMontoSeguro(rawMonto);
  }, 0);

  if (sumaPagosArray > 0) {
    return sumaPagosArray;
  }

  return parsearMontoSeguro(venta.pago?.montoPagado);
};

const obtenerCuotasPagadas = (venta) => {
  const totalCuotas = Number(venta.cuotas || 0);
  const valorCuota = parsearMontoSeguro(venta.valorCuota);
  const totalPagado = calcularTotalPagadoVenta(venta);
  const totalVenta = obtenerTotalVenta(venta);

  if (totalVenta > 0 && Math.round(totalPagado) >= Math.round(totalVenta)) {
    return totalCuotas > 0 ? totalCuotas : 1;
  }

  if (totalCuotas <= 0 || valorCuota <= 0) return 0;
  return Math.min(Math.floor(totalPagado / valorCuota), totalCuotas);
};

const estaPagado = (venta) => {
  const totalVenta = obtenerTotalVenta(venta);
  const totalPagado = calcularTotalPagadoVenta(venta);
  const totalCuotas = Number(venta.cuotas || 0);
  const cuotasPagadas = obtenerCuotasPagadas(venta);

  const pagosArray = Array.isArray(venta.pagos) ? venta.pagos : [];
  const tienePagosRegistrados =
    pagosArray.length > 0 || parsearMontoSeguro(venta.pago?.montoPagado) > 0;

  if (
    totalVenta > 0 &&
    tienePagosRegistrados &&
    Math.round(totalPagado) >= Math.round(totalVenta)
  ) {
    return true;
  }

  if (totalCuotas > 0 && cuotasPagadas >= totalCuotas && totalPagado > 0) {
    return true;
  }

  return false;
};

const calcularSaldoVenta = (venta) => {
  if (estaPagado(venta)) return 0;
  const totalVenta = obtenerTotalVenta(venta);
  const totalPagado = calcularTotalPagadoVenta(venta);
  return Math.max(totalVenta - totalPagado, 0);
};

const pagoEnMesActual = (venta, hoy) => {
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();

  if (
    venta.pago?.primerCuotaPaga ||
    parsearMontoSeguro(venta.pago?.montoPagado) > 0
  ) {
    const fechaInicial = parsearFechaVentaSegura(venta);
    if (
      fechaInicial &&
      fechaInicial.getMonth() === mesActual &&
      fechaInicial.getFullYear() === anioActual
    ) {
      return true;
    }
  }

  return (venta.pagos || []).some((p) => {
    const fechaPago = parsearFechaCruda(p.fecha);
    return (
      fechaPago &&
      fechaPago.getMonth() === mesActual &&
      fechaPago.getFullYear() === anioActual
    );
  });
};

const resolverQuincena = (cliente, venta, fechaVencimiento) => {
  const preferencia = (
    cliente.quincenaPago ||
    venta.quincenaPago ||
    ""
  )
    .toString()
    .toLowerCase();

  if (preferencia === "primera" || preferencia === "1" || preferencia === "1ra") {
    return "primera";
  }
  if (preferencia === "segunda" || preferencia === "2" || preferencia === "2da") {
    return "segunda";
  }

  const dia = fechaVencimiento ? fechaVencimiento.getDate() : 1;
  return dia <= 15 ? "primera" : "segunda";
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [usuarios, setUsuarios] = useState({});

  const [search, setSearch] = useState("");
  const [chipActivo, setChipActivo] = useState("todos");
  const [filtroTablaPagoMes, setFiltroTablaPagoMes] = useState("todos"); // 👈 SOLO PARA LA TABLA
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroQuincena, setFiltroQuincena] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState(null);

  const [limiteVisibles, setLimiteVisibles] = useState(12);
  const loaderRef = useRef(null);

  const [clientesReclamadosHoy, setClientesReclamadosHoy] = useState(() => {
    try {
      const stored = localStorage.getItem("clientesReclamadosHoy");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const expira = localStorage.getItem("expiraVisita");
    if (expira && Date.now() > Number(expira)) {
      localStorage.removeItem("clientesReclamadosHoy");
      localStorage.removeItem("expiraVisita");
      setClientesReclamadosHoy([]);
    }

    const ahora = new Date();
    const proximoReinicio = new Date();
    proximoReinicio.setHours(24, 0, 0, 0);
    const timeout = Math.max(proximoReinicio - ahora, 1000);

    const timer = setTimeout(() => {
      localStorage.removeItem("clientesReclamadosHoy");
      localStorage.removeItem("expiraVisita");
      setClientesReclamadosHoy([]);
    }, timeout);

    return () => clearTimeout(timer);
  }, []);

  const ordenarClientesAZ = (lista) =>
    [...lista].sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || "", "es", {
        sensitivity: "base",
      })
    );

  const fetchData = useCallback(async () => {
    try {
      const [snapClientes, snapVentas, snapUsuarios] = await Promise.all([
        getDocs(collection(db, "clientes")),
        getDocs(collection(db, "ventas")),
        getDocs(collection(db, "usuarios")),
      ]);

      const dataClientes = snapClientes.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          ...raw,
          clasificacion: normalizarClasificacion(raw.clasificacion),
        };
      });

      const dataVentas = snapVentas.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const mapUsuarios = {};
      snapUsuarios.docs.forEach((d) => {
        const data = d.data();
        const nombreReal = data.nombre || data.nombreUsuario || data.email || d.id;
        mapUsuarios[d.id] = nombreReal;
        if (data.uid) mapUsuarios[data.uid] = nombreReal;
        if (data.email) mapUsuarios[data.email.toLowerCase().trim()] = nombreReal;
      });

      setClientes(ordenarClientesAZ(dataClientes));
      setVentas(dataVentas);
      setUsuarios(mapUsuarios);
    } catch (error) {
      console.error("Error al obtener datos:", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCambiarClasificacion = useCallback(
    async (clienteId, nuevaClasificacion) => {
      const claseValida = normalizarClasificacion(nuevaClasificacion);
      try {
        await updateDoc(doc(db, "clientes", clienteId), {
          clasificacion: claseValida,
        });

        setClientes((prev) =>
          prev.map((c) =>
            c.id === clienteId ? { ...c, clasificacion: claseValida } : c
          )
        );
      } catch (error) {
        console.error("Error al actualizar clasificación:", error);
        alert("No se pudo actualizar la clasificación del cliente.");
      }
    },
    []
  );

  const ventasPorClienteMap = useMemo(() => {
    const mapa = {};
    ventas.forEach((v) => {
      const claveCliente = v.clienteId || v.idCliente;
      if (!claveCliente) return;
      if (!mapa[claveCliente]) mapa[claveCliente] = [];
      mapa[claveCliente].push(v);
    });
    return mapa;
  }, [ventas]);

  const clientesConCalculos = useMemo(() => {
    return clientes.map((c) => {
      const ventasDelCliente = ventasPorClienteMap[c.id] || [];
      const total = ventasDelCliente.length;
      const terminadas = ventasDelCliente.filter((v) => estaPagado(v)).length;
      const activas = total - terminadas;
      const ventaActiva = ventasDelCliente.find((v) => !estaPagado(v));
      const deudaTotal = ventasDelCliente.reduce(
        (acc, v) => acc + calcularSaldoVenta(v),
        0
      );

      return {
        ...c,
        clasificacion: normalizarClasificacion(c.clasificacion),
        ventasDelCliente,
        comprasPagadas: terminadas,
        comprasTotales: total,
        comprasActivas: activas,
        comprasTerminadas: terminadas,
        idVenta: ventaActiva ? ventaActiva.id : null,
        deudaTotal,
      };
    });
  }, [clientes, ventasPorClienteMap]);

  const contadoresClasificacion = useMemo(() => {
    const conteo = {
      todos: clientesConCalculos.length,
      "sin clasificar": 0,
      excelente: 0,
      pagador: 0,
      nuevo: 0,
      duro: 0,
      bloqueado: 0,
    };

    clientesConCalculos.forEach((c) => {
      const clase = normalizarClasificacion(c.clasificacion);
      conteo[clase] = (conteo[clase] || 0) + 1;
      if (esClienteBloqueado(c)) {
        conteo.bloqueado += 1;
      }
    });

    return conteo;
  }, [clientesConCalculos]);

  // Cobros del mes por quincena: excluye bloqueados y ventas pagadas
  const cobrosDelMes = useMemo(() => {
    if (!ventas.length) return [];
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    const itemsCobro = [];

    clientesConCalculos.forEach((cliente) => {
      if (esClienteBloqueado(cliente)) {
        return;
      }

      const claseCliente = normalizarClasificacion(cliente.clasificacion);
      const ventasPendientes = cliente.ventasDelCliente.filter((v) => !estaPagado(v));

      ventasPendientes.forEach((venta) => {
        const fechaBase = parsearFechaVentaSegura(venta);
        if (!fechaBase) return;

        const cuotasPagadas = obtenerCuotasPagadas(venta);
        const proximoVenc = new Date(fechaBase);
        proximoVenc.setMonth(proximoVenc.getMonth() + cuotasPagadas);

        const venceEsteMes =
          proximoVenc.getMonth() === mesActual &&
          proximoVenc.getFullYear() === anioActual;
        const estaAtrasado = proximoVenc < hoy;

        if (!venceEsteMes && !estaAtrasado) return;

        const diferenciaDias = Math.floor(
          (hoy - proximoVenc) / (1000 * 60 * 60 * 24)
        );
        const diasAtraso = diferenciaDias > 0 ? diferenciaDias : 0;

        const nombresProductos =
          venta.productos
            ?.map((p) => p.name || p.nombre || p.descripcion || p.titulo)
            .filter(Boolean)
            .join(", ") ||
          venta.producto ||
          "—";

        const claveVendedorRaw = (
          venta.vendedorReal ||
          venta.cargadoPor ||
          venta.vendedor ||
          ""
        )
          .toString()
          .trim();

        let nombreVendedor = "—";
        const claveLower = claveVendedorRaw.toLowerCase();

        if (claveVendedorRaw) {
          if (usuarios[claveVendedorRaw]) {
            nombreVendedor = usuarios[claveVendedorRaw];
          } else if (usuarios[claveLower]) {
            nombreVendedor = usuarios[claveLower];
          } else if (claveVendedorRaw.includes("@")) {
            const parteMail = claveVendedorRaw.split("@")[0];
            nombreVendedor =
              parteMail.charAt(0).toUpperCase() + parteMail.slice(1);
          } else {
            nombreVendedor = claveVendedorRaw;
          }
        }

        const quincena = resolverQuincena(cliente, venta, proximoVenc);
        const totalCuotasNum = Number(venta.cuotas || 0);
        const cuotaDebeNum =
          totalCuotasNum > 0
            ? Math.min(cuotasPagadas + 1, totalCuotasNum)
            : cuotasPagadas + 1;

        itemsCobro.push({
          idFila: `${cliente.id}-${venta.id}`,
          clienteId: cliente.id,
          nombre: cliente.nombre || "Sin nombre",
          dni: cliente.dni || "—",
          clasificacion: claseCliente,
          producto: nombresProductos,
          vendedor: nombreVendedor,
          proximoVencimiento: proximoVenc,
          cuotaDebe: cuotaDebeNum,
          totalCuotas: totalCuotasNum,
          valorCuota: parsearMontoSeguro(venta.valorCuota) || calcularSaldoVenta(venta),
          diasAtraso,
          pagoEsteMes: pagoEnMesActual(venta, hoy),
          quincena,
        });
      });
    });

    return itemsCobro.sort((a, b) => {
      if (a.proximoVencimiento && b.proximoVencimiento) {
        return a.proximoVencimiento - b.proximoVencimiento;
      }
      return b.diasAtraso - a.diasAtraso;
    });
  }, [clientesConCalculos, ventas, usuarios]);

  const cumpleChipClasificacion = useCallback(
    (item) => {
      if (chipActivo === "todos") return true;
      if (chipActivo === "bloqueado") return esClienteBloqueado(item);
      return normalizarClasificacion(item.clasificacion) === chipActivo;
    },
    [chipActivo]
  );

  // Base de la tabla filtrada por búsqueda, chip de clase, vendedor y quincena
  // (para calcular los contadores internos de PAGADOS ESTE MES / NO PAGADOS ESTE MES)
  const cobrosBaseTabla = useMemo(() => {
    const q = search.trim().toLowerCase();

    return cobrosDelMes.filter((item) => {
      const pasaBusqueda =
        !q ||
        (item.nombre || "").toLowerCase().includes(q) ||
        String(item.dni || "").toLowerCase().includes(q) ||
        (item.producto || "").toLowerCase().includes(q);

      const pasaChip = cumpleChipClasificacion(item);
      const pasaVendedor = !filtroVendedor || item.vendedor === filtroVendedor;
      const pasaQuincena = !filtroQuincena || item.quincena === filtroQuincena;

      return pasaBusqueda && pasaChip && pasaVendedor && pasaQuincena;
    });
  }, [cobrosDelMes, search, cumpleChipClasificacion, filtroVendedor, filtroQuincena]);

  const contadoresTablaPagoMes = useMemo(() => {
    let pagados = 0;
    let noPagados = 0;

    cobrosBaseTabla.forEach((item) => {
      if (item.pagoEsteMes) pagados += 1;
      else noPagados += 1;
    });

    return {
      todos: cobrosBaseTabla.length,
      pagados_mes: pagados,
      no_pagados_mes: noPagados,
    };
  }, [cobrosBaseTabla]);

  // Cobros finales mostrados en la tabla (aplicando filtro interno PAGADOS / NO PAGADOS ESTE MES)
  const cobrosFiltrados = useMemo(() => {
    return cobrosBaseTabla.filter((item) => {
      if (filtroTablaPagoMes === "pagados_mes") return item.pagoEsteMes;
      if (filtroTablaPagoMes === "no_pagados_mes") return !item.pagoEsteMes;
      return true;
    });
  }, [cobrosBaseTabla, filtroTablaPagoMes]);

  const cobrosPrimeraQuincena = useMemo(
    () => cobrosFiltrados.filter((c) => c.quincena === "primera"),
    [cobrosFiltrados]
  );

  const cobrosSegundaQuincena = useMemo(
    () => cobrosFiltrados.filter((c) => c.quincena === "segunda"),
    [cobrosFiltrados]
  );

  // Grilla inferior de clientes: NO depende de filtroTablaPagoMes
  const clientesFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();

    return clientesConCalculos.filter((cli) => {
      const pasaBusqueda =
        !q ||
        (cli.nombre || "").toLowerCase().includes(q) ||
        String(cli.dni || "").toLowerCase().includes(q) ||
        (cli.direccion || "").toLowerCase().includes(q);

      const pasaChip = cumpleChipClasificacion(cli);

      if (!filtroVendedor) {
        return pasaBusqueda && pasaChip;
      }

      const vendedoresDelCliente = new Set();
      (cli.ventasDelCliente || []).forEach((v) => {
        const raw = (v.vendedorReal || v.cargadoPor || v.vendedor || "")
          .toString()
          .trim();
        const resuelto = usuarios[raw] || usuarios[raw.toLowerCase()] || raw;
        if (resuelto) vendedoresDelCliente.add(resuelto);
      });

      return pasaBusqueda && pasaChip && vendedoresDelCliente.has(filtroVendedor);
    });
  }, [clientesConCalculos, search, cumpleChipClasificacion, filtroVendedor, usuarios]);

  const clientesPaginados = useMemo(
    () => clientesFiltrados.slice(0, limiteVisibles),
    [clientesFiltrados, limiteVisibles]
  );

  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLimiteVisibles((prev) => prev + 12);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(currentLoader);
    return () => observer.unobserve(currentLoader);
  }, [clientesFiltrados.length]);

  const abrirClienteEnNuevaPestana = useCallback(
    (clienteId) => {
      const finDelDia = new Date();
      finDelDia.setHours(23, 59, 59, 999);

      const current = [...clientesReclamadosHoy];
      if (!current.includes(clienteId)) {
        current.push(clienteId);
        localStorage.setItem("clientesReclamadosHoy", JSON.stringify(current));
        setClientesReclamadosHoy(current);
      }
      localStorage.setItem("expiraVisita", String(finDelDia.getTime()));

      const url = `${window.location.origin}/clientes/${clienteId}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [clientesReclamadosHoy]
  );

  const handleSaveClient = async (data) => {
    try {
      const payload = {
        ...data,
        clasificacion: normalizarClasificacion(data.clasificacion),
      };

      if (payload.id) {
        await updateDoc(doc(db, "clientes", payload.id), payload);
      } else {
        await addDoc(collection(db, "clientes"), payload);
      }

      setIsModalOpen(false);
      setClientToEdit(null);
      fetchData();
    } catch (error) {
      console.error("Error al guardar cliente:", error);
    }
  };

  const renderFilasQuincena = (lista) => {
    if (!lista.length) {
      return (
        <tr>
          <td colSpan={6} style={{ textAlign: "center", padding: "16px", color: "#64748b" }}>
            Sin cobros en esta quincena con el filtro actual.
          </td>
        </tr>
      );
    }

    return lista.map((c) => (
      <tr key={c.idFila} className={styles.vencidosRow}>
        <td>
          {clientesReclamadosHoy.includes(c.clienteId) ? (
            <span className={styles.checked}>✅</span>
          ) : null}
        </td>
        <td
          className={styles.clickableCell}
          onDoubleClick={() => abrirClienteEnNuevaPestana(c.clienteId)}
        >
          <strong>{c.nombre}</strong>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            DNI {c.dni} · {c.producto}
          </div>
          {c.pagoEsteMes && (
            <span
              style={{
                marginTop: "4px",
                backgroundColor: "#dcfce7",
                color: "#166534",
                padding: "2px 6px",
                borderRadius: "10px",
                fontSize: "10px",
                fontWeight: "600",
                display: "inline-block",
              }}
            >
              ✅ Pago en el mes
            </span>
          )}
        </td>
        <td>
          <span className={styles.chipBadge}>{c.clasificacion.toUpperCase()}</span>
        </td>
        <td>
          {c.proximoVencimiento
            ? c.proximoVencimiento.toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "2-digit",
              })
            : "—"}
        </td>
        <td>
          #{c.cuotaDebe}
          {c.totalCuotas > 0 ? `/${c.totalCuotas}` : ""} · $
          {Number(c.valorCuota || 0).toLocaleString("es-AR")}
        </td>
        <td
          className={`${styles.diasCell} ${
            c.diasAtraso > 60
              ? styles.red
              : c.diasAtraso > 30
              ? styles.orange
              : styles.yellow
          }`}
        >
          {c.diasAtraso}d
        </td>
      </tr>
    ));
  };

  return (
    <>
      <div className={styles.header}>
        <input
          type="text"
          placeholder="Buscar por nombre, DNI o dirección..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimiteVisibles(12);
          }}
          className={styles.searchInput}
        />

        <button
          className={styles.addClientBtn}
          onClick={() => {
            setClientToEdit(null);
            setIsModalOpen(true);
          }}
        >
          +
        </button>
      </div>

      {/* FILTER CHIPS GENERALES (CLASIFICACIÓN + BLOQUEADOS) */}
      <div className={styles.chipsBar} role="tablist" aria-label="Clasificación de clientes">
        {CLASIFICACIONES.map((chip) => {
          const activo = chipActivo === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setChipActivo(chip.id);
                setLimiteVisibles(12);
              }}
              className={`${styles.filterChip} ${activo ? styles.chipActive : ""}`}
            >
              <span>{chip.label}</span>
              <span className={styles.chipCount}>
                {contadoresClasificacion[chip.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.filterContainer}>
        <label>Vendedor: </label>
        <select
          value={filtroVendedor}
          onChange={(e) => {
            setFiltroVendedor(e.target.value);
            setLimiteVisibles(12);
          }}
        >
          <option value="">Todos</option>
          {Array.from(new Set(cobrosDelMes.map((c) => c.vendedor))).map(
            (v, i) => (
              <option key={i} value={v}>
                {v}
              </option>
            )
          )}
        </select>

        <label style={{ marginLeft: "16px" }}>Quincena: </label>
        <select
          value={filtroQuincena}
          onChange={(e) => setFiltroQuincena(e.target.value)}
        >
          <option value="">Ambas quincenas</option>
          <option value="primera">1ra Quincena (1 - 15)</option>
          <option value="segunda">2da Quincena (15 - 30/31)</option>
        </select>

        {(filtroVendedor || filtroQuincena || chipActivo !== "todos" || search) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setChipActivo("todos");
              setFiltroVendedor("");
              setFiltroQuincena("");
              setLimiteVisibles(12);
            }}
            className={styles.btnVerTodos}
            style={{ marginLeft: "12px" }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* TABLA DE PENDIENTES A COBRAR (CON CHIPS INTERNOS DE PAGO ESTE MES) */}
      <section className={styles.vencidosContainer}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <h3 className={styles.vencidosTitle} style={{ margin: 0 }}>
            Cobros del Mes por Quincena ({cobrosFiltrados.length})
          </h3>

          <div
            className={styles.chipsBar}
            style={{ margin: 0 }}
            role="tablist"
            aria-label="Filtrar tabla por estado de pago este mes"
          >
            {FILTROS_TABLA_PAGO_MES.map((chip) => {
              const activo = filtroTablaPagoMes === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFiltroTablaPagoMes(chip.id)}
                  className={`${styles.filterChip} ${activo ? styles.chipActive : ""}`}
                >
                  <span>{chip.label}</span>
                  <span className={styles.chipCount}>
                    {contadoresTablaPagoMes[chip.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.quincenasGrid}>
          <div className={styles.quincenaBox}>
            <h4 className={styles.quincenaHeader}>
              1ra Quincena (1 - 15) · {cobrosPrimeraQuincena.length}
            </h4>
            <div
              className={styles.tableScrollWrapper}
              style={{ maxHeight: "460px", overflowY: "auto" }}
            >
              <table className={styles.vencidosTable}>
                <thead>
                  <tr>
                    <th className={styles.checkColumn}>✅</th>
                    <th>Cliente</th>
                    <th>Clase</th>
                    <th>Venc.</th>
                    <th>Cuota / Valor</th>
                    <th>Atraso</th>
                  </tr>
                </thead>
                <tbody>{renderFilasQuincena(cobrosPrimeraQuincena)}</tbody>
              </table>
            </div>
          </div>

          <div className={styles.quincenaBox}>
            <h4 className={styles.quincenaHeader}>
              2da Quincena (15 - 30/31) · {cobrosSegundaQuincena.length}
            </h4>
            <div
              className={styles.tableScrollWrapper}
              style={{ maxHeight: "460px", overflowY: "auto" }}
            >
              <table className={styles.vencidosTable}>
                <thead>
                  <tr>
                    <th className={styles.checkColumn}>✅</th>
                    <th>Cliente</th>
                    <th>Clase</th>
                    <th>Venc.</th>
                    <th>Cuota / Valor</th>
                    <th>Atraso</th>
                  </tr>
                </thead>
                <tbody>{renderFilasQuincena(cobrosSegundaQuincena)}</tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* GRILLA INFERIOR DE TODOS LOS CLIENTES */}
      <div className={styles.grid}>
        {clientesPaginados.length > 0 ? (
          clientesPaginados.map((cli) => (
            <div
              key={cli.id}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                abrirClienteEnNuevaPestana(cli.id);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  abrirClienteEnNuevaPestana(cli.id);
                }
              }}
            >
              <CardClient
                cliente={cli}
                resaltado={clientesReclamadosHoy.includes(cli.id)}
                onCambiarClasificacion={handleCambiarClasificacion}
                onEdit={(c) => {
                  setClientToEdit(c);
                  setIsModalOpen(true);
                }}
                onDelete={fetchData}
              />
            </div>
          ))
        ) : (
          <p className={styles.empty}>No se encontraron clientes</p>
        )}
      </div>

      <div
        ref={loaderRef}
        style={{ height: "40px", margin: "20px 0", textAlign: "center" }}
      >
        {limiteVisibles < clientesFiltrados.length && (
          <span style={{ color: "#666", fontSize: "14px" }}>
            Cargando más clientes...
          </span>
        )}
      </div>

      {isModalOpen && (
        <AddClient
          onClose={() => {
            setIsModalOpen(false);
            setClientToEdit(null);
          }}
          onSave={handleSaveClient}
          clientToEdit={clientToEdit}
        />
      )}
    </>
  );
}