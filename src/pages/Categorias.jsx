import { useState, useEffect, useMemo } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { auth, db, storage } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";

import styles from "../styles/Categorias.module.css";
import CardCategory from "../components/CardCategory";
import AddCategory from "../components/AddCategory";
import { Loader } from "../components/Loader";
import ClientBot from "../components/ClientBot";

export const Categorias = () => {
  const [categorias, setCategorias] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [search, setSearch] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState(null);
  const [role, setRole] = useState(null);

  const navigate = useNavigate();

  /* ===============================
     OBTENER ROL
  =============================== */
  useEffect(() => {
    const fetchUserRole = async () => {
      const user = auth.currentUser;

      if (!user) {
        // Si no hay user (invitado), asumimos rol catalogo desde localStorage
        const guest = localStorage.getItem("guestUser");
        if (guest) {
          setRole(JSON.parse(guest).role);
        }
        return;
      }

      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (snap.exists()) setRole(snap.data().role);
    };

    fetchUserRole();
  }, []);

  const canAddOrEdit = role === "jefe" || role === "encargado";
  const canDelete = role === "jefe";

  /* ===============================
     OBTENER CATEGORÍAS
  =============================== */
  const fetchCategorias = async () => {
    const snap = await getDocs(collection(db, "categorias"));

    const data = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      );

    setCategorias(data);
  };

  /* ===============================
     OBTENER PRODUCTOS (GLOBAL)
  =============================== */
  const fetchProductos = async () => {
    const snapCategorias = await getDocs(collection(db, "categorias"));
    const grouped = {};

    for (const cat of snapCategorias.docs) {
      const productosSnap = await getDocs(
        collection(db, "categorias", cat.id, "productos")
      );

      const productos = productosSnap.docs.map((p) => ({
        id: p.id,
        ...p.data(),
      }));

      if (productos.length > 0) {
        grouped[cat.id] = {
          categoriaId: cat.id,
          categoriaNombre: cat.data().nombre,
          productos,
        };
      }
    }

    setProductosPorCategoria(grouped);
  };

  useEffect(() => {
    fetchCategorias();
    fetchProductos();
  }, []);

  /* ===============================
     BUSCADOR AGRUPADO POR CATEGORÍA
  =============================== */
  const resultadosPorCategoria = useMemo(() => {
    if (!search.trim()) return [];
    if (!productosPorCategoria) return [];

    const q = search.toLowerCase();

    return Object.values(productosPorCategoria)
      .map((cat) => {
        const productosFiltrados = (cat.productos || []).filter((p) =>
          (p.name || p.nombre || "").toLowerCase().includes(q)
        );

        if (productosFiltrados.length === 0) return null;

        return {
          categoriaId: cat.categoriaId,
          categoriaNombre: cat.categoriaNombre,
          productos: productosFiltrados,
        };
      })
      .filter(Boolean);
  }, [search, productosPorCategoria]);

  /* ===============================
     ATAJO TECLADO
  =============================== */
  useEffect(() => {
    if (!canAddOrEdit) return;

    const handleKeyDown = (e) => {
      if (isModalOpen) return;

      const tag = document.activeElement?.tagName || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const isPlus =
        e.key === "+" ||
        (e.key === "=" && e.shiftKey) ||
        e.code === "NumpadAdd";

      if (isPlus && e.shiftKey) {
        e.preventDefault();
        setCategoryToEdit(null);
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canAddOrEdit, isModalOpen]);

  /* ===============================
     GUARDAR / EDITAR CATEGORÍA
  =============================== */
  const handleSaveCategory = async (data) => {
    if (!canAddOrEdit) return;

    try {
      const user = auth.currentUser;
      if (!user) return;

      const userSnap = await getDoc(doc(db, "usuarios", user.uid));
      const userName = userSnap.exists()
        ? userSnap.data().nombre
        : "Desconocido";

      const { id, nombre, descripcion, tag, imagenUrl, imagePath } = data;

      if (id) {
        const old = categorias.find((c) => c.id === id);

        if (old?.imagePath && old.imagePath !== imagePath) {
          await deleteObject(ref(storage, old.imagePath)).catch(() => { });
        }

        await updateDoc(doc(db, "categorias", id), {
          nombre,
          descripcion,
          tag,
          imagenUrl,
          imagePath,
        });
      } else {
        await addDoc(collection(db, "categorias"), {
          nombre,
          descripcion,
          tag,
          imagenUrl,
          imagePath,
        });
      }

      setIsModalOpen(false);
      setCategoryToEdit(null);
      fetchCategorias();
      fetchProductos();
    } catch (err) {
      console.error(err);
    }
  };

  if (role === null) return <Loader />;

  return (
    <>
      {/* BUSCADOR */}
      <div className={styles.searchWrapper}>
        <input
          className={styles.searchInput}
          placeholder="Buscar producto en todas las categorías..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {search && resultadosPorCategoria.length > 0 && (
          <div className={styles.searchResults}>
            {resultadosPorCategoria.map((cat) => (
              <div key={cat.categoriaId} className={styles.searchCategory}>
                <h4>{cat.categoriaNombre}</h4>

                {cat.productos.map((p) => (
                  <div
                    key={p.id}
                    className={styles.searchItem}
                    onClick={() =>
                      navigate(`/categorias/${cat.categoriaId}/productos`)
                    }
                  >
                    {p.name || p.nombre}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BOTÓN + */}
      {canAddOrEdit && (
        <button
          className={styles.addCategoryBtn}
          onClick={() => {
            setCategoryToEdit(null);
            setIsModalOpen(true);
          }}
        >
          +
        </button>
      )}

      {/* LISTADO CATEGORÍAS */}
      <div className={styles.grid}>
        {categorias.map((cat) => (
          <CardCategory
            key={cat.id}
            category={cat}
            onSelect={() => navigate(`/categorias/${cat.id}/productos`)}
            onEdit={
              canAddOrEdit
                ? () => {
                  setCategoryToEdit(cat);
                  setIsModalOpen(true);
                }
                : null
            }
            onDelete={
              canDelete
                ? async () => {
                  if (!confirm("¿Eliminar categoría?")) return;
                  await deleteDoc(doc(db, "categorias", cat.id));
                  fetchCategorias();
                  fetchProductos();
                }
                : null
            }
          />
        ))}
      </div>

      {/* MODAL */}
      {isModalOpen && canAddOrEdit && (
        <AddCategory
          onClose={() => {
            setIsModalOpen(false);
            setCategoryToEdit(null);
          }}
          onSave={handleSaveCategory}
          categoryToEdit={categoryToEdit}
        />
      )}
      {/* {role === "catalogo" && <ClientBot />} */}
    </>
  );
};
