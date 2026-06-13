import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../styles/ComboCard.module.css";
import { useCart } from "../context/CartContext";
import ProductCard from "./ProductCard";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const configuracionCuotas = [
  { cuotas: 2, interes: 15 },
  { cuotas: 3, interes: 25 },
  { cuotas: 4, interes: 40 },
  { cuotas: 6, interes: 60 },
  { cuotas: 9, interes: 75 },
  { cuotas: 12, interes: 100 },
];

const formatARS = (valor) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Math.ceil(Number(valor || 0) / 1000) * 1000);

const getStockObj = (variant) =>
  variant?.stock && typeof variant.stock === "object" ? variant.stock : {};

const getStockTotal = (variant) =>
  Object.values(getStockObj(variant)).reduce(
    (sum, qty) => sum + Number(qty || 0),
    0
  );

const getCartItemUnits = (item) => {
  const units =
    item.unitsToDiscount ??
    item.unidadesNecesarias ??
    item.unidadesPorJuego ??
    1;

  return Number(item.qty || 1) * Number(units || 1);
};

const adminActionsStyle = {
  position: "absolute",
  top: "9px",
  right: "9px",
  zIndex: 20,
  display: "flex",
  gap: "6px",
};

const adminButtonStyle = {
  width: "26px",
  height: "26px",
  border: "1px solid rgba(255, 255, 255, 0.16)",
  borderRadius: "999px",
  background: "rgba(18, 22, 28, 0.72)",
  color: "#fff",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  fontSize: "0.72rem",
  boxShadow:
    "0 6px 12px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
};

