import React, { useEffect, useState } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import styles from "../styles/Finanzas.module.css";
import { Loader } from "./Loader";

const Finanzas = () => {
  const [ventas, setVentas] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientesMap, setClientesMap] = useState({});
  const [usuariosMap, setUsuariosMap] = useState({});
  const [usuariosEmailMap, setUsuariosEmailMap] = useState({});
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [ventasFiltradas, setVentasFiltradas] = useState([]);
  const [cobrosFiltrados, setCobrosFiltrados] = useState([]);

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

  // Función para aplicar filtro de fechas
  const aplicarFiltro = () => {
    const desde = fechaDesde ? new Date(fechaDesde) : null;
    const hasta = fechaHasta ? new Date(fechaHasta) : null;

    setVentasFiltradas(
      ventas.filter(v => {
        const fechaVenta = new Date(v.fecha);
        return (!desde || fechaVenta >= desde) && (!hasta || fechaVenta <= hasta);
      })
    );

    setCobrosFiltrados(
      cobros.filter(c => {
        const fechaCobro = new Date(c.fecha);
        return (!desde || fechaCobro >= desde) && (!hasta || fechaCobro <= hasta);
      })
    );
  };

  // Función para borrar filtro
  const borrarFiltro = () => {
    setFechaDesde("");
    setFechaHasta("");
    setVentasFiltradas(ventas);
    setCobrosFiltrados(cobros);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // CLIENTES
        const clientesSnap = await getDocs(collection(db, "clientes"));
        const clientes = {};
        clientesSnap.docs.forEach(c => (clientes[c.id] = c.data().nombre));
        setClientesMap(clientes);

        // USUARIOS
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

        // VENTAS
        const ventasSnap = await getDocs(query(collection(db, "ventas"), orderBy("createdAt", "desc")));
        const ventasData = ventasSnap.docs.map(doc => {
          const v = doc.data();
          const vendedorEmail = v.vendedorReal || v.vendedor || v.cargadoPor;
          const vendedorNombre = usuariosEmailMapLocal[vendedorEmail] || usuariosIdMap[vendedorEmail] || vendedorEmail || "Sin Nombre";
          return { id: doc.id, ...v, clienteNombre: clientes[v.clienteId] || "Sin Nombre", vendedorNombre };
        });
        setVentas(ventasData);
        setVentasFiltradas(ventasData);

        // COBROS
        const cobrosGenerados = [];
        ventasData.forEach(venta => {
          if (!venta.pagos) return;
          venta.pagos.forEach(pago => {
            const vendedorEmail = pago?.firma?.email || venta.vendedorReal || venta.vendedor || venta.cargadoPor;
            const vendedorNombre = usuariosEmailMapLocal[vendedorEmail] || usuariosIdMap[vendedorEmail] || vendedorEmail || "Sin Nombre";
            cobrosGenerados.push({
              id: venta.id + "-" + pago.numero,
              fecha: pago.fecha,
              clienteNombre: clientes[venta.clienteId] || "Sin Nombre",
              cuotaNumero: pago.numero,
              monto: pago.monto,
              vendedorNombre
            });
          });
        });
        cobrosGenerados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        setCobros(cobrosGenerados);
        setCobrosFiltrados(cobrosGenerados);

        // GASTOS
        const gastosSnap = await getDocs(query(collection(db, "gastos"), orderBy("createdAt", "desc")));
        const gastosData = gastosSnap.docs.map(g => {
          const gasto = g.data();
          const vendedorEmail = gasto.vendedor || gasto.usuario;
          const registradoPor = usuariosEmailMapLocal[vendedorEmail] || usuariosIdMap[vendedorEmail] || vendedorEmail || "Sin Nombre";
          return { id: g.id, ...gasto, registradoPor };
        });
        setGastos(gastosData);

      } catch (error) {
        console.error("Error cargando datos de Finanzas:", error);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Totales filtrados
  const totalVentas = ventasFiltradas.reduce((acc, v) => acc + (v.pago?.montoPagado || v.valorCuota || 0), 0);
  const totalCobros = cobrosFiltrados.reduce((acc, c) => acc + (c.monto || 0), 0);
  const totalGastos = gastos.reduce((acc, g) => acc + (g.monto || 0), 0);
  const balance = totalCobros - totalGastos;

  if (loading) return <Loader />;

  return (

    <div className={styles.container}>

      <h1>Finanzas</h1>

      {/* SELECTOR DE FECHAS CON BOTONES */}
      <section className={styles.filtros}>
        <label>
          Desde:
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </label>
        <label>
          Hasta:
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </label>
        <button onClick={aplicarFiltro}>Buscar</button>
        <button onClick={borrarFiltro}>Borrar filtro</button>
      </section>

      <section className={styles.resumen}>

        <h2>Resumen</h2>

        <div className={styles.cards}>

          <div>Total Cobrado en Ventas: <b>${formatearMonto(totalVentas)}</b></div>
          <div>Dinero en Caja: <b>${formatearMonto(totalCobros)}</b></div>
          <div>Gastos: <b>${formatearMonto(totalGastos)}</b></div>
          <div>Balance Caja: <b>${formatearMonto(balance)}</b></div>

        </div>

      </section>

     {/* VENTAS */}
<section>
  <h2>Ventas</h2>
  <div className={styles["table-wrapper"]}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Cobrado</th>
          <th>Plan de Pago</th>
          <th>Vendedor</th>
        </tr>
      </thead>
      <tbody>
        {ventasFiltradas.map(venta => {
          const cuotas = venta.cuotas || 1;
          const valorCuota = venta.valorCuota || venta.pago?.montoPagado || 0;
          const cobrado = venta.pago?.montoPagado || valorCuota;

          return (
            <tr key={venta.id}>
              <td>{formatearFecha(venta.fecha)}</td>
              <td>{venta.clienteNombre}</td>
              <td>${formatearMonto(cobrado)}</td>
              <td>{cuotas} cuotas de ${formatearMonto(valorCuota)}</td>
              <td>{venta.vendedorNombre}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan="2"><b>Total Cobrado</b></td>
          <td><b>${formatearMonto(totalVentas)}</b></td>
          <td colSpan="2"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</section>

{/* COBROS */}
<section>
  <h2>Cobros</h2>
  <div className={styles["table-wrapper"]}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Cuota</th>
          <th>Monto</th>
          <th>Recibido por</th>
        </tr>
      </thead>
      <tbody>
        {cobrosFiltrados.map(c => (
          <tr key={c.id}>
            <td>{formatearFecha(c.fecha)}</td>
            <td>{c.clienteNombre}</td>
            <td>Cuota {c.cuotaNumero || "-"}</td>
            <td>${formatearMonto(c.monto)}</td>
            <td>{c.vendedorNombre}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan="3"><b>Total Cobrado</b></td>
          <td><b>${formatearMonto(totalCobros)}</b></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>
</section>

      {/* GASTOS */}
      <section>

        <h2>Gastos</h2>

        <div className={styles["table-wrapper"]}>

          <table className={styles.table}>

            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Monto</th>
                <th>Registrado por</th>
              </tr>
            </thead>

            <tbody>

              {gastos.map(g => (

                <tr key={g.id}>

                  <td>{formatearFecha(g.fecha)}</td>
                  <td>{g.descripcion}</td>
                  <td>${formatearMonto(g.monto)}</td>
                  <td>{g.registradoPor}</td>

                </tr>

              ))}

            </tbody>

            <tfoot>

              <tr>
                <td colSpan="2"><b>Total Gastos</b></td>
                <td><b>${formatearMonto(totalGastos)}</b></td>
                <td></td>
              </tr>

            </tfoot>

          </table>

        </div>

      </section>

    </div>

  );

};

export default Finanzas;