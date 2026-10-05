import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import styles from "../styles/ComboCard.module.css";
import { useCart } from "../context/CartContext";
import ProductCard from "./ProductCard";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import html2canvas from "html2canvas";

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
  const { addToCart, items: cartItems = [] } = useCart();

  const printRef = useRef(null); // Ref al ticket formal oculto
  const [showSingles, setShowSingles] = useState(false);
  const [showCuotas, setShowCuotas] = useState(false);
  const [comboQty, setComboQty] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [isSharing, setIsSharing] = useState(false);

  const esJefe = Role === "jefe";
  const esEncargado = Role === "encargado";

  const editHandler = onEditCombo || onEdit;
  const deleteHandler = onDeleteCombo || onDelete;

  const puedeEditar = esJefe || esEncargado || Role === undefined;
  const puedeEliminar = esJefe || Role === undefined;

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
          ? product.variantes.map((v) => {
              const stockOriginal = v.stock && typeof v.stock === "object" ? v.stock : {};
              const stockNormalizado = { ...stockOriginal };
              
              if (stockNormalizado["Mosconi"] !== undefined && stockNormalizado["Jofre 2440"] === undefined) {
                stockNormalizado["Jofre 2440"] = stockNormalizado["Mosconi"];
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

  const getCartUnitsFor = useCallback(
    (productId, variantName, branch) => {
      return cartItems.reduce((total, item) => {
        let units = 0;

        if (Array.isArray(item.comboItems)) {
          units += item.comboItems.reduce((sum, comboItem) => {
            const sameProduct = comboItem.productId === productId;
            const sameVariant = String(comboItem.variant).trim() === String(variantName).trim();
            const sameBranch = comboItem.branch === branch;

            if (!sameProduct || !sameVariant || !sameBranch) return sum;

            const unitsPerCombo =
              comboItem.unitsToDiscount ?? comboItem.quantity ?? 1;

            return sum + Number(item.qty || 1) * Number(unitsPerCombo || 1);
          }, 0);
        }

        const sameSimpleProduct =
          item.id === productId || item.productId === productId;
        const sameSimpleVariant = String(item.variant).trim() === String(variantName).trim();
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
    (productId, variant, physicalRequiredQty) => {
      const stockObj = getStockObj(variant);
      const variantName = variant?.attr?.trim();

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
          availableUnits / Number(physicalRequiredQty || 1)
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
      let selectedIndex = selectedVariants[item.productId];

      if (selectedIndex === undefined) {
        const autoAvailableIndex = item.variants.findIndex((v) => {
           const mult = Number(v.unidadesPorJuego ?? item.product?.unidadesPorJuego ?? item.product?.unidadesNecesarias ?? 1);
           return getStockTotal(v) >= (item.requiredQty * mult);
        });
        selectedIndex = autoAvailableIndex >= 0 ? autoAvailableIndex : 0;
      }

      const safeIndex =
        selectedIndex >= 0 && selectedIndex < item.variants.length
          ? selectedIndex
          : 0;

      const variant = item.variants[safeIndex] ?? null;
      const variantName = variant?.attr?.trim() ?? "Sin variante";

      const multiplier = Number(
        variant?.unidadesPorJuego ??
        item.product?.unidadesPorJuego ??
        item.product?.unidadesNecesarias ??
        1
      );

      const physicalQty = item.requiredQty * multiplier;

      const availability = variant
        ? getAvailabilityForVariant(item.productId, variant, physicalQty)
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
        multiplier,
        physicalQty,
        stockTotal: getStockTotal(variant),
        branch: availability.branch,
        availableUnits: availability.availableUnits,
        availableCombos: availability.availableCombos,
        image: variant?.image || item.product?.image || combo?.image,
      };
    });

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
        return {
          cuotas,
          montoCuota: formatARS(cuota),
        };
      });
  }, [comboTotal]);

  const selectionSummary = useMemo(() => {
    return selectedComponents
      .map((component) => {
        const qtyText = component.requiredQty > 1 ? `${component.requiredQty} ` : "";
        const multText = component.multiplier > 1 ? ` (Juego x${component.multiplier})` : "";

        return `${qtyText}${component.product.name} ${component.variantName}${multText}`;
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
      unitsToDiscount: component.physicalQty,
      totalUnitsToDiscount: component.physicalQty * comboQty,
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

  /* =========================================
     COMPARTIR PRESUPUESTO ESTILO TICKET LIMPIO (IMG 1)
  ========================================= */
  const handleSharePresupuesto = async () => {
    if (!printRef.current) return;
    setIsSharing(true);

    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const dataUrl = canvas.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `Presupuesto-${combo.name}.png`, {
        type: "image/png",
      });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Presupuesto ${combo.name}`,
          text: `Presupuesto para ${combo.name}:\nTotal: ${formatARS(comboTotal)}`,
          files: [file],
        });
      } else {
        const link = document.createElement("a");
        link.download = `Presupuesto-${combo.name}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error("Error generando la imagen del presupuesto:", error);
    } finally {
      setIsSharing(false);
    }
  };

  const currentDate = new Date().toLocaleDateString("es-AR");

  return (
    <>
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
          {(puedeEditar || puedeEliminar) && (
            <div className={styles.adminActions}>
              {puedeEditar && (
                <button
                  type="button"
                  className={styles.adminEditBtn}
                  onClick={handleEditCombo}
                  title="Editar combo"
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
                  {component.multiplier > 1
                    ? `juego(s) de ${component.multiplier} unidades`
                    : component.requiredQty === 1
                    ? "unidad"
                    : "unidades"}
                </p>
              </header>

              <div className={styles.variantGrid}>
                {component.variants.map((variant, variantIndex) => {
                  const stockTotal = getStockTotal(variant);

                  const varMultiplier = Number(
                    variant?.unidadesPorJuego ??
                    component.product?.unidadesPorJuego ??
                    component.product?.unidadesNecesarias ??
                    1
                  );
                  const varPhysicalQty = component.requiredQty * varMultiplier;

                  const availability = getAvailabilityForVariant(
                    component.productId,
                    variant,
                    varPhysicalQty
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
                    {item.physicalQty} unidades, stock insuficiente.
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
              {cuotas.map((item, index) => (
                <span key={index} className={styles.cuota}>
                  {item.cuotas} cuotas {item.montoCuota}
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

            <button
              type="button"
              className={styles.shareBtn}
              onClick={handleSharePresupuesto}
              disabled={isSharing}
            >
              {isSharing ? "Generando..." : "📲 Compartir Presupuesto"}
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

      {/* ==============================================================
          PLANTILLA DE PRESUPUESTO ESTILO TICKET (EXCLUSIVO PARA CAPTURA DE IMAGEN)
         ============================================================== */}
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
        }}
      >
        <div
          ref={printRef}
          style={{
            width: "450px",
            backgroundColor: "#ffffff",
            padding: "24px",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#1e293b",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2
            style={{
              fontSize: "22px",
              fontWeight: "900",
              color: "#0f2942",
              margin: "0 0 4px 0",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            PRESUPUESTO DE COMPRA
          </h2>
          <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0" }}>
            Fecha: {currentDate}
          </p>

          <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />

          {/* LISTA DE COMPONENTES DEL COMBO */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" }}>
            {selectedComponents.map((comp) => {
              const unitPrice = Number(comp.variant?.price || comp.product?.price || 0);
              const calculatedTotal = unitPrice * comp.requiredQty;

              return (
                <div key={comp.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ paddingRight: "10px" }}>
                    <strong style={{ fontSize: "15px", color: "#0f172a", display: "block" }}>
                      {comp.product.name}
                    </strong>
                    <span style={{ fontSize: "13px", color: "#64748b" }}>
                      Variante: {comp.variantName} | {comp.requiredQty} u. {unitPrice > 0 ? `x ${formatARS(unitPrice)}` : ""}
                    </span>
                  </div>
                  <strong style={{ fontSize: "15px", color: "#0f172a", whiteSpace: "nowrap" }}>
                    {calculatedTotal > 0 ? formatARS(calculatedTotal) : formatARS(comboUnitPrice)}
                  </strong>
                </div>
              );
            })}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />

          {/* TOTALES */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", color: "#475569", marginBottom: "8px" }}>
            <span>Subtotal</span>
            <strong>{formatARS(comboTotal)}</strong>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <span style={{ fontSize: "18px", fontWeight: "900", color: "#16a34a" }}>TOTAL CONTADO</span>
            <span style={{ fontSize: "22px", fontWeight: "900", color: "#16a34a" }}>{formatARS(comboTotal)}</span>
          </div>

          {/* CUOTAS DISPONIBLES */}
          {cuotas.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ fontSize: "14px", color: "#2563eb", margin: "0 0 10px 0", fontWeight: "700" }}>
                Cuotas disponibles:
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {cuotas.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontSize: "14px",
                      fontWeight: "700",
                      color: "#1e293b",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span style={{ color: "#7c3aed" }}>✔</span> {c.cuotas} cuotas {c.montoCuota}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PIE DE PÁGINA */}
          <div
            style={{
              backgroundColor: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "6px",
              padding: "10px",
              textAlign: "center",
              color: "#0284c7",
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            Presupuesto válido por 15 días.
          </div>
        </div>
      </div>
    </>
  );
}