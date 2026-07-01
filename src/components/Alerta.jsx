import React, { useState, useEffect } from 'react';
import styles from '../styles/Alerta.module.css';

export default function Alerta() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000); // 3 segundos

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.contenedorAlerta}>
      <div className={styles.cartelCarton}>
        <h1 className={styles.texto}>⚠️ NO DAR MÁS DE 1 PRODUCTO POR CLIENTE⚠️ <br /> ⚠️CONSULTAR EN GERENCIA⚠️</h1>
      </div>
    </div>
  );
}