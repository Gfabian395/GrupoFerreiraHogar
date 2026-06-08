import { useState, useMemo, useEffect } from "react";
import styles from "../styles/ProductCard.module.css";
import { useCart } from "../context/CartContext";
import { useParams, useSearchParams } from "react-router-dom";
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase/firebaseConfig";
import ImgCarrusel from "./ImgCarrusel";
import { SiMercadopago } from "react-icons/si";

export default function ProductCard({ producto, onEdit, onDelete, fromCombo = false, userRole, initialVariant = 0 }) {
  const [selectedVariant, setSelectedVariant] = useState(initialVariant);
  const [showCuotas, setShowCuotas] = useState(false);
  const [showCarrusel, setShowCarrusel] = useState(false);

  const [variantes, setVariantes] = useState(() =>
    producto?.variantes
      ? producto.variantes.map((v) => ({
        ...v,
        stock: {
          "Los Andes 4320": v.stock?.["Los Andes 4320"] ?? 0,
          "Los Andes 4034": v.stock?.["Los Andes 4034"] ?? 0,
          "Jofre 2440": v.stock?.["Jofre 2440"] ?? v.stock?.["Mosconi"] ?? 0,
        },
      }))
      : []
  );

  const { addToCart, items } = useCart();
  const { categoriaId } = useParams();

  const [searchParams] = useSearchParams();
  const productoSeleccionado = searchParams.get("producto");
  const varianteSeleccionada = searchParams.get("variante");

  if (!producto || !variantes.length) return null;

  const variant = variantes[selectedVariant];

  // ⚡️ Calcular totalStock después de declarar variant
  const totalStock = Object.values(variant.stock).reduce((a, b) => a + b, 0);

  const esJefe = userRole === "jefe";
  const esEncargado = userRole === "encargado";

  const sendNotification = async (action, detail = {}) => {
    const user = auth.currentUser;
    if (!user) return;

    const snap = await getDoc(doc(db, "usuarios", user.uid));
    const userName = snap.exists() ? snap.data().nombre : "Desconocido";

    await addDoc(collection(db, "notificaciones"), {
      userId: user.uid,
      userName,
      userEmail: user.email,
      action,
      detail: {
        tipo: detail.tipo,
        producto: producto.name,
        variante: variant.attr,
        ...detail,
      },
      timestamp: serverTimestamp(),
    });
  };

 const configuracionCuotas = [
  { cuotas: 2, interes: 15 },
  { cuotas: 3, interes: 25 },
  { cuotas: 4, interes: 40 },
  { cuotas: 6, interes: 60 },
  { cuotas: 9, interes: 75 },
  { cuotas: 12, interes: 100 },
];

const CUOTA_MINIMA = 80000;

const formatARS = (valor) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Math.ceil(Number(valor) / 1000) * 1000);

