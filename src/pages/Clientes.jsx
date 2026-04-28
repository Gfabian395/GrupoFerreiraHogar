import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";
import AddClient from "../components/AddClient";
import CardClient from "../components/CardClient";
import styles from "../styles/Clientes.module.css";

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
  // OBTENER CLIENTES
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
  // BUSCADOR
  // ===============================
  const clientesFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;

    return clientes.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const dni = String(c.dni || "").toLowerCase();
      return nombre.includes(q) || dni.includes(q);
    });
  }, [clientes, search]);

  // ===============================
  // CALCULAR SI ESTÁ PAGADO
  // ===============================
  const estaPagado = (venta) => {
    const totalPagado = (venta.pagos || []).reduce(
      (sum, p) => sum + Number(p.monto || 0),
      0
    );

    const totalCredito =
      venta.totalCredito ||
      (venta.valorCuota || 0) * (venta.cuotas || 0);

    return totalPagado >= totalCredito;
  };

  // ===============================
  // CLIENTES VENCIDOS CON DETALLE
  // ===============================
  const clientesVencidos = useMemo(() => {
    if (!ventas.length) return [];

    const hoy = new Date();

    const resultado = clientes.map((cliente) => {

      // 🚫 NO mostrar clientes bloqueados
      if (cliente.estado === "Bloqueado") return null;

      const ventasCliente = ventas.filter(
        (v) => v.clienteId === cliente.id && !estaPagado(v)
      );

      if (!ventasCliente.length) return null;

      let mayorAtraso = 0;
      let ventaMasAtrasada = null;

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
        fechaBase.setMonth(fechaBase.getMonth() + cuotasPagadas);

        const diferenciaDias = Math.floor(
          (hoy - fechaBase) / (1000 * 60 * 60 * 24)
        );

        if (diferenciaDias > mayorAtraso) {
          mayorAtraso = diferenciaDias;
          ventaMasAtrasada = venta;
        }
      });

      if (mayorAtraso > 30 && ventaMasAtrasada) {
        const fechaInicio = ventaMasAtrasada.fecha?.toDate
          ? ventaMasAtrasada.fecha.toDate()
          : ventaMasAtrasada.fecha
            ? new Date(ventaMasAtrasada.fecha)
            : null;

        const cuotasPagadas = ventaMasAtrasada.pagos?.length || 0;

        const proximoVencimiento = fechaInicio
          ? new Date(
            fechaInicio.setMonth(fechaInicio.getMonth() + cuotasPagadas)
          )
          : null;

        const nombresProductos =
          ventaMasAtrasada.productos?.map((p) => p.nombre).join(", ") || "—";

        return {
          ...cliente,
          diasAtraso: mayorAtraso,
          producto: nombresProductos,
          cuotaDebe: cuotasPagadas + 1,
          valorCuota: ventaMasAtrasada.valorCuota || 0,
          proximoVencimiento,
          vendedor: ventaMasAtrasada.vendedor || "—",
        };
      }

      return null;
    });

    return resultado
      .filter(Boolean)
      .sort((a, b) => a.diasAtraso - b.diasAtraso);
  }, [clientes, ventas]);

  // ===============================
  // DOBLE CLICK → MARCAR + NAVEGAR
  // ===============================
  const handleDoubleClickCliente = (clienteId) => {
    const finDelDia = new Date();
    finDelDia.setHours(23, 59, 59, 999); // hoy a las 23:59:59

    // Array de clientes visitados hoy
    const current = [...clientesReclamadosHoy];

    if (!current.includes(clienteId)) {
      current.push(clienteId);
      localStorage.setItem("clientesReclamadosHoy", JSON.stringify(current));
      setClientesReclamadosHoy(current);
    }

    // Guardamos expiración del día
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
                <th class="checkColumn">✅</th>
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
