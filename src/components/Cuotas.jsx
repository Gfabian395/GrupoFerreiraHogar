import { useState, useEffect } from "react";
import styles from "../styles/Cuotas.module.css";

const configuracionCuotas = [
  { cuotas: 2, interes: 30 },
  { cuotas: 3, interes: 50 },
  { cuotas: 4, interes: 70 },
  { cuotas: 6, interes: 90 },
  { cuotas: 9, interes: 120 },
  { cuotas: 12, interes: 150 }/* ,
  { cuotas: 18, interes: 170 },
  { cuotas: 24, interes: 200 }, */
];

const formatARS = (valor) => {
  const redondeado = Math.ceil(Number(valor) / 1000) * 1000;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(redondeado);
};

const evaluarExpresionSegura = (expr) => {
  const limpia = expr.replace(/,/g, "").replace(/[^0-9+\-*/.]/g, "");
  if (!limpia.trim()) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const res = new Function(`return ${limpia}`)();
    return isNaN(res) || res <= 0 ? 0 : res;
  } catch {
    return 0;
  }
};

const Cuotas = ({ onClose }) => {
  const [expresion, setExpresion] = useState(
    () => localStorage.getItem("calculadoraExpresion") || ""
  );
  const [mostrarCuotas, setMostrarCuotas] = useState(
    () => JSON.parse(localStorage.getItem("mostrarCuotas")) || false
  );

  useEffect(() => {
    localStorage.setItem("calculadoraExpresion", expresion);
  }, [expresion]);

  useEffect(() => {
    localStorage.setItem("mostrarCuotas", JSON.stringify(mostrarCuotas));
  }, [mostrarCuotas]);

  const total = evaluarExpresionSegura(expresion);

  const resultados = total > 0 
    ? configuracionCuotas.map(({ cuotas, interes }) => {
        const montoConInteres = total * (1 + interes / 100);
        const montoCuota = Math.ceil(montoConInteres / cuotas / 1000) * 1000;
        return { cuotas, montoCuota };
      })
    : [];

  const agregar = (valor) => {
    setExpresion((prev) => prev + valor);
  };

  const limpiarTodo = () => {
    setExpresion("");
    setMostrarCuotas(false);
    localStorage.removeItem("calculadoraExpresion");
  };

  return (
    <div className={styles.cuotasWrapper}>
      <div className={styles.cuotasContainer}>
        <div className={styles.header}>
          <h3 className={styles.title}>Calculadora de Cuotas</h3>
          <div className={styles.headerButtons}>
            <button className={styles.minimizeButton} onClick={onClose} title="Cerrar">─</button>
            <button className={styles.closeButton} onClick={onClose} title="Cerrar">✕</button>
          </div>
        </div>

        <input
          type="text"
          value={expresion}
          onChange={(e) => setExpresion(e.target.value)}
          placeholder="Suma el precio acá..."
          className={styles.calculatorInput}
        />

        <div className={styles.calculatorButtons}>
          <button onClick={() => agregar("7")}>7</button>
          <button onClick={() => agregar("8")}>8</button>
          <button onClick={() => agregar("9")}>9</button>
          <button onClick={() => agregar("/")} className={styles.opBtn}>÷</button>

          <button onClick={() => agregar("4")}>4</button>
          <button onClick={() => agregar("5")}>5</button>
          <button onClick={() => agregar("6")}>6</button>
          <button onClick={() => agregar("*")} className={styles.opBtn}>×</button>

          <button onClick={() => agregar("1")}>1</button>
          <button onClick={() => agregar("2")}>2</button>
          <button onClick={() => agregar("3")}>3</button>
          <button onClick={() => agregar("-")} className={styles.opBtn}>−</button>

          <button onClick={() => agregar("0")}>0</button>
          <button onClick={() => agregar("000")}>000</button>
          <button onClick={() => agregar(".")}>.</button>
          <button onClick={() => agregar("+")} className={styles.opBtn}>+</button>
        </div>

        <div className={styles.totalBox}>
          <strong>Total:</strong> {total > 0 ? formatARS(total) : "$ 0"}
        </div>

        <div className={styles.actionButtons}>
          <button
            className={styles.viewButton}
            onClick={() => setMostrarCuotas(!mostrarCuotas)}
            disabled={total === 0}
          >
            {mostrarCuotas ? "Ocultar cuotas" : "Ver cuotas"}
          </button>

          <button className={styles.clearButton} onClick={limpiarTodo}>
            Limpiar
          </button>
        </div>

        {mostrarCuotas && total > 0 && (
          <div className={styles.resultados}>
            {resultados.map(({ cuotas, montoCuota }, i) => (
              <p key={i}>
                <strong>{cuotas}</strong> cuotas de <span>{formatARS(montoCuota)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Cuotas;