import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/Carrito.module.css";
import { useCart } from "../context/CartContext";
import { SiMercadopago } from "react-icons/si";

export default function Carrito() {
  const { items, updateQty, removeItem } = useCart();
  const [loading, setLoading] = useState(false);
  const [descuento, setDescuento] = useState(""); // <-- ESTADO PARA DESCUENTO
  const navigate = useNavigate();

  const totalItems = items.reduce(
    (acc, i) => acc + i.qty,
    0
  );

  // Subtotal original (sin descuentos)
  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.qty,
    0
  );

  // Descuento a aplicar y total final (evitando que dé negativo)
  const descuentoAplicado = Number(descuento) || 0;
  const total = Math.max(0, subtotal - descuentoAplicado);

  const handlePagarCarrito = async () => {
    if (items.length === 0) return;

    // Validación MP: No permite cobros de $0
    if (total <= 0) {
      alert("El total es $0. Mercado Pago no permite pagos gratuitos. Usá 'Finalizar compra' para registrarlo en el sistema.");
      return;
    }

    try {
      setLoading(true);

      // Factor para repartir el descuento entre los productos. 
      // Ej: Si subtotal es 10.000 y total es 8.000, el factor es 0.8 (pagás el 80%)
      const factorDescuento = subtotal > 0 ? (total / subtotal) : 1;

      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.id,
            title: item.name,
            // CLAVE PARA MERCADO PAGO: Aplicamos el factor y usamos Math.round() 
            // para enviar números enteros exactos. Cero decimales.
            price: Math.round(item.price * factorDescuento),
            quantity: item.qty,
            variant: item.variant,
            branch: item.branch,
            categoriaId: item.categoriaId,
          })),
        }),
      });

      // Leemos como texto primero para evitar que React crashee si el backend falla
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(responseText || `Error HTTP: ${response.status}`);
      }

      // Parseamos seguro
      const data = JSON.parse(responseText);

      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert("Error: El backend no devolvió el init_point de Mercado Pago");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error pagando carrito:", error);
      alert("Error contactando al servidor. Revisá la consola.");
      setLoading(false);
    }
  };

  return (
    <section className={styles.cart}>
      <h1 className={styles.title}>🛒 Tu carrito</h1>

      <div className={styles.layout}>
        <div className={styles.items}>
          {items.length === 0 ? (
            <p className={styles.empty}>El carrito está vacío</p>
          ) : (
            items.map((item) => {
              const totalStock = Object.values(item.stockFull).reduce(
                (a, b) => a + b,
                0
              );

              return (
                <article key={item.key} className={styles.card}>
                  <img src={item.image} alt={item.name} />

                  <div className={styles.info}>
                    <h3>{item.name}</h3>

                    {item.variant && (
                      <small className={styles.variant}>
                        {item.variant}
                      </small>
                    )}

                    {item.fromCombo && (
                      <small className={styles.comboTag}>Combo</small>
                    )}

                    <span className={styles.price}>
                      ${item.price.toLocaleString("es-AR")}
                    </span>

                    <div className={styles.qty}>
                      <button onClick={() => updateQty(item.key, -1)}>−</button>
                      <span>{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.key, 1)}
                        disabled={item.qty >= totalStock}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    className={styles.remove}
                    onClick={() => removeItem(item.key)}
                  >
                    ✕
                  </button>
                </article>
              );
            })
          )}
        </div>

        {/* ================= RESUMEN ================= */}
        <aside className={styles.summary}>
          <h2>Resumen</h2>

          <div className={styles.row}>
            <span>Productos</span>
            <span>{totalItems}</span>
          </div>

          <div className={styles.row}>
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString("es-AR")}</span>
          </div>

          <div className={styles.row}>
            <span>Descuento ($)</span>
            <input 
              type="number" 
              min="0"
              className={styles.input} 
              style={{ width: "90px", padding: "4px", textAlign: "right" }}
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className={styles.row}>
            <span>Total</span>
            <strong>${total.toLocaleString("es-AR")}</strong>
          </div>

          {/* BOTÓN MERCADO PAGO */}
          <button
            className={styles.mpButton}
            disabled={items.length === 0 || loading}
            onClick={handlePagarCarrito}
          >
            <SiMercadopago className={styles.mpIcon} />
            {loading ? "Redirigiendo..." : "Pagar con Mercado Pago"}
          </button>

          {/* BOTÓN FINALIZAR COMPRA INTERNA */}
          <button
            className={styles.checkout}
            disabled={items.length === 0}
            // Navegamos pasando el descuento por state
            onClick={() => navigate("/ventas", { state: { descuentoPreCargado: descuento } })}
          >
            Finalizar compra
          </button>
        </aside>
      </div>
    </section>
  );
}