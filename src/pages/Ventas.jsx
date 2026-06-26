import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase/firebaseConfig";
import { useCart } from "../context/CartContext";
import styles from "../styles/Ventas.module.css";

/* ===============================
   CONFIG CUOTAS
=============================== */
const configuracionCuotas = [
    { cuotas: 2, interes: 30 },
    { cuotas: 3, interes: 50 },
    { cuotas: 4, interes: 70 },
    { cuotas: 6, interes: 90 },
    { cuotas: 9, interes: 120 },
    { cuotas: 12, interes: 150 },
    { cuotas: 18, interes: 170 },
    { cuotas: 24, interes: 200 },
  ];

const redondearMil = (v) => Math.ceil(Number(v) / 1000) * 1000;

export default function Ventas() {
  const navigate = useNavigate();
  const { items, clearCart } = useCart();

  /* ===============================
     ESTADOS
  =============================== */
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);

  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioActual, setUsuarioActual] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState("");

  const [cuotas, setCuotas] = useState(1);

  const [tipoEntrega, setTipoEntrega] = useState("sucursal");
  const [choferId, setChoferId] = useState("");

  const [ventaDeOtro, setVentaDeOtro] = useState(false);
  const [vendedorReal, setVendedorReal] = useState("");

  // PAGOS
  const [primerCuotaPaga, setPrimerCuotaPaga] = useState(false);
  const [pagoParcial, setPagoParcial] = useState(false);
  const [montoPagoParcial, setMontoPagoParcial] = useState("");

  /* ===============================
     FETCH DATA
  =============================== */
  useEffect(() => {
    const fetchData = async () => {
      const clientesSnap = await getDocs(collection(db, "clientes"));
      setClientes(clientesSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      setUsuarios(usuariosSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) setUsuarioActual(snap.data());
      }
    };
    fetchData();
  }, []);

  /* ===============================
     FILTROS
  =============================== */
  const clientesFiltrados = clientes.filter((c) =>
    `${c.nombre} ${c.dni}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  const choferes = usuarios.filter(
    (u) => u.activo && u.roles?.chofer
  );

  const vendedores = usuarios.filter(
    (u) => u.activo && u.roles?.vendedor
  );

  /* ===============================
     TOTALES
  =============================== */
  const total = items.reduce((acc, i) => acc + i.price * i.qty, 0);

  // ✅ BASE PARA CUOTAS (NO EXISTÍA)
  const saldoBase = total;

  /* ===============================
     CUOTAS
  =============================== */
  const cuotasOpciones = useMemo(() => {
    if (!saldoBase) return [{ cuotas: 1, valor: 0 }];

    const monto = saldoBase;

    const cuotasFiltradas = configuracionCuotas.filter(({ cuotas }) => {
      if (monto < 30000) return cuotas <= 2;
      if (monto < 80000) return cuotas <= 3;
      if (monto < 150000) return cuotas <= 6;
      if (monto < 250000) return cuotas <= 9;
      if (monto < 350000) return cuotas <= 12;
      if (monto < 500000) return cuotas <= 18;
      return true;
    });

    return [{ cuotas: 1, valor: monto }].concat(
      cuotasFiltradas.map(({ cuotas, interes }) => {
        const conInteres = monto * (1 + interes / 100);
        return {
          cuotas,
          valor: redondearMil(conInteres / cuotas),
        };
      })
    );
  }, [saldoBase]);

  const valorCuota =
    cuotasOpciones.find(c => c.cuotas === cuotas)?.valor || 0;

  const montoPagado = primerCuotaPaga
    ? valorCuota
    : pagoParcial
      ? Number(montoPagoParcial)
      : 0;

  const saldoFinanciado = Math.max(total - montoPagado, 0);

  /* ===============================
     CONFIRMAR
  =============================== */
  const confirmarVenta = async () => {
    if (!clienteSeleccionado) return alert("Seleccioná un cliente");
    if (!items.length) return alert("El carrito está vacío");
    if (tipoEntrega === "envio" && !choferId)
      return alert("Seleccioná un chofer");
    if (ventaDeOtro && !vendedorReal)
      return alert("Seleccioná el vendedor real");

    const ventaRef = doc(collection(db, "ventas"));

    const venta = {
      id: ventaRef.id, // opcional pero recomendable
      fecha,
      clienteId: clienteSeleccionado,
      productos: items,
      total,
      cuotas,
      valorCuota,
      pago: {
        primerCuotaPaga,
        pagoParcial,
        montoPagado,
        saldoFinanciado,
      },
      tipoEntrega,
      choferId: tipoEntrega === "envio" ? choferId : null,
      ventaDeOtro,
      vendedorReal: ventaDeOtro
        ? vendedorReal
        : auth.currentUser.email,
      cargadoPor: auth.currentUser.email,
      createdAt: serverTimestamp(),
    };

    try {
      await runTransaction(db, async (transaction) => {
        const productosLeidos = [];

        // ===============================
        // 1️⃣ LECTURAS
        // ===============================
        for (const item of items) {
          // ===============================
          // SI ES COMBO
          // ===============================
          if (item.type === "combo") {
            const comboRef = doc(
              db,
              "categorias",
              item.categoriaId,
              "productos",
              item.id
            );

            const comboSnap = await transaction.get(comboRef);
            if (!comboSnap.exists())
              throw new Error("Combo inexistente");

            const comboData = comboSnap.data();

            if (!Array.isArray(comboData.items))
              throw new Error("Combo mal configurado");

            for (const comboItem of comboData.items) {
              const productoRef = doc(
                db,
                "categorias",
                comboData.categoriaId,
                "productos",
                comboItem.productId
              );

              const snap = await transaction.get(productoRef);
              if (!snap.exists())
                throw new Error("Producto del combo inexistente");

              productosLeidos.push({
                item: {
                  ...comboItem,
                  qty: comboItem.quantity * item.qty,
                },
                ref: productoRef,
                data: snap.data(),
              });
            }
          } else {
            // ===============================
            // PRODUCTO NORMAL
            // ===============================
            const productoRef = doc(
              db,
              "categorias",
              item.categoriaId,
              "productos",
              item.id
            );

            const snap = await transaction.get(productoRef);
            if (!snap.exists())
              throw new Error("Producto inexistente");

            productosLeidos.push({
              item,
              ref: productoRef,
              data: snap.data(),
            });
          }
        }

        // ===============================
        // 2️⃣ DESCONTAR STOCK
        // ===============================
        const vendedorId = ventaDeOtro
          ? vendedorReal
          : auth.currentUser.uid;

        const vendedorRef = doc(db, "usuarios", vendedorId);
        const vendedorSnap = await transaction.get(vendedorRef);

        if (!vendedorSnap.exists()) {
          throw new Error("Vendedor no encontrado");
        }

        const vendedorData = vendedorSnap.data();

        const topeTotal = 5000000;

        const mesActual = new Date().toISOString().slice(0, 7);

        let topeUsado = vendedorData.topeUsado || 0;
        const mesCredito = vendedorData.mesCredito || null;

        // 🔥 reset automático mensual
        if (mesCredito !== mesActual) {
          topeUsado = 0;
        }

        let riesgo = 0;

        // calculamos costo total de la venta
        const costoTotal = productosLeidos.reduce((acc, p) => {
          const qty = p.item.qty || 0;
          const costo = Number(p.data.purchasePrice || 0);
          return acc + costo * qty;
        }, 0);

        if (primerCuotaPaga) {
          riesgo = 0;
        } else if (pagoParcial) {
          riesgo = saldoFinanciado;
        } else {
          // 🔥 SOLO cuando no paga nada → usa costo en vez de precio de venta
          riesgo = costoTotal;
        }

        const disponible = topeTotal - topeUsado;

        if (riesgo > disponible) {
          throw new Error("El vendedor no tiene crédito disponible suficiente");
        }

        // ===============================
        // 3️⃣ WRITES
        // ===============================

        // 🔻 DESCONTAR STOCK
        for (const { item, ref, data } of productosLeidos) {
          const variantesDB = Array.isArray(data.variantes)
            ? data.variantes
            : [
              {
                attr: "default",
                stock: data.stock || {},
              },
            ];

          const variantesActualizadas = variantesDB.map((v) => {
            if (item.variant && v.attr !== item.variant) return v;

            const nuevoStock = { ...v.stock };
            const sucursal = item.branch;

            if (!nuevoStock[sucursal])
              throw new Error(`Sin stock en ${sucursal}`);

            if (nuevoStock[sucursal] < item.qty)
              throw new Error(`Stock insuficiente en ${sucursal}`);

            nuevoStock[sucursal] -= item.qty;

            return { ...v, stock: nuevoStock };
          });

          transaction.update(ref, {
            variantes: variantesActualizadas,
          });
        }

        // 🔻 ACTUALIZAR CRÉDITO
        transaction.update(vendedorRef, {
          topeUsado: topeUsado + riesgo,
          mesCredito: mesActual,
        });

        // 🔻 REGISTRAR VENTA
        transaction.set(ventaRef, venta);
      });

      alert("✅ Venta registrada correctamente");
      clearCart();
      navigate(`/clientes/${clienteSeleccionado}`);
    } catch (err) {
      console.error("Error al confirmar venta:", err);
      alert(err.message || "Error al registrar la venta");
    }
  };

  /* ===============================
     RENDER
  =============================== */
  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <h1>🧾 Registrar Venta</h1>

        <input
          type="date"
          className={styles.input}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </header>


      {/* CLIENTE */}
      <div className={styles.card}>
        <h2>Cliente</h2>
        <input
          className={styles.input}
          placeholder="Buscar cliente"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className={styles.select}
          value={clienteSeleccionado}
          onChange={(e) => setClienteSeleccionado(e.target.value)}
        >
          <option value="">-- Seleccionar --</option>
          {clientesFiltrados.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre} - DNI {c.dni}
            </option>
          ))}
        </select>
      </div>

      {/* ENTREGA */}
      <div className={styles.card}>
        <h2>Entrega</h2>

        <div className={styles.checkboxGroup}>
          <label className={styles.checkbox}>
            <input
              type="radio"
              checked={tipoEntrega === "sucursal"}
              onChange={() => setTipoEntrega("sucursal")}
            />
            Retira en sucursal
          </label>

          <label className={styles.checkbox}>
            <input
              type="radio"
              checked={tipoEntrega === "envio"}
              onChange={() => setTipoEntrega("envio")}
            />
            Envío a domicilio
          </label>
        </div>

        {tipoEntrega === "envio" && (
          <select
            className={styles.select}
            value={choferId}
            onChange={(e) => setChoferId(e.target.value)}
          >
            <option value="">-- Chofer --</option>
            {choferes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* VENTA DE OTRO */}
      <div className={styles.card}>
        <h2>Vendedor</h2>

        <div className={styles.checkboxGroup}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={ventaDeOtro}
              onChange={(e) => setVentaDeOtro(e.target.checked)}
            />
            Venta de otro vendedor
          </label>
        </div>

        {ventaDeOtro && (
          <select
            className={styles.select}
            value={vendedorReal}
            onChange={(e) => setVendedorReal(e.target.value)}
          >
            <option value="">-- Vendedor --</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* PAGOS */}
      <div className={styles.card}>
        <h2>Pago</h2>

        <div className={styles.checkboxGroup}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={primerCuotaPaga}
              onChange={(e) => {
                setPrimerCuotaPaga(e.target.checked);
                setPagoParcial(false);
              }}
            />
            Pagó primera cuota
          </label>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={pagoParcial}
              onChange={(e) => {
                setPagoParcial(e.target.checked);
                setPrimerCuotaPaga(false);
              }}
            />
            Pago parcial
          </label>
        </div>

        {pagoParcial && (
          <input
            type="number"
            className={styles.input}
            placeholder="Monto abonado"
            value={montoPagoParcial}
            onChange={(e) => setMontoPagoParcial(e.target.value)}
          />
        )}

        <select
          className={styles.select}
          value={cuotas}
          onChange={(e) => setCuotas(Number(e.target.value))}
        >
          {cuotasOpciones.map(c => (
            <option key={c.cuotas} value={c.cuotas}>
              {c.cuotas} x ${c.valor.toLocaleString("es-AR")}
            </option>
          ))}
        </select>
      </div>

      <button className={styles.confirm} onClick={confirmarVenta}>
        Confirmar Venta (${total.toLocaleString("es-AR")})
      </button>
    </section>
  );
}
