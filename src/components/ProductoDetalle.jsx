import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import ProductCard from "../components/ProductCard";
import styles from "../styles/ProductoDetalle.module.css";

export default function ProductoDetalle() {
  const { categoriaId, productoId } = useParams();
  const [searchParams] = useSearchParams();

  const variantIndex = Math.max(0, Number(searchParams.get("v")) || 0);

  const [producto, setProducto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducto = async () => {
      try {
        let snap;

        if (categoriaId) {
          snap = await getDoc(
            doc(db, "categorias", categoriaId, "productos", productoId)
          );
        } else {
          snap = await getDoc(doc(db, "productos", productoId));
        }

        if (snap.exists()) {
          setProducto({ id: snap.id, ...snap.data() });
        } else {
        }
      } catch (error) {
        console.error("Error cargando producto:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducto();
  }, [productoId, categoriaId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>Cargando producto...</h2>
        </div>
      </div>
    );
  }

  if (!producto) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>Producto no encontrado</h2>
        </div>
      </div>
    );
  }

  const safeVariant =
    producto.variantes && producto.variantes[variantIndex]
      ? variantIndex
      : 0;

  return (
    <div className={styles.container}>
      <div className={styles.cardWrapper}>
        <div className={styles.card}>
          <ProductCard producto={producto} initialVariant={safeVariant} />
        </div>
      </div>
    </div>
  );
}