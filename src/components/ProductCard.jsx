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

    try {
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      const userName = snap.exists() ? snap.data().nombre : "Desconocido";

      await addDoc(collection(db, "notificaciones"), {
        userId: user.uid,
        userName,
        userEmail: user.email ?? "Sin Email",
        action,
        detail: {
          tipo: detail.tipo ?? null,
          producto: producto.name ?? "Producto sin nombre",
          variante: variant?.attr ?? null,
          formatoCompra: formatoActual ?? null,
          ...detail,
        },
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("❌ Error enviando notificación a Firebase:", error);
    }
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
        formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Por unidad";

      const mensaje = `Mirá este producto 👇\n${producto.name} - ${variant.attr}\nFormato: ${formatoTexto}\nPrecio: ${formatARS(precioSeleccionado)}\n${productUrl}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
      window.open(whatsappUrl, "_blank");
    } catch (error) {
      console.error("Error compartiendo:", error);
    }
  };

  const handleWhatsApp = () => {
    const formatoTexto =
      formatoActual === "juego" ? `Juego x${unidadesPorJuego}` : "Por unidad";

    const mensaje = `Hola, quiero consultar por:\n${producto.name} - ${variant.attr}\nFormato: ${formatoTexto}\nPrecio: ${formatARS(precioSeleccionado)}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(whatsappUrl, "_blank");
  };

// REMPLAZÁ ESTA FUNCIÓN COMPLETA EN TU ARCHIVO
const handlePrintPresupuesto = () => {
    const printWindow = window.open("", "_blank", "width=400,height=600");
    const fechaActual = new Date().toLocaleDateString("es-AR");
    const imagenUrl = variant.image || producto.image || "";
    const formatoTexto = formatoActual === "juego" ? ` (Juego x${unidadesPorJuego})` : "";

    printWindow.document.write(`
      <html>
        <head>
          <title>Presupuesto - ${producto.name}</title>
          <link href='https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' rel='stylesheet'>
          <style>
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box;
            }
            
            /* Ajuste estricto de página para evitar saltos de hoja */
            @page { 
              size: 4in 6in; 
              margin: 5mm 5mm 5mm 5mm; 
            }
            body {
              font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              color: #0f172a;
              display: flex;
              flex-direction: column;
              background-color: #ffffff;
              overflow: hidden;
            }
            
            /* Header */
            .header-banner {
              background: #ffffff;
              color: #0f2b48;
              padding: 0 0 5px 0;
              border-bottom: 2.5px solid #0f2b48;
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-shrink: 0;
            }
            
            .header-left {
              text-align: left;
              display: flex;
              flex-direction: column;
              gap: 1px;
            }
            
            .main-title {
              font-size: 24px; 
              font-weight: 800;
              color: #0f2b48;
              margin: 0;
              letter-spacing: 0.5px;
              text-transform: uppercase;
            }
            
            .header-meta {
              font-size: 11.5px;
              color: #475569;
              font-weight: 600;
            }
            
            .logo-container {
              background: #ffffff;
              width: 58px; 
              height: 58px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 1px 4px rgba(0,0,0,0.1);
              overflow: hidden;
              flex-shrink: 0;
            }
            .logo-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            
            /* Contenido Base optimizado en espacio */
            .content {
              padding: 6px 0 0 0;
              display: flex;
              flex-direction: column;
              flex-grow: 1;
              justify-content: space-between; 
              gap: 8px; 
            }

            /* Estructura de 2 Columnas */
            .main-grid {
              display: flex;
              gap: 8px;
              align-items: stretch;
            }
            
            /* Columna Izquierda */
            .left-column {
              width: 52%;
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            
            .product-details {
              text-align: left;
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            .product-name {
              font-size: 13.5px;
              font-weight: 700;
              color: #0f2b48;
              margin: 0;
              line-height: 1.2;
            }
            .product-variant {
              font-size: 13px;
              font-weight: 800;
              color: #0f2b48;
              margin: 1px 0;
              background-color: #f1f5f9;
              padding: 2px 6px;
              border-radius: 4px;
              display: inline-block;
              width: fit-content;
            }
            .product-price {
              font-size: 14px;
              color: #0284c7;
              font-weight: 800;
              margin: 0;
            }

            /* Lista de Cuotas */
            .cuotas-list {
              display: flex;
              flex-direction: column;
              gap: 3px;
            }
            .cuota-item {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              font-size: 13px; 
              background-color: #f8fafc;
              padding: 3.5px 5px;
              border-radius: 4px;
              border-left: 3.5px solid #0284c7;
            }
            .cuota-label {
              color: #0f172a;
              font-weight: 700;
              white-space: nowrap;
            }
            .cuota-dots {
              flex-grow: 1;
              border-bottom: 1.5px dotted #cbd5e1;
              margin: 0 2px;
              position: relative;
              top: -3px;
            }
            .cuota-value {
              font-weight: 800;
              color: #0f2b48;
              white-space: nowrap;
            }

            /* Columna Derecha con imagen cover */
            .right-column {
              width: 48%;
              display: flex;
              flex-direction: column;
              gap: 5px;
            }
            
            .image-wrapper {
              width: 100%;
              height: 100px; /* Ajuste sutil para garantizar una sola hoja */
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              background-color: #ffffff;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .product-img {
              width: 100%;
              height: 100%;
              object-fit: cover; 
              object-position: center;
            }

            /* Bloque Requisitos */
            .requisitos-block {
              background-color: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 4px 5px;
              display: flex;
              flex-direction: column;
              gap: 2px;
              flex-grow: 1;
              justify-content: center;
            }
            
            .credito-llamativo {
              background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
              color: #ffffff;
              font-size: 11px;
              font-weight: 900;
              text-align: center;
              padding: 3px 2px;
              border-radius: 4px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            
            .requisitos-title {
              font-size: 9.5px;
              font-weight: 700;
              color: #0f2b48;
              margin: 1px 0 0 0;
              text-transform: uppercase;
              border-bottom: 1px solid #e2e8f0;
            }
            .requisitos-item {
              font-size: 10px;
              color: #1e293b;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 4px;
              line-height: 1.1;
            }
            .requisitos-item i {
              font-size: 12px;
              color: #0284c7;
              flex-shrink: 0;
            }
            
            /* Bloques Inferiores (Sucursales y Redes) */
            .bottom-row {
              display: flex;
              gap: 6px;
            }
            
            .contacto-block, .redes-block {
              width: 50%;
              background-color: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              padding: 4px 5px;
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            .section-title {
              font-size: 10px;
              font-weight: 700;
              color: #0f2b48;
              margin: 0 0 2px 0;
              text-transform: uppercase;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 1px;
            }
            .contacto-row {
  display: flex;
  flex-direction: column; /* Cambia a columna para que el teléfono quede abajo de la dirección */
  align-items: flex-start;
  font-size: 10px;
  margin-bottom: 4px; /* Un pequeño margen entre sucursal y sucursal */
}

/* Agrega o modifica esto para darle un toque visual más limpio */
.contacto-branch {
  color: #334155;
  font-weight: 700; /* Un poco más de peso para diferenciarlo del teléfono */
  display: flex;
  align-items: center;
  gap: 2px;
}
            .contacto-branch i {
              color: #64748b;
              font-size: 11px;
            }
            .contacto-phone {
  color: #16a34a;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 13px; /* Alinea el teléfono justo debajo del texto de la dirección, ignorando el icono del mapa */
}

            .redes-row {
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 10px;
              color: #334155;
              font-weight: 600;
            }
            .redes-row i {
              font-size: 13px;
              color: #0f2b48;
              flex-shrink: 0;
            }

            /* Alerta de Validez */
            .validez-alert {
              background-color: #f0f9ff;
              border: 1px solid #bae6fd;
              color: #0369a1;
              font-size: 11px;
              font-weight: 700;
              text-align: center;
              padding: 4px;
              border-radius: 4px;
            }

            .divider {
              height: 1px;
              background-color: #e2e8f0;
            }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <div class="header-left">
              <h1 class="main-title">Presupuesto</h1>
              <div class="header-meta">Emisión: ${fechaActual}</div>
            </div>
            <div class="logo-container">
              <img class="logo-img" src="/Logo---Invierno.png" alt="Logo Invierno" />
            </div>
          </div>

          <div class="content">
            <div class="main-grid">
              
              <div class="left-column">
                <div class="product-details">
                  <h2 class="product-name">${producto.name}${formatoTexto}</h2>
                  <p class="product-variant">${variant.attr}</p>
                  <p class="product-price">PRECIO CONTADO: ${formatARS(precioSeleccionado)}</p>
                </div>
                <div class="divider"></div>
                <div class="cuotas-list">
                  ${cuotas.map(c => {
                    const parts = c.split(" cuotas ");
                    const cantidad = parts[0] ? `${parts[0]} cuotas` : "";
                    const monto = parts[1] || "";
                    return `
                      <div class="cuota-item">
                        <span class="cuota-label">${cantidad}</span>
                        <div class="cuota-dots"></div>
                        <span class="cuota-value">${monto}</span>
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>
              
              <div class="right-column">
                <div class="image-wrapper">
                  ${imagenUrl ? `<img class="product-img" src="${imagenUrl}" alt="Product" />` : `<div style="font-size:12px;color:#94a3b8;">Sin Foto</div>`}
                </div>
                
                <div class="requisitos-block">
                  <div class="credito-llamativo">
                    🔥 CRÉDITO INICIAL<br>HASTA $300.000
                  </div>
                  <p class="requisitos-title">Requisitos:</p>
                  <div class="requisitos-item"><i class='bx bx-id-card'></i> DNI</div>
                  <div class="requisitos-item"><i class='bx bx-receipt'></i> Recibo Sueldo o</div>
                  <div class="requisitos-item"><i class='bx bx-home-alt'></i> Servicio (del mismo DNI)</div>
                  <div class="requisitos-item"><i class='bx bx-phone'></i> 2 Números de Teléfono</div>
                  <div class="requisitos-item"><i class='bx bx-dollar-circle'></i> Abonar la 1ra Cuota</div>
                  <div class="requisitos-item"><i class='bx bx-camera'></i> Foto digital</div>
                </div>
              </div>

            </div>

            <div class="divider"></div>

            <div class="bottom-row">
              <div class="contacto-block">
                <h2 class="section-title">Sucursales</h2>
                <div class="contacto-row">
                  <span class="contacto-branch"><i class='bx bx-map-pin'></i> Los Andes 4320</span>
                  <span class="contacto-phone"><i class='bx bxl-whatsapp'></i>11-2846-6001</span>
                </div>
                <div class="contacto-row">
                  <span class="contacto-branch"><i class='bx bx-map-pin'></i> Los Andes 4034</span>
                  <span class="contacto-phone"><i class='bx bxl-whatsapp'></i>11-2553-8824</span>
                </div>
                <div class="contacto-row">
                  <span class="contacto-branch"><i class='bx bx-map-pin'></i> La Fuente 2440</span>
                  <span class="contacto-phone"><i class='bx bxl-whatsapp'></i>11-7644-7868</span>
                </div>
              </div>

              <div class="redes-block">
                <h2 class="section-title">Síguenos</h2>
                <div class="redes-row"><i class='bx bxl-facebook-circle'></i> <b>Grupo Ferreira</b></div>
                <div class="redes-row"><i class='bx bxl-instagram'></i> <b>@ferreirahogar</b></div>
                <div class="redes-row"><i class='bx bxl-tiktok'></i> <b>@ferreirahogar1</b></div>
              </div>
            </div>

            <div class="validez-alert">
              ❄️ Presupuesto válido por 15 días.
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
            {/* NUEVO BOTÓN AGREGADO */}
            <button
              type="button"
              className={styles.printBudget}
              onClick={handlePrintPresupuesto}
              style={{ backgroundColor: "#002d72", color: "#fff", fontWeight: "bold" }}
            >
              📄 Imprimir Presupuesto
            </button>

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