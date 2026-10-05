import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseConfig";
import ProductCard from "../components/ProductCard";
import ComboCard from "../components/ComboCard";
import AddProduct from "../components/AddProduct";
import AddCombo from "../components/AddCombo";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import styles from "../styles/Productos.module.css";
import { Loader } from "../components/Loader";
import Drop from "../components/Drop";
import Cuotas from "../components/Cuotas";

export const Productos = () => {
  const { categoriaId } = useParams();
  const location = useLocation();
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoriaNombre, setCategoriaNombre] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [addType, setAddType] = useState(null);
  const [productoEditando, setProductoEditando] = useState(null);
  const [role, setRole] = useState(null);
  const [search, setSearch] = useState("");
  const [showSinStock, setShowSinStock] = useState(false);
  const isJefe = role === "jefe";
  const isEncargado = role === "encargado";
  const canUseCalculator = isJefe || isEncargado || role === "vendedor";
  const canAddOrEdit = isJefe || isEncargado;
  const canDelete = isJefe;
  const [ordenPrecio, setOrdenPrecio] = useState("ninguno");
  const [showCalculator, setShowCalculator] = useState(false);

  // Estados para la selección e impresión de QR
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState([]);

  // Referencias directas a los nodos del DOM para garantizar el autoscroll
  const itemRefs = useRef({});

  /* ===============================
      SCROLL AUTOMÁTICO AL PRODUCTO BUSCADO
   =============================== */
  useEffect(() => {
    if (loading || productos.length === 0) return;

    const searchParams = new URLSearchParams(location.search);
    const targetId = searchParams.get("producto") || location.state?.productoId;

    if (!targetId) return;

    // Si el producto buscado no está visible porque no hay stock y el filtro está apagado, lo encendemos
    const estaVisible = productosFiltrados.some((p) => p.id === targetId);
    if (!estaVisible && !showSinStock) {
      setShowSinStock(true);
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;

    const executeScroll = () => {
      const element = itemRefs.current[targetId] || document.getElementById(`prod-${targetId}`);

      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });

        // APLICA EL EFECTO NEÓN DE RESALTADO
        element.classList.add(styles.highlightCard);

        // Remueve el resplandor tras 3 segundos
        setTimeout(() => {
          element.classList.remove(styles.highlightCard);
        }, 3000);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(executeScroll, 100);
      }
    };

    const timeoutId = setTimeout(() => {
      requestAnimationFrame(executeScroll);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [loading, productos, location, showSinStock]);

  /* ===============================
     ATAJOS DE TECLADO
  =============================== */

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!canAddOrEdit) return;

      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const isPlus =
        e.key === "+" ||
        (e.key === "=" && e.shiftKey) ||
        e.code === "NumpadAdd";

      const isStar =
        e.key === "*" ||
        (e.key === "8" && e.shiftKey) ||
        e.code === "NumpadMultiply";

      if (isPlus && e.shiftKey) {
        e.preventDefault();
        setProductoEditando(null);
        setSelectorOpen(false);
        setAddType("product");
        setAddOpen(true);
        return;
      }

      if (isStar && e.shiftKey) {
        e.preventDefault();
        setProductoEditando(null);
        setSelectorOpen(false);
        setAddType("combo");
        setAddOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canAddOrEdit]);

  /* ===============================
     OBTENER ROL
  =============================== */

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const user = auth.currentUser;

        if (!user) {
          const guest = localStorage.getItem("guestUser");
          if (guest) {
            setRole(JSON.parse(guest).role);
          }
          return;
        }

        const snap = await getDoc(doc(db, "usuarios", user.uid));

        if (snap.exists()) {
          setRole(snap.data().role);
        }
      } catch (error) {
        console.error("Error obteniendo rol:", error);
      }
    };

    fetchRole();
  }, []);

  /* ===============================
     OBTENER PRODUCTOS
  =============================== */

  const fetchProductos = async () => {
    if (!categoriaId) return;

    try {
      const ref = collection(db, "categorias", categoriaId, "productos");
      const snap = await getDocs(ref);

      const dataOrdenada = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", "es", {
            sensitivity: "base",
          })
        );

      setProductos(dataOrdenada);
    } catch (error) {
      console.error("Error obteniendo productos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductos();
  }, [categoriaId]);

  useEffect(() => {
    const fetchCategoria = async () => {
      try {
        const ref = doc(db, "categorias", categoriaId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setCategoriaNombre(snap.data().name || "categoria");
        }
      } catch (error) {
        console.error("Error obteniendo categoría:", error);
      }
    };

    if (categoriaId) fetchCategoria();
  }, [categoriaId]);

  /* ===============================
     FILTRO DE PRODUCTOS
  =============================== */

  const productosFiltrados = productos.filter((p) => {
    const coincideBusqueda = (p.name || "")
      .toLowerCase()
      .includes(search.toLowerCase());

    if (p.type === "combo") {
      return coincideBusqueda;
    }

    const totalStock = (p.variantes || []).reduce((total, variante) => {
      const stockVariante = Object.values(variante?.stock || {}).reduce(
        (a, b) => a + Number(b || 0),
        0
      );

      return total + stockVariante;
    }, 0);

    const tieneStock = totalStock > 0;
    const esInvitado = role === "invitado";

    if (esInvitado) {
      return coincideBusqueda && tieneStock;
    }

    if (!showSinStock) {
      return coincideBusqueda && tieneStock;
    }

    return coincideBusqueda;
  });

  /* ===============================
      FILTRO Y ORDEN DE PRODUCTOS
   =============================== */

  const getPrecioParaOrdenar = (item, orden) => {
    const precios = (item.variantes || []).map((v) => Number(v.price || 0));

    if (item.price) {
      precios.push(Number(item.price));
    }

    const preciosValidos = precios.filter((p) => !isNaN(p) && p > 0);

    if (preciosValidos.length === 0) return orden === "asc" ? Infinity : 0;

    return orden === "asc"
      ? Math.min(...preciosValidos)
      : Math.max(...preciosValidos);
  };

  const productosOrdenados = [...productosFiltrados].sort((a, b) => {
    if (ordenPrecio === "asc") {
      return getPrecioParaOrdenar(a, "asc") - getPrecioParaOrdenar(b, "asc");
    }

    if (ordenPrecio === "desc") {
      return getPrecioParaOrdenar(b, "desc") - getPrecioParaOrdenar(a, "desc");
    }

    return (a.name || "").localeCompare(b.name || "", "es", {
      sensitivity: "base",
    });
  });

  /* ===============================
     NOTIFICACIONES
  =============================== */

  const sendNotification = async (action, detail = {}) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "usuarios", user.uid));

      const userName = snap.exists()
        ? snap.data().nombre
        : "Desconocido";

      await addDoc(collection(db, "notificaciones"), {
        userId: user.uid,
        userName,
        userEmail: user.email,
        action,
        detail,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error enviando notificación:", error);
    }
  };

  /* ===============================
     ELIMINAR PRODUCTO
  =============================== */

  const handleDelete = async (id, nombre) => {
    if (!canDelete) return;

    if (!window.confirm(`¿Eliminar ${nombre}?`)) return;

    try {
      const ref = doc(db, "categorias", categoriaId, "productos", id);

      await deleteDoc(ref);

      await sendNotification("eliminó producto", {
        tipo: "eliminado",
        producto: nombre,
      });

      fetchProductos();
    } catch (error) {
      console.error("Error eliminando producto:", error);
    }
  };

  /* ===============================
     AGREGAR / EDITAR PRODUCTO
  =============================== */

  const handleAddProduct = async (productoNuevo) => {
    if (!canAddOrEdit) return;

    try {
      if (productoEditando) {
        const ref = doc(
          db,
          "categorias",
          categoriaId,
          "productos",
          productoEditando.id
        );

        await setDoc(ref, productoNuevo, { merge: true });
      } else {
        await addDoc(
          collection(db, "categorias", categoriaId, "productos"),
          {
            ...productoNuevo,
            type: "product",
            categoriaId,
          }
        );
      }

      fetchProductos();

      setAddOpen(false);
      setAddType(null);
      setProductoEditando(null);
    } catch (e) {
      console.error("Error guardando producto:", e);
    }
  };

  /* ===============================
     AGREGAR COMBO
  =============================== */

  const handleAddCombo = async (comboNuevo) => {
    if (!canAddOrEdit) return;

    try {
      await addDoc(
        collection(db, "categorias", categoriaId, "productos"),
        {
          ...comboNuevo,
          type: "combo",
          categoriaId,
        }
      );

      fetchProductos();

      setAddOpen(false);
      setAddType(null);
    } catch (e) {
      console.error("Error guardando combo:", e);
    }
  };

  /* ===============================
     EDITAR PRODUCTO
  =============================== */

  const handleEditProduct = (producto) => {
    setProductoEditando(producto);
    setAddType("product");
    setAddOpen(true);
  };

  const handleIncreasePrices = async () => {
    const porcentajeInput = prompt("¿Qué porcentaje querés aumentar? (ej: 10 para 10%)");

    if (!porcentajeInput) return;

    const porcentaje = Number(porcentajeInput);

    if (isNaN(porcentaje)) {
      alert("Por favor ingresá un número válido");
      return;
    }

    if (!window.confirm(`¿Aumentar precios un ${porcentaje}% y redondear a múltiplos de 1000?`)) return;

    try {
      const ref = collection(db, "categorias", categoriaId, "productos");
      const snap = await getDocs(ref);

      const updates = snap.docs.map((d) => {
        const data = d.data();

        if (!data.variantes) return Promise.resolve();

        const nuevasVariantes = data.variantes.map((v) => {
          const precio = Number(v.price || 0);

          const precioAumentado = precio * (1 + porcentaje / 100);

          const nuevoPrecio = Math.ceil(precioAumentado / 1000) * 1000;

          return {
            ...v,
            price: nuevoPrecio,
          };
        });

        return setDoc(
          doc(db, "categorias", categoriaId, "productos", d.id),
          { variantes: nuevasVariantes },
          { merge: true }
        );
      });

      await Promise.all(updates);

      alert("Precios aumentados correctamente");
      await fetchProductos();

    } catch (error) {
      console.error(error);
    }
  };

  const handleDecreasePrices = async () => {
    const porcentajeInput = prompt("¿Qué porcentaje querés bajar? (ej: 10 para 10%)");

    if (!porcentajeInput) return;

    const porcentaje = Number(porcentajeInput);

    if (isNaN(porcentaje)) {
      alert("Por favor ingresá un número válido");
      return;
    }

    if (!window.confirm(`¿Bajar precios un ${porcentaje}% y redondear al múltiplo inferior de 1000?`)) return;

    try {
      const ref = collection(db, "categorias", categoriaId, "productos");
      const snap = await getDocs(ref);

      const updates = snap.docs.map((d) => {
        const data = d.data();

        if (!data.variantes) return Promise.resolve();

        const nuevasVariantes = data.variantes.map((v) => {
          const precio = Number(v.price || 0);

          const precioReducido = precio * (1 - porcentaje / 100);

          const nuevoPrecio = Math.floor(precioReducido / 1000) * 1000;

          return {
            ...v,
            price: nuevoPrecio,
          };
        });

        return setDoc(
          doc(db, "categorias", categoriaId, "productos", d.id),
          { variantes: nuevasVariantes },
          { merge: true }
        );
      });

      await Promise.all(updates);

      alert("Precios reducidos correctamente");
      await fetchProductos();

    } catch (error) {
      console.error(error);
    }
  };

  /* ===============================
     GENERACIÓN DE QR Y SELECCIÓN
  =============================== */

  const openQRSelector = () => {
    setQrModalOpen(true);
  };

  const toggleSelectVariant = (variantKey) => {
    setSelectedVariants((prev) =>
      prev.includes(variantKey)
        ? prev.filter((id) => id !== variantKey)
        : [...prev, variantKey]
    );
  };

  const toggleSelectAllVariants = () => {
    const allKeys = [];
    productos.forEach((p) => {
      if (p.variantes) {
        p.variantes.forEach((_, index) => {
          allKeys.push(`${p.id}_${index}`);
        });
      }
    });

    if (selectedVariants.length === allKeys.length) {
      setSelectedVariants([]);
    } else {
      setSelectedVariants(allKeys);
    }
  };

  const handleGenerateQR = async (selectedVariantIds = []) => {
    try {
      const ref = collection(db, "categorias", categoriaId, "productos");
      const snap = await getDocs(ref);

      let html = `
      <html>
      <head>
        <title>Catálogo de Productos QR</title>
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }

          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 5px;
            background-color: #ffffff;
            color: #1e293b;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .container {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            justify-content: center;
          }

          .item {
            display: flex;
            flex-direction: column;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 10px;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
            page-break-inside: avoid;
            position: relative;
            box-sizing: border-box;
          }

          .img-container {
            width: 100%;
            height: 110px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            overflow: hidden;
            background-color: #f1f5f9;
            border: 1px solid #e2e8f0;
          }

          .product-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .meta-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          h3 {
            margin: 0;
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .attr {
            font-size: 11px;
            color: #64748b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .price {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 1px;
          }

          .qr-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 4px;
          }

          .qr-container {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
            border-radius: 12px; 
            width: 76px;
            height: 76px;
            box-shadow: 0 0 12px rgba(0, 180, 216, 0.25);
            border: 2px solid #00b4d8;
          }

          .qr {
            width: 64px;
            height: 64px;
            display: block;
          }
        </style>
      </head>
      <body>

      <div class="container">
      `;

      for (const d of snap.docs) {
        const data = d.data();

        if (!data.variantes) continue;

        for (const [index, variante] of data.variantes.entries()) {
          const variantKey = `${d.id}_${index}`;

          // Filtrar si hay una lista de selección activa
          if (selectedVariantIds.length > 0 && !selectedVariantIds.includes(variantKey)) {
            continue;
          }

          const totalStockVariante = Object.values(variante?.stock || {}).reduce(
            (total, cantidad) => total + Number(cantidad || 0),
            0
          );

          if (totalStockVariante <= 0 || variante.disponible === false) {
            continue;
          }

          const url = `${window.location.origin}/producto/${categoriaId}/${d.id}?v=${index}`;
          const qr = await QRCode.toDataURL(url);

          const imageUrl = data.image || variante.image || "";

          html += `
          <div class="item">
            ${imageUrl
              ? `<div class="img-container"><img class="product-img" src="${imageUrl}" /></div>`
              : `<div class="img-container" style="color: #94a3b8; font-size: 11px;">Sin foto</div>`
            }

            <div class="meta-info">
              <h3>${data.name}</h3>
              <div class="attr">${variante.attr || "Estándar"}</div>
              <div class="price">$${Number(variante.price).toLocaleString('es-AR')}</div>
            </div>

            <div class="qr-wrapper">
              <div class="qr-container">
                <img class="qr" src="${qr}" />
              </div>
            </div>

          </div>
          `;
        }
      }

      html += `
      </div>

      <script>
        window.onload = () => {
          setTimeout(() => {
            window.print();
          }, 300);
        };
      </script>

      </body>
      </html>
      `;

      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();

    } catch (error) {
      console.error(error);
    }
  };

  const handlePDFStock = async () => {
    try {
      setDownloadingPDF(true);

      const ref = collection(db, "categorias", categoriaId, "productos");
      const snap = await getDocs(ref);

      let html = `
    <html>
    <head>
      <title>Stock ${categoriaNombre}</title>

      <style>

      @page{
        size:A4;
        margin:10mm;
      }

      body{
        font-family:Arial;
        margin:0;
      }

      .container{
        display: flex;
        gap: 8px;
        flex-direction: row;
        align-content: center;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
      }

      .card{
        display:flex;
        align-items:center;
        border:1px solid #000;
        padding:8px;
        overflow:hidden;
        height:200px;
          width: 500px;
      }

      .img{
        max-width:300px;
        max-height:300px;
        object-fit:contain;
        transform:scale(1.6);
        transform-origin:left center;
        margin-left: -120px;
      }

      .info{
        flex:1;
        padding-left:65px;
      }

      .title{
        font-size:14px;
        font-weight:bold;
        margin-bottom:8px;
      }

      .stock{
        font-size:13px;
        margin-bottom:6px;
      }

      </style>
    </head>

    <body>

    <div class="container">
    `;

      for (const d of snap.docs) {

        const data = d.data();
        const variantes = data.variantes || [null];

        for (const variante of variantes) {

          const imageUrl =
            variante?.image ||
            data.image ||
            "https://via.placeholder.com/150";

          const nombre = variante
            ? `${data.name} - ${variante.attr || ""}`
            : data.name;

          html += `
        <div class="card">

          <img class="img" src="${imageUrl}" />

          <div class="info">

            <div class="title">
              ${nombre}
            </div>

            <div class="stock">
              Los Andes 4320: ________
            </div>

            <div class="stock">
              Los Andes 4034: ________
            </div>

            <div class="stock">
              La Fuente 2440: ________
            </div>

          </div>

        </div>
        `;
        }
      }

      html += `
    </div>

    <script>
      window.onload = () => window.print();
    </script>

    </body>
    </html>
    `;

      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();

    } catch (error) {
      console.error(error);
    } finally {
      setDownloadingPDF(false);
    }
  };

  /* ===============================
     ELIMINAR PRODUCTOS SIN STOCK
  =============================== */
  const handleDeleteSinStockMasivo = async () => {
    if (!canDelete) return;

    if (!window.confirm("¿Estás seguro de eliminar permanentemente todos los productos que tengan stock 0 en todas las sucursales?")) return;

    try {
      setLoading(true);
      const ref = collection(db, "categorias", categoriaId, "productos");
      const snap = await getDocs(ref);

      let countEliminados = 0;

      const promesasEliminacion = snap.docs.map(async (documento) => {
        const data = documento.data();

        if (data.type === "combo") return;

        const variantes = data.variantes || [];

        const sinStockEnAbsoluto = variantes.length === 0 || variantes.every((v) => {
          const stockTotalVariante = Object.values(v?.stock || {}).reduce(
            (total, cantidad) => total + Number(cantidad || 0),
            0
          );
          return stockTotalVariante <= 0;
        });

        if (sinStockEnAbsoluto) {
          countEliminados++;
          const docRef = doc(db, "categorias", categoriaId, "productos", documento.id);
          return deleteDoc(docRef);
        }
      });

      await Promise.all(promesasEliminacion);

      await sendNotification("eliminó masivamente productos sin stock", {
        tipo: "eliminacion_masiva",
        cantidad: countEliminados,
      });

      alert(`Se eliminaron ${countEliminados} productos sin stock correctamente.`);
      await fetchProductos();
    } catch (error) {
      console.error("Error eliminando productos sin stock:", error);
      alert("Hubo un error al intentar eliminar los productos.");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     CÁLCULO DE CONTADOR (PRODUCTOS Y VARIANTES)
  =============================== */
  const totalProductosCount = productos.length;
  const totalVariantesCount = productos.reduce((acc, p) => {
    if (p.type === "combo") return acc + 1;
    return acc + (p.variantes ? p.variantes.length : 0);
  }, 0);

  if (loading || role === null) return <Loader />;

  return (
    <div className={styles.container}>
      {
        downloadingPDF && (
          <div className={styles.downloadOverlay}>
            <Loader />
            <p className={styles.downloadText}>Descargando PDF...</p>
          </div>
        )
      }
      <div className={styles.searchWrapper}>
        <input
          type="text"
          placeholder="🔍 Buscar producto en esta categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.neonSearch}
        />
      </div>

      <div className={styles.priceFilters}>
        <button
          className={ordenPrecio === "ninguno" ? styles.activeFilter : ""}
          onClick={() => setOrdenPrecio("ninguno")}
        >
          Todos
        </button>

        <button
          className={ordenPrecio === "asc" ? styles.activeFilter : ""}
          onClick={() => setOrdenPrecio("asc")}
        >
          💲 Menor a mayor
        </button>

        <button
          className={ordenPrecio === "desc" ? styles.activeFilter : ""}
          onClick={() => setOrdenPrecio("desc")}
        >
          💰 Mayor a menor
        </button>

        {/* 📊 Contador exclusivo para el Jefe */}
        {isJefe && (
          <div style={{ display: "inline-flex", alignItems: "center", padding: "0 8px", fontSize: "13px", fontWeight: "600", color: "#334155", background: "#f1f5f9", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
            Prod: {totalProductosCount} | Var: {totalVariantesCount}
          </div>
        )}

        {/* 🗑️ Botón exclusivo para Jefes */}
        {canDelete && (
          <button
            style={{ backgroundColor: "#ef4444", color: "white" }}
            onClick={handleDeleteSinStockMasivo}
            title="Elimina productos con stock 0 en todas las sucursales"
          >
            🗑️ Limpiar Sin Stock
          </button>
        )}
      </div>

      {productos.length === 0 ? (
        <p>No hay productos en esta categoría.</p>
      ) : (
        <div className={styles.grid}>
          {productosOrdenados.map((item) => {
            if (item.type === "combo") {
              return (
                <div
                  key={item.id}
                  id={`prod-${item.id}`}
                  data-producto-id={item.id}
                  ref={(el) => (itemRefs.current[item.id] = el)}
                >
                  <ComboCard
                    combo={item}
                    productos={productos}
                    Role={role}
                    onEdit={() => handleEditProduct(item)}
                    onDeleteCombo={
                      canDelete
                        ? (deletedId) =>
                          setProductos((prev) =>
                            prev.filter((p) => p.id !== deletedId)
                          )
                        : null
                    }
                  />
                </div>
              );
            }

            return (
              <div
                key={item.id}
                id={`prod-${item.id}`}
                data-producto-id={item.id}
                ref={(el) => (itemRefs.current[item.id] = el)}
              >
                <ProductCard
                  producto={item}
                  userRole={role}
                  onEdit={canAddOrEdit ? () => handleEditProduct(item) : null}
                  onDelete={
                    canDelete
                      ? () => handleDelete(item.id, item.name)
                      : null
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE SELECCIÓN DE VARIANTES / PRODUCTOS PARA IMPRIMIR QR */}
      {qrModalOpen && (
        <div className={styles.overlay} onClick={() => setQrModalOpen(false)}>
          <div
            className={styles.selector}
            style={{ maxWidth: "550px", width: "90%", maxHeight: "80vh", overflowY: "auto", textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px 0" }}>Seleccionar Productos para QR</h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 15px 0" }}>
              Marque las variantes que desea incluir en el catálogo de códigos QR.
            </p>

            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              <button
                type="button"
                onClick={toggleSelectAllVariants}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                {selectedVariants.length > 0 ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "350px", overflowY: "auto", paddingRight: "5px" }}>
              {productos.map((prod) => {
                if (!prod.variantes || prod.type === "combo") return null;

                return (
                  <div key={prod.id} style={{ borderBottom: "1px solid #e2e8f0", pb: "8px" }}>
                    <strong style={{ fontSize: "14px" }}>{prod.name}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", paddingLeft: "10px" }}>
                      {prod.variantes.map((v, idx) => {
                        const variantKey = `${prod.id}_${idx}`;
                        const isChecked = selectedVariants.includes(variantKey);

                        return (
                          <label key={variantKey} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectVariant(variantKey)}
                            />
                            <span>{v.attr || "Estándar"} - ${Number(v.price || 0).toLocaleString('es-AR')}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                style={{ background: "#cbd5e1", color: "#1e293b" }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  handleGenerateQR(selectedVariants);
                  setQrModalOpen(false);
                }}
                style={{ background: "#00b4d8", color: "#ffffff" }}
              >
                Imprimir QR ({selectedVariants.length === 0 ? "Todos" : selectedVariants.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {selectorOpen && canAddOrEdit && (
        <div
          className={styles.overlay}
          onClick={() => setSelectorOpen(false)}
        >
          <div
            className={styles.selector}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>¿Qué querés agregar?</h3>

            <button
              onClick={() => {
                setAddType("product");
                setSelectorOpen(false);
                setAddOpen(true);
              }}
            >
              Producto individual
            </button>

            <button
              onClick={() => {
                setAddType("combo");
                setSelectorOpen(false);
                setAddOpen(true);
              }}
            >
              Combo / Set
            </button>
          </div>
        </div>
      )}

      {addOpen && addType === "product" && canAddOrEdit && (
        <AddProduct
          onClose={() => {
            setAddOpen(false);
            setProductoEditando(null);
            setAddType(null);
          }}
          onSave={handleAddProduct}
          categoriaId={categoriaId}
          producto={productoEditando}
        />
      )}

      {addOpen && addType === "combo" && canAddOrEdit && (
        <AddCombo
          onClose={() => {
            setAddOpen(false);
            setAddType(null);
          }}
          onSave={handleAddCombo}
          products={productos.filter((p) => p.type === "product")}
        />
      )}

      {(isJefe || isEncargado || role === "vendedor") && (
        <button
          className={styles.calculatorFab}
          onClick={() => setShowCalculator(true)}
        >
          <i className='bx bxs-calculator'></i>
        </button>
      )}

      {canAddOrEdit && (
        <button
          className={styles.fab}
          onClick={() => {
            setProductoEditando(null);
            setSelectorOpen(true);
          }}
        >
          +
        </button>
      )}

      {showCalculator && (
        <div
          className={styles.calculatorOverlay}
          onClick={() => setShowCalculator(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Cuotas onClose={() => setShowCalculator(false)} />
          </div>
        </div>
      )}

      {(isJefe || isEncargado || role === "vendedor") && (
        <Drop
          userRole={role}

          onPDFStock={(isJefe || isEncargado) ? handlePDFStock : null}
          onGenerateQR={(isJefe || isEncargado) ? openQRSelector : null}
          onIncreasePrices={isJefe ? handleIncreasePrices : null}
          onDecreasePrices={isJefe ? handleDecreasePrices : null}

          showSinStock={showSinStock}
          onToggleSinStock={() => setShowSinStock(prev => !prev)}
        />
      )}
    </div>
  );
};