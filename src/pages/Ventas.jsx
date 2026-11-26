import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { normalizarClasificacion } from "../pages/Clientes";
import styles from "../styles/Ventas.module.css";

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

const obtenerQuincenaPorFecha = (fechaStr) => {
  if (!fechaStr) return "primera";
  const partes = String(fechaStr).split("-");
  const dia = partes.length === 3 ? Number(partes[2]) : new Date(fechaStr).getDate();
  return dia <= 15 ? "primera" : "segunda";
};

export default function Ventas() {
  const navigate = useNavigate();
  const location = useLocation();
  const { items, clearCart } = useCart();

  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [quincenaPago, setQuincenaPago] = useState(() =>
    obtenerQuincenaPorFecha(new Date().toISOString().split("T")[0])
  );

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

  const [descuento, setDescuento] = useState(
    location.state?.descuentoPreCargado || ""
  );
  const [primerCuotaPaga, setPrimerCuotaPaga] = useState(false);
  const [pagoParcial, setPagoParcial] = useState(false);
  const [montoPagoParcial, setMontoPagoParcial] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const clientesSnap = await getDocs(collection(db, "clientes"));
      setClientes(
        clientesSnap.docs.map((d) => {
          const raw = d.data();
          return {
            id: d.id,
            ...raw,
            clasificacion: normalizarClasificacion(raw.clasificacion),
          };
        })
      );

      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      setUsuarios(usuariosSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) setUsuarioActual(snap.data());
      }
    };
    fetchData();
  }, []);

  const clientesFiltrados = useMemo(
    () =>
      clientes.filter((c) =>
        `${c.nombre || ""} ${c.dni || ""}`
          .toLowerCase()
          .includes(busqueda.toLowerCase())
      ),
    [clientes, busqueda]
  );

  const choferes = useMemo(
    () => usuarios.filter((u) => u.activo && u.roles?.chofer),
    [usuarios]
  );

  const vendedores = useMemo(
    () => usuarios.filter((u) => u.activo && u.roles?.vendedor),
    [usuarios]
  );

  const subtotal = items.reduce(
    (acc, i) => acc + Number(i.price || 0) * Number(i.qty || 1),
    0
  );
  const descuentoAplicado = Number(descuento) || 0;
  const total = Math.max(0, subtotal - descuentoAplicado);

  const montoParcialNum = Number(montoPagoParcial) || 0;
  const saldoBase = Math.max(
    0,
    total - (pagoParcial ? montoParcialNum : 0)
  );

  const cuotasOpciones = useMemo(() => {
    if (!saldoBase) return [{ cuotas: 1, valor: 0 }];

    const monto = saldoBase;
    const cuotasFiltradas = configuracionCuotas.filter(({ cuotas: c }) => {
      if (monto < 30000) return c <= 2;
      if (monto < 80000) return c <= 3;
      if (monto < 150000) return c <= 6;
      if (monto < 250000) return c <= 9;
      if (monto < 350000) return c <= 12;
      if (monto < 500000) return c <= 18;
      return true;
    });

    return [{ cuotas: 1, valor: monto }].concat(
      cuotasFiltradas.map(({ cuotas: c, interes }) => {
        const conInteres = monto * (1 + interes / 100);
        return {
          cuotas: c,
          valor: redondearMil(conInteres / c),
        };
      })
    );
  }, [saldoBase]);

  const valorCuota =
    cuotasOpciones.find((c) => c.cuotas === cuotas)?.valor || 0;

  const montoPagado = primerCuotaPaga
    ? valorCuota
    : pagoParcial
    ? montoParcialNum
    : 0;

  const saldoFinanciado = Math.max(total - montoPagado, 0);

  const confirmarVenta = async () => {
    if (!clienteSeleccionado) return alert("Seleccioná un cliente");
    if (!items.length) return alert("El carrito está vacío");
    if (tipoEntrega === "envio" && !choferId)
      return alert("Seleccioná un chofer");
    if (ventaDeOtro && !vendedorReal)
      return alert("Seleccioná el vendedor real");
    if (!auth.currentUser) return alert("Usuario no autenticado");

    const clienteObj = clientes.find((c) => c.id === clienteSeleccionado);
    const ventaRef = doc(collection(db, "ventas"));
    const clienteRef = doc(db, "clientes", clienteSeleccionado);

    const venta = {
      id: ventaRef.id,
      fecha,
      quincenaPago,
      clienteId: clienteSeleccionado,
      clienteClasificacion: normalizarClasificacion(clienteObj?.clasificacion),
      productos: items,
      subtotal,
      descuento: descuentoAplicado,
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
      vendedorReal: ventaDeOtro ? vendedorReal : auth.currentUser.uid,
      cargadoPor: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    };

    try {
      await runTransaction(db, async (transaction) => {
        const productosLeidos = [];

        for (const item of items) {
          if (item.type === "combo") {
            const comboRef = doc(
              db,
              "categorias",
              item.categoriaId,
              "productos",
              item.id
            );
            const comboSnap = await transaction.get(comboRef);
            if (!comboSnap.exists()) {
              throw new Error("Combo inexistente en la base de datos");
            }

            const seleccionesCarrito = item.comboItems || [];
            if (!seleccionesCarrito.length) {
              throw new Error(
                `El combo ${item.name} no tiene productos válidos en el carrito.`
              );
            }

            for (const cartComboItem of seleccionesCarrito) {
              const productoRef = doc(
                db,
                "categorias",
                cartComboItem.categoriaId,
                "productos",
                cartComboItem.productId
              );
              const snap = await transaction.get(productoRef);
              if (!snap.exists()) {
                throw new Error(
                  `Producto ${cartComboItem.name} del combo no existe`
                );
              }

              productosLeidos.push({
                item: {
                  ...cartComboItem,
                  qty:
                    (cartComboItem.unitsToDiscount ||
                      cartComboItem.quantity ||
                      1) * item.qty,
                },
                ref: productoRef,
                data: snap.data(),
              });
            }
          } else {
            const productoRef = doc(
              db,
              "categorias",
              item.categoriaId,
              "productos",
              item.id
            );
            const snap = await transaction.get(productoRef);
            if (!snap.exists()) {
              throw new Error(
                `El producto ${item.name} ya no existe en la base de datos`
              );
            }

            productosLeidos.push({
              item,
              ref: productoRef,
              data: snap.data(),
            });
          }
        }

        const vendedorId = ventaDeOtro ? vendedorReal : auth.currentUser.uid;
        const vendedorRef = doc(db, "usuarios", vendedorId);
        const vendedorSnap = await transaction.get(vendedorRef);

        if (!vendedorSnap.exists()) {
          throw new Error("Vendedor no encontrado");
        }

        const clienteSnap = await transaction.get(clienteRef);

        const vendedorData = vendedorSnap.data();
        const topeTotal = 5000000;
        const mesActual = new Date().toISOString().slice(0, 7);

        let topeUsado = vendedorData.topeUsado || 0;
        const mesCredito = vendedorData.mesCredito || null;

        if (mesCredito !== mesActual) {
          topeUsado = 0;
        }

        const costoTotal = productosLeidos.reduce((acc, p) => {
          const qty = Number(p.item.qty || 0);
          const costo = Number(p.data.purchasePrice || 0);
          return acc + costo * qty;
        }, 0);

        let riesgo = 0;
        if (primerCuotaPaga) {
          riesgo = 0;
        } else if (pagoParcial) {
          riesgo = saldoFinanciado;
        } else {
          riesgo = costoTotal;
        }

        const disponible = topeTotal - topeUsado;
        if (riesgo > disponible) {
          throw new Error(
            "El vendedor no tiene crédito disponible suficiente"
          );
        }

        for (const { item, ref, data } of productosLeidos) {
          const variantesDB = Array.isArray(data.variantes)
            ? data.variantes
            : [{ attr: "default", stock: data.stock || {} }];

          const variantesActualizadas = variantesDB.map((v) => {
            const attrDb = String(v.attr || "").trim();
            const attrItem = String(item.variant || "").trim();

            if (item.variant) {
              const coincideAttr = attrDb === attrItem;
              const coincideModelo =
                String(v.modelo || "").trim() === attrItem;
              if (!coincideAttr && !coincideModelo) return v;
            }

            const nuevoStock = { ...v.stock };
            const sucursal = item.branch;

            if (!sucursal) {
              throw new Error(
                `El producto "${item.name}" no tiene una sucursal asignada.`
              );
            }
            if (nuevoStock[sucursal] === undefined) {
              throw new Error(
                `La sucursal "${sucursal}" no está cargada en el producto "${item.name}".`
              );
            }

            const stockActual = Number(nuevoStock[sucursal] || 0);
            const cantidadPedida = Number(item.qty || 0);

            if (stockActual < cantidadPedida) {
              throw new Error(
                `Stock insuficiente de "${item.name}" en la sucursal "${sucursal}". Pedidos: ${cantidadPedida}, Disponibles: ${stockActual}`
              );
            }

            nuevoStock[sucursal] = stockActual - cantidadPedida;
            return { ...v, stock: nuevoStock };
          });

          transaction.update(ref, { variantes: variantesActualizadas });
        }

        transaction.update(vendedorRef, {
          topeUsado: topeUsado + riesgo,
          mesCredito: mesActual,
        });

        // Asegura que el cliente tenga 'sin clasificar' si no tenía clasificación previa
        if (clienteSnap.exists()) {
          const datosCliente = clienteSnap.data();
          if (!datosCliente.clasificacion) {
            transaction.update(clienteRef, {
              clasificacion: "sin clasificar",
              quincenaPago,
            });
          }
        }

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

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <h1>🧾 Registrar Venta</h1>

        <input
          type="date"
          className={styles.input}
          value={fecha}
          onChange={(e) => {
            const nuevaFecha = e.target.value;
            setFecha(nuevaFecha);
            setQuincenaPago(obtenerQuincenaPorFecha(nuevaFecha));
          }}
        />
      </header>

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
          onChange={(e) => {
            const idSel = e.target.value;
            setClienteSeleccionado(idSel);
            const cli = clientes.find((c) => c.id === idSel);
            if (cli?.quincenaPago) {
              setQuincenaPago(cli.quincenaPago);
            }
          }}
        >
          <option value="">-- Seleccionar --</option>
          {clientesFiltrados.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} DNI {c.dni} ({normalizarClasificacion(c.clasificacion).toUpperCase()})
            </option>
          ))}
        </select>

        <div style={{ marginTop: "12px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            Quincena habitual de cobro:
          </label>
          <select
            className={styles.select}
            value={quincenaPago}
            onChange={(e) => setQuincenaPago(e.target.value)}
          >
            <option value="primera">1ra Quincena (1 - 15)</option>
            <option value="segunda">2da Quincena (15 - 30/31)</option>
          </select>
        </div>
      </div>

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
            {choferes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

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
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={styles.card}>
        <h2>Resumen</h2>

        <div style={{ marginBottom: "15px" }}>
          <strong>Subtotal: </strong> ${subtotal.toLocaleString("es-AR")}
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px" }}>
            Descuento ($ ARS):
          </label>
          <input
            type="number"
            min="0"
            className={styles.input}
            placeholder="0"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
          />
        </div>

        <div style={{ fontSize: "1.2em" }}>
          <strong>Total final: </strong> ${total.toLocaleString("es-AR")}
        </div>
      </div>

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
          {cuotasOpciones.map((c) => (
            <option key={c.cuotas} value={c.cuotas}>
              {c.cuotas} x ${c.valor.toLocaleString("es-AR")}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className={styles.confirm}
        onClick={confirmarVenta}
      >
        Confirmar Venta (${total.toLocaleString("es-AR")})
      </button>
    </section>
  );
}