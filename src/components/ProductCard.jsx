import { useState, useMemo } from "react";
import styles from "../styles/ProductCard.module.css";
import { useCart } from "../context/CartContext";
import { useParams } from "react-router-dom";
import {
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase/firebaseConfig";
import ImgCarrusel from "./ImgCarrusel";
import { SiMercadopago } from "react-icons/si";

export default function ProductCard({
  producto,
  onEdit,
  onDelete,
  fromCombo = false,
  userRole,
  initialVariant = 0,
}) {
  const [selectedVariant, setSelectedVariant] = useState(initialVariant);
  const [formatoCompra, setFormatoCompra] = useState("unidad");
  const [showCuotas, setShowCuotas] = useState(false);
  const [showCarrusel, setShowCarrusel] = useState(false);

  const [variantes, setVariantes] = useState(() =>
    producto?.variantes
      ? producto.variantes.map((v) => ({
        ...v,
        priceJuego: v.priceJuego ?? null,
        unidadesPorJuego: v.unidadesPorJuego ?? null,
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

  const variant = variantes[selectedVariant] ?? null;

  const precioUnidad = Number(variant?.price || 0);
  const precioJuego = Number(variant?.priceJuego || 0);
  const unidadesPorJuego = Number(variant?.unidadesPorJuego || 0);

  const tieneJuego = precioJuego > 0 && unidadesPorJuego > 1;

  const formatoActual =
    formatoCompra === "juego" && tieneJuego ? "juego" : "unidad";

  const unidadesNecesarias =
    formatoActual === "juego" ? unidadesPorJuego : 1;

  const precioSeleccionado =
    formatoActual === "juego" ? precioJuego : precioUnidad;

  const totalStock = Object.values(variant?.stock || {}).reduce(
    (a, b) => a + Number(b || 0),
    0
  );

  const juegosDisponibles = tieneJuego
    ? Math.floor(totalStock / unidadesPorJuego)
    : 0;

  const sucursalDisponible = Object.entries(variant?.stock || {}).find(
    ([, cantidad]) => Number(cantidad || 0) >= unidadesNecesarias
  )?.[0];

  const esJefe = userRole === "jefe";
  const esEncargado = userRole === "encargado";

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

  const formatARS = (valor) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(Math.ceil(Number(valor) / 1000) * 1000);

  const cuotas = useMemo(() => {
    if (!precioSeleccionado) return [];

    const precio = precioSeleccionado;

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
  }, [precioSeleccionado]);

  if (!producto || !variant) return null;

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
        formatoCompra: formatoActual,
        ...detail,
      },
      timestamp: serverTimestamp(),
    });
  };

  const getStockTotalVariante = (v) =>
    Object.values(v.stock || {}).reduce((a, b) => a + Number(b || 0), 0);

  const getItemUnits = (item) => {
    const units =
      item.unitsToDiscount ??
      item.unidadesNecesarias ??
      item.unidadesPorJuego ??
      1;

    return Number(item.qty || 1) * Number(units || 1);
  };

  const updateStock = async (sucursal, delta) => {
    if (!esJefe) return;

    const antes = Number(variant.stock?.[sucursal] ?? 0);
    const despues = Math.max(antes + delta, 0);

    if (antes === despues) return;

    const nuevasVariantes = variantes.map((v, i) =>
      i === selectedVariant
        ? { ...v, stock: { ...v.stock, [sucursal]: despues } }
        : v
    );

    setVariantes(nuevasVariantes);

    try {
      await updateDoc(
        doc(db, "categorias", categoriaId, "productos", producto.id),
        {
          variantes: nuevasVariantes,
        }
      );

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

  const handleVariantSelect = (index) => {
    const nuevaVariante = variantes[index];
    const nuevaTieneJuego =
      Number(nuevaVariante?.priceJuego || 0) > 0 &&
      Number(nuevaVariante?.unidadesPorJuego || 0) > 1;

    setSelectedVariant(index);

    if (!nuevaTieneJuego) {
      setFormatoCompra("unidad");
    }
  };

  const handleEdit = () => {
    onEdit?.({
      ...producto,
      variantes,
    });
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar ${producto.name}?`)) return;

    await sendNotification("eliminó producto", {
      tipo: "eliminado",
      producto: producto.name,
    });

    onDelete?.(producto.id);
  };

  const handleAddToCart = async (branch) => {
    if (!variant || precioSeleccionado <= 0) return;

    const stockSucursal = Number(variant.stock?.[branch] || 0);

    const cartUnitsForThisBranch = items
      .filter(
        (i) =>
          i.id === producto.id &&
          i.variant === variant.attr &&
          i.branch === branch
      )
      .reduce((a, i) => a + getItemUnits(i), 0);

    if (cartUnitsForThisBranch + unidadesNecesarias > stockSucursal) {
      return alert("❌ Ya no hay stock disponible en esta sucursal.");
    }

    addToCart({
      key: `${producto.id}-${variant.attr}-${formatoActual}-${branch}`,
      id: producto.id,
      categoriaId,
      name: producto.name,
      price: precioSeleccionado,
      image: variant.image || producto.image,
      qty: 1,
      variant: variant.attr,
      type: formatoActual === "juego" ? "juego" : "simple",
      formatoCompra: formatoActual,
      unidadesPorJuego: formatoActual === "juego" ? unidadesPorJuego : null,
      unitsToDiscount: unidadesNecesarias,
      fromCombo,
      comboId: producto.comboId ?? null,
      branch,
      stockFull: { ...variant.stock },
    });

    await sendNotification("agregó al carrito", {
      tipo: "carrito",
      sucursal: branch,
      precio: precioSeleccionado,
      unidades: unidadesNecesarias,
    });
  };

  const handleComprar = async () => {
    if (!sucursalDisponible) {
      alert("❌ No hay stock disponible para este formato.");
      return;
    }

    try {
      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: producto.id,
              title:
                formatoActual === "juego"
                  ? `${producto.name} - ${variant.attr} - Juego x${unidadesPorJuego}`
                  : `${producto.name} - ${variant.attr}`,
              price: precioSeleccionado,
              quantity: 1,
              variant: variant.attr,
              type: formatoActual,
              unidadesPorJuego:
                formatoActual === "juego" ? unidadesPorJuego : null,
              unitsToDiscount: unidadesNecesarias,
              branch: sucursalDisponible,
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

      const productUrl = `${window.location.origin}/producto/${categoriaId}/${producto.id}?v=${variantIndex}`;

      await navigator.clipboard.writeText(productUrl);

      const formatoTexto =
        formatoActual === "juego"
          ? `Juego x${unidadesPorJuego}`
          : "Por unidad";

      const mensaje = `Mirá este producto 👇
${producto.name} - ${variant.attr}
Formato: ${formatoTexto}
Precio: ${formatARS(precioSeleccionado)}
${productUrl}`;

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

      window.open(whatsappUrl, "_blank");
    } catch (error) {
      console.error("Error compartiendo:", error);
    }
  };

  const handleWhatsApp = () => {
    const formatoTexto =
      formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Por unidad";

    const mensaje = `Hola, quiero consultar por:
${producto.name} - ${variant.attr}
Formato: ${formatoTexto}
Precio: ${formatARS(precioSeleccionado)}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className={styles.productWrapper}>
      <article className={styles.productCard}>
        {(esJefe || esEncargado) && (
          <div className={styles.productActions}>
            <button className={styles.edit} onClick={handleEdit}>
              ✏️
            </button>
            {esJefe && (
              <button className={styles.delete} onClick={handleDelete}>
                🗑
              </button>
            )}
          </div>
        )}

        <figure className={styles.productFigure}>
          <img
            src={producto.image || variant.image || null}
            alt={producto.name}
            onClick={() => setShowCarrusel(true)}
            style={{ cursor: "zoom-in" }}
          />
          {producto.tag && <span className={styles.badge}>{producto.tag}</span>}
          {fromCombo && <span className={styles.badge}>De combo</span>}
        </figure>

        <div className={styles.info}>
          <div className={styles.headerInfo}>
            <h3>{producto.name}</h3>

            <div className={styles.priceBlock}>
              <p>
                <strong>{formatARS(precioUnidad)}</strong>
                <span>/ Unidad</span>
              </p>

              {tieneJuego && (
                <p>
                  <strong>{formatARS(precioJuego)}</strong>
                  <span>/ Juego x{unidadesPorJuego}</span>
                </p>
              )}
            </div>
          </div>

          <fieldset className={styles.options}>
            <legend>Paso 1: Elegí tu color / tapizado</legend>

            <div className={styles.variantGrid}>
              {variantes.map((v, i) => {
                const stockVariante = getStockTotalVariante(v);
                const agotada = stockVariante <= 0;
                const optionImage = v.image;

                return (
                  <label
                    key={i}
                    className={`
                      ${styles.variantOption}
                      ${selectedVariant === i ? styles.selected : ""}
                      ${agotada ? styles.disabled : ""}
                    `}
                  >
                    <input
                      type="radio"
                      checked={selectedVariant === i}
                      disabled={!esJefe && agotada}
                      onChange={() => handleVariantSelect(i)}
                    />

                    <span className={styles.variantCircle}>
                      {optionImage ? (
                        <img src={optionImage} alt={v.attr} />
                      ) : (
                        <span className={styles.variantFallback}></span>
                      )}

                      {agotada && (
                        <span className={styles.soldOutBadge}>Agotado</span>
                      )}
                    </span>

                    <span className={styles.variantText}>
                      <span className={styles.variantName}>{v.attr}</span>
                      <span className={styles.variantPrice}>
                        {formatARS(v.price)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.buyFormat}>
            <legend>Paso 2: Elegí tu formato de compra</legend>

            <div className={styles.buyFormatGrid}>
              <button
                type="button"
                className={`
                  ${styles.formatButton}
                  ${formatoActual === "unidad" ? styles.selectedFormat : ""}
                `}
                onClick={() => setFormatoCompra("unidad")}
                disabled={totalStock <= 0}
              >
                <span>{totalStock} disponibles</span>
                <strong>Por unidad</strong>
              </button>

              {tieneJuego && (
                <button
                  type="button"
                  className={`
                    ${styles.formatButton}
                    ${formatoActual === "juego" ? styles.selectedFormat : ""}
                  `}
                  onClick={() => setFormatoCompra("juego")}
                  disabled={juegosDisponibles <= 0}
                >
                  <span>{juegosDisponibles} juegos disponibles</span>
                  <strong>Juego x{unidadesPorJuego}</strong>
                </button>
              )}
            </div>
          </fieldset>

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

          <div className={styles.stock}>
            {Object.entries(variant.stock).map(([sucursal, cantidad]) => {
              const cantidadNumber = Number(cantidad || 0);
              const juegosSucursal = tieneJuego
                ? Math.floor(cantidadNumber / unidadesPorJuego)
                : 0;

              let clase = styles.ok;
              if (cantidadNumber <= 0) clase = styles.out;
              else if (cantidadNumber < unidadesNecesarias) clase = styles.low;

              return (
                <div key={sucursal} className={`${styles.branch} ${clase}`}>
                  <div className={styles.branchMeta}>
                    <span>🏬 {sucursal}</span>
                    <small>
                      {cantidadNumber} unidades
                      {tieneJuego && ` / ${juegosSucursal} juegos`}
                    </small>
                  </div>

                  <div className={styles.stockControls}>
                    {esJefe && (
                      <>
                        <button
                          disabled={cantidadNumber === 0}
                          onClick={() => updateStock(sucursal, -1)}
                        >
                          -
                        </button>
                        <strong>{cantidadNumber}</strong>
                        <button onClick={() => updateStock(sucursal, 1)}>
                          +
                        </button>
                      </>
                    )}

                    {!esJefe && <strong>{cantidadNumber}</strong>}

                    <button
                      className={styles.cartMini}
                      disabled={cantidadNumber < unidadesNecesarias}
                      onClick={() => handleAddToCart(sucursal)}
                    >
                      🛒
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.cardButtons}>
            <button className={styles.whatsapp} onClick={handleWhatsApp}>
              Pedir por WhatsApp
            </button>

            <button className={styles.share} onClick={handleShare}>
              Compartir
            </button>

            <button
              className={styles.mpButton}
              onClick={handleComprar}
              disabled={!sucursalDisponible || precioSeleccionado <= 0}
            >
              <SiMercadopago size={50} style={{ marginRight: "5px" }} />
              Pagar con Mercado Pago
            </button>
          </div>
        </div>
      </article>

      {showCarrusel && (
        <ImgCarrusel
          imagenes={[producto.image || variant.image].filter(Boolean)}
          indexInicial={0}
          onClose={() => setShowCarrusel(false)}
        />
      )}
    </div>
  );
}