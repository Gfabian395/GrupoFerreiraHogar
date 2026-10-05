import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/Carrito.module.css";
import { useCart } from "../context/CartContext";
import { SiMercadopago } from "react-icons/si";

export default function Carrito() {
  const { items, updateQty, removeItem } = useCart();
  const [loading, setLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [descuento, setDescuento] = useState("");
  const navigate = useNavigate();

  const totalItems = items.reduce((acc, i) => acc + i.qty, 0);

  // Subtotal original (sin descuentos)
  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.qty,
    0
  );

  // Descuento a aplicar y total final
  const descuentoAplicado = Number(descuento) || 0;
  const total = Math.max(0, subtotal - descuentoAplicado);

  const formatARS = (valor) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
      Math.ceil(Number(valor) / 1000) * 1000
    );

  // CÁLCULO DE CUOTAS BASADO EN EL TOTAL DEL CARRITO
  const configuracionCuotas = [
    { cuotas: 2, interes: 30 },
    { cuotas: 3, interes: 50 },
    { cuotas: 4, interes: 70 },
    { cuotas: 6, interes: 90 },
    { cuotas: 9, interes: 120 },
    { cuotas: 12, interes: 150 },
  ];

  const cuotas = useMemo(() => {
    if (!total) return [];
    return configuracionCuotas
      .filter(({ cuotas }) => {
        if (total < 30000) return cuotas <= 2;
        if (total < 80000) return cuotas <= 3;
        if (total < 150000) return cuotas <= 6;
        if (total < 250000) return cuotas <= 9;
        return cuotas <= 12;
      })
      .map(({ cuotas, interes }) => {
        const monto = total * (1 + interes / 100);
        return `${cuotas} cuotas ${formatARS(Math.ceil(monto / cuotas / 1000) * 1000)}`;
      });
  }, [total]);

  // GENERACIÓN DE LA TARJETA DEL PRESUPUESTO COMPLETO EN CANVAS
  const generateCartPresupuestoImage = async () => {
    const width = 500;
    const padding = 25;

    // Cálculo dinámico de altura requerida según cantidad de items y cuotas
    let currentY = padding;
    currentY += 40; // Encabezado Presupuesto
    currentY += 25; // Fecha
    currentY += 20; // Separador
    currentY += items.length * 48; // Items
    currentY += 20; // Separador
    currentY += 28; // Subtotal
    if (descuentoAplicado > 0) currentY += 28; // Descuento
    currentY += 36; // Total

    // Espacio para la sección de cuotas
    if (cuotas.length > 0) {
      currentY += 35 + cuotas.length * 32;
    }

    currentY += 40; // Pie de página / aviso
    currentY += padding;

    const canvas = document.createElement("canvas");
    canvas.width = width * 2; // Alta resolución (Retina)
    canvas.height = currentY * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    // Fondo Blanco
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, currentY);

    // Borde general
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, width - 2, currentY - 2);

    let y = padding + 15;

    // 1. ENCABEZADO
    ctx.fillStyle = "#0f2b48";
    ctx.font = "bold 22px 'Segoe UI', sans-serif";
    ctx.fillText("PRESUPUESTO DE COMPRA", padding, y);

    y += 22;
    ctx.fillStyle = "#64748b";
    ctx.font = "12px sans-serif";
    ctx.fillText(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, padding, y);

    y += 15;
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    y += 25;

    // 2. LISTADO DE PRODUCTOS
    items.forEach((item) => {
      // Nombre del producto
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(item.name, padding, y);

      // Subtotal por item alineado a la derecha
      const itemSubtotalText = formatARS(item.price * item.qty);
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(itemSubtotalText, width - padding - ctx.measureText(itemSubtotalText).width, y);

      y += 18;

      // Variante y detalle de cantidad x precio
      ctx.fillStyle = "#64748b";
      ctx.font = "12px sans-serif";
      const varianteTexto = item.variant ? `Variante: ${item.variant} | ` : "";
      ctx.fillText(`${varianteTexto}${item.qty} u. x ${formatARS(item.price)}`, padding, y);

      y += 30;
    });

    // Separador pre-totales
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    y += 22;

    // 3. DESGLOSE DE TOTALES
    // Subtotal
    ctx.fillStyle = "#475569";
    ctx.font = "14px sans-serif";
    ctx.fillText("Subtotal", padding, y);

    const subtotalText = formatARS(subtotal);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(subtotalText, width - padding - ctx.measureText(subtotalText).width, y);

    // Descuento (si corresponde)
    if (descuentoAplicado > 0) {
      y += 26;
      ctx.fillStyle = "#dc2626";
      ctx.font = "14px sans-serif";
      ctx.fillText("Descuento", padding, y);

      const descuentoText = `-${formatARS(descuentoAplicado)}`;
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(descuentoText, width - padding - ctx.measureText(descuentoText).width, y);
    }

    y += 32;

    // Total Final Contado
    ctx.fillStyle = "#16a34a";
    ctx.font = "bold 18px 'Segoe UI', sans-serif";
    ctx.fillText("TOTAL CONTADO", padding, y);

    const totalText = formatARS(total);
    ctx.font = "bold 20px 'Segoe UI', sans-serif";
    ctx.fillText(totalText, width - padding - ctx.measureText(totalText).width, y);

    y += 30;

    // 4. SECCIÓN CUOTAS DISPONIBLES
    if (cuotas.length > 0) {
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

      y += 10;
    }

    // 5. AVISO DE VALIDEZ EN PIE
    ctx.fillStyle = "#f0f9ff";
    ctx.fillRect(padding, y, width - padding * 2, 28);
    ctx.strokeStyle = "#bae6fd";
    ctx.strokeRect(padding, y, width - padding * 2, 28);

    ctx.fillStyle = "#0369a1";
    ctx.font = "bold 11px sans-serif";
    const aviso = "Presupuesto válido por 15 días.";
    ctx.fillText(aviso, (width - ctx.measureText(aviso).width) / 2, y + 18);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
    });
  };

  // FUNCIÓN PARA COMPARTIR / COPIAR PRESUPUESTO
  const handleSharePresupuesto = async () => {
    if (items.length === 0 || isSharing) return;
    setIsSharing(true);

    try {
      const blob = await generateCartPresupuestoImage();

      if (!blob) {
        alert("Ocurrió un error al generar la imagen del presupuesto.");
        setIsSharing(false);
        return;
      }

      const file = new File([blob], `presupuesto-carrito.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Presupuesto de compra",
          text: `Presupuesto de carrito (${items.length} productos) - Total: ${formatARS(total)}`,
          files: [file],
        });
      } else if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        alert("📋 ¡Imagen del presupuesto copiada al portapapeles!\n\nAbrí tu chat de WhatsApp y presioná Ctrl + V para enviarla.");
      } else {
        const link = document.createElement("a");
        link.download = `presupuesto-carrito.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        alert("Imagen descargada. Podés adjuntarla manualmente en tu mensaje.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error al compartir presupuesto:", error);
        alert("Ocurrió un error al generar o compartir el presupuesto.");
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handlePagarCarrito = async () => {
    if (items.length === 0) return;

    if (total <= 0) {
      alert("El total es $0. Mercado Pago no permite pagos gratuitos. Usá 'Finalizar compra' para registrarlo en el sistema.");
      return;
    }

    try {
      setLoading(true);

      const factorDescuento = subtotal > 0 ? total / subtotal : 1;

      const response = await fetch("/api/crear-preferencia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.id,
            title: item.name,
            price: Math.round(item.price * factorDescuento),
            quantity: item.qty,
            variant: item.variant,
            branch: item.branch,
            categoriaId: item.categoriaId,
          })),
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(responseText || `Error HTTP: ${response.status}`);
      }

      const data = JSON.parse(responseText);

      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert("Error: El backend no devolvió el init_point de Mercado Pago");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error pagando carrito:", error);
      alert("Error contactando al servidor. Revisá la consola.");
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
              const totalStock = Object.values(item.stockFull || {}).reduce(
                (a, b) => a + Number(b || 0),
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
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString("es-AR")}</span>
          </div>

          <div className={styles.row}>
            <span>Descuento ($)</span>
            <input 
              type="number" 
              min="0"
              className={styles.input} 
              style={{ width: "90px", padding: "4px", textAlign: "right" }}
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              placeholder="0"
            />
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
            onClick={() => navigate("/ventas", { state: { descuentoPreCargado: descuento } })}
          >
            Finalizar compra
          </button>

          {/* BOTÓN COMPARTIR PRESUPUESTO DEL CARRITO */}
          <button
            type="button"
            className={styles.sharePresupuesto}
            style={{
              marginTop: "10px",
              padding: "10px",
              backgroundColor: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              cursor: items.length === 0 || isSharing ? "not-allowed" : "pointer",
              opacity: items.length === 0 || isSharing ? 0.6 : 1,
              width: "100%"
            }}
            disabled={items.length === 0 || isSharing}
            onClick={handleSharePresupuesto}
          >
            📄 {isSharing ? "Generando..." : "Compartir Presupuesto"}
          </button>
        </aside>
      </div>
    </section>
  );
}