import { useState, useMemo } from "react";
import styles from "../styles/ComboCard.module.css";
import { useCart } from "../context/CartContext";
import ProductCard from "./ProductCard";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export default function ComboCard({ combo, productos = [], onDeleteCombo }) {
  const { addToCart } = useCart();
  const [showSingles, setShowSingles] = useState(false);
  const [showCuotas, setShowCuotas] = useState(false);

  const configuracionCuotas = [
    { cuotas: 2, interes: 15 },
    { cuotas: 3, interes: 25 },
    { cuotas: 4, interes: 40 },
    { cuotas: 6, interes: 60 },
    { cuotas: 9, interes: 75 },
    { cuotas: 12, interes: 100 },
  ];

  const formatARS = (v) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(v || 0);

  const cuotas = useMemo(() => {
    if (!combo?.price) return [];
    const precio = combo.price;
    return configuracionCuotas
      .filter(({ cuotas }) => {
        if (precio < 30000) return cuotas <= 2;
        if (precio < 80000) return cuotas <= 3;
        if (precio < 150000) return cuotas <= 6;
        if (precio < 250000) return cuotas <= 9;
        return cuotas <= 12;
      })
      .map(({ cuotas, interes }) => {
        const monto = precio * (1 + interes / 100);
        const cuota = Math.ceil(monto / cuotas / 1000) * 1000;
        return `${cuotas} cuotas ${formatARS(cuota)}`;
      });
  }, [combo?.price]);

  const productosById = useMemo(() => {
    const map = {};
    if (Array.isArray(productos)) {
      productos.forEach((p) => {
        if (p?.id) map[p.id] = p;
      });
    }
    return map;
  }, [productos]);

  const items = useMemo(() => {
    if (!Array.isArray(combo?.items)) return [];
    return combo.items
      .map((i) => {
        const producto = productosById[i.productId];
        if (!producto) return null;
        const variantes = Array.isArray(producto.variantes)
          ? producto.variantes
          : [];
        const variant = variantes[0];
        if (!variant) return null;
        const stockObj =
          variant.stock && typeof variant.stock === "object" ? variant.stock : {};
        const branch = Object.keys(stockObj)[0] || "Los Andes 4034";
        const stockTotal = Object.values(stockObj).reduce(
          (sum, qty) => sum + (Number(qty) || 0),
          0
        );
        return {
          ...producto,
          variant: variant.attr,
          branch,
          qty: i.quantity || 1,
          stockTotal,
        };
      })
      .filter(Boolean);
  }, [combo, productosById]);

  const brokenItems = items.filter((p) => p.stockTotal <= 0);
  const isBroken = brokenItems.length > 0;

  const addComboToCart = () => {
    if (isBroken) return;
    addToCart({
      key: `combo-${combo.id}`,
      id: combo.id,
      categoriaId: combo.categoriaId,
      name: combo.name,
      price: combo.price,
      image: combo.image,
      qty: 1,
      type: "combo",
    });
  };

  const deleteCombo = async () => {
    if (!window.confirm("¿Seguro que querés eliminar este combo?")) return;
    try {
      const comboRef = doc(
        db,
        "categorias",
        combo.categoriaId,
        "productos",
        combo.id
      );
      await deleteDoc(comboRef);
      if (onDeleteCombo) onDeleteCombo(combo.id);
    } catch (err) {
      console.error("❌ Error al eliminar combo:", err);
    }
  };

  return (
    <article className={styles.card}>
      {combo.image ? (
        <img src={combo.image} alt={combo.name} />
      ) : (
        <div className={styles.noImage}>Sin imagen</div>
      )}
      <h3>{combo.name}</h3>
      <p className={styles.price}>{formatARS(combo.price)}</p>

      <button
        className={styles.toggleCuotas}
        onClick={() => setShowCuotas(!showCuotas)}
      >
        {showCuotas ? "Ocultar cuotas" : "Ver cuotas"}
      </button>

      {showCuotas && (
        <div className={styles.cuotasInline}>
          {cuotas.map((c, i) => (
            <span key={i} className={styles.cuota}>
              {c}
            </span>
          ))}
        </div>
      )}

      {isBroken && (
        <div className={styles.alertBroken}>
          ⚠ Algunos productos no tienen stock. El combo no puede venderse completo.
          <ul style={{ marginTop: 4 }}>
            {brokenItems.map((p) => (
              <li key={p.id}>❌ {p.name}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className={styles.includes}>
        {items.map((p) => (
          <li
            key={p.id}
            style={{ textDecoration: p.stockTotal <= 0 ? "line-through" : "none" }}
          >
            ✔ {p.name}
            <small className={styles.badge}>Stock: {p.stockTotal}</small>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button onClick={addComboToCart} disabled={isBroken}>
          Comprar combo
        </button>

        <button
          onClick={async () => {
            if (isBroken) return;
            try {
              const response = await fetch("/api/crear-preferencia", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: [
                    {
                      id: combo.id,
                      title: combo.name,
                      price: combo.price,
                      quantity: 1,
                      type: "combo",
                    },
                  ],
                }),
              });
              const data = await response.json();
              if (data.init_point) window.location.href = data.init_point;
            } catch (error) {
              console.error("Error procesando pago:", error);
              alert("Error al procesar el pago.");
            }
          }}
          disabled={isBroken}
          className={styles.mpButton}
        >
          Pagar con Mercado Pago
        </button>

        <button
          onClick={() => setShowSingles((v) => !v)}
          className={styles.title}
        >
          Comprar por separado
        </button>

        <button onClick={deleteCombo} className={styles.delete} title="Eliminar combo">
          <i className="bx bx-box" style={{ fontSize: 20 }}></i>
        </button>
      </div>

      {showSingles && (
        <div className={styles.overlay} onClick={() => setShowSingles(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h4>Comprar productos por separado</h4>
              <button onClick={() => setShowSingles(false)}>✕</button>
            </header>

            <div className={styles.modalContent}>
              {items.map((p) => (
                <ProductCard key={p.id} producto={p} fromCombo />
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
