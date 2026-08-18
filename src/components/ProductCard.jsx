import { useState, useMemo, useEffect } from "react";
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

/**
 * Helper para validar y formatear valores de color (HEX, RGB o listas de números)
 */
function formatCssColor(color) {
  if (!color) return null;
  const str = String(color).trim();
  if (str.startsWith("#") || str.startsWith("rgb") || str.startsWith("hsl")) return str;
  if (/^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})$/.test(str)) return `rgb(${str})`;
  if (/^[0-9A-Fa-f]{3,6}$/.test(str)) return `#${str}`;
  return str;
}

export default function ProductCard({
  producto,
  onEdit,
  onDelete,
  fromCombo = false,
  userRole,
  initialVariant = 0,
}) {
  const [selectedVariant, setSelectedVariant] = useState(initialVariant);
  const [selectedModel, setSelectedModel] = useState(null);
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

  // AGRUPAMIENTO INTELIGENTE POR MODELO
  const agrupadoPorModelo = useMemo(() => {
    const grupos = {};
    variantes.forEach((v, originalIndex) => {
      const tipo = v.tipoVariante || (v.colorHex ? "color" : "modelo");
      const modeloNombre = tipo === 'modelo' ? v.attr : (v.modelo || producto?.name || "Modelo Principal");

      if (!grupos[modeloNombre]) {
        grupos[modeloNombre] = {
          nombre: modeloNombre,
          imagenPrincipal: null,
          variantes: [],
        };
      }

      if (tipo === 'modelo' && v.image) {
        grupos[modeloNombre].imagenPrincipal = v.image;
      }

      grupos[modeloNombre].variantes.push({ ...v, originalIndex });
    });

    Object.values(grupos).forEach(g => {
      if (!g.imagenPrincipal) g.imagenPrincipal = producto?.image;
    });

    return Object.values(grupos);
  }, [variantes, producto]);

  // Sincronizar modelo seleccionado al cambiar de variante activa
  useEffect(() => {
    if (variantes[selectedVariant]) {
      const vActiva = variantes[selectedVariant];
      const tipo = vActiva.tipoVariante || (vActiva.colorHex ? "color" : "modelo");
      const modeloNombre = tipo === 'modelo' ? vActiva.attr : (vActiva.modelo || producto?.name || "Modelo Principal");
      setSelectedModel(modeloNombre);
    } else if (agrupadoPorModelo.length > 0) {
      setSelectedModel(agrupadoPorModelo[0].nombre);
    }
  }, [selectedVariant, variantes, agrupadoPorModelo, producto]);

  const variant = variantes[selectedVariant] ?? null;

  // Lógica para determinar la imagen principal a mostrar siempre (evita imagen rota en colores)
  const modeloActual = agrupadoPorModelo.find((m) => m.nombre === selectedModel) || agrupadoPorModelo[0];
  const imagenMostrar = modeloActual?.imagenPrincipal || producto?.image || null;

  const precioUnidad = Number(variant?.price || 0);
  const precioJuego = Number(variant?.priceJuego || 0);
  const unidadesPorJuego = Number(variant?.unidadesPorJuego || 0);

  const tieneJuego = precioJuego > 0 && unidadesPorJuego > 1;
  const formatoActual = formatoCompra === "juego" && tieneJuego ? "juego" : "unidad";
  const unidadesNecesarias = formatoActual === "juego" ? unidadesPorJuego : 1;
  const precioSeleccionado = formatoActual === "juego" ? precioJuego : precioUnidad;

  const totalStock = Object.values(variant?.stock || {}).reduce((a, b) => a + Number(b || 0), 0);
  const juegosDisponibles = tieneJuego ? Math.floor(totalStock / unidadesPorJuego) : 0;
  const sucursalDisponible = Object.entries(variant?.stock || {}).find(
    ([, cantidad]) => Number(cantidad || 0) >= unidadesNecesarias
  )?.[0];

  const esJefe = userRole === "jefe";
  const esEncargado = userRole === "encargado";

  const configuracionCuotas = [
    { cuotas: 2, interes: 30 }, { cuotas: 3, interes: 50 }, { cuotas: 4, interes: 70 },
    { cuotas: 6, interes: 90 }, { cuotas: 9, interes: 120 }, { cuotas: 12, interes: 150 },
    { cuotas: 18, interes: 170 }, { cuotas: 24, interes: 200 },
  ];

  const formatARS = (valor) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
    .format(Math.ceil(Number(valor) / 1000) * 1000);

  const cuotas = useMemo(() => {
    if (!precioSeleccionado) return [];
    return configuracionCuotas
      .filter(({ cuotas }) => {
        if (precioSeleccionado < 30000) return cuotas <= 2;
        if (precioSeleccionado < 80000) return cuotas <= 3;
        if (precioSeleccionado < 150000) return cuotas <= 6;
        if (precioSeleccionado < 250000) return cuotas <= 9;
        return cuotas <= 12;
      })
      .map(({ cuotas, interes }) => {
        const monto = precioSeleccionado * (1 + interes / 100);
        return `${cuotas} cuotas ${formatARS(Math.ceil(monto / cuotas / 1000) * 1000)}`;
      });
  }, [precioSeleccionado]);

  if (!producto || variantes.length === 0) return null;

  const sendNotification = async (action, detail = {}) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      await addDoc(collection(db, "notificaciones"), {
        userId: user.uid,
        userName: snap.exists() ? snap.data().nombre : "Desconocido",
        userEmail: user.email ?? "Sin Email",
        action,
        detail: { tipo: detail.tipo ?? null, producto: producto.name ?? "Sin nombre", variante: variant?.attr ?? null, formatoCompra: formatoActual ?? null, ...detail },
        timestamp: serverTimestamp(),
      });
    } catch (error) { console.error("❌ Error Firebase:", error); }
  };

  const getStockTotalVariante = (v) => Object.values(v.stock || {}).reduce((a, b) => a + Number(b || 0), 0);

  const getItemUnits = (item) => Number(item.qty || 1) * Number(item.unitsToDiscount ?? item.unidadesNecesarias ?? item.unidadesPorJuego ?? 1);

  const updateStock = async (sucursal, delta) => {
    if (!esJefe) return;
    const antes = Number(variant.stock?.[sucursal] ?? 0);
    const despues = Math.max(antes + delta, 0);
    if (antes === despues) return;
    const nuevasVariantes = variantes.map((v, i) => i === selectedVariant ? { ...v, stock: { ...v.stock, [sucursal]: despues } } : v);
    setVariantes(nuevasVariantes);
    try {
      await updateDoc(doc(db, "categorias", categoriaId, "productos", producto.id), { variantes: nuevasVariantes });
      await sendNotification("modificó stock", { tipo: "stock", sucursal, antes, despues });
    } catch (err) { alert("Error al guardar stock"); }
  };

  const handleVariantSelect = (index) => {
    setSelectedVariant(index);
    const v = variantes[index];
    if (!(Number(v?.priceJuego || 0) > 0 && Number(v?.unidadesPorJuego || 0) > 1)) setFormatoCompra("unidad");
  };

  const handleAddToCart = async (branch) => {
    if (!variant || precioSeleccionado <= 0) return;
    const stockSucursal = Number(variant.stock?.[branch] || 0);
    const inCart = items.filter((i) => i.id === producto.id && i.variant === variant.attr && i.branch === branch).reduce((a, i) => a + getItemUnits(i), 0);
    if (inCart + unidadesNecesarias > stockSucursal) return alert("❌ Ya no hay stock disponible en esta sucursal.");
    
    addToCart({ 
      key: `${producto.id}-${variant.attr}-${formatoActual}-${branch}`, 
      id: producto.id, 
      categoriaId, 
      name: producto.name, 
      price: precioSeleccionado, 
      image: variant.image || imagenMostrar, 
      qty: 1, 
      variant: variant.attr, 
      type: formatoActual === "juego" ? "juego" : "simple", 
      formatoCompra: formatoActual, 
      unidadesPorJuego: formatoActual === "juego" ? unidadesPorJuego : null, 
      unitsToDiscount: unidadesNecesarias, 
      fromCombo, 
      comboId: producto.comboId ?? null, 
      branch, 
      stockFull: { ...variant.stock } 
    });
    
    await sendNotification("agregó al carrito", { tipo: "carrito", sucursal: branch, precio: precioSeleccionado, unidades: unidadesNecesarias });
  };

  const handleComprar = async () => {
    if (!sucursalDisponible) return alert("❌ No hay stock disponible.");
    try {
      const response = await fetch("/api/crear-preferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: producto.id, title: formatoActual === "juego" ? `${producto.name} - ${variant.attr} - Juego x${unidadesPorJuego}` : `${producto.name} - ${variant.attr}`, price: precioSeleccionado, quantity: 1, variant: variant.attr, type: formatoActual, unidadesPorJuego: formatoActual === "juego" ? unidadesPorJuego : null, unitsToDiscount: unidadesNecesarias, branch: sucursalDisponible, categoriaId }] }),
      });
      const data = await response.json();
      if (data.init_point) window.location.href = data.init_point;
    } catch (error) { console.error("Error comprando:", error); }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/producto/${categoriaId}/${producto.id}?v=${selectedVariant}`;
    await navigator.clipboard.writeText(url);
    const msj = `Mirá este producto 👇\n${producto.name} - ${variant.attr}\nFormato: ${formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Por unidad"}\nPrecio: ${formatARS(precioSeleccionado)}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, "_blank");
  };

  const handleWhatsApp = () => {
    const msj = `Hola, quiero consultar por:\n${producto.name} - ${variant.attr}\nFormato: ${formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Por unidad"}\nPrecio: ${formatARS(precioSeleccionado)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, "_blank");
  };

  const handlePrintPresupuesto = () => {
    const printWindow = window.open("", "_blank", "width=400,height=600");
    printWindow.document.write(`
      <html><head><title>Presupuesto</title><style>
        body { font-family: 'Segoe UI', sans-serif; color: #0f172a; display: flex; flex-direction: column; background: #fff; margin: 15px; }
        .title { font-size: 24px; font-weight: 800; border-bottom: 2px solid #0f2b48; padding-bottom: 10px; margin-bottom: 10px; }
        .row { display: flex; gap: 10px; }
        .info { width: 60%; }
        .img { width: 40%; }
        .img img { max-width: 100%; border-radius: 8px; border: 1px solid #ddd; }
        .validez { margin-top: 15px; font-size: 12px; font-weight: bold; padding: 5px; background: #f0f9ff; border: 1px solid #bae6fd; text-align: center; border-radius: 4px; }
      </style></head><body>
      <div class="title">PRESUPUESTO - ${new Date().toLocaleDateString("es-AR")}</div>
      <div class="row">
        <div class="info">
          <h2>${producto.name} ${formatoActual === "juego" ? `(Juego x${unidadesPorJuego})` : ""}</h2>
          <h3>Variante: ${variant.attr}</h3>
          <h2 style="color:#0284c7">CONTADO: ${formatARS(precioSeleccionado)}</h2>
          ${cuotas.map(c => `<div style="margin:5px 0; font-size: 14px;">✔️ ${c}</div>`).join('')}
        </div>
        <div class="img">${imagenMostrar ? `<img src="${imagenMostrar}"/>` : ''}</div>
      </div>
      <div class="validez">Presupuesto válido por 15 días.</div>
      <script>window.onload=()=>{window.print();setTimeout(window.close,300)}</script></body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className={styles.productWrapper}>
      <article className={styles.productCard}>
        {(esJefe || esEncargado) && (
          <div className={styles.productActions}>
            <button className={styles.edit} onClick={() => onEdit?.({ ...producto, variantes })}>✏️</button>
            {esJefe && <button className={styles.delete} onClick={() => { if(window.confirm(`¿Eliminar ${producto.name}?`)) { sendNotification("eliminó producto", { producto: producto.name }); onDelete?.(producto.id); } }}>🗑</button>}
          </div>
        )}

        <figure className={styles.productFigure}>
          <img src={imagenMostrar} alt={producto.name} onClick={() => setShowCarrusel(true)} style={{ cursor: "zoom-in" }} />
          {producto.tag && <span className={styles.badge}>{producto.tag}</span>}
          {fromCombo && <span className={styles.badge}>De combo</span>}
        </figure>

        <div className={styles.info}>
          <div className={styles.headerInfo}>
            <h3>{producto.name}</h3>
            <div className={styles.priceBlock}>
              <p><strong>{formatARS(precioUnidad)}</strong><span>/ Unidad</span></p>
              {tieneJuego && <p><strong>{formatARS(precioJuego)}</strong><span>/ Juego x{unidadesPorJuego}</span></p>}
            </div>
          </div>

          <fieldset className={styles.options}>
            <legend>Paso 1: Elegí tu modelo y color</legend>

            <div className={styles.modelsContainer}>
              {agrupadoPorModelo.map((m) => {
                const isActiveModel = selectedModel === m.nombre;
                
                // La variante base es el modelo en sí (evitamos que se repita a la derecha)
                const baseVariant = m.variantes.find(v => v.tipoVariante === 'modelo') || m.variantes[0];
                const isBaseSelected = selectedVariant === baseVariant.originalIndex;
                
                // Los colores son todas las DEMÁS variantes
                const colorVariants = m.variantes.filter(v => v.originalIndex !== baseVariant.originalIndex);

                return (
                  <div key={m.nombre} className={`${styles.modelRow} ${isActiveModel ? styles.activeModelRow : ""}`}>
                    
                    {/* INFO DEL MODELO: Ahora funciona como el botón selector de la variante base */}
                    <div 
                      className={styles.modelInfo}
                      style={{ borderRight: colorVariants.length === 0 ? "none" : undefined }}
                      onClick={() => handleVariantSelect(baseVariant.originalIndex)}
                    >
                      {m.imagenPrincipal ? (
                        <img 
                          src={m.imagenPrincipal} 
                          alt={m.nombre} 
                          className={isBaseSelected ? styles.selectedBaseImg : ""}
                        />
                      ) : (
                        <div className={`${styles.noModelImage} ${isBaseSelected ? styles.selectedBaseImg : ""}`}>📷</div>
                      )}
                      <span className={`${styles.modelName} ${isBaseSelected ? styles.selectedBaseText : ""}`}>{m.nombre}</span>
                    </div>

                    {/* VARIANTES DE COLOR: Solo renderizamos si hay colores extra */}
                    {colorVariants.length > 0 && (
                      <div className={styles.modelVariantsContainer}>
                        {colorVariants.map((v) => {
                          const agotada = getStockTotalVariante(v) <= 0;
                          const isSelected = selectedVariant === v.originalIndex;
                          const optionColor = formatCssColor(v.colorHex || v.colorRgb || v.color || v.rgb);

                          return (
                            <label key={v.originalIndex} className={`${styles.variantOption} ${isSelected ? styles.selected : ""} ${agotada ? styles.disabled : ""}`}>
                              <input type="radio" name={`variant-${producto.id}`} checked={isSelected} onChange={() => handleVariantSelect(v.originalIndex)} />
                              <span className={styles.variantCircle}>
                                {optionColor ? <span className={styles.variantFallback} style={{ backgroundColor: optionColor }} /> : v.image ? <img src={v.image} alt={v.attr} /> : <span className={styles.variantFallback} />}
                                {agotada && <span className={styles.soldOutBadge}>Agotado</span>}
                              </span>
                              <span className={styles.variantText}>
                                <span className={styles.variantName}>{v.attr}</span>
                                {/* PRECIO ELIMINADO PARA LIMPIAR LA VISTA */}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.buyFormat}>
            <legend>Paso 2: Elegí tu formato de compra</legend>
            <div className={styles.buyFormatGrid}>
              <button type="button" className={`${styles.formatButton} ${formatoActual === "unidad" ? styles.selectedFormat : ""}`} onClick={() => setFormatoCompra("unidad")} disabled={totalStock <= 0}>
                <span>{totalStock} disponibles</span><strong>Por unidad</strong>
              </button>
              {tieneJuego && (
                <button type="button" className={`${styles.formatButton} ${formatoActual === "juego" ? styles.selectedFormat : ""}`} onClick={() => setFormatoCompra("juego")} disabled={juegosDisponibles <= 0}>
                  <span>{juegosDisponibles} juegos disponibles</span><strong>Juego x{unidadesPorJuego}</strong>
                </button>
              )}
            </div>
          </fieldset>

          <button className={styles.toggleCuotas} onClick={() => setShowCuotas(!showCuotas)}>
            {showCuotas ? "Ocultar cuotas" : "Ver cuotas"}
          </button>

          {showCuotas && <div className={styles.cuotasInline}>{cuotas.map((c, i) => <span key={i} className={styles.cuota}>{c}</span>)}</div>}

          <div className={styles.stock}>
            {variant && Object.entries(variant.stock || {}).map(([sucursal, cantidad]) => {
              const cant = Number(cantidad || 0);
              let clase = styles.ok; if (cant <= 0) clase = styles.out; else if (cant < unidadesNecesarias) clase = styles.low;
              return (
                <div key={sucursal} className={`${styles.branch} ${clase}`}>
                  <div className={styles.branchMeta}>
                    <span>🏬 {sucursal}</span>
                    <small>{cant} unidades {tieneJuego && `/ ${Math.floor(cant / unidadesPorJuego)} juegos`}</small>
                  </div>
                  <div className={styles.stockControls}>
                    {esJefe && (<><button disabled={cant === 0} onClick={() => updateStock(sucursal, -1)}>-</button><strong>{cant}</strong><button onClick={() => updateStock(sucursal, 1)}>+</button></>)}
                    {!esJefe && <strong>{cant}</strong>}
                    <button className={styles.cartMini} disabled={cant < unidadesNecesarias} onClick={() => handleAddToCart(sucursal)}>🛒</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.cardButtons}>
            <button type="button" className={styles.printBudget} onClick={handlePrintPresupuesto}>📄 Imprimir Presupuesto</button>
            <button className={styles.whatsapp} onClick={handleWhatsApp}>Pedir por WhatsApp</button>
            <button className={styles.share} onClick={handleShare}>Compartir</button>
            <button className={styles.mpButton} onClick={handleComprar} disabled={!sucursalDisponible || precioSeleccionado <= 0}>
              <SiMercadopago size={50} style={{ marginRight: "5px" }} /> Pagar
            </button>
          </div>
        </div>
      </article>

      {showCarrusel && <ImgCarrusel imagenes={[imagenMostrar].filter(Boolean)} indexInicial={0} onClose={() => setShowCarrusel(false)} />}
    </div>
  );
}