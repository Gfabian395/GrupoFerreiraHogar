import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import ComboCard from "./ComboCard";
import styles from "../styles/ComboDetalle.module.css";

export default function ComboDetalle() {
  const { categoriaId, comboId } = useParams();

  const [combo, setCombo] = useState(null);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComboAndProducts = async () => {
      try {
        // 1. Obtener el documento del combo
        let comboSnap;
        if (categoriaId) {
          comboSnap = await getDoc(
            doc(db, "categorias", categoriaId, "productos", comboId)
          );
        } else {
          comboSnap = await getDoc(doc(db, "productos", comboId));
        }

        if (comboSnap.exists()) {
          setCombo({ id: comboSnap.id, ...comboSnap.data() });
        }

        // 2. Cargar productos globales para resolver componentes y variantes
        const productosSnap = await getDocs(collection(db, "productos"));
        const listaProductos = productosSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProductos(listaProductos);
      } catch (error) {
        console.error("Error cargando detalle del combo:", error);
      } finally {
        setLoading(false);
      }
    };

    if (comboId) {
      fetchComboAndProducts();
    }
  }, [comboId, categoriaId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.cardWrapper}>
          <div className={styles.card}>
            <h2 className={styles.title}>Cargando combo...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!combo) {
    return (
      <div className={styles.container}>
        <div className={styles.cardWrapper}>
          <div className={styles.card}>
            <h2 className={styles.title}>Combo no encontrado</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.cardWrapper}>
        <ComboCard combo={combo} productos={productos} />
      </div>
    </div>
  );
}