import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import styles from "../styles/Finanzas.module.css";
import { Loader } from "./Loader";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

const Finanzas = () => {
  const [ventas, setVentas] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [historialBalances, setHistorialBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [clientesMap, setClientesMap] = useState({});
  const [usuariosMap, setUsuariosMap] = useState({});
  const [usuariosEmailMap, setUsuariosEmailMap] = useState({});
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const listaSucursales = ["Los Andes 4320", "Los Andes 4034", "Jofre 2440"];
  const [ventasFiltradas, setVentasFiltradas] = useState([]);
  const [cobrosFiltrados, setCobrosFiltrados] = useState([]);
  const [gastosFiltrados, setGastosFiltrados] = useState([]);
  const [mostrarVentas, setMostrarVentas] = useState({});
  const [mostrarCobros, setMostrarCobros] = useState({});
  const [mostrarGastos, setMostrarGastos] = useState({});
  
  const [refreshKey, setRefreshKey] = useState(0); 
  
  // NUEVO: Estado para saber en qué sucursal se abrió el formulario
  const [sucursalFormularioAbierto, setSucursalFormularioAbierto] = useState(null);
  
  // NUEVO: Agregamos la categoría al estado inicial
  const [nuevoGasto, setNuevoGasto] = useState({
    descripcion: "",
    monto: "",
    categoria: "General", 
    fecha: new Date().toISOString().split("T")[0] 
  });

  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  const mesActual = ahora.getMonth();
  const nombreMes = ahora.toLocaleDateString("es-AR", { month: "long" });
  const nombreMesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  const formatearMonto = (monto) => Number(monto || 0).toLocaleString("es-AR");
  
  const formatearFecha = (fecha) => {
    if (!fecha) return "-";
    let date;
    if (fecha?.seconds) date = new Date(fecha.seconds * 1000);
    else if (typeof fecha === "string" && fecha.includes("-")) {
      const [year, month, day] = fecha.split("-");
      date = new Date(Number(year), Number(month) - 1, Number(day));
    } else date = new Date(fecha);
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  };
  
  const obtenerObjetoFecha = (fecha) => {
    if (!fecha) return null;
    if (fecha?.seconds) return new Date(fecha.seconds * 1000);
    if (typeof fecha === "string" && fecha.includes("-")) {
      const [year, month, day] = fecha.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(fecha);
  };
  
  const ordenarPorFechaDescendente = (a, b) => {
    const fechaA = obtenerObjetoFecha(a.fecha) || new Date(0);
    const fechaB = obtenerObjetoFecha(b.fecha) || new Date(0);
    return fechaB - fechaA;
  };
  
  const aplicarFiltro = () => {
    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;

    setVentasFiltradas(ventas.filter(v => { const f = obtenerObjetoFecha(v.fecha); return (!desde || f >= desde) && (!hasta || f <= hasta); }));
    setCobrosFiltrados(cobros.filter(c => { const f = obtenerObjetoFecha(c.fecha); return (!desde || f >= desde) && (!hasta || f <= hasta); }));
    setGastosFiltrados(gastos.filter(g => { const f = obtenerObjetoFecha(g.fecha); return (!desde || f >= desde) && (!hasta || f <= hasta); }));
  };
  
  const borrarFiltro = () => {
    setFechaDesde(""); setFechaHasta("");
    setVentasFiltradas(ventas); setCobrosFiltrados(cobros); setGastosFiltrados(gastos);
  };

  const handleCargarGasto = async (e) => {
    e.preventDefault();
    if (!nuevoGasto.descripcion || !nuevoGasto.monto) {
      alert("Por favor completa la descripción y el monto.");
      return;
    }

    try {
      await addDoc(collection(db, "gastos"), {
        descripcion: nuevoGasto.descripcion,
        monto: Number(nuevoGasto.monto),
        categoria: nuevoGasto.categoria, // Guardamos la categoría (Sueldo, Comisión, etc)
        sucursal: sucursalFormularioAbierto, // Toma la sucursal del botón que tocaste
        fecha: nuevoGasto.fecha,
        createdAt: serverTimestamp(),
        usuario: "Usuario Actual", 
      });

      alert("Gasto cargado exitosamente");
      
      setNuevoGasto({ descripcion: "", monto: "", categoria: "General", fecha: new Date().toISOString().split("T")[0] });
      setSucursalFormularioAbierto(null); // Cierra el formulario
      setRefreshKey(prev => prev + 1);
      
    } catch (error) {
      console.error("Error al guardar el gasto:", error);
      alert("Hubo un error al cargar el gasto.");
    }
  };
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const clientesSnap = await getDocs(collection(db, "clientes"));
        const clientes = {};
        clientesSnap.docs.forEach(c => (clientes[c.id] = c.data().nombre));
        setClientesMap(clientes);

        const usuariosSnap = await getDocs(collection(db, "usuarios"));
        const usuariosIdMap = {};
        const usuariosEmailMapLocal = {};
        usuariosSnap.docs.forEach(u => {
          const data = u.data();
          usuariosIdMap[u.id] = data.nombre;
          usuariosEmailMapLocal[data.email] = data.nombre;
        });
        setUsuariosMap(usuariosIdMap);
        setUsuariosEmailMap(usuariosEmailMapLocal);

        const ventasSnap = await getDocs(query(collection(db, "ventas"), orderBy("createdAt", "desc")));
        const todasLasVentas = ventasSnap.docs.map(doc => {
          const v = doc.data();
          const sellerEmail = v.vendedorReal || v.vendedor || v.cargadoPor;
          const vendedorNombre = usuariosEmailMapLocal[sellerEmail] || usuariosIdMap[sellerEmail] || sellerEmail || "Sin Nombre";
          
          let sucursalNombre = v.productos?.[0]?.branch || v.sucursal || "Jofre 2440";
          if (sucursalNombre === "Mosconi") {
            sucursalNombre = "Jofre 2440";
          }

          const esFuturaNoCobrada = v.pago && v.pago.montoPagado === 0 && v.pago.primerCuotaPaga === false;

          return { 
            id: doc.id, 
            ...v, 
            clienteNombre: clientes[v.clienteId] || "Sin Nombre", 
            vendedorNombre,
            sucursal: sucursalNombre,
            esFuturaNoCobrada
          };
        });

        const cobrosGenerados = [];
        todasLasVentas.forEach(venta => {
          if (venta.pago && venta.pago.primerCuotaPaga === true && venta.pago.montoPagado > 0) {
            const sellerEmail = venta.vendedorReal || venta.vendedor || venta.cargadoPor;
            const vendedorNombre = usuariosEmailMapLocal[sellerEmail] || usuariosIdMap[sellerEmail] || sellerEmail || "Sin Nombre";
            
            cobrosGenerados.push({
              id: venta.id + "-inicial",
              fecha: venta.fecha,
              clienteNombre: clientes[venta.clienteId] || "Sin Nombre",
              cuotaNumero: 1,
              monto: Number(venta.pago.montoPagado),
              vendedorNombre,
              sucursal: venta.sucursal
            });
          }

          if (venta.pagos && Array.isArray(venta.pagos)) {
            venta.pagos.forEach(pago => {
              const esCobroReal = pago.cobrado !== false && pago.pendiente !== true && (pago.monto > 0 || pago.montoPagado > 0);
              if (esCobroReal) {
                const sellerEmail = pago?.firma?.email || venta.vendedorReal || venta.vendedor || venta.cargadoPor;
                const vendedorNombre = usuariosEmailMapLocal[sellerEmail] || usuariosIdMap[sellerEmail] || sellerEmail || "Sin Nombre";
                
                cobrosGenerados.push({
                  id: venta.id + "-" + (pago.numero || Math.random()),
                  fecha: pago.fecha,
                  clienteNombre: clientes[venta.clienteId] || "Sin Nombre",
                  cuotaNumero: pago.numero || "Extra",
                  monto: Number(pago.monto || pago.montoPagado || 0),
                  vendedorNombre,
                  sucursal: venta.sucursal 
                });
              }
            });
          }
        });

        const gastosSnap = await getDocs(query(collection(db, "gastos"), orderBy("createdAt", "desc")));
        const todosLosGastos = gastosSnap.docs.map(g => {
          const gasto = g.data();
          const expenseUser = gasto.vendedor || gasto.usuario;
          const registradoPor = usuariosEmailMapLocal[expenseUser] || usuariosIdMap[expenseUser] || expenseUser || "Sin Nombre";
          
          let sucursalGasto = gasto.sucursal || gasto.branch || "Jofre 2440";
          if (sucursalGasto === "Mosconi") sucursalGasto = "Jofre 2440";
          
          return { id: g.id, ...gasto, registradoPor, sucursal: sucursalGasto };
        });

        const historialTemp = {};
        const procesarParaHistorial = (lista, tipo, montoKey) => {
          lista.forEach(item => {
            if (tipo === "ventas" && item.esFuturaNoCobrada) return;
            const f = obtenerObjetoFecha(item.fecha);
            if (!f || isNaN(f.getTime())) return;
            
            const y = f.getFullYear();
            const m = f.getMonth(); 
            
            if (!historialTemp[y]) historialTemp[y] = {};
            if (!historialTemp[y][m]) historialTemp[y][m] = { ventas: 0, cobros: 0, gastos: 0 };
            
            historialTemp[y][m][tipo] += (Number(item[montoKey]) || 0);
          });
        };

        procesarParaHistorial(todasLasVentas, "ventas", "total");
        procesarParaHistorial(cobrosGenerados, "cobros", "monto");
        procesarParaHistorial(todosLosGastos, "gastos", "monto");
        
        setHistorialBalances(historialTemp);

        const ventasMesActual = todasLasVentas.filter(v => {
          const f = obtenerObjetoFecha(v.fecha);
          return f && f.getFullYear() === anioActual && f.getMonth() === mesActual;
        });
        
        const cobrosMesActual = cobrosGenerados.filter(c => {
          const f = obtenerObjetoFecha(c.fecha);
          return f && f.getFullYear() === anioActual && f.getMonth() === mesActual;
        });

        const gastosMesActual = todosLosGastos.filter(g => {
          const f = obtenerObjetoFecha(g.fecha);
          return f && f.getFullYear() === anioActual && f.getMonth() === mesActual;
        });

        setVentas(ventasMesActual);
        setVentasFiltradas(ventasMesActual);
        
        setCobros(cobrosMesActual);
        setCobrosFiltrados(cobrosMesActual);
        
        setGastos(gastosMesActual);
        setGastosFiltrados(gastosMesActual);

      } catch (error) {
        console.error("Error cargando datos de Finanzas:", error);
      }
      setLoading(false);
    };
    fetchData();
  }, [refreshKey]); 

  const obtenerDatosGraficoPorSucursal = (sucursalNombre) => {
    const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();
    const nombresDiasCortos = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    return Array.from({ length: diasEnMes }, (_, i) => {
      const diaNum = i + 1;
      const fechaEspecifica = new Date(anioActual, mesActual, diaNum);
      const nombreDiaSemana = nombresDiasCortos[fechaEspecifica.getDay()];

      const vDia = ventasFiltradas.reduce((acc, v) => {
        const f = obtenerObjetoFecha(v.fecha);
        return f && f.getDate() === diaNum && v.sucursal === sucursalNombre && !v.esFuturaNoCobrada
          ? acc + (Number(v.total) || 0) 
          : acc;
      }, 0);

      const cDia = cobrosFiltrados.reduce((acc, c) => {
        const f = obtenerObjetoFecha(c.fecha);
        return f && f.getDate() === diaNum && c.sucursal === sucursalNombre 
          ? acc + (c.monto || 0) 
          : acc;
      }, 0);

      const gDia = gastosFiltrados.reduce((acc, g) => {
        const f = obtenerObjetoFecha(g.fecha);
        return f && f.getDate() === diaNum && g.sucursal === sucursalNombre 
          ? acc + (g.monto || 0) 
          : acc;
      }, 0);

      return {
        name: `${nombreDiaSemana} ${diaNum.toString().padStart(2, '0')}`,
        nameCompleto: `${fechaEspecifica.toLocaleDateString("es-AR", { weekday: 'long', day: 'numeric' })}`,
        Ventas: vDia,
        Cobros: cDia,
        Gastos: gDia
      };
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const diaInfo = payload[0].payload.nameCompleto || label;
      return (
        <div style={{ background: "#fff", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: "700", color: "#0f172a", textTransform: "capitalize", fontSize: "14px" }}>{diaInfo}</p>
          {payload.map((item, idx) => (
            <p key={idx} style={{ margin: "4px 0", fontSize: "13px", color: item.color, fontWeight: "600" }}>
              {item.name}: ${formatearMonto(item.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const toggleVentasLocal = (loc) => setMostrarVentas(prev => ({ ...prev, [loc]: !prev[loc] }));
  const toggleCobrosLocal = (loc) => setMostrarCobros(prev => ({ ...prev, [loc]: !prev[loc] }));
  const toggleGastosLocal = (loc) => setMostrarGastos(prev => ({ ...prev, [loc]: !prev[loc] }));

  const nombresMesesArray = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  if (loading) return <Loader />;

 return (
  <div className={styles.container}>
    <h1>Panel de Finanzas - {nombreMesCapitalizado} {anioActual}</h1>

    {/* FILTROS GLOBALES POR FECHA */}
    <section className={styles.filtros}>
      <div className={styles.filtrosFlex}>
        <label>Desde: <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} /></label>
        <label>Hasta: <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} /></label>
        <div className={styles.botonesFiltro}>
          <button onClick={aplicarFiltro} className={styles.btnPrimario}>Buscar Rango</button>
          <button onClick={borrarFiltro} className={styles.btnSecundario}>Resetear</button>
        </div>
      </div>
    </section>

    {/* RENDERIZADO COMPLETO POR CADA LOCAL INDEPENDIENTE */}
    {listaSucursales.map((sucursalNombre, idx) => {
      // FILTRADO DE DATOS
      const ventasSucursal = ventasFiltradas
        .filter(v => v.sucursal === sucursalNombre && !v.esFuturaNoCobrada)
        .sort(ordenarPorFechaDescendente);

      const cobrosSucursal = cobrosFiltrados
        .filter(c => c.sucursal === sucursalNombre)
        .sort(ordenarPorFechaDescendente);

      const gastosSucursal = gastosFiltrados
        .filter(g => g.sucursal === sucursalNombre)
        .sort(ordenarPorFechaDescendente);

      const totalVentasSuc = ventasSucursal.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
      const totalCobrosSuc = cobrosSucursal.reduce((acc, c) => acc + (c.monto || 0), 0);
      const totalGastosSuc = gastosSucursal.reduce((acc, g) => acc + (g.monto || 0), 0);
      const balanceSuc = totalCobrosSuc - totalGastosSuc;

      const datosGraficoSucursal = obtenerDatosGraficoPorSucursal(sucursalNombre);

      return (
        <div key={sucursalNombre} className={styles.sucursalCard}>
          
          {/* Header del Local modificado para alojar el Botón */}
          <div className={styles.sucursalHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>🏪 {sucursalNombre}</h2>
              <span className={styles.sucursalBadge}>Sucursal Activa</span>
            </div>
            
            {/* BOTÓN INDIVIDUAL POR SUCURSAL */}
            <button 
              className={styles.btnPrimario} 
              style={{ backgroundColor: sucursalFormularioAbierto === sucursalNombre ? "#ef4444" : "" }}
              onClick={() => {
                if (sucursalFormularioAbierto === sucursalNombre) {
                  setSucursalFormularioAbierto(null); // Cierra si ya estaba abierto
                } else {
                  // Resetea el form y lo abre para esta sucursal
                  setNuevoGasto({ descripcion: "", monto: "", categoria: "General", fecha: new Date().toISOString().split("T")[0] });
                  setSucursalFormularioAbierto(sucursalNombre);
                }
              }}
            >
              {sucursalFormularioAbierto === sucursalNombre ? "❌ Cancelar Carga" : "➕ Cargar Gasto Acá"}
            </button>
          </div>

          {/* FORMULARIO INYECTADO SOLO EN LA SUCURSAL SELECCIONADA */}
          {sucursalFormularioAbierto === sucursalNombre && (
            <form onSubmit={handleCargarGasto} style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", margin: "15px 0", border: "2px dashed #cbd5e1" }}>
              <h3 style={{ margin: "0 0 15px 0", color: "#334155" }}>Registrar Gasto en {sucursalNombre}</h3>
              <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", alignItems: "flex-end" }}>
                
                <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px", fontWeight: "bold" }}>
                  Fecha:
                  <input 
                    style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    type="date" 
                    value={nuevoGasto.fecha} 
                    onChange={(e) => setNuevoGasto({...nuevoGasto, fecha: e.target.value})} 
                    required
                  />
                </label>

                {/* NUEVO SELECTOR DE CATEGORÍA */}
                <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px", fontWeight: "bold" }}>
                  Categoría:
                  <select 
                    style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1", minWidth: "150px" }}
                    value={nuevoGasto.categoria} 
                    onChange={(e) => setNuevoGasto({...nuevoGasto, categoria: e.target.value})}
                  >
                    <option value="General">General / Varios</option>
                    <option value="Sueldos">Sueldos</option>
                    <option value="Comisiones por Ventas">Comisiones por Ventas</option>
                    <option value="Insumos">Insumos y Limpieza</option>
                    <option value="Servicios">Servicios (Luz, Internet, etc)</option>
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px", fontWeight: "bold", flexGrow: 1 }}>
                  Descripción:
                  <input 
                    style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    type="text" 
                    placeholder={nuevoGasto.categoria === "Comisiones por Ventas" ? "Ej: Comisión a Juan por venta #123" : "Ej: Detalle del gasto"} 
                    value={nuevoGasto.descripcion} 
                    onChange={(e) => setNuevoGasto({...nuevoGasto, descripcion: e.target.value})} 
                    required
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "14px", fontWeight: "bold" }}>
                  Monto ($):
                  <input 
                    style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    type="number" 
                    placeholder="Ej: 5000" 
                    value={nuevoGasto.monto} 
                    onChange={(e) => setNuevoGasto({...nuevoGasto, monto: e.target.value})} 
                    required
                  />
                </label>

                <button type="submit" className={styles.btnPrimario} style={{ padding: "10px 20px", height: "fit-content" }}>
                  Guardar Gasto
                </button>
              </div>
            </form>
          )}

          {/* SUBTÍTULO: 3 RANKINGS DINÁMICOS */}
          {(() => {
            const obtenerTopDia = (lista, llaveMonto) => {
              if (!lista || lista.length === 0) return { dia: "Sin datos", monto: 0 };
              const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
              
              const acumPorDia = lista.reduce((acc, curr) => {
                const fechaObj = obtenerObjetoFecha(curr.fecha); 
                const diaNombre = (!fechaObj || isNaN(fechaObj.getTime())) ? "S/D" : diasSemana[fechaObj.getDay()];
                const monto = Number(curr[llaveMonto]) || 0;
                
                acc[diaNombre] = (acc[diaNombre] || 0) + monto;
                return acc;
              }, {});

              const topDia = Object.keys(acumPorDia).reduce((a, b) => acumPorDia[a] > acumPorDia[b] ? a : b, "Sin datos");
              return { dia: topDia, monto: acumPorDia[topDia] || 0 };
            };

            const topVenta = obtenerTopDia(ventasSucursal, 'total');
            const topCobro = obtenerTopDia(cobrosSucursal, 'monto');
            const topGasto = obtenerTopDia(gastosSucursal, 'monto');

            return (
              <div className={styles.sucursalRankings}>
                <div className={`${styles.rankingItem} ${styles.ventas}`}>
                  <span className={styles.rankingTitulo}>Top Ventas:</span>
                  <span className={styles.rankingBadge}>1º {topVenta.dia} (${formatearMonto(topVenta.monto)})</span>
                </div>
                <div className={`${styles.rankingItem} ${styles.cobros}`}>
                  <span className={styles.rankingTitulo}>Top Cobros:</span>
                  <span className={styles.rankingBadge}>1º {topCobro.dia} (${formatearMonto(topCobro.monto)})</span>
                </div>
                <div className={`${styles.rankingItem} ${styles.gastos}`}>
                  <span className={styles.rankingTitulo}>Top Gastos:</span>
                  <span className={styles.rankingBadge}>1º {topGasto.dia} (${formatearMonto(topGasto.monto)})</span>
                </div>
              </div>
            );
          })()}

          {/* Tarjetas Informativas del Local */}
          <div className={styles.cards}>
            <div className={`${styles.cardInfo} ${styles.cardVentas}`}>Emitido Ventas:<br /><b>${formatearMonto(totalVentasSuc)}</b></div>
            <div className={`${styles.cardInfo} ${styles.cardCobros}`}>Ingreso Caja:<br /><b>${formatearMonto(totalCobrosSuc)}</b></div>
            <div className={`${styles.cardInfo} ${styles.cardGastos}`}>Gastos de Caja:<br /><b>${formatearMonto(totalGastosSuc)}</b></div>
            <div className={`${styles.cardInfo} ${balanceSuc >= 0 ? styles.balancePositivo : styles.balanceNegativo}`}>
              Balance Neto:<br /><b>${formatearMonto(balanceSuc)}</b>
            </div>
          </div>

          {/* Gráfica Exclusiva del Local */}
          <div className={styles.chartWrapper}>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={datosGraficoSucursal} margin={{ top: 10, right: 10, left: -5, bottom: 5 }}>
                  <defs>
                    <linearGradient id={`colorVentas-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id={`colorCobros-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id={`colorGastos-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickLine={false} dy={10} />
                  <YAxis tickFormatter={(v) => v === 0 ? "$0" : `$${(v / 1000).toLocaleString("es-AR")}k`} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
                  <Legend verticalAlign="top" height={35} iconType="circle" iconSize={9} />

                  <Area type="monotone" dataKey="Ventas" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill={`url(#colorVentas-${idx})`} dot={{ r: 1.5 }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="Cobros" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill={`url(#colorCobros-${idx})`} dot={{ r: 1.5 }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="Gastos" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill={`url(#colorGastos-${idx})`} dot={{ r: 1.5 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TABLAS DETALLADAS SUCURSALES (COLLAPSIBLES) */}
          <div className={styles.auditoriaWrapper}>
            <h3>📋 Auditoría Detallada (Ordenado por Día): {sucursalNombre}</h3>

            <section className={styles.seccionTablaCollapsible}>
              <div className={styles.headerTablaFlex}>
                <h4>Historial Ventas Realizadas ({ventasSucursal.length})</h4>
                <button onClick={() => toggleVentasLocal(sucursalNombre)} className={styles.btnToggleTabla}>
                  {mostrarVentas[sucursalNombre] ? "Ocultar 🔼" : "Ver Detalle 🔽"}
                </button>
              </div>
              {mostrarVentas[sucursalNombre] && (
                <div className={styles["table-wrapper"]}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Fecha</th><th>Cliente</th><th>Monto Total</th><th>Plan de Pago</th><th>Vendedor</th></tr>
                    </thead>
                    <tbody>
                      {ventasSucursal.map(venta => {
                        const cuotas = venta.cuotas || 1;
                        const valorCuota = venta.valorCuota || venta.total || 0;
                        return (
                          <tr key={venta.id}>
                            <td>{formatearFecha(venta.fecha)}</td>
                            <td>{venta.clienteNombre}</td>
                            <td className={styles.textoDestacadoVentas}>${formatearMonto(venta.total)}</td>
                            <td>{cuotas} cuotas de ${formatearMonto(valorCuota)}</td>
                            <td>{venta.vendedorNombre}</td>
                          </tr>
                        );
                      })}
                      {ventasSucursal.length === 0 && <tr><td colSpan="5" className={styles.tablaVacia}>No hay ventas registradas este mes.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={styles.seccionTablaCollapsible}>
              <div className={styles.headerTablaFlex}>
                <h4>Historial Cobros Caja ({cobrosSucursal.length})</h4>
                <button onClick={() => toggleCobrosLocal(sucursalNombre)} className={styles.btnToggleTabla}>
                  {mostrarCobros[sucursalNombre] ? "Ocultar 🔼" : "Ver Detalle 🔽"}
                </button>
              </div>
              {mostrarCobros[sucursalNombre] && (
                <div className={styles["table-wrapper"]}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Fecha</th><th>Cliente</th><th>Cuota</th><th>Monto</th><th>Recibido por</th></tr>
                    </thead>
                    <tbody>
                      {cobrosSucursal.map(c => (
                        <tr key={c.id}>
                          <td>{formatearFecha(c.fecha)}</td>
                          <td>{c.clienteNombre}</td>
                          <td>{typeof c.cuotaNumero === "number" ? `Cuota ${c.cuotaNumero}` : c.cuotaNumero}</td>
                          <td className={styles.textoDestacadoCobros}>${formatearMonto(c.monto)}</td>
                          <td>{c.vendedorNombre}</td>
                        </tr>
                      ))}
                      {cobrosSucursal.length === 0 && <tr><td colSpan="5" className={styles.tablaVacia}>No hay cobros registrados este mes.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={styles.seccionTablaCollapsible}>
              <div className={styles.headerTablaFlex}>
                <h4>Historial Gastos Caja ({gastosSucursal.length})</h4>
                <button onClick={() => toggleGastosLocal(sucursalNombre)} className={styles.btnToggleTabla}>
                  {mostrarGastos[sucursalNombre] ? "Ocultar 🔼" : "Ver Detalle 🔽"}
                </button>
              </div>
              {mostrarGastos[sucursalNombre] && (
                <div className={styles["table-wrapper"]}>
                  <table className={styles.table}>
                    <thead>
                      {/* NUEVO: Columna de Categoría agregada en la tabla */}
                      <tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th>Registrado por</th></tr>
                    </thead>
                    <tbody>
                      {gastosSucursal.map(g => (
                        <tr key={g.id}>
                          <td>{formatearFecha(g.fecha)}</td>
                          <td>
                            <span style={{ 
                              background: g.categoria === 'Sueldos' ? '#fef08a' : g.categoria === 'Comisiones por Ventas' ? '#bbf7d0' : '#e2e8f0', 
                              padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' 
                            }}>
                              {g.categoria || 'General'}
                            </span>
                          </td>
                          <td>{g.descripcion}</td>
                          <td className={styles.textoDestacadoGastos}>${formatearMonto(g.monto)}</td>
                          <td>{g.registradoPor}</td>
                        </tr>
                      ))}
                      {gastosSucursal.length === 0 && <tr><td colSpan="5" className={styles.tablaVacia}>No hay gastos registrados este mes.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

        </div>
      );
    })}

    {/* ==============================================================
        HISTORIAL DE BALANCES GLOBALES (AÑOS Y MESES) 
        ============================================================== */}
    <div className={styles.sucursalCard} style={{ marginTop: "2rem" }}>
      <div className={styles.sucursalHeader} style={{ marginBottom: "1rem" }}>
        <h2>📅 Historial General de Balances</h2>
        <span className={styles.sucursalBadge} style={{ background: "#334155", color: "white" }}>Datos Históricos Globales</span>
      </div>

      {Object.keys(historialBalances).length === 0 ? (
        <p style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>No hay datos históricos disponibles.</p>
      ) : (
        Object.keys(historialBalances)
          .sort((a, b) => b - a)
          .map(year => {
            const mesesDelAnio = historialBalances[year];
            return (
              <div key={year} style={{ marginBottom: "2.5rem" }}>
                <h3 style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: "10px", color: "#334155", marginBottom: "15px" }}>
                  Año {year}
                </h3>
                
                <div className={styles["table-wrapper"]}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th>Emitido Ventas</th>
                        <th>Ingresos (Cobros)</th>
                        <th>Gastos de Caja</th>
                        <th>Balance Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(mesesDelAnio)
                        .sort((a, b) => b - a) 
                        .map(monthIndex => {
                          const datosMes = mesesDelAnio[monthIndex];
                          const balanceMes = datosMes.cobros - datosMes.gastos;
                          
                          return (
                            <tr key={`${year}-${monthIndex}`}>
                              <td style={{ fontWeight: "700", textTransform: "capitalize", color: "#0f172a" }}>
                                {nombresMesesArray[monthIndex]}
                              </td>
                              <td className={styles.textoDestacadoVentas}>
                                ${formatearMonto(datosMes.ventas)}
                              </td>
                              <td className={styles.textoDestacadoCobros}>
                                ${formatearMonto(datosMes.cobros)}
                              </td>
                              <td className={styles.textoDestacadoGastos}>
                                ${formatearMonto(datosMes.gastos)}
                              </td>
                              <td className={balanceMes >= 0 ? styles.balancePositivo : styles.balanceNegativo} style={{ fontWeight: "bold" }}>
                                ${formatearMonto(balanceMes)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
      )}
    </div>

  </div>
 );
};

export default Finanzas;