const cuotas = useMemo(() => {
  if (!variant?.price) return [];

  const precio = variant.price;

  return configuracionCuotas
    .map(({ cuotas, interes }) => {
      const monto = precio * (1 + interes / 100);
      const cuota = Math.ceil(monto / cuotas / 1000) * 1000;

      return {
        cuotas,
        cuota,
      };
    })
    .filter(({ cuota }) => cuota >= CUOTA_MINIMA)
    .map(
      ({ cuotas, cuota }) =>
        `${cuotas} cuotas ${formatARS(cuota)}`
    );
}, [variant?.price]);

  const updateStock = async (sucursal, delta) => {
    if (!esJefe) return;

    const antes = variant.stock?.[sucursal] ?? 0;
    const despues = Math.max(antes + delta, 0);

    if (antes === despues) return;

    const nuevasVariantes = variantes.map((v, i) =>
      i === selectedVariant ? { ...v, stock: { ...v.stock, [sucursal]: despues } } : v
    );

    setVariantes(nuevasVariantes);

    try {
      await updateDoc(doc(db, "categorias", categoriaId, "productos", producto.id), {
        variantes: nuevasVariantes,
      });

      await sendNotification("modificó stock", {
        tipo: "stock",
        sucursal,
        antes: Number(antes),
        despues: Number(despues),
      });
    } catch (err) {
      console.error("❌ Error actualizando stock:", err);
      alert("Error al guardar stock");
    }
  };

  const handleEdit = () => {
    onEdit?.(producto);
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar ${producto.name}?`)) return;
    await sendNotification("eliminó producto", { tipo: "eliminado", producto: producto.name });
    onDelete?.(producto.id);
  };

  const handleAddToCart = async (branch) => {
    if (!variant || variant.price <= 0) return;

    const cartQtyForThisProduct = items
      .filter((i) => i.id === producto.id && i.variant === variant.attr)
      .reduce((a, i) => a + i.qty, 0);

    if (cartQtyForThisProduct >= totalStock) return alert("❌ Ya no hay stock disponible.");

    addToCart({
      key: `${producto.id}-${variant.attr}-${branch}`,
      id: producto.id,
      categoriaId,
      name: producto.name,
      price: variant.price,
      image: variant.image || producto.image,
      qty: 1,
      variant: variant.attr,
      type: "simple",
      fromCombo,
      comboId: producto.comboId ?? null,
      branch,
      stockFull: { ...variant.stock },
    });

    await sendNotification("agregó al carrito", {
      tipo: "carrito",
      sucursal: branch,
      precio: variant.price,
    });
  };

  const handleComprar = async () => {
    try {
      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: producto.id,
              title: producto.name,
              price: variant.price,
              quantity: 1,
              variant: variant.attr,
              branch: Object.keys(variant.stock)[0], // o sucursal seleccionada
              categoriaId,
            },
          ],
        }),
      });

      const data = await response.json();

      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (error) {
      console.error("Error comprando:", error);
    }
  };

  const handleShare = async () => {
    try {
      const variantIndex = selectedVariant;

      const productUrl =
  `${window.location.origin}/producto/${categoriaId}/${producto.id}` +
  `?producto=${producto.id}&variante=${encodeURIComponent(variant.attr)}`;

      await navigator.clipboard.writeText(productUrl);

      const mensaje = `Mirá este producto 👇 ${producto.name} - ${variant.attr}
      Precio: $${variant.price.toLocaleString("es-AR")} ${productUrl}`;

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

      window.open(whatsappUrl, "_blank");
    } catch (error) {
      console.error("Error compartiendo:", error);
    }
  };

  useEffect(() => {
    if (!productoSeleccionado) return;

    setTimeout(() => {
      const el = document.getElementById(
        `producto-${productoSeleccionado}`
      );

      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 400);
  }, [productoSeleccionado]);

  useEffect(() => {
  if (!varianteSeleccionada || !variantes.length) return;

  const index = variantes.findIndex(
    (v) =>
      v.attr?.toLowerCase().trim() ===
      varianteSeleccionada.toLowerCase().trim()
  );

  if (index >= 0) {
    setSelectedVariant(index);
  }
}, [varianteSeleccionada, variantes]);

  return (
    <div
      id={`producto-${producto.id}`}
      className={`${styles.productWrapper} ${producto.id === productoSeleccionado
        ? styles.productoActivo
        : ""
        }`}
    >
      <article className={styles.productCard}>
        {(esJefe || esEncargado) && (
          <div className={styles.productActions}>
            <button className={styles.edit} onClick={handleEdit}>✏️</button>
            {esJefe && <button className={styles.delete} onClick={handleDelete}>🗑</button>}
          </div>
        )}

        <figure>
          <img
            src={variant.image || producto.image || null}
            alt={`${producto.name} - ${variant.attr}`}
            onClick={() => setShowCarrusel(true)}
            style={{ cursor: "zoom-in" }}
          />
          {producto.tag && <span className={styles.badge}>{producto.tag}</span>}
          {fromCombo && <span className={styles.badge}>De combo</span>}
        </figure>

        <div className={styles.info}>
          <h3>{producto.name}</h3>

          <fieldset className={styles.options}>
            <legend>Elegí tu versión</legend>
            {variantes.map((v, i) => (
              <label
                key={i}
                className={`${styles.variantOption} ${selectedVariant === i ? styles.selected : ""}`}
              >
                <input
                  type="radio"
                  checked={selectedVariant === i}
                  onChange={() => setSelectedVariant(i)}
                />
                <span className={styles.variantText}>
                  <span className={styles.variantName}>{v.attr}</span>
                  <span className={styles.variantPrice}>${v.price.toLocaleString("es-AR")}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <button className={styles.toggleCuotas} onClick={() => setShowCuotas(!showCuotas)}>
            {showCuotas ? "Ocultar cuotas" : "Ver cuotas"}
          </button>

          {showCuotas && (
            <div className={styles.cuotasInline}>
              {cuotas.map((c, i) => (
                <span key={i} className={styles.cuota}>{c}</span>
              ))}
            </div>
          )}

          <div className={styles.stock}>
            {Object.entries(variant.stock).map(([sucursal, cantidad]) => {
              let clase = styles.ok;
              if (cantidad <= 0) clase = styles.out;
              else if (cantidad < 3) clase = styles.low;

              return (
                <div key={sucursal} className={`${styles.branch} ${clase}`}>
                  <span>🏬 {sucursal}</span> 
                  <div className={styles.stockControls}>
                    {esJefe && (
                      <>
                        <button disabled={cantidad === 0} onClick={() => updateStock(sucursal, -1)}>-</button>
                        <strong>{cantidad}</strong>
                        <button onClick={() => updateStock(sucursal, 1)}>+</button>
                      </>
                    )}
                    {!esJefe && <strong>{cantidad}</strong>}
                    <button className={styles.cartMini} disabled={cantidad === 0} onClick={() => handleAddToCart(sucursal)}>🛒</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.cardButtons}>
            <button className={styles.whatsapp}>Pedir por WhatsApp</button>
            <button className={styles.share} onClick={handleShare}>
              Compartir
            </button>
            <button
              className={styles.mpButton}
              onClick={handleComprar}
              disabled={totalStock === 0}
            >
              <SiMercadopago size={50} style={{ marginRight: "5px" }} />
              Pagar con Mercado Pago
            </button>

          </div>
        </div>
      </article>

      {showCarrusel && (
        <ImgCarrusel
          imagenes={[variant.image || producto.image].filter(Boolean)}
          indexInicial={0}
          onClose={() => setShowCarrusel(false)}
        />
      )}
    </div>
  );
}
