import { useState, useEffect } from "react";
import { storage, db, auth } from "../firebase/firebaseConfig";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import styles from "../styles/AddProduct.module.css";

/* ================= DICCIONARIOS DE COLORES AMPLIADOS ================= */
const diccionarioColores = {
  "verde": "#008000",
  "verde claro": "#90ee90",
  "verde oscuro": "#006400",
  "esmeralda": "#50c878",
  "lima": "#00ff00",
  "rojo": "#ff0000",
  "bordo": "#800000",
  "bordó": "#800000",
  "coral": "#ff7f50",
  "salmon": "#fa8072",
  "salmón": "#fa8072",
  "azul": "#0000ff",
  "celeste": "#87ceeb",
  "turquesa": "#40e0d0",
  "cian": "#00ffff",
  "cyan": "#00ffff",
  "amarillo": "#ffff00",
  "naranja": "#ffa500",
  "mostaza": "#ffdb58",
  "oro": "#ffd700",
  "dorado": "#ffd700",
  "negro": "#000000",
  "blanco": "#ffffff",
  "blanco perlado": "#f0ead6",
  "gris": "#808080",
  "gris claro": "#d3d3d3",
  "gris oscuro": "#a9a9a9",
  "plateado": "#c0c0c0",
  "cromado": "#d8d8d8",
  "rosa": "#ffc0cb",
  "fucsia": "#ff00ff",
  "magenta": "#ff00ff", 
  "violeta": "#8a2be2",
  "lila": "#c8a2c8",
  "purpura": "#800080",
  "púrpura": "#800080",
  "marron": "#a52a2a",
  "marrón": "#a52a2a",
  "beige": "#f5f5dc"
};

const diccionarioHexANombre = {
  "#008000": "Verde",
  "#90ee90": "Verde Claro",
  "#006400": "Verde Oscuro",
  "#50c878": "Esmeralda",
  "#00ff00": "Lima",
  "#ff0000": "Rojo",
  "#800000": "Bordó",
  "#ff7f50": "Coral",
  "#fa8072": "Salmón",
  "#0000ff": "Azul",
  "#87ceeb": "Celeste",
  "#40e0d0": "Turquesa",
  "#00ffff": "Cian",
  "#ffff00": "Amarillo",
  "#ffa500": "Naranja",
  "#ffdb58": "Mostaza",
  "#ffd700": "Dorado",
  "#000000": "Negro",
  "#ffffff": "Blanco",
  "#f0ead6": "Blanco Perlado",
  "#808080": "Gris",
  "#d3d3d3": "Gris Claro",
  "#a9a9a9": "Gris Oscuro",
  "#c0c0c0": "Plateado",
  "#d8d8d8": "Cromado",
  "#ffc0cb": "Rosa",
  "#ff00ff": "Magenta",
  "#8a2be2": "Violeta",
  "#c8a2c8": "Lila",
  "#800080": "Púrpura",
  "#a52a2a": "Marrón",
  "#f5f5dc": "Beige"
};

/* ================= CAMPOS PREDETERMINADOS POR CATEGORÍA ================= */
const fichasPorCategoria = {
  "celulares": ["Marca", "Modelo", "Memoria RAM", "Almacenamiento", "Cámara Principal", "Batería"],
  "smart tv": ["Marca", "Modelo", "Pulgadas", "Resolución", "Smart TV", "Puertos HDMI"],
  "bicicletas": ["Marca", "Modelo", "Rodado", "Material del cuadro", "Velocidades", "Frenos"],
  "herramientas": ["Marca", "Modelo", "Potencia", "Alimentación", "Velocidad máxima"],
  "heladeras": ["Marca", "Modelo", "Capacidad", "Eficiencia Energética", "Sistema de Frío"],
  "cocinas": ["Marca", "Modelo", "Tipo de Alimentación", "Hornallas", "Horno con Luz"],
  "colchones": ["Marca", "Modelo", "Medidas", "Densidad", "Firmeza"],
  "default": ["Marca", "Modelo", "Material", "Garantía", "Origen"]
};

/* ================= UTILS ================= */
const formatText = (value) => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const createEmptyVariant = () => ({
  attr: "",
  price: "",
  priceJuego: "",
  unidadesPorJuego: "",
  tipoVariante: "modelo", 
  modeloPadre: "", 
  image: "",
  colorHex: "#000000",
  stock4320: 0,
  stock4034: 0,
  stock2440: 0,
});

