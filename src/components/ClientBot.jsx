import { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export default function ClientBot() {
  const [open, setOpen] = useState(false);
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [ventasActivas, setVentasActivas] = useState([]);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [nombreCliente, setNombreCliente] = useState("");
  const [error, setError] = useState("");

  const buscarCliente = async () => {
    if (!dni.trim()) return;

    setLoading(true);
    setError("");
    setVentasActivas([]);
    setVentaSeleccionada(null);

    try {
      const q = query(collection(db, "clientes"), where("dni", "==", dni));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError("No se encontró cliente con ese DNI");
        setLoading(false);
        return;
      }

      const clienteDoc = snap.docs[0];
      const data = clienteDoc.data();

      const cliente = {
        uid: data.uid || clienteDoc.id,
        dni: data.dni,
        nombre: data.nombre || data.nombreCompleto || "Cliente",
      };

      setNombreCliente(cliente.nombre);

      // 🔥 BUSCAR VENTAS POR UID Y DNI
      const ventasPorUid = await getDocs(
        query(collection(db, "ventas"), where("clienteId", "==", cliente.uid))
      );

      const ventasPorDni = await getDocs(
        query(collection(db, "ventas"), where("clienteId", "==", cliente.dni))
      );

      // 🔥 UNIR Y ELIMINAR DUPLICADOS
      const mapaVentas = new Map();

      [...ventasPorUid.docs, ...ventasPorDni.docs].forEach((doc) => {
        mapaVentas.set(doc.id, doc.data());
      });

      const activas = [];

      mapaVentas.forEach((v) => {
        const cuotasTotales = Number(v.cuotas || 0);
        const pagosArray = Array.isArray(v.pagos) ? v.pagos : [];

        const totalCredito =
          v.totalCredito ||
          Number(v.valorCuota || 0) * cuotasTotales;

        const totalPagado = pagosArray.reduce(
          (acc, p) => acc + Number(p.monto || 0),
          0
        );

        const saldoPendiente = Math.max(totalCredito - totalPagado, 0);

        // 🔥 CONDICIÓN CORRECTA: ACTIVA SI SALDO > 0
        if (saldoPendiente > 0) {

          let ultimaFechaPago = null;
          if (pagosArray.length > 0) {
            const ultima = pagosArray[pagosArray.length - 1].fecha;
            ultimaFechaPago = ultima?.toDate
              ? ultima.toDate()
              : new Date(ultima);
          }

          // 🔥 PRODUCTOS UNIVERSAL
          let productos = [];

          if (Array.isArray(v.productos) && v.productos.length > 0) {
            productos = v.productos.map((p) => ({
              nombre:
                p.nombre ||
                p.descripcion ||
                p.nombreProducto ||
                "Producto sin nombre",
              cantidad: p.cantidad || 1,
            }));
          } else if (v.producto) {
            productos = [{ nombre: v.producto, cantidad: 1 }];
          } else if (v.nombreProducto) {
            productos = [{ nombre: v.nombreProducto, cantidad: 1 }];
          } else {
            productos = [{ nombre: "Producto no especificado", cantidad: 1 }];
          }

          activas.push({
            productos,
            cuotasTotales,
            cuotasPagadas: pagosArray.length,
            cuotasRestantes: Math.max(
              cuotasTotales - pagosArray.length,
              0
            ),
            saldoPendiente,
            ultimaFechaPago,
          });
        }
      });

      if (activas.length === 0) {
        setError("No registra créditos activos");
      }

      setVentasActivas(activas);

    } catch (err) {
      console.error(err);
      setError("Error buscando cliente");
    }

    setLoading(false);
  };

  const estadoCuenta = (venta) => {
    if (!venta.ultimaFechaPago) return "ATRASADO";

    const hoy = new Date();
    const diffDias =
      (hoy - venta.ultimaFechaPago) / (1000 * 60 * 60 * 24);

    return diffDias > 40 ? "ATRASADO" : "AL DÍA";
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "#00f0ff",
          color: "#000",
          borderRadius: "50px",
          padding: "15px 25px",
          border: "none",
          cursor: "pointer",
          fontWeight: "900",
          fontSize: "15px",
          boxShadow: "0 0 30px #00f0ff",
          zIndex: 9999,
        }}
      >
        💳 CONSULTAR CRÉDITO
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "90px",
            right: "20px",
            width: "420px",
            background: "#050814",
            borderRadius: "20px",
            padding: "25px",
            boxShadow: "0 0 50px #00f0ff",
            maxHeight: "600px",
            overflowY: "auto",
            color: "#ffffff",
            fontFamily: "Arial, sans-serif",
            zIndex: 9999,
            border: "2px solid #00f0ff",
          }}
        >
          <h2
            style={{
              textAlign: "center",
              marginBottom: "20px",
              color: "#00f0ff",
              fontWeight: "900",
              fontSize: "22px",
            }}
          >
            ESTADO DE CRÉDITO
          </h2>

          <input
            type="number"
            placeholder="Ingresar DNI"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "2px solid #00f0ff",
              background: "#0c1325",
              color: "#fff",
              marginBottom: "15px",
              fontSize: "14px",
            }}
          />

          <button
            onClick={buscarCliente}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "#a100ff",
              color: "#fff",
              fontWeight: "800",
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 0 20px #a100ff",
            }}
          >
            {loading ? "Buscando..." : "CONSULTAR"}
          </button>

          {error && (
            <p style={{ marginTop: "15px", color: "#ff3b3b", fontWeight: "800" }}>
              {error}
            </p>
          )}

          {ventasActivas.length > 0 && !ventaSeleccionada && (
            <>
              <p style={{ marginTop: "20px", fontWeight: "700" }}>
                {nombreCliente}, seleccioná tu producto:
              </p>

              {ventasActivas.map((venta, i) => (
                <button
                  key={i}
                  onClick={() => setVentaSeleccionada(venta)}
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    padding: "12px",
                    borderRadius: "12px",
                    border: "1px solid #00f0ff",
                    background: "#0c1325",
                    color: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight: "600",
                  }}
                >
                  {venta.productos
                    .map((p) => `${p.nombre} x${p.cantidad}`)
                    .join(", ")}
                </button>
              ))}
            </>
          )}

          {ventaSeleccionada && (
            <div style={{ marginTop: "20px" }}>
              <h3 style={{ color: "#00f0ff" }}>
                {ventaSeleccionada.productos
                  .map((p) => `${p.nombre} x${p.cantidad}`)
                  .join(", ")}
              </h3>

              <p>Cuotas: {ventaSeleccionada.cuotasTotales}</p>
              <p>Pagadas: {ventaSeleccionada.cuotasPagadas}</p>
              <p>Restantes: {ventaSeleccionada.cuotasRestantes}</p>

              <p style={{ fontWeight: "800", marginTop: "10px" }}>
                Saldo: $
                {ventaSeleccionada.saldoPendiente.toLocaleString("es-AR")}
              </p>

              <p
                style={{
                  marginTop: "15px",
                  padding: "12px",
                  borderRadius: "12px",
                  background:
                    estadoCuenta(ventaSeleccionada) === "AL DÍA"
                      ? "#003d2e"
                      : "#4d0000",
                  color:
                    estadoCuenta(ventaSeleccionada) === "AL DÍA"
                      ? "#00ffae"
                      : "#ff3b3b",
                  fontWeight: "900",
                  textAlign: "center",
                  fontSize: "15px",
                }}
              >
                {estadoCuenta(ventaSeleccionada)}
              </p>

              <a
                href="https://wa.me/5491159781434"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  marginTop: "20px",
                  textAlign: "center",
                  padding: "14px",
                  borderRadius: "12px",
                  textDecoration: "none",
                  fontWeight: "900",
                  background: "#25D366",
                  color: "#000",
                  fontSize: "14px",
                }}
              >
                💬 HABLAR CON UN VENDEDOR
              </a>
            </div>
          )}
        </div>
      )}
    </>
  );
}