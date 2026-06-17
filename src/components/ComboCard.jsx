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

export default function ComboCard({
  combo,
  productos = [],
  onEditCombo,
  onEdit,
  onDeleteCombo,
  onDelete,
  Role,
}) {
  // Diagnóstico de inicialización y renderizado
  console.log(
    `%c📦 [ComboCard Render] Dibujando card para combo: ${combo?.name || "Sin nombre"}`,
    "background: #22c55e; color: #fff; padding: 4px; font-weight: bold;"
  );
  console.log("-> Parámetros de rol y producto recibidos:", { Role, comboId: combo?.id, totalProductos: productos?.length });

  const { addToCart, items: cartItems = [] } = useCart();

  const [showSingles, setShowSingles] = useState(false);
  const [showCuotas, setShowCuotas] = useState(false);
  const [comboQty, setComboQty] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState({});

  const esJefe = Role === "jefe";
  const esEncargado = Role === "encargado";

  const editHandler = onEditCombo || onEdit;
  const deleteHandler = onDeleteCombo || onDelete;

  // Si Role llega vacío o indefinido pero existen handlers, permitimos mostrar botones para evitar bloqueos
  const puedeEditar = esJefe || esEncargado || Role === undefined;
  const puedeEliminar = esJefe || Role === undefined;

  console.log("-> Estado de los permisos de visualización:", { esJefe, esEncargado, puedeEditar, puedeEliminar });

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

        // SOLUCCIÓN: Dejamos el stock dinámico tal cual viene de Firebase sin forzar llaves fijas
        const variants = Array.isArray(product.variantes)
          ? product.variantes.map((v) => {
              // Si la base de datos usa "Mosconi" pero la app espera "Jofre 2440", normalizamos acá abajo sin destruir las demás sucursales
              const stockOriginal = v.stock && typeof v.stock === "object" ? v.stock : {};
              const stockNormalizado = { ...stockOriginal };
              
              if (stockNormalizado["Mosconi"] !== undefined && stockNormalizado["Jofre 2440"] === undefined) {
                stockNormalized["Jofre 2440"] = stockNormalizado["Mosconi"];
              }

              return {
                ...v,
                stock: stockNormalizado,
              };
            })
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

      console.log("⚙️ [ComboCard Effect] Mapeando índices de variantes:", next);
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

      if (!best.branch && Object.keys(stockObj).length > 0) {
        best.branch = Object.keys(stockObj)[0];
      }

      return best;
    },
    [getCartUnitsFor]
  );

  const selectedComponents = useMemo(() => {
    const calculated = comboProducts.map((item) => {
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
        // REEMPLAZÁ LA PROPIEDAD 'image:' DENTRO DEL MAP DE selectedComponents POR ESTA:
image: variant?.image || item.product?.image || combo?.image,
      };
    });

    console.log(`📊 [ComboCard Stock Check] Evaluación de stock para ${combo?.name}:`, calculated.map(c => ({
      producto: c.product.name,
      variante: c.variantName,
      unidadesFisicasTotales: c.stockTotal,
      combosQueArmaEnEstaSucursal: c.availableCombos,
      sucursalDetectada: c.branch
    })));

    return calculated;
  }, [
    comboProducts,
    selectedVariants,
    getAvailabilityForVariant,
    combo?.image,
  ]);

  const availableCombos = useMemo(() => {
    if (!selectedComponents.length) return 0;

    const minCombos = Math.min(
      ...selectedComponents.map((component) => component.availableCombos)
    );
    console.log(`📉 [ComboCard Stock Result] Máximos combos constructores calculados: ${minCombos}`);
    return minCombos;
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

  if (isBroken) {
    console.warn(`🚨 [ComboCard Alerta Stock] Combo deshabilitado por falta de stock crítico en:`, brokenItems);
  }

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
    console.log("%c🎯 [Click] Click ejecutado sobre EDITAR COMBO", "background: #f97316; color: #fff; font-weight: bold;");
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
    console.log("%c🎯 [Click] Click ejecutado sobre ELIMINAR COMBO", "background: #ef4444; color: #fff; font-weight: bold;");
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
      <div className={styles.browserBar}>
        <div className={styles.browserDots}>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className={styles.addressBar}>tu-tienda.com</div>
      </div>

      <section className={styles.hero}>
        {/* BOTONES FLOTANTES: Mapeados directamente con las clases del módulo CSS */}
        {(puedeEditar || puedeEliminar) && (
          <div className={styles.adminActions}>
            {puedeEditar && (
              <button
                type="button"
                className={styles.adminEditBtn}
                onClick={handleEditCombo}
                title="Editar combo"
                onMouseEnter={() => console.log("%c👀 [Hover] Puntero ingresó a botón EDITAR", "color: #f97316; font-weight: bold;")}
                onMouseLeave={() => console.log("👋 [Hover] Puntero abandonó botón EDITAR")}
              >
                ✏️
              </button>
            )}

            {puedeEliminar && (
              <button
                type="button"
                className={styles.adminDeleteBtn}
                onClick={deleteCombo}
                title="Eliminar combo"
                onMouseEnter={() => console.log("%c👀 [Hover] Puntero ingresó a botón ELIMINAR", "color: #ef4444; font-weight: bold;")}
                onMouseLeave={() => console.log("👋 [Hover] Puntero abandonó botón ELIMINAR")}
              >
                🗑
              </button>
            )}
          </div>
        )}

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
                  meta = `SIN STOCK (Dispo: ${stockTotal})`;
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
                  Role={Role}
                  initialVariant={component.variantIndex}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}