import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
  const canAddOrEdit = isJefe || isEncargado;
  const canDelete = isJefe;
  const [ordenPrecio, setOrdenPrecio] = useState("ninguno");
  const [showCalculator, setShowCalculator] = useState(false);

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

    // CORRECCIÓN: Si es un combo, pasa el filtro de stock directamente
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

  const productosOrdenados = [...productosFiltrados].sort((a, b) => {
    // CORRECCIÓN: Si no hay variantes (como en los combos), usa el .price base del documento
    const precioA = Math.min(
      ...((a.variantes || []).map(v => Number(v.price || 0))),
      a.price ? Number(a.price) : 0
    );

    const precioB = Math.min(
      ...((b.variantes || []).map(v => Number(v.price || 0))),
      b.price ? Number(b.price) : 0
    );

    if (ordenPrecio === "asc") {
      return precioA - precioB;
    }

    if (ordenPrecio === "desc") {
      return precioB - precioA;
    }

    return 0;
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

  const loadImageBase64 = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        resolve(canvas.toDataURL("image/png"));
      };

      img.onerror = reject;
      img.src = url;
    });
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

const handleGenerateQR = async () => {
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

        /* 4 columnas exactas por línea en A4 */
        .container {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          justify-content: center;
        }

        /* Tarjeta Modo Claro */
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

        /* Contenedor Cuadrado Perfecto con Bordes Suaves */
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

      console.log("--- INICIANDO VERIFICACIÓN DE STOCK PARA QR ---");

      for (const d of snap.docs) {
        const data = d.data();

        if (!data.variantes) continue;

        for (const [index, variante] of data.variantes.entries()) {

          /* =================================================================
             SISTEMA DE CONTROL DE STOCK (Suma todas las sucursales del objeto)
             ================================================================= */
          const totalStockVariante = Object.values(variante?.stock || {}).reduce(
            (total, cantidad) => total + Number(cantidad || 0),
            0
          );

          console.log(`Producto: ${data.name} (${variante.attr || "Estándar"}) -> Stock calculado: ${totalStockVariante}`);

          // Si el stock es 0 o menor, se informa en consola y salta a la siguiente
          if (totalStockVariante <= 0) {
            console.warn(`[SALTEADO - SIN STOCK] ${data.name} (${variante.attr || "Estándar"}) no se incluirá.`);
            continue;
          }

          // Flag manual por las dudas
          if (variante.disponible === false) {
            console.warn(`[SALTEADO - NO DISPONIBLE] ${data.name} (${variante.attr || "Estándar"}) tiene disponible: false.`);
            continue;
          }

          // Si pasó los filtros, se confirma en la consola que va a impresión
          console.log(`%c[A IMPRESIÓN] ${data.name} (${variante.attr || "Estándar"})`, "color: #00b4d8; font-weight: bold;");

          const url = `${window.location.origin}/producto/${categoriaId}/${d.id}?v=${index}`;
          const qr = await QRCode.toDataURL(url);

          const imageUrl = variante.image || data.image || "";

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

      console.log("--- PROCESO DE LOGS TERMINADO ---");

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
      </div>

      {productos.length === 0 ? (
        <p>No hay productos en esta categoría.</p>
      ) : (
        <div className={styles.grid}>
          {productosOrdenados.map((item) => {
            if (item.type === "combo") {
              return (
                <ComboCard
                  key={item.id}
                  combo={item}
                  productos={productos}
                  Role={role} // CORRECCIÓN: Sincronizado con la prop 'Role' (con R mayúscula)
                  onEdit={() => handleEditProduct(item)} // CORRECCIÓN: Habilita el botón editar en el combo
                  onDeleteCombo={
                    canDelete
                      ? (deletedId) =>
                        setProductos((prev) =>
                          prev.filter((p) => p.id !== deletedId)
                        )
                      : null
                  }
                />
              );
            }

            return (
              <ProductCard
                key={item.id}
                producto={item}
                userRole={role}
                onEdit={canAddOrEdit ? () => handleEditProduct(item) : null}
                onDelete={
                  canDelete
                    ? () => handleDelete(item.id, item.name)
                    : null
                }
              />
            );
          })}
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

      {canAddOrEdit && (
        <>
          <button
            className={styles.calculatorFab}
            onClick={() => setShowCalculator(true)}
          >
            <i className='bx bxs-calculator'></i>
          </button>

          <button
            className={styles.fab}
            onClick={() => {
              setProductoEditando(null);
              setSelectorOpen(true);
            }}
          >
            +
          </button>
        </>
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

      {(isJefe || isEncargado) && (
        <Drop
          onPDFStock={(isJefe || isEncargado) ? handlePDFStock : null}
          onGenerateQR={(isJefe || isEncargado) ? handleGenerateQR : null}
          onIncreasePrices={isJefe ? handleIncreasePrices : null}
          onDecreasePrices={isJefe ? handleDecreasePrices : null}

          showSinStock={(isJefe || isEncargado) ? showSinStock : undefined}
          onToggleSinStock={(isJefe || isEncargado)
            ? () => setShowSinStock(prev => !prev)
            : null
          }
        />
      )}
    </div>
  );
};