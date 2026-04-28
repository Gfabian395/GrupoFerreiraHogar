import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/Carrito.module.css";
import { useCart } from "../context/CartContext";
import { SiMercadopago } from "react-icons/si";

export default function Carrito() {
  const { items, updateQty, removeItem } = useCart();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const total = items.reduce(
    (acc, item) => acc + item.price * item.qty,
    0
  );

  const totalItems = items.reduce(
    (acc, i) => acc + i.qty,
    0
  );

  const handlePagarCarrito = async () => {
    if (items.length === 0) return;

    try {
      setLoading(true);

      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.id,
            title: item.name,
            price: item.price,
            quantity: item.qty,
            variant: item.variant,
            branch: item.branch,
            categoriaId: item.categoriaId,
          })),
        }),
      });

      const data = await response.json();

      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert("Error iniciando pago");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error pagando carrito:", error);
      alert("Error procesando el pago");
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
            onClick={() => navigate("/ventas")}
          >
            Finalizar compra
          </button>
        </aside>
      </div>
    </section>
  );
}