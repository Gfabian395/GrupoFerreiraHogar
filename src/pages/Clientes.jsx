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
const calcularScoreCliente = (cliente, ventasDelCliente, hoy) => {
  if (cliente.estado === "Bloqueado") {
    return {
      puntos: 0,
      leyenda: "Bloqueado",
      detalle: "Cliente bloqueado del sistema."
    };
  }

  if (!ventasDelCliente.length) {
    return {
      puntos: 50,
      leyenda: "Sin historial",
      detalle: "Cliente nuevo sin compras registradas."
    };
  }

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

  let techoPuntaje = 55;

  if (terminadas >= 10) techoPuntaje = 100;    
  else if (terminadas >= 5) techoPuntaje = 88;   
  else if (terminadas >= 3) techoPuntaje = 78;   
  else if (terminadas >= 2) techoPuntaje = 68;   
  else if (terminadas === 1) techoPuntaje = 62;   

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
    const pagoInicial = Number(venta.pago?.montoPagado || 0);
    const pagosPosteriores = (venta.pagos || []).reduce((sum, p) => {
      const montoLimpio = typeof p.monto === "string" ? p.monto.replace(",", ".") : p.monto;
      return sum + Number(montoLimpio || 0);
    }, 0);
    const totalPagado = pagoInicial + pagosPosteriores;
    const totalCredito = venta.totalCredito || (venta.valorCuota || 0) * (venta.cuotas || 0);

    if (Math.round(totalPagado) >= Math.round(totalCredito)) {
      return; 
    }

    const fechaVentaReal = parsearFechaSegura(venta.fecha);
    if (!fechaVentaReal) return;

    const pagos = venta.pagos || [];
    let cuotasPagadasEnVenta = 0;

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

  let leyenda = "Excelente";
  if (scoreFinal >= 85) leyenda = "Excelente";
  else if (scoreFinal >= 65) leyenda = "Bueno";
  else if (scoreFinal >= 45) leyenda = "Regular";
  else leyenda = "Mal pagador";

  if (terminadas >= 3 && leyenda === "Mal pagador" && maximoAtrasoActual < 90) {
    leyenda = "Regular";
    scoreFinal = Math.max(50, scoreFinal);
  }

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
  const [filtroColor, setFiltroColor] = useState(""); 
  
  // 📅 ESTADOS DE FECHA POR DEFECTO = HOY
  const obtenerFechaHoy = () => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  const [fechaDesde, setFechaDesde] = useState(obtenerFechaHoy);
  const [fechaHasta, setFechaHasta] = useState(obtenerFechaHoy);

  const [clientesReclamadosHoy, setClientesReclamadosHoy] = useState(() => {
    const stored = localStorage.getItem("clientesReclamadosHoy");
    return stored ? JSON.parse(stored) : [];
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
    const timeout = proximoReinicio - ahora;

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
        const proximoVenc = new Date(fechaBase);
        proximoVenc.setMonth(proximoVenc.getMonth() + cuotasPagadas + 1);

        const diferenciaDias = Math.floor(
          (hoy - proximoVenc) / (1000 * 60 * 60 * 24)
        );

        const atrasoReal = diferenciaDias > 0 ? diferenciaDias : 0;

        if (atrasoReal > mayorAtraso) {
          mayorAtraso = atrasoReal;
          ventaMasAtrasada = venta;
          cuotasPagadasVenta = cuotasPagadas;
          proximoVencimientoCalculado = proximoVenc;
        }
      });

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
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [clientes, ventas]);

  const clientesFiltrados = useMemo(() => {
    const hoy = new Date();

    const clientesConTotales = clientes.map((c) => {
      const ventasDelCliente = ventas.filter((v) => v.clienteId === c.id);

      const total = ventasDelCliente.length;
      const terminadas = ventasDelCliente.filter((v) => estaPagado(v)).length;
      const activas = total - terminadas;
      const ventaActiva = ventasDelCliente.find((v) => !estaPagado(v));
      const scorePagos = calcularScoreCliente(c, ventasDelCliente, hoy);

      return {
        ...c,
        comprasPagadas: terminadas,
        comprasTotales: total,
        comprasActivas: activas,
        comprasTerminadas: terminadas,
        idVenta: ventaActiva ? ventaActiva.id : null,
        score: scorePagos,
      };
    });

    const q = search.trim().toLowerCase();

    return clientesConTotales.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const dni = String(c.dni || "").toLowerCase();
      const cumpleBusq = !q || nombre.includes(q) || dni.includes(q);

      let cumpleColor = true;
      if (filtroColor === "bloqueado") {
        cumpleColor = c.estado === "Bloqueado";
      } else if (filtroColor === "verde") {
        cumpleColor = c.score.leyenda === "Excelente" || c.score.leyenda === "Bueno";
      } else if (filtroColor === "amarillo") {
        cumpleColor = c.score.leyenda === "Regular" || c.score.leyenda === "Sin historial";
      } else if (filtroColor === "rojo") {
        cumpleColor = c.score.leyenda === "Mal pagador" || c.estado === "Bloqueado";
      }

      return cumpleBusq && cumpleColor;
    });
  }, [clientes, ventas, search, filtroColor]);

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

        <label style={{ marginLeft: "20px" }}>Filtrar por color: </label>
        <select
          value={filtroColor}
          onChange={(e) => setFiltroColor(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="verde">Verdes (Buenos/Excelentes)</option>
          <option value="amarillo">Amarillos (Regulares)</option>
          <option value="rojo">Rojos (Bloqueados / Mal pagador)</option>
        </select>

        {/* 📅 RANGO DE FECHAS CON HOY POR DEFECTO */}
        <label style={{ marginLeft: "20px" }}>Desde: </label>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className={styles.searchInput}
        />

        <label style={{ marginLeft: "10px" }}>Hasta: </label>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className={styles.searchInput}
        />

        <button 
          onClick={() => { setFechaDesde(""); setFechaHasta(""); }} 
          className={styles.btnVerTodos}
          style={{ marginLeft: "10px" }}
        >
          Ver Todos
        </button>
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
                .filter(c => {
                  const pasaVendedor = !filtroVendedor || c.vendedor === filtroVendedor;

                  let pasaRangoFecha = true;
                  if (c.proximoVencimiento) {
                    const fechaVenc = new Date(c.proximoVencimiento);
                    fechaVenc.setHours(0, 0, 0, 0);

                    if (fechaDesde) {
                      const dDesde = new Date(fechaDesde + "T00:00:00");
                      if (fechaVenc < dDesde) pasaRangoFecha = false;
                    }
                    if (fechaHasta) {
                      const dHasta = new Date(fechaHasta + "T23:59:59");
                      if (fechaVenc > dHasta) pasaRangoFecha = false;
                    }
                  } else if (fechaDesde || fechaHasta) {
                    pasaRangoFecha = false;
                  }

                  return pasaVendedor && pasaRangoFecha;
                })
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