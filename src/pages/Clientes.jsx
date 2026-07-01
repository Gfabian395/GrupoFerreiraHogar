import { useEffect, useRef, useState, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";
import AddClient from "../components/AddClient";
import CardClient from "../components/CardClient";
import styles from "../styles/Clientes.module.css";

// ===============================
// CALCULAR SCORE DEL CLIENTE (0 a 100)
// ===============================
const calcularScoreCliente = (ventasDelCliente, hoy) => {
  if (!ventasDelCliente.length) {
    return {
      puntos: 50,
      leyenda: "Sin historial",
      detalle: "Cliente nuevo sin compras registradas."
    };
  }

  // 1. Contamos cuántas compras ya pagó por completo
  const terminadas = ventasDelCliente.filter((v) => {
    const pagoInicial = Number(v.pago?.montoPagado || 0);
    const pagosPosteriores = (v.pagos || []).reduce((sum, p) => {
      const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
      return sum + Number(montoLimpio || 0);
    }, 0);
    const totalPagado = pagoInicial + pagosPosteriores;
    const totalCredito = v.totalCredito || (v.valorCuota || 0) * (v.cuotas || 0);
    return Math.round(totalPagado) >= Math.round(totalCredito);
  }).length;

  // 2. 🌟 NUEVOS TECHOS ESTRICTOS DE CONFIANZA POR VOLUMEN COMERCIAL
  let techoPuntaje = 55; // 0 compras terminadas (está pagando sus primeras cosas) -> Techo Máx: 5.5 (Regular)

  if (terminadas >= 10) techoPuntaje = 100;    // Cliente VIP -> Techo Máx: 10.0 (Excelente)
  else if (terminadas >= 5) techoPuntaje = 88;   // Cliente Premium -> Techo Máx: 8.8 (Bueno)
  else if (terminadas >= 3) techoPuntaje = 78;   // Buen cliente recurrente -> Techo Máx: 7.8 (Bueno)
  else if (terminadas >= 2) techoPuntaje = 68;   // Cumplió más de una vez -> Techo Máx: 6.8 (Bueno raspando)
  else if (terminadas === 1) techoPuntaje = 62;  // 🌟 CORREGIDO: 1 sola compra terminada -> Techo Máx: 6.2 (Regular). No puede ser "Bueno" todavía.

  let totalCuotasEvaluadas = 0;
  let diasAtrasoAcumulados = 0;
  let penalizacionActivaGrave = 0;
  let maximoAtrasoActual = 0;

  const mesesEs = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
  };

  const parsearFechaSegura = (fechaObj) => {
    if (!fechaObj) return null;
    if (fechaObj.toDate) return fechaObj.toDate();
    if (fechaObj instanceof Date) return fechaObj;

    if (typeof fechaObj === "string") {
      const limpio = fechaObj.toLowerCase().replace(/de\s/g, "").trim();
      const partes = limpio.split(/\s+/);
      if (partes.length === 3 && mesesEs[partes[1]] !== undefined) {
        return new Date(Number(partes[2]), mesesEs[partes[1]], Number(partes[0]));
      }
      const d = new Date(fechaObj);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  ventasDelCliente.forEach((venta) => {
    // 🌟 CONTROL DE VENTA TOTALMENTE PAGADA
    const pagoInicial = Number(venta.pago?.montoPagado || 0);
    const pagosPosteriores = (venta.pagos || []).reduce((sum, p) => {
      const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
      return sum + Number(montoLimpio || 0);
    }, 0);
    const totalPagado = pagoInicial + pagosPosteriores;
    const totalCredito = venta.totalCredito || (venta.valorCuota || 0) * (venta.cuotas || 0);

    // 🌟 SI YA LA PAGÓ COMPLETA, SE IGNORA PARA EL SCORE (NO RESTA PUNTOS)
    if (Math.round(totalPagado) >= Math.round(totalCredito)) {
      return; // Saltamos la venta completamente. No evalúa atrasos viejos de acá.
    }

    const fechaVentaReal = parsearFechaSegura(venta.fecha);
    if (!fechaVentaReal) return;

    const pagos = venta.pagos || [];
    let cuotasPagadasEnVenta = 0;

    // Evaluar pagos históricos (Solo se ejecuta si la venta sigue abierta/activa)
    pagos.forEach((pago, indice) => {
      totalCuotasEvaluadas++;
      cuotasPagadasEnVenta++;
      const fechaVencimientoCuota = new Date(fechaVentaReal);
      fechaVencimientoCuota.setMonth(fechaVencimientoCuota.getMonth() + indice);

      const fechaPagoReal = parsearFechaSegura(pago.fecha);
      if (fechaPagoReal) {
        const diasDiferencia = Math.floor((fechaPagoReal - fechaVencimientoCuota) / (1000 * 60 * 60 * 24));
        if (diasDiferencia > 7) {
          diasAtrasoAcumulados += (diasDiferencia - 7);
        }
      }
    });

    // Evaluar cuotas colgadas activas
    if (cuotasPagadasEnVenta < (venta.cuotas || 0)) {
      const proxVenc = new Date(fechaVentaReal);
      proxVenc.setMonth(proxVenc.getMonth() + cuotasPagadasEnVenta);

      const diasAtrasoActual = Math.floor((hoy - proxVenc) / (1000 * 60 * 60 * 24));

      if (diasAtrasoActual > 7) {
        const diasExcedidos = diasAtrasoActual - 7;
        if (diasExcedidos > maximoAtrasoActual) {
          maximoAtrasoActual = diasExcedidos;
        }

        if (diasExcedidos > 60) {
          penalizacionActivaGrave += 15;
        } else if (diasExcedidos > 30) {
          penalizacionActivaGrave += 10;
        } else {
          penalizacionActivaGrave += diasExcedidos * 0.2;
        }
      }
    }
  });

  let promedioAtraso = totalCuotasEvaluadas > 0 ? diasAtrasoAcumulados / totalCuotasEvaluadas : 0;
  let restaPorHistorial = promedioAtraso * 0.8;

  let scoreFinal = techoPuntaje - restaPorHistorial - penalizacionActivaGrave;
  scoreFinal = Math.max(0, Math.min(100, scoreFinal));

  // Clasificación por puntaje
  let leyenda = "Excelente";
  if (scoreFinal >= 85) leyenda = "Excelente";
  else if (scoreFinal >= 65) leyenda = "Bueno";
  else if (scoreFinal >= 45) leyenda = "Regular";
  else leyenda = "Mal pagador";

  // 🌟 SALVAVIDAS POR FIDELIDAD (Mínimo 3 compras completas para perdonar)
  if (terminadas >= 3 && leyenda === "Mal pagador" && maximoAtrasoActual < 90) {
    leyenda = "Regular";
    scoreFinal = Math.max(50, scoreFinal);
  }

  // Detalles inteligentes según su volumen de compras
  let detalle = "Paga dentro de los términos pactados.";

  if (leyenda === "Excelente") {
    detalle = "Historial impecable. Muy buen comportamiento de pago.";
  } else if (leyenda === "Bueno") {
    detalle = `Buen cliente (${terminadas} compras pagadas). Registra atrasos mínimos.`;
  } else if (leyenda === "Regular") {
    if (terminadas === 1) {
      detalle = "Cliente nuevo con una sola compra terminada a término. En proceso de evaluación.";
    } else if (terminadas === 0) {
      detalle = "Cliente nuevo pagando sus primeras cuotas activas.";
    } else if (terminadas >= 3 && maximoAtrasoActual > 0) {
      detalle = `Cliente fiel (${terminadas} pagadas), revisando atraso activo de ${maximoAtrasoActual} días.`;
    } else {
      detalle = "Registra demoras frecuentes en los vencimientos de sus cuotas.";
    }
  } else {
    if (maximoAtrasoActual > 0) {
      detalle = `Atraso activo crítico de ${maximoAtrasoActual} días con pocas compras completadas.`;
    } else {
      detalle = "Historial de pagos muy irregular fuera de término.";
    }
  }

  return { puntos: Math.round(scoreFinal), leyenda, detalle };
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState(null);
  const [ventas, setVentas] = useState([]);
  const navigate = useNavigate();
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [clientesReclamadosHoy, setClientesReclamadosHoy] = useState(() => {
    const stored = localStorage.getItem("clientesReclamadosHoy");
    return stored ? JSON.parse(stored) : [];
  });

  // ===============================
  // LIMPIAR VISITA SI EXPIRÓ
  // ===============================
  useEffect(() => {
    const expira = localStorage.getItem("expiraVisita");

    if (expira && Date.now() > Number(expira)) {
      localStorage.removeItem("clientesReclamadosHoy");
      localStorage.removeItem("expiraVisita");
      setClientesReclamadosHoy([]);
    }

    // Timer automático hasta medianoche
    const ahora = new Date();
    const proximoReinicio = new Date();
    proximoReinicio.setHours(24, 0, 0, 0);
    const timeout = proximoReinicio - ahora;

    const timer = setTimeout(() => {
      localStorage.removeItem("clientesReclamadosHoy");
      localStorage.removeItem("expiraVisita");
      setClientesReclamadosHoy([]);
    }, timeout);

    return () => clearTimeout(timer);
  }, []);

  // ===============================
  // ORDENAR A–Z
  // ===============================
  const ordenarClientesAZ = (lista) =>
    [...lista].sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || "", "es", {
        sensitivity: "base",
      })
    );

  // ===============================
  // OBTENER CLIENTES Y VENTAS
  // ===============================
  const fetchClientes = async () => {
    try {
      const snap = await getDocs(collection(db, "clientes"));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setClientes(ordenarClientesAZ(data));
    } catch (error) {
      console.error("Error al obtener clientes:", error);
    }
  };

  const fetchVentas = async () => {
    try {
      const snap = await getDocs(collection(db, "ventas"));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setVentas(data);
    } catch (error) {
      console.error("Error al obtener ventas:", error);
    }
  };

  useEffect(() => {
    fetchClientes();
    fetchVentas();
  }, []);

  // ===============================
  // CALCULAR SI ESTÁ PAGADO (CORREGIDA CON REDONDEO)
  // ===============================
  const estaPagado = (venta) => {
    const pagoInicial = Number(
      venta.pago?.montoPagado || 0
    );

    const pagosPosteriores = (venta.pagos || []).reduce(
      (sum, p) => {
        const montoLimpio =
          typeof p.monto === "string"
            ? p.monto.replace(",", ".")
            : p.monto;

        return sum + Number(montoLimpio || 0);
      },
      0
    );

    const totalPagado =
      pagoInicial + pagosPosteriores;

    const totalCredito =
      venta.totalCredito ||
      (venta.valorCuota || 0) * (venta.cuotas || 0);

    return Math.round(totalPagado) >= Math.round(totalCredito);
  };

  // ===============================
  // CLIENTES VENCIDOS CON DETALLE
  // ===============================
  const clientesVencidos = useMemo(() => {
    if (!ventas.length) return [];

    const hoy = new Date();

    const resultado = clientes.map((cliente) => {
      if (cliente.estado === "Bloqueado") return null;

      const ventasCliente = ventas.filter(
        (v) => v.clienteId === cliente.id && !estaPagado(v)
      );

      if (!ventasCliente.length) return null;

      let mayorAtraso = 0;
      let ventaMasAtrasada = null;
      let cuotasPagadasVenta = 0;
      let proximoVencimientoCalculado = null;

      ventasCliente.forEach((venta) => {
        let fechaBase;

        if (venta.fecha?.toDate) {
          fechaBase = venta.fecha.toDate();
        } else if (venta.fecha) {
          fechaBase = new Date(venta.fecha);
        } else {
          return;
        }

        const cuotasPagadas = venta.pagos?.length || 0;

        // 1. Calculamos la fecha teórica de vencimiento de la cuota que DEBE actualmente
        const proximoVenc = new Date(fechaBase);
        proximoVenc.setMonth(proximoVenc.getMonth() + cuotasPagadas);

        // 2. CORRECCIÓN LÓGICA: Si el cliente ya pagó recientemente (ej. en junio pagó lo de mayo),
        // evaluamos los días reales de atraso frente a la fecha límite real de la nueva cuota.
        const diferenciaDias = Math.floor(
          (hoy - proximoVenc) / (1000 * 60 * 60 * 24)
        );

        // Solo cuenta como atraso real si la fecha del próximo vencimiento ya pasó (diferencia > 0)
        const atrasoReal = diferenciaDias > 0 ? diferenciaDias : 0;

        if (atrasoReal > mayorAtraso) {
          mayorAtraso = atrasoReal;
          ventaMasAtrasada = venta;
          cuotasPagadasVenta = cuotasPagadas;
          proximoVencimientoCalculado = proximoVenc;
        }
      });

      // Cambiamos a > 0 o al umbral de días mínimos que consideres para clasificar como "Moroso"
      // Si el atraso volvió a 0 (porque el próximo vencimiento es a futuro o fin de mes), no entrará aquí
      if (mayorAtraso > 0 && ventaMasAtrasada) {
        const nombresProductos =
          ventaMasAtrasada.productos?.map((p) => p.nombre).join(", ") || "—";

        return {
          ...cliente,
          diasAtraso: mayorAtraso,
          producto: nombresProductos,
          cuotaDebe: cuotasPagadasVenta + 1,
          valorCuota: ventaMasAtrasada.valorCuota || 0,
          proximoVencimiento: proximoVencimientoCalculado,
          vendedor: ventaMasAtrasada.vendedor || "—",
        };
      }

      return null;
    });

    return resultado
      .filter(Boolean)
      .sort((a, b) => b.diasAtraso - a.diasAtraso); // Ordenados de mayor a menor atraso
  }, [clientes, ventas]);

  // ===============================
  // BUSCADOR + CÁLCULO DE METRICAS DE COMPRA (INCLUYE PUNTUACIÓN)
  // ===============================
  const clientesFiltrados = useMemo(() => {
    const hoy = new Date();

    const clientesConTotales = clientes.map((c) => {
      const ventasDelCliente = ventas.filter((v) => v.clienteId === c.id);

      const total = ventasDelCliente.length;

      ventasDelCliente.forEach(v => {
      });
      const terminadas = ventasDelCliente.filter((v) => estaPagado(v)).length;
      const activas = total - terminadas;

      // 🔍 Buscamos la venta activa (la que NO está totalmente pagada)
      const ventaActiva = ventasDelCliente.find((v) => !estaPagado(v));

      // 🌟 CALCULAMOS EL SCORE AQUÍ PARA PASARLO A LA CARD
      const scorePagos = calcularScoreCliente(ventasDelCliente, hoy);

      return {
        ...c,
        comprasPagadas: terminadas,
        comprasTotales: total,
        comprasActivas: activas,
        comprasTerminadas: terminadas,
        idVenta: ventaActiva ? ventaActiva.id : null,
        score: scorePagos, // 👈 Inyectamos la puntuación
      };
    });

    const q = search.trim().toLowerCase();
    if (!q) return clientesConTotales;

    return clientesConTotales.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const dni = String(c.dni || "").toLowerCase();
      return nombre.includes(q) || dni.includes(q);
    });
  }, [clientes, ventas, search]);

  // ===============================
  // DOBLE CLICK → MARCAR + NAVEGAR
  // ===============================
  const handleDoubleClickCliente = (clienteId) => {
    const finDelDia = new Date();
    finDelDia.setHours(23, 59, 59, 999);

    const current = [...clientesReclamadosHoy];

    if (!current.includes(clienteId)) {
      current.push(clienteId);
      localStorage.setItem("clientesReclamadosHoy", JSON.stringify(current));
      setClientesReclamadosHoy(current);
    }

    localStorage.setItem("expiraVisita", finDelDia.getTime());
    window.open(`/clientes/${clienteId}`, "_blank");
  };

  // ===============================
  // GUARDAR CLIENTE
  // ===============================
  const handleSaveClient = async (data) => {
    try {
      if (data.id) {
        await updateDoc(doc(db, "clientes", data.id), data);
      } else {
        await addDoc(collection(db, "clientes"), data);
      }

      setIsModalOpen(false);
      setClientToEdit(null);
      fetchClientes();
    } catch (error) {
      console.error("Error al guardar cliente:", error);
    }
  };

  return (
    <>
      {/* HEADER */}
      <div className={styles.header}>
        <input
          type="text"
          placeholder="Buscar por nombre o DNI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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

      <div className={styles.filterContainer}>
        <label>Filtrar por vendedor: </label>
        <select
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
        >
          <option value="">Todos</option>

          {Array.from(new Set(clientesVencidos.map(c => c.vendedor))).map((v, i) => (
            <option key={i} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* CLIENTES VENCIDOS */}
      {clientesVencidos.length > 0 && (
        <div className={styles.vencidosContainer}>
          <h3 className={styles.vencidosTitle}>
            Clientes con atraso
          </h3>

          <table className={styles.vencidosTable}>
            <thead>
              <tr>
                <th className={styles.checkColumn}>✅</th>
                <th>Nombre</th>
                <th>DNI</th>
                <th className={styles.productColumn}>Producto</th>
                <th>Vendedor</th>
                <th>Próx. Venc.</th>
                <th>Cuota</th>
                <th>Valor</th>
                <th>Días</th>
              </tr>
            </thead>

            <tbody>
              {clientesVencidos
                .filter(c => !filtroVendedor || c.vendedor === filtroVendedor)
                .map((c) => (
                  <tr key={c.id} className={styles.vencidosRow}>
                    <td>
                      {clientesReclamadosHoy.includes(c.id) ? (
                        <span className={styles.checked}>✅</span>
                      ) : null}
                    </td>
                    <td className={styles.clickableCell} onDoubleClick={() => handleDoubleClickCliente(c.id)}>{c.nombre}</td>
                    <td className={styles.clickableCell} onDoubleClick={() => handleDoubleClickCliente(c.id)}>{c.dni}</td>
                    <td className={styles.productColumn}>{c.producto}</td>
                    <td>{c.vendedor}</td>
                    <td>{c.proximoVencimiento && new Date(c.proximoVencimiento).toLocaleDateString("es-AR")}</td>
                    <td>#{c.cuotaDebe}</td>
                    <td>${Number(c.valorCuota || 0).toLocaleString("es-AR")}</td>
                    <td className={`${styles.diasCell} ${c.diasAtraso > 60 ? styles.red : c.diasAtraso > 45 ? styles.orange : styles.yellow}`}>{c.diasAtraso}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* GRID DE CLIENTES */}
      <div className={styles.grid}>
        {clientesFiltrados.length > 0 ? (
          clientesFiltrados.map((cli) => (
            <CardClient
              key={cli.id}
              cliente={cli}
              resaltado={clientesReclamadosHoy.includes(cli.id)}
              onEdit={(c) => {
                setClientToEdit(c);
                setIsModalOpen(true);
              }}
              onDelete={fetchClientes}
            />
          ))
        ) : (
          <p className={styles.empty}>
            No se encontraron clientes
          </p>
        )}
      </div>

      {/* MODAL */}
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