export default function AddProduct({ onClose, onSave, categoriaId, producto }) {
  const [name, setName] = useState(producto?.name || "");
  const [tag, setTag] = useState(producto?.tag || "");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [variantImages, setVariantImages] = useState({});

  // Ficha técnica unificada a base de objetos { label, value }
  const [fichaTecnica, setFichaTecnica] = useState(() => {
    if (producto?.fichaTecnica) {
      if (Array.isArray(producto.fichaTecnica)) {
        return producto.fichaTecnica.map(item => ({
          label: item.label || item.etiqueta || item.key || "",
          value: item.value || item.valor || ""
        }));
      }
      return Object.entries(producto.fichaTecnica).map(([label, value]) => ({ label, value }));
    }
    const catKey = categoriaId ? categoriaId.toLowerCase().trim() : "default";
    const keysPredeterminadas = fichasPorCategoria[catKey] || fichasPorCategoria["default"];
    return keysPredeterminadas.map(label => ({ label, value: "" }));
  });

  const [variantes, setVariantes] = useState(
    producto?.variantes?.map((v) => ({
      attr: v.attr || "",
      price: v.price ?? "",
      priceJuego: v.priceJuego ?? "",
      unidadesPorJuego: v.unidadesPorJuego ?? "",
      tipoVariante: v.tipoVariante || (v.colorHex ? "color" : "modelo"),
      modeloPadre: v.modelo || "", 
      image: v.image || "",
      colorHex: v.colorHex || "#000000",
      stock4320: v.stock?.["Los Andes 4320"] ?? 0,
      stock4034: v.stock?.["Los Andes 4034"] ?? 0,
      stock2440:
        v.stock?.["Jofre 2440"] ??
        v.stock?.["Mosconi"] ??
        0,
    })) || [createEmptyVariant()]
  );

  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleAddVariant = () => {
    setVariantes([...variantes, createEmptyVariant()]);
  };

  const handleAddColorToModel = (index) => {
    const modeloSeleccionado = variantes[index];
    
    if (!modeloSeleccionado.attr.trim()) {
      alert("Primero ingresá el nombre de este modelo antes de agregarle un color.");
      return;
    }

    const nuevaVarianteColor = {
      ...createEmptyVariant(),
      tipoVariante: "color",
      modeloPadre: modeloSeleccionado.attr, 
      price: modeloSeleccionado.price, 
      priceJuego: modeloSeleccionado.priceJuego,
      unidadesPorJuego: modeloSeleccionado.unidadesPorJuego,
    };

    const nuevasVariantes = [...variantes];
    nuevasVariantes.splice(index + 1, 0, nuevaVarianteColor);
    setVariantes(nuevasVariantes);
  };

  const handleRemoveVariant = (index) => {
    if (variantes.length === 1) return;
    setVariantes(variantes.filter((_, i) => i !== index));
  };

  const handleAddFichaRow = () => {
    setFichaTecnica([...fichaTecnica, { label: "", value: "" }]);
  };

  const handleRemoveFichaRow = (index) => {
    setFichaTecnica(fichaTecnica.filter((_, i) => i !== index));
  };

  const handleFichaChange = (index, field, value) => {
    const nuevaFicha = [...fichaTecnica];
    nuevaFicha[index][field] = value;
    setFichaTecnica(nuevaFicha);
  };

  const handleVariantChange = (index, field, value) => {
    const newVariantes = [...variantes];
    const oldAttr = newVariantes[index].attr;
    newVariantes[index][field] = value;

    if (field === "attr" && newVariantes[index].tipoVariante === "modelo" && oldAttr) {
      newVariantes.forEach(v => {
        if (v.tipoVariante === "color" && v.modeloPadre === oldAttr) {
          v.modeloPadre = value;
        }
      });
    }

    if (field === "attr" && newVariantes[index].tipoVariante === "color") {
      const colorBuscado = value.trim().toLowerCase();
      if (diccionarioColores[colorBuscado]) {
        newVariantes[index].colorHex = diccionarioColores[colorBuscado];
      }
    }

    if (field === "colorHex" && newVariantes[index].tipoVariante === "color") {
      const targetRgb = hexToRgb(value);
      if (targetRgb) {
        let minDistance = Infinity;
        let closestName = newVariantes[index].attr; 

        for (const [hex, name] of Object.entries(diccionarioHexANombre)) {
          const rgb = hexToRgb(hex);
          if (rgb) {
            const distance = Math.pow(targetRgb.r - rgb.r, 2) +
                             Math.pow(targetRgb.g - rgb.g, 2) +
                             Math.pow(targetRgb.b - rgb.b, 2);
            if (distance < minDistance) {
              minDistance = distance;
              closestName = name;
            }
          }
        }
        newVariantes[index].attr = closestName;
      }
    }

    setVariantes(newVariantes);
  };

  const handleCopyStockFromModel = (colorIndex, modeloPadreAttr) => {
    const parentModel = variantes.find(v => v.tipoVariante === "modelo" && v.attr === modeloPadreAttr);
    if (parentModel) {
      const newVariantes = [...variantes];
      newVariantes[colorIndex].stock4320 = parentModel.stock4320;
      newVariantes[colorIndex].stock4034 = parentModel.stock4034;
      newVariantes[colorIndex].stock2440 = parentModel.stock2440;
      setVariantes(newVariantes);
    } else {
      alert("No se encontró el modelo padre para copiar el stock.");
    }
  };

  const handleRemoveVariantImage = (index) => {
    if (variantImages[index]) {
      const newImages = { ...variantImages };
      delete newImages[index];
      setVariantImages(newImages);
    }
    const newVariantes = [...variantes];
    newVariantes[index].image = "";
    setVariantes(newVariantes);
  };

  const sendNotification = async (detail) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, "usuarios", user.uid));
      const userName = userDoc.exists() ? userDoc.data().nombre : "Desconocido";
      await addDoc(collection(db, "notificaciones"), {
        userId: user.uid,
        userName,
        userEmail: user.email,
        action: producto ? "editó producto" : "creó producto",
        detail,
        timestamp: serverTimestamp(),
      });
    } catch (err) {}
  };

  const handleSubmit = async () => {
    if (!name.trim() || variantes.some((v) => v.attr.trim() === "" || v.price === "")) {
      alert("Completa todos los campos obligatorios de las variantes.");
      return;
    }

    try {
      setLoading(true);
      let imageURL = producto?.image || "";

      if (imageFile) {
        const fileName = `${Date.now()}-${imageFile.name}`;
        const storageRef = ref(storage, `products/${fileName}`);
        await uploadBytes(storageRef, imageFile);
        imageURL = await getDownloadURL(storageRef);
      }

      const variantesProcesadas = await Promise.all(
        variantes.map(async (v, i) => {
          let variantImageURL = v.image || "";
          if (variantImages[i]) {
            const fileName = `${Date.now()}-${variantImages[i].name}`;
            const storageRef = ref(storage, `variants/${fileName}`);
            await uploadBytes(storageRef, variantImages[i]);
            variantImageURL = await getDownloadURL(storageRef);
          }
          return {
            attr: v.attr,
            tipoVariante: v.tipoVariante,
            modelo: v.tipoVariante === "color" ? (v.modeloPadre || "") : v.attr,
            price: Number(v.price),
            priceJuego: v.priceJuego !== "" ? Number(v.priceJuego) : null,
            unidadesPorJuego: v.unidadesPorJuego !== "" ? Number(v.unidadesPorJuego) : null,
            image: variantImageURL,
            colorHex: v.tipoVariante === "color" ? v.colorHex : "",
            stock: {
              "Los Andes 4320": Number(v.stock4320),
              "Los Andes 4034": Number(v.stock4034),
              "Jofre 2440": Number(v.stock2440),
            },
          };
        })
      );

      const fichaTecnicaLimpia = fichaTecnica
        .filter(item => item.label.trim() !== "")
        .map(item => ({
          label: item.label.trim(),
          value: item.value.trim()
        }));

      const nuevoProducto = { 
        name, 
        tag, 
        image: imageURL, 
        variantes: variantesProcesadas,
        fichaTecnica: fichaTecnicaLimpia
      };
      if (!producto) nuevoProducto.createdAt = serverTimestamp();

      await onSave(nuevoProducto);
      
      if (producto && producto.name !== name) {
        await sendNotification({ tipo: "nombre", producto: producto.name, antes: producto.name, despues: name });
      } else if (!producto) {
        await sendNotification({ tipo: "nombre", producto: name, antes: "", despues: name });
      }
      onClose?.();
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error. Revisá la consola.");
    } finally {
      setLoading(false);
    }
  };

  const variantesConIndex = variantes.map((v, i) => ({ ...v, _originalIndex: i }));
  const modelos = variantesConIndex.filter((v) => v.tipoVariante === "modelo");
  const colores = variantesConIndex.filter((v) => v.tipoVariante === "color");

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.productForm}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} onClick={onClose}>×</button>

        <h2>{producto ? "Editar producto" : "Nuevo producto"}</h2>

        <div className={styles.headerInputs}>
          <label>
            Nombre del producto
            <input type="text" value={name} onChange={(e) => setName(formatText(e.target.value))} />
          </label>
          <label>
            Badge (Etiqueta principal)
            <input type="text" value={tag} onChange={(e) => setTag(formatText(e.target.value))} />
          </label>
          <label>
            Imagen principal general del producto
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} />
          </label>
          {producto?.image && !imageFile && (
            <img src={producto.image} alt="Principal" style={{ width: 80, borderRadius: 6 }} />
          )}
        </div>

        {/* ================= SECCIÓN FICHA TÉCNICA ================= */}
        <fieldset className={styles.treeFieldset} style={{ marginTop: "15px" }}>
          <legend>Ficha Técnica</legend>
          <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "10px" }}>
            Campos sugeridos automáticamente según la categoría seleccionada. Podés modificarlos o agregar más.
          </p>

          {fichaTecnica.map((item, index) => (
            <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Característica (Ej: Marca)"
                value={item.label}
                onChange={(e) => handleFichaChange(index, "label", e.target.value)}
                style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              />
              <input
                type="text"
                placeholder="Valor (Ej: Samsung)"
                value={item.value}
                onChange={(e) => handleFichaChange(index, "value", e.target.value)}
                style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              />
              <button
                type="button"
                onClick={() => handleRemoveFichaRow(index)}
                style={{ background: "#fee2e2", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: "4px", padding: "6px 10px", cursor: "pointer", fontSize: "0.85rem" }}
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddFichaRow}
            style={{ marginTop: "5px", padding: "6px 12px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "0.85rem", fontWeight: "600", cursor: "pointer", color: "#334155" }}
          >
            + Agregar Línea de Ficha Técnica
          </button>
        </fieldset>

        <fieldset className={styles.treeFieldset}>
          <legend>Variedades / Opciones</legend>

          {modelos.map((modelo) => {
            const hijos = colores.filter(c => c.modeloPadre === modelo.attr && modelo.attr !== "");
            
            return (
              <div key={modelo._originalIndex} className={styles.variantRow}>
                
                <div className={styles.variantModelo}>
                  <div className={styles.cardHeader}>
                    <h4>Modelo Base</h4>
                  </div>
                  
                  <label>
                    Nombre del Modelo
                    <input
                      type="text"
                      value={modelo.attr}
                      onChange={(e) => handleVariantChange(modelo._originalIndex, "attr", formatText(e.target.value))}
                      placeholder="Ej: Exhibidora 437lts"
                    />
                  </label>

                  <label>
                    Subir foto de este modelo
                    <input type="file" accept="image/*" onChange={(e) => setVariantImages({ ...variantImages, [modelo._originalIndex]: e.target.files[0] })} />
                  </label>
                  {modelo.image && <img src={modelo.image} alt={modelo.attr} className={styles.previewImg} />}

                  <div className={styles.grid2Cols}>
                    <label>
                      Precio unidad
                      <input type="number" min="0" step="0.01" value={modelo.price} onChange={(e) => handleVariantChange(modelo._originalIndex, "price", e.target.value)} onWheel={(e) => e.target.blur()} />
                    </label>
                    <label>
                      Precio combo
                      <input type="number" min="0" step="0.01" value={modelo.priceJuego} onChange={(e) => handleVariantChange(modelo._originalIndex, "priceJuego", e.target.value)} onWheel={(e) => e.target.blur()} />
                    </label>
                  </div>
                  
                  <label>
                    Unidades por combo
                    <input type="number" min="0" step="1" value={modelo.unidadesPorJuego} onChange={(e) => handleVariantChange(modelo._originalIndex, "unidadesPorJuego", e.target.value)} onWheel={(e) => e.target.blur()} />
                  </label>

                  <div className={styles.grid3Cols}>
                    <label>Stk 4320 <input type="number" min="0" value={modelo.stock4320} onChange={(e) => handleVariantChange(modelo._originalIndex, "stock4320", e.target.value)} onWheel={(e) => e.target.blur()} /></label>
                    <label>Stk 4034 <input type="number" min="0" value={modelo.stock4034} onChange={(e) => handleVariantChange(modelo._originalIndex, "stock4034", e.target.value)} onWheel={(e) => e.target.blur()} /></label>
                    <label>Stk 2440 <input type="number" min="0" value={modelo.stock2440} onChange={(e) => handleVariantChange(modelo._originalIndex, "stock2440", e.target.value)} onWheel={(e) => e.target.blur()} /></label>
                  </div>

                  <div className={styles.variantActions}>
                    <button type="button" onClick={() => handleAddColorToModel(modelo._originalIndex)} className={styles.btnAddColor}>
                      + Agregar Color
                    </button>
                    <button type="button" onClick={() => handleRemoveVariant(modelo._originalIndex)} className={styles.btnRemoveVariant}>
                      Borrar
                    </button>
                  </div>
                </div>

                {hijos.length > 0 && (
                  <div className={styles.coloresScroll}>
                    {hijos.map((color) => {
                      const hasImage = !!variantImages[color._originalIndex] || !!color.image;
                      
                      return (
                        <div key={color._originalIndex} className={styles.variantColorMini}>
                          <div className={styles.cardHeaderColor}>
                            <h4>Variante Color</h4>
                          </div>
                          
                          <label>
                            Nombre Color (Ej: Tapizado Flores)
                            <input type="text" value={color.attr} onChange={(e) => handleVariantChange(color._originalIndex, "attr", formatText(e.target.value))} placeholder="Ej: Azul" />
                          </label>

                          <label>
                            Subir imagen del tapizado/color
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={(e) => setVariantImages({ ...variantImages, [color._originalIndex]: e.target.files[0] })} 
                            />
                          </label>

                          {hasImage ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', margin: '10px 0' }}>
                              {color.image && !variantImages[color._originalIndex] && (
                                <img src={color.image} alt={color.attr} className={styles.previewImg} style={{width: '60px', borderRadius: '4px', border: '1px solid #ddd'}} />
                              )}
                              {variantImages[color._originalIndex] && (
                                <span style={{ fontSize: "0.85rem", color: "#16a34a", fontWeight: "bold" }}>✅ Imagen nueva lista para subir</span>
                              )}
                              <button 
                                type="button" 
                                onClick={() => handleRemoveVariantImage(color._originalIndex)} 
                                style={{ marginTop: '5px', fontSize: '0.75rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: '#fef2f2' }}
                              >
                                🗑️ Quitar imagen y usar color
                              </button>
                            </div>
                          ) : (
                            <label>
                              Tono Visual
                              <input type="color" value={color.colorHex || "#000000"} onChange={(e) => handleVariantChange(color._originalIndex, "colorHex", e.target.value)} className={styles.colorInput} />
                            </label>
                          )}

                          <div className={styles.grid2Cols}>
                            <label>Precio <input type="number" min="0" value={color.price} onChange={(e) => handleVariantChange(color._originalIndex, "price", e.target.value)} onWheel={(e) => e.target.blur()}/></label>
                            <label>Combo <input type="number" min="0" value={color.priceJuego} onChange={(e) => handleVariantChange(color._originalIndex, "priceJuego", e.target.value)} onWheel={(e) => e.target.blur()}/></label>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '15px 0 5px 0' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Stock sucursales</span>
                            <button 
                              type="button" 
                              onClick={() => handleCopyStockFromModel(color._originalIndex, color.modeloPadre)}
                              style={{ 
                                fontSize: "0.75rem", padding: "4px 8px", cursor: "pointer", 
                                borderRadius: "4px", border: "1px solid #cbd5e1", 
                                background: "#f1f5f9", color: "#334155", fontWeight: "600" 
                              }}
                              title="Copiar las mismas cantidades que pusiste en el modelo base"
                            >
                              🔄 Repetir stock
                            </button>
                          </div>

                          <div className={styles.grid3Cols}>
                            <label>Stk 4320 <input type="number" min="0" value={color.stock4320} onChange={(e) => handleVariantChange(color._originalIndex, "stock4320", e.target.value)} onWheel={(e) => e.target.blur()}/></label>
                            <label>Stk 4034 <input type="number" min="0" value={color.stock4034} onChange={(e) => handleVariantChange(color._originalIndex, "stock4034", e.target.value)} onWheel={(e) => e.target.blur()}/></label>
                            <label>Stk 2440 <input type="number" min="0" value={color.stock2440} onChange={(e) => handleVariantChange(color._originalIndex, "stock2440", e.target.value)} onWheel={(e) => e.target.blur()}/></label>
                          </div>

                          <button type="button" onClick={() => handleRemoveVariant(color._originalIndex)} className={styles.btnRemoveVariantMini}>
                            Eliminar Color
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={handleAddVariant} className={styles.btnAddNewModel}>
            + Agregar Nuevo Modelo Base
          </button>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading ? "Guardando..." : producto ? "Guardar cambios" : "Agregar producto"}
        </button>
      </form>
    </div>
  );
}