export default function ComboCard({
  combo,
  productos = [],
  onEditCombo,
  onEdit,
  onDeleteCombo,
  onDelete,
  userRole,
}) {
  const { addToCart, items: cartItems = [] } = useCart();

  const [showSingles, setShowSingles] = useState(false);
  const [showCuotas, setShowCuotas] = useState(false);
  const [comboQty, setComboQty] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState({});

  const esJefe = userRole === "jefe";
  const esEncargado = userRole === "encargado";

  const editHandler = onEditCombo || onEdit;
  const deleteHandler = onDeleteCombo || onDelete;

  const puedeEditar = esJefe || esEncargado;
  const puedeEliminar = esJefe;

  const comboUnitPrice = Number(combo?.price || 0);
  const comboTotal = comboUnitPrice * comboQty;

  const productosById = useMemo(() => {
  const map = {};

  if (Array.isArray(productos)) {
    productos.forEach((producto) => {
      if (producto?.id) map[producto.id] = producto;
    });
  }

  return map;
}, [productos]);

  const comboProducts = useMemo(() => {
    if (!Array.isArray(combo?.items)) return [];

    return combo.items
      .map((item, index) => {
        const product = productosById[item.productId];
        if (!product) return null;

        const variants = Array.isArray(product.variantes)
          ? product.variantes
          : [];

        return {
          product,
          productId: item.productId,
          requiredQty: Number(
            item.quantity ?? item.qty ?? item.requiredQty ?? 1
          ),
          variants,
          order: index,
        };
      })
      .filter(Boolean);
  }, [combo?.items, productosById]);

  useEffect(() => {
    setSelectedVariants((prev) => {
      let next = prev;
      let changed = false;

      comboProducts.forEach((item) => {
        if (next[item.productId] !== undefined) return;

        const firstAvailableIndex = item.variants.findIndex(
          (variant) => getStockTotal(variant) >= item.requiredQty
        );

        if (!changed) {
          next = { ...prev };
          changed = true;
        }

        next[item.productId] =
          firstAvailableIndex >= 0 ? firstAvailableIndex : 0;
      });

      return changed ? next : prev;
    });
  }, [comboProducts]);

  const getCartUnitsFor = useCallback(
    (productId, variantName, branch) => {
      return cartItems.reduce((total, item) => {
        let units = 0;

        if (Array.isArray(item.comboItems)) {
          units += item.comboItems.reduce((sum, comboItem) => {
            const sameProduct = comboItem.productId === productId;
            const sameVariant = comboItem.variant === variantName;
            const sameBranch = comboItem.branch === branch;

            if (!sameProduct || !sameVariant || !sameBranch) return sum;

            const unitsPerCombo =
              comboItem.unitsToDiscount ?? comboItem.quantity ?? 1;

            return sum + Number(item.qty || 1) * Number(unitsPerCombo || 1);
          }, 0);
        }

        const sameSimpleProduct =
          item.id === productId || item.productId === productId;
        const sameSimpleVariant = item.variant === variantName;
        const sameSimpleBranch = item.branch === branch;

        if (sameSimpleProduct && sameSimpleVariant && sameSimpleBranch) {
          units += getCartItemUnits(item);
        }

        return total + units;
      }, 0);
    },
    [cartItems]
  );

  const getAvailabilityForVariant = useCallback(
    (productId, variant, requiredQty) => {
      const stockObj = getStockObj(variant);
      const variantName = variant?.attr;

      let best = {
        branch: null,
        availableUnits: 0,
        availableCombos: 0,
      };

      Object.entries(stockObj).forEach(([branch, stockQty]) => {
        const reservedUnits = getCartUnitsFor(productId, variantName, branch);
        const availableUnits = Math.max(
          Number(stockQty || 0) - reservedUnits,
          0
        );

        const availableCombos = Math.floor(
          availableUnits / Number(requiredQty || 1)
        );

        if (availableCombos > best.availableCombos) {
          best = {
            branch,
            availableUnits,
            availableCombos,
          };
        }
      });

      return best;
    },
    [getCartUnitsFor]
  );

  const selectedComponents = useMemo(() => {
    return comboProducts.map((item) => {
      const selectedIndex = Number(selectedVariants[item.productId] ?? 0);
      const safeIndex =
        selectedIndex >= 0 && selectedIndex < item.variants.length
          ? selectedIndex
          : 0;

      const variant = item.variants[safeIndex] ?? null;
      const variantName = variant?.attr ?? "Sin variante";

      const availability = variant
        ? getAvailabilityForVariant(item.productId, variant, item.requiredQty)
        : {
            branch: null,
            availableUnits: 0,
            availableCombos: 0,
          };

      return {
        ...item,
        variant,
        variantIndex: safeIndex,
        variantName,
        stockTotal: getStockTotal(variant),
        branch: availability.branch,
        availableUnits: availability.availableUnits,
        availableCombos: availability.availableCombos,
        image: variant?.image || item.product.image || combo?.image,
      };
    });
  }, [
    comboProducts,
    selectedVariants,
    getAvailabilityForVariant,
    combo?.image,
  ]);

  const availableCombos = useMemo(() => {
    if (!selectedComponents.length) return 0;

    return Math.min(
      ...selectedComponents.map((component) => component.availableCombos)
    );
  }, [selectedComponents]);

  useEffect(() => {
    if (availableCombos <= 0) {
      setComboQty(1);
      return;
    }

    if (comboQty > availableCombos) {
      setComboQty(availableCombos);
    }
  }, [availableCombos, comboQty]);

  const isBroken =
    !comboUnitPrice ||
    !selectedComponents.length ||
    selectedComponents.some(
      (component) => !component.variant || component.availableCombos <= 0
    );

  const brokenItems = selectedComponents.filter(
    (component) => !component.variant || component.availableCombos <= 0
  );

  const cuotas = useMemo(() => {
    if (!comboTotal) return [];

    return configuracionCuotas
      .filter(({ cuotas }) => {
        if (comboTotal < 30000) return cuotas <= 2;
        if (comboTotal < 80000) return cuotas <= 3;
        if (comboTotal < 150000) return cuotas <= 6;
        if (comboTotal < 250000) return cuotas <= 9;
        return cuotas <= 12;
      })
      .map(({ cuotas, interes }) => {
        const monto = comboTotal * (1 + interes / 100);
        const cuota = Math.ceil(monto / cuotas / 1000) * 1000;
        return `${cuotas} cuotas ${formatARS(cuota)}`;
      });
  }, [comboTotal]);

  const selectionSummary = useMemo(() => {
    return selectedComponents
      .map((component) => {
        const qtyText =
          component.requiredQty > 1 ? `${component.requiredQty} ` : "";

        return `${qtyText}${component.product.name} ${component.variantName}`;
      })
      .join(" + ");
  }, [selectedComponents]);

  const handleEditCombo = () => {
    if (!editHandler) {
      alert("No hay una función de edición conectada para este combo.");
      return;
    }

    editHandler({
      ...combo,
      type: "combo",
      isCombo: true,
      items: Array.isArray(combo?.items) ? combo.items : [],
    });
  };

  const handleVariantSelect = (productId, variantIndex) => {
    setSelectedVariants((prev) => ({
      ...prev,
      [productId]: variantIndex,
    }));

    setComboQty(1);
  };

  const buildComboItems = () => {
    return selectedComponents.map((component) => ({
      productId: component.product.id,
      categoriaId: component.product.categoriaId ?? combo.categoriaId,
      name: component.product.name,
      variant: component.variantName,
      variantIndex: component.variantIndex,
      quantity: component.requiredQty,
      unitsToDiscount: component.requiredQty,
      totalUnitsToDiscount: component.requiredQty * comboQty,
      branch: component.branch,
      image: component.image,
      price: Number(component.variant?.price || 0),
      stockFull: { ...getStockObj(component.variant) },
    }));
  };

  const addComboToCart = () => {
    if (isBroken) return;

    const comboItems = buildComboItems();

    addToCart({
      key: `combo-${combo.id}-${comboItems
        .map((item) => `${item.productId}-${item.variant}-${item.branch}`)
        .join("|")}`,
      id: combo.id,
      comboId: combo.id,
      categoriaId: combo.categoriaId,
      name: `${combo.name} - ${selectionSummary}`,
      price: comboUnitPrice,
      image: combo.image || selectedComponents[0]?.image,
      qty: comboQty,
      type: "combo",
      comboItems,
    });
  };

  const handleMercadoPago = async () => {
    if (isBroken) return;

    try {
      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: combo.id,
              title: `${combo.name} - ${selectionSummary}`,
              price: comboUnitPrice,
              quantity: comboQty,
              type: "combo",
              categoriaId: combo.categoriaId,
              comboItems: buildComboItems(),
            },
          ],
        }),
      });

      const data = await response.json();

      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (error) {
      console.error("Error procesando pago:", error);
      alert("Error al procesar el pago.");
    }
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

      deleteHandler?.(combo.id);
    } catch (err) {
      console.error("❌ Error al eliminar combo:", err);
      alert("Error al eliminar el combo.");
    }
  };

  return (
    <article className={styles.card}>
      {(puedeEditar || puedeEliminar) && (
        <div style={adminActionsStyle}>
          {puedeEditar && (
            <button
              type="button"
              style={adminButtonStyle}
              onClick={handleEditCombo}
              title="Editar combo"
            >
              ✏️
            </button>
          )}

          {puedeEliminar && (
            <button
              type="button"
              style={{
                ...adminButtonStyle,
                background: "rgba(120, 24, 36, 0.82)",
              }}
              onClick={deleteCombo}
              title="Eliminar combo"
            >
              🗑
            </button>
          )}
        </div>
      )}

      <div className={styles.browserBar}>
        <div className={styles.browserDots}>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div className={styles.addressBar}>tu-tienda.com</div>
      </div>

      <section className={styles.hero}>
        {combo.image || selectedComponents[0]?.image ? (
          <img
            src={combo.image || selectedComponents[0]?.image}
            alt={combo.name}
            className={styles.heroImage}
          />
        ) : (
          <div className={styles.noImage}>Sin imagen</div>
        )}

        <div className={styles.heroPrice}>
          <span>PRECIO DEL COMBO:</span>
          <strong>{formatARS(comboUnitPrice)}</strong>
        </div>
      </section>

      <div className={styles.content}>
        <h3 className={styles.comboName}>{combo.name}</h3>

        {selectedComponents.map((component, stepIndex) => (
          <section key={component.productId} className={styles.step}>
            <header className={styles.stepHeader}>
              <h4>
                Paso {stepIndex + 1}: Elegí tu Variante de{" "}
                {component.product.name}
              </h4>
              <p>
                requiere {component.requiredQty}{" "}
                {component.requiredQty === 1 ? "unidad" : "unidades"}
              </p>
            </header>

            <div className={styles.variantGrid}>
              {component.variants.map((variant, variantIndex) => {
                const stockTotal = getStockTotal(variant);
                const availability = getAvailabilityForVariant(
                  component.productId,
                  variant,
                  component.requiredQty
                );

                const selected = component.variantIndex === variantIndex;
                const noStock = stockTotal <= 0;
                const noComboStock = availability.availableCombos <= 0;
                const disabled = !esJefe && noComboStock;

                let meta = `Stock: ${stockTotal}`;

                if (noStock) {
                  meta = "AGOTADO";
                } else if (noComboStock) {
                  meta = `SIN STOCK PARA COMBO (${stockTotal} dispo.)`;
                }

                return (
                  <button
                    type="button"
                    key={`${component.productId}-${variantIndex}`}
                    className={`
                      ${styles.variantOption}
                      ${selected ? styles.selected : ""}
                      ${disabled ? styles.disabled : ""}
                    `}
                    disabled={disabled}
                    onClick={() =>
                      handleVariantSelect(component.productId, variantIndex)
                    }
                  >
                    <span className={styles.swatch}>
                      {variant.image ? (
                        <img src={variant.image} alt={variant.attr} />
                      ) : (
                        <span className={styles.swatchFallback}></span>
                      )}

                      {noComboStock && <span className={styles.cross}></span>}
                    </span>

                    <strong>{variant.attr}</strong>
                    <small>{meta}</small>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {isBroken && (
          <div className={styles.alertBroken}>
            <strong>⚠ Este combo no se puede vender así.</strong>

            <ul>
              {brokenItems.map((item) => (
                <li key={item.productId}>
                  {item.product.name} - {item.variantName}: requiere{" "}
                  {item.requiredQty}, stock insuficiente.
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.summary}>
          <strong>Selección actual:</strong>
          <span>{selectionSummary || "Sin selección"}</span>
        </div>

        <div className={styles.qtyBox}>
          <div>
            <strong>Combos a sumar</strong>
            <small>
              {availableCombos > 0
                ? `${availableCombos} combo${
                    availableCombos === 1 ? "" : "s"
                  } disponible${availableCombos === 1 ? "" : "s"}`
                : "Sin combos disponibles"}
            </small>
          </div>

          <div className={styles.qtyControls}>
            <button
              type="button"
              disabled={comboQty <= 1}
              onClick={() => setComboQty((q) => Math.max(q - 1, 1))}
            >
              -
            </button>

            <strong>{comboQty}</strong>

            <button
              type="button"
              disabled={comboQty >= availableCombos}
              onClick={() =>
                setComboQty((q) => Math.min(q + 1, availableCombos))
              }
            >
              +
            </button>
          </div>
        </div>

        {comboQty > 1 && (
          <div className={styles.totalBox}>
            <span>Total:</span>
            <strong>{formatARS(comboTotal)}</strong>
          </div>
        )}

        <button
          type="button"
          className={styles.toggleCuotas}
          onClick={() => setShowCuotas((v) => !v)}
        >
          {showCuotas ? "Ocultar cuotas" : "Ver cuotas"}
        </button>

        {showCuotas && (
          <div className={styles.cuotasInline}>
            {cuotas.map((cuota, index) => (
              <span key={index} className={styles.cuota}>
                {cuota}
              </span>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={addComboToCart}
            disabled={isBroken}
          >
            Sumar combo al carrito
          </button>

          <button
            type="button"
            className={styles.mpButton}
            onClick={handleMercadoPago}
            disabled={isBroken}
          >
            Pagar con Mercado Pago
          </button>

          <button
            type="button"
            className={styles.secondary}
            onClick={() => setShowSingles(true)}
          >
            Comprar por separado
          </button>
        </div>
      </div>

      {showSingles && (
        <div className={styles.overlay} onClick={() => setShowSingles(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h4>Comprar productos por separado</h4>
              <button type="button" onClick={() => setShowSingles(false)}>
                ✕
              </button>
            </header>

            <div className={styles.modalContent}>
              {selectedComponents.map((component) => (
                <ProductCard
                  key={`${component.product.id}-${component.variantIndex}`}
                  producto={{
                    ...component.product,
                    comboId: combo.id,
                  }}
                  fromCombo
                  userRole={userRole}
                  initialVariant={component.variantIndex}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}