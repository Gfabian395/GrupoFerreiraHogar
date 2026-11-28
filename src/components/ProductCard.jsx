import { useState, useMemo, useEffect } from "react";
import styles from "../styles/ProductCard.module.css";
import { useCart } from "../context/CartContext";
import { useParams, useSearchParams } from "react-router-dom";
import {
  doc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase/firebaseConfig";
import ImgCarrusel from "./ImgCarrusel";
import { SiMercadopago } from "react-icons/si";

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
  isHighlighted: isHighlightedProp,
}) {
  const [searchParams] = useSearchParams();
  const highlightedQuery =
    searchParams.get("highlight") ||
    searchParams.get("search") ||
    searchParams.get("id") ||
    searchParams.get("productoId");

  const isHighlighted = useMemo(() => {
    if (typeof isHighlightedProp === "boolean") return isHighlightedProp;
    if (!highlightedQuery || !producto) return false;
    return (
      String(producto.id) === String(highlightedQuery) ||
      String(producto.slug) === String(highlightedQuery)
    );
  }, [isHighlightedProp, highlightedQuery, producto]);

  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
          setUserData(snap.data());
        }
      } catch (e) {
        console.error("Error al obtener datos del usuario", e);
      }
    };
    fetchUserData();
  }, []);

  const [variantes, setVariantes] = useState(() =>
    producto?.variantes
      ? producto.variantes.map((v) => ({
          ...v,
          priceJuego: v.priceJuego ?? null,
          unidadesPorJuego: v.unidadesPorJuego ?? null,
          fichaTecnica: v.fichaTecnica ?? null,
          stock: {
            "Los Andes 4320": Number(v.stock?.["Los Andes 4320"] ?? 0),
            "Los Andes 4034": Number(v.stock?.["Los Andes 4034"] ?? 0),
            "Jofre 2440": Number(v.stock?.["Jofre 2440"] ?? v.stock?.["Mosconi"] ?? 0),
          },
        }))
      : []
  );

  // AGRUPAMIENTO INTELIGENTE POR MODELO
  const agrupadoPorModelo = useMemo(() => {
    const grupos = {};
    variantes.forEach((v, originalIndex) => {
      const tipo = v.tipoVariante || (v.colorHex ? "color" : "modelo");
      const modeloNombre =
        tipo === "modelo"
          ? v.attr
          : v.modelo || producto?.name || "Modelo Principal";

      if (!grupos[modeloNombre]) {
        grupos[modeloNombre] = {
          nombre: modeloNombre,
          imagenPrincipal: null,
          variantes: [],
        };
      }

      if (tipo === "modelo" && v.image) {
        grupos[modeloNombre].imagenPrincipal = v.image;
      }

      grupos[modeloNombre].variantes.push({ ...v, originalIndex });
    });

    Object.values(grupos).forEach((g) => {
      if (!g.imagenPrincipal) g.imagenPrincipal = producto?.image;
    });

    return Object.values(grupos);
  }, [variantes, producto]);

  // Asegurar por defecto que se seleccione la primera variante de color real (hija) y no un modelo base vacío
  const [selectedVariant, setSelectedVariant] = useState(() => {
    const initialIdx = Number(initialVariant) || 0;
    const vInit = variantes[initialIdx];
    if (vInit && (vInit.tipoVariante === "modelo" || !vInit.tipoVariante)) {
      const primerHijoColor = variantes.findIndex(
        (v) =>
          v.tipoVariante === "color" &&
          (v.modelo === vInit.attr || v.modeloPadre === vInit.attr)
      );
      if (primerHijoColor !== -1) return primerHijoColor;
    }
    const primerColor = variantes.findIndex((v) => v.tipoVariante === "color");
    return primerColor !== -1 ? primerColor : initialIdx;
  });

  const [formatoCompra, setFormatoCompra] = useState("unidad");
  const [showCuotas, setShowCuotas] = useState(false);
  const [showCarrusel, setShowCarrusel] = useState(false);
  const [showFichaTecnica, setShowFichaTecnica] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isPrintingInstallments, setIsPrintingInstallments] = useState(false);
  const [ticketPreviewUrl, setTicketPreviewUrl] = useState(null);

  const { addToCart, items } = useCart();
  const { categoriaId } = useParams();

  useEffect(() => {
    return () => {
      if (ticketPreviewUrl) {
        URL.revokeObjectURL(ticketPreviewUrl);
      }
    };
  }, [ticketPreviewUrl]);

  const esJefe =
    userRole === "jefe" || userData?.role === "jefe" || userData?.roles?.jefe;
  const esEncargado =
    userRole === "encargado" ||
    userData?.role === "encargado" ||
    userData?.roles?.encargado;

  const getStockTotalVariante = (v) =>
    Object.values(v?.stock || {}).reduce((a, b) => a + Number(b || 0), 0);

  const variant = variantes[selectedVariant] ?? variantes[0] ?? null;

  const handleVariantSelect = (index) => {
    setSelectedVariant(index);
    const v = variantes[index];
    if (!(Number(v?.priceJuego || 0) > 0 && Number(v?.unidadesPorJuego || 0) > 1)) {
      setFormatoCompra("unidad");
    }
  };

  const selectedModel = useMemo(() => {
    if (!variant) return "";
    const tipo = variant.tipoVariante || (variant.colorHex ? "color" : "modelo");
    return tipo === "modelo"
      ? variant.attr
      : variant.modelo || variant.modeloPadre || producto?.name || "";
  }, [variant, producto]);

  // Identificamos el grupo del modelo actual para extraer su imagen base fija
  const grupoModeloActual = useMemo(() => {
    return (
      agrupadoPorModelo.find((m) => m.nombre === selectedModel) ||
      agrupadoPorModelo[0]
    );
  }, [agrupadoPorModelo, selectedModel]);

  // IMAGEN FIJA BASE DEL PRODUCTO/MODELO (NO CAMBIA AL ELEGIR EL TAPIZADO)
  const imagenBaseFija =
    grupoModeloActual?.imagenPrincipal || producto?.image || null;

  // ARRAY PARA EL CARRUSEL: La primera imagen es la base fija, seguida de las imágenes de las variantes de color de ese modelo
  const imagenesCarrusel = useMemo(() => {
    const imgs = [imagenBaseFija];
    if (grupoModeloActual?.variantes) {
      grupoModeloActual.variantes.forEach((v) => {
        if (v.image && v.image !== imagenBaseFija) {
          imgs.push(v.image);
        }
      });
    }
    return [...new Set(imgs.filter(Boolean))];
  }, [imagenBaseFija, grupoModeloActual]);

  const precioUnidad = Number(variant?.price || 0);
  const precioJuego = Number(variant?.priceJuego || 0);
  const unidadesPorJuego = Number(variant?.unidadesPorJuego || 0);

  const tieneJuego = precioJuego > 0 && unidadesPorJuego > 1;
  const formatoActual =
    formatoCompra === "juego" && tieneJuego ? "juego" : "unidad";
  const unidadesNecesarias = formatoActual === "juego" ? unidadesPorJuego : 1;
  const precioSeleccionado =
    formatoActual === "juego" ? precioJuego : precioUnidad;

  const totalStock = getStockTotalVariante(variant);
  const juegosDisponibles = tieneJuego
    ? Math.floor(totalStock / unidadesPorJuego)
    : 0;
  const sucursalDisponible = Object.entries(variant?.stock || {}).find(
    ([, cantidad]) => Number(cantidad || 0) >= unidadesNecesarias
  )?.[0];

  const configuracionCuotas = [
    { cuotas: 2, interes: 30 },
    { cuotas: 3, interes: 50 },
    { cuotas: 4, interes: 70 },
    { cuotas: 6, interes: 90 },
    { cuotas: 9, interes: 120 },
    { cuotas: 12, interes: 150 },
  ];

  const formatARS = (valor) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(Math.ceil(Number(valor) / 1000) * 1000);

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

  if (!producto || variantes.length === 0 || agrupadoPorModelo.length === 0)
    return null;

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
        detail: {
          tipo: detail.tipo ?? null,
          producto: producto.name ?? "Sin nombre",
          variante: variant?.attr ?? null,
          formatoCompra: formatoActual ?? null,
          ...detail,
        },
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("❌ Error Firebase:", error);
    }
  };

  const getItemUnits = (item) =>
    Number(item.qty || 1) *
    Number(
      item.unitsToDiscount ??
        item.unidadesNecesarias ??
        item.unidadesPorJuego ??
        1
    );

  const handleAddToCart = async (branch) => {
    if (!variant || precioSeleccionado <= 0) return;
    const stockSucursal = Number(variant.stock?.[branch] || 0);
    const inCart = items
      .filter(
        (i) =>
          i.id === producto.id &&
          i.variant === variant.attr &&
          i.branch === branch
      )
      .reduce((a, i) => a + getItemUnits(i), 0);
    if (inCart + unidadesNecesarias > stockSucursal)
      return alert("❌ Ya no hay stock disponible en esta sucursal.");

    addToCart({
      key: `${producto.id}-${variant.attr}-${formatoActual}-${branch}`,
      id: producto.id,
      categoriaId,
      name: producto.name,
      price: precioSeleccionado,
      image: variant.image || imagenBaseFija,
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
    if (!sucursalDisponible) return alert("❌ No hay stock disponible.");
    try {
      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              id: producto.id,
              title: `${producto.name} - ${variant.attr}`,
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
      if (data.init_point) window.location.href = data.init_point;
    } catch (error) {
      console.error("Error comprando:", error);
    }
  };

  const handleWhatsApp = () => {
    const msj = `Hola, quiero consultar por:\n${producto.name} - ${
      variant.attr
    }\nFormato: ${
      formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Por unidad"
    }\nPrecio: ${formatARS(precioSeleccionado)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, "_blank");
  };

  const generateProductCardImage = async () => {
    const width = 450;
    const padding = 20;

    const fichaItems =
      variant?.fichaTecnica?.length > 0
        ? variant.fichaTecnica
        : [
            { label: "Marca", value: producto.marca || "Genérico" },
            { label: "Origen", value: producto.origen || "Nacional / Importado" },
            { label: "Garantía", value: producto.garantia || "6 meses" },
          ];

    let currentY = padding;
    currentY += 45;
    currentY += 40;
    currentY += 50;
    currentY += 35 + fichaItems.length * 24;
    currentY += 35 + cuotas.length * 32 + padding;

    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = currentY * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, currentY);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, width - 2, currentY - 2);

    let y = padding + 15;

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 22px 'Segoe UI', sans-serif";
    ctx.fillText(producto.name, padding, y);

    y += 35;
    ctx.fillStyle = "#16a34a";
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    const precioTexto = formatARS(precioSeleccionado);
    ctx.fillText(precioTexto, padding, y);

    const precioWidth = ctx.measureText(precioTexto).width;
    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText(
      `/ ${formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Unidad"}`,
      padding + precioWidth + 12,
      y
    );

    y += 30;

    ctx.fillStyle = "#334155";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("Opción seleccionada", padding, y);

    y += 12;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(padding, y, 100, 36);

    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(variant?.attr || "General", padding + 12, y + 22);

    y += 50;

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(
      padding,
      y,
      width - padding * 2,
      30 + fichaItems.length * 24
    );
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(
      padding,
      y,
      width - padding * 2,
      30 + fichaItems.length * 24
    );

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`📋 Ficha técnica (${variant?.attr || "General"})`, padding + 12, y + 20);

    let fy = y + 40;
    fichaItems.forEach((item) => {
      ctx.fillStyle = "#475569";
      ctx.font = "12px sans-serif";
      ctx.fillText(`${item.label}:`, padding + 12, fy);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(
        String(item.value),
        width - padding - 12 - ctx.measureText(String(item.value)).width,
        fy
      );

      fy += 24;
    });

    y = fy + 15;

    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("Cuotas disponibles:", padding, y);

    y += 15;
    cuotas.forEach((c) => {
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(padding, y, width - padding * 2, 26);
      ctx.strokeStyle = "#e2e8f0";
      ctx.strokeRect(padding, y, width - padding * 2, 26);

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`✔️  ${c}`, padding + 12, y + 17);

      y += 32;
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
    });
  };

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      const blob = await generateProductCardImage();

      if (!blob) {
        alert("Ocurrió un error al generar la tarjeta.");
        setIsSharing(false);
        return;
      }

      const file = new File([blob], `producto-${producto.name}.png`, {
        type: "image/png",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
        });
      } else if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        alert(
          "📋 ¡Imagen de la tarjeta copiada al portapapeles!\n\nAbrí tu chat de WhatsApp y presioná Ctrl + V para enviarla."
        );
      } else {
        const link = document.createElement("a");
        link.download = `tarjeta-${producto.name}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        alert("Imagen descargada. Podés adjuntarla manualmente en tu mensaje.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error al compartir la tarjeta:", error);
        alert("Ocurrió un error al generar o compartir la imagen.");
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Genera imagen térmica en blanco y negro con precio de contado gigante y cuotas en tamaño grande
  const generateInstallmentsThermalImage = async () => {
    const width = 384;
    const scale = 2;
    const padding = 14;

    const titulo = producto.name || "Producto";
    const subtitulo = `${variant?.attr || "General"} · ${
      formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Unidad"
    }`;
    const contadoTexto = formatARS(precioSeleccionado);
    const listaCuotas = cuotas.length > 0 ? cuotas : ["Consultar cuotas"];

    const alturaEstimada =
      padding +
      28 + // título
      22 + // variante / formato
      14 + // separador
      18 + // etiqueta CONTADO
      52 + // precio de contado gigante (44px)
      16 + // separador
      26 + // encabezado CUOTAS
      listaCuotas.length * 36 + // cada cuota grande (22px)
      padding +
      16;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = alturaEstimada * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, alturaEstimada);

    let y = padding + 18;

    ctx.fillStyle = "#000000";
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.fillText(titulo, padding, y);

    y += 22;
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillText(subtitulo, padding, y);

    y += 12;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    y += 18;
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillText("CONTADO:", padding, y);

    y += 42;
    ctx.font = "bold 44px Arial, sans-serif";
    ctx.fillText(contadoTexto, padding, y);

    y += 16;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    y += 24;
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.fillText("CUOTAS:", padding, y);

    y += 30;
    ctx.font = "bold 22px Arial, sans-serif";
    listaCuotas.forEach((cuotaTexto) => {
      ctx.fillText(`• ${cuotaTexto}`, padding, y);
      y += 35;
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 1);
    });
  };

  // Compartir hacia Fun Print: usa Web Share con archivo en HTTPS/localhost;
  // en HTTP por IP local muestra la imagen en modal para mantener apretado -> Compartir con Fun Print (sin descargar)
  const handlePrintInstallments = async () => {
    if (isPrintingInstallments) return;
    setIsPrintingInstallments(true);

    try {
      const blob = await generateInstallmentsThermalImage();
      if (!blob) {
        alert("No se pudo generar el ticket de cuotas.");
        return;
      }

      const safeName = (producto.name || "producto")
        .toLowerCase()
        .replace(/\s+/g, "-");
      const file = new File([blob], `cuotas-${safeName}.png`, {
        type: "image/png",
      });

      const canShareFile =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFile && typeof navigator.share === "function") {
        await navigator.share({
          files: [file],
          title: `Cuotas - ${producto.name}`,
        });
      } else {
        if (ticketPreviewUrl) {
          URL.revokeObjectURL(ticketPreviewUrl);
        }
        const previewUrl = URL.createObjectURL(blob);
        setTicketPreviewUrl(previewUrl);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error al compartir cuotas para Fun Print:", error);
        alert("Ocurrió un error al compartir las cuotas.");
      }
    } finally {
      setIsPrintingInstallments(false);
    }
  };

  const closeTicketPreview = () => {
    if (ticketPreviewUrl) {
      URL.revokeObjectURL(ticketPreviewUrl);
      setTicketPreviewUrl(null);
    }
  };

  return (
    <div className={styles.productWrapper}>
      <article
        className={`${styles.productCard} ${
          isHighlighted ? styles.highlightCard : ""
        }`}
      >
        {(esJefe || esEncargado) && (
          <div className={styles.productActions}>
            <button
              className={styles.edit}
              onClick={() => onEdit?.({ ...producto, variantes })}
            >
              <i className="bx bxs-pencil"></i>
            </button>
            {esJefe && (
              <button
                className={styles.delete}
                onClick={() => {
                  if (window.confirm(`¿Eliminar ${producto.name}?`)) {
                    sendNotification("eliminó producto", {
                      producto: producto.name,
                    });
                    onDelete?.(producto.id);
                  }
                }}
              >
                <i className="bx bxs-trash"></i>
              </button>
            )}
          </div>
        )}

        <figure className={styles.productFigure}>
          <img
            src={imagenBaseFija}
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

          {/* SELECTOR JERÁRQUICO: MODELO BASE INFORMATIVO (NO SELECCIONABLE) + COLORES SELECCIONABLES */}
          <fieldset className={styles.options}>
            <legend>Paso 1: Elegí tu color / variante</legend>

            <div className={styles.modelsContainer}>
              {agrupadoPorModelo.map((m) => {
                const baseVariant =
                  m.variantes.find((v) => v.tipoVariante === "modelo") ||
                  m.variantes[0];
                const colorVariants = m.variantes.filter(
                  (v) => v.originalIndex !== baseVariant.originalIndex
                );

                const coloresVisibles = colorVariants.filter(
                  (v) =>
                    esJefe || esEncargado || getStockTotalVariante(v) > 0
                );

                if (!esJefe && !esEncargado && coloresVisibles.length === 0) {
                  return null;
                }

                const isModelActive = coloresVisibles.some(
                  (v) => v.originalIndex === selectedVariant
                );

                return (
                  <div
                    key={m.nombre}
                    className={`${styles.modelRow} ${
                      isModelActive ? styles.activeModelRow : ""
                    }`}
                  >
                    <div
                      className={styles.modelInfo}
                      style={{
                        borderRight:
                          coloresVisibles.length === 0 ? "none" : undefined,
                        cursor: "default",
                      }}
                    >
                      {m.imagenPrincipal ? (
                        <img src={m.imagenPrincipal} alt={m.nombre} />
                      ) : (
                        <div className={styles.noModelImage}>📷</div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <span className={styles.modelName}>{m.nombre}</span>
                      </div>
                    </div>

                    {coloresVisibles.length > 0 && (
                      <div className={styles.modelVariantsContainer}>
                        {coloresVisibles.map((v) => {
                          const agotada = getStockTotalVariante(v) <= 0;
                          const isSelected = selectedVariant === v.originalIndex;
                          const optionColor = formatCssColor(
                            v.colorHex || v.colorRgb || v.color || v.rgb
                          );

                          return (
                            <label
                              key={v.originalIndex}
                              className={`${styles.variantOption} ${
                                isSelected ? styles.selected : ""
                              } ${agotada ? styles.disabled : ""}`}
                            >
                              <input
                                type="radio"
                                name={`variant-${producto.id}`}
                                checked={isSelected}
                                onChange={() =>
                                  handleVariantSelect(v.originalIndex)
                                }
                                disabled={
                                  !esJefe && !esEncargado && agotada
                                }
                              />
                              <span className={styles.variantCircle}>
                                {v.image ? (
                                  <img
                                    src={v.image}
                                    alt={v.attr}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                      borderRadius: "50%",
                                    }}
                                  />
                                ) : optionColor ? (
                                  <span
                                    className={styles.variantFallback}
                                    style={{ backgroundColor: optionColor }}
                                  />
                                ) : (
                                  <span className={styles.variantFallback} />
                                )}
                                {agotada && (
                                  <span className={styles.soldOutBadge}>
                                    Agotado
                                  </span>
                                )}
                              </span>
                              <span className={styles.variantText}>
                                <span className={styles.variantName}>
                                  {v.attr}
                                </span>
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

          {/* FICHA TÉCNICA DINÁMICA */}
          <div className={styles.fichaContainer}>
            <button
              type="button"
              className={styles.toggleFicha}
              onClick={() => setShowFichaTecnica(!showFichaTecnica)}
            >
              <span>📋 Ficha técnica ({selectedModel || "General"})</span>
              <span>{showFichaTecnica ? "▲" : "▼"}</span>
            </button>

            {showFichaTecnica && (
              <div className={styles.fichaContent}>
                {variant?.fichaTecnica?.length > 0 ? (
                  variant.fichaTecnica.map((item, index) => (
                    <div key={index} className={styles.fichaRow}>
                      <span className={styles.fichaLabel}>{item.label}:</span>
                      <span className={styles.fichaValue}>{item.value}</span>
                    </div>
                  ))
                ) : (
                  <div className={styles.fichaRow}>
                    <span className={styles.fichaValue}>
                      Sin especificaciones cargadas.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

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

          <fieldset className={styles.buyFormat}>
            <legend>Paso 2: Elegí tu formato de compra</legend>
            <div className={styles.buyFormatGrid}>
              <button
                type="button"
                className={`${styles.formatButton} ${
                  formatoActual === "unidad" ? styles.selectedFormat : ""
                }`}
                onClick={() => setFormatoCompra("unidad")}
                disabled={totalStock <= 0}
              >
                <span>{totalStock} disponibles</span>
                <strong>Por unidad</strong>
              </button>
              {tieneJuego && (
                <button
                  type="button"
                  className={`${styles.formatButton} ${
                    formatoActual === "juego" ? styles.selectedFormat : ""
                  }`}
                  onClick={() => setFormatoCompra("juego")}
                  disabled={juegosDisponibles <= 0}
                >
                  <span>{juegosDisponibles} juegos disponibles</span>
                  <strong>Juego x{unidadesPorJuego}</strong>
                </button>
              )}
            </div>
          </fieldset>

          <div className={styles.stock}>
            {variant &&
              Object.entries(variant.stock || {}).map(
                ([sucursal, cantidad]) => {
                  const cant = Number(cantidad || 0);
                  let clase = styles.ok;
                  if (cant <= 0) clase = styles.out;
                  else if (cant < unidadesNecesarias) clase = styles.low;

                  return (
                    <div
                      key={sucursal}
                      className={`${styles.branch} ${clase}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        margin: "4px 0",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div className={styles.branchMeta}>
                        <span>🏬 {sucursal}</span>
                        <small style={{ display: "block", color: "#64748b" }}>
                          {cant} unidades{" "}
                          {tieneJuego &&
                            `/ ${Math.floor(cant / unidadesPorJuego)} juegos`}
                        </small>
                      </div>
                      <div
                        className={styles.stockControls}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{ fontWeight: "bold", fontSize: "0.95rem" }}
                        >
                          {cant} unidades
                        </span>
                        <button
                          className={styles.cartMini}
                          disabled={cant < unidadesNecesarias}
                          onClick={() => handleAddToCart(sucursal)}
                          title="Agregar al carrito"
                        >
                          🛒
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
          </div>

          <div className={styles.cardButtons}>
            <button className={styles.whatsapp} onClick={handleWhatsApp}>
              Pedir por WhatsApp
            </button>
            <button
              className={styles.share}
              onClick={handleShare}
              disabled={isSharing}
            >
              {isSharing ? "Generando..." : "Compartir"}
            </button>
            <button
              type="button"
              className={styles.printInstallments}
              onClick={handlePrintInstallments}
              disabled={isPrintingInstallments || precioSeleccionado <= 0}
              style={{
                background: "linear-gradient(135deg, #fbcfe8 0%, #f9a8d4 100%)",
                color: "#831843",
                border: "1px solid #f472b6",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <i className="bx bxs-cat" style={{ fontSize: "1.2rem" }}></i>
              {isPrintingInstallments ? "Preparando..." : "Imprimir cuotas"}
            </button>
            <button
              className={styles.mpButton}
              onClick={handleComprar}
              disabled={!sucursalDisponible || precioSeleccionado <= 0}
            >
              <SiMercadopago size={50} style={{ marginRight: "5px" }} /> Pagar
            </button>
          </div>
        </div>
      </article>

      {ticketPreviewUrl && (
        <div
          onClick={closeTicketPreview}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#ffffff",
              color: "#0f172a",
              borderRadius: 12,
              padding: 16,
              maxWidth: 420,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              textAlign: "center",
            }}
          >
            <p style={{ margin: "0 0 10px", fontSize: "0.9rem", fontWeight: 600 }}>
              Mantené apretada la imagen y tocá &ldquo;Compartir imagen&rdquo; para enviarla a Fun Print
            </p>
            <img
              src={ticketPreviewUrl}
              alt={`Cuotas ${producto.name}`}
              style={{
                width: "100%",
                height: "auto",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              onClick={closeTicketPreview}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                backgroundColor: "#0f172a",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {showCarrusel && (
        <ImgCarrusel
          imagenes={imagenesCarrusel}
          indexInicial={0}
          onClose={() => setShowCarrusel(false)}
        />
      )}
    </div>
  );
}