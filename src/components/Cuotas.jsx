import { useState, useEffect } from "react";
import styles from "../styles/Cuotas.module.css";

const configuracionCuotas = [
  { cuotas: 2, interes: 15 },
  { cuotas: 3, interes: 25 },
  { cuotas: 4, interes: 40 },
  { cuotas: 6, interes: 60 },
  { cuotas: 9, interes: 75 },
  { cuotas: 12, interes: 100 },
  { cuotas: 18, interes: 150 },
  { cuotas: 24, interes: 180 },
];

const CUOTA_MINIMA = 80000;

const formatARS = (valor) => {
  const redondeado = Math.ceil(Number(valor) / 1000) * 1000;

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(redondeado);
};

const Cuotas = ({ onClose }) => {
  const [expresion, setExpresion] = useState(
    () => localStorage.getItem("calculadoraExpresion") || ""
  );

  const [mostrarCuotas, setMostrarCuotas] = useState(
    () => JSON.parse(localStorage.getItem("mostrarCuotas")) || false
  );

  const [minimizada, setMinimizada] = useState(false);

  const [resultados, setResultados] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    localStorage.setItem("calculadoraExpresion", expresion);
  }, [expresion]);

  useEffect(() => {
    localStorage.setItem(
      "mostrarCuotas",
      JSON.stringify(mostrarCuotas)
    );
  }, [mostrarCuotas]);

  useEffect(() => {
    if (!expresion.trim()) {
      setResultados([]);
      setTotal(0);
      return;
    }

    try {
      const resultado = Function(
        `"use strict"; return (${expresion.replace(/,/g, "")})`
      )();

      if (isNaN(resultado) || resultado <= 0) {
        setResultados([]);
        setTotal(0);
        return;
      }

      setTotal(resultado);

      const resultadosArray = configuracionCuotas
        .map(({ cuotas, interes }) => {
          const montoConInteres =
            resultado * (1 + interes / 100);

          const montoCuota =
            Math.ceil(
              montoConInteres / cuotas / 1000
            ) * 1000;

          return {
            cuotas,
            montoCuota,
          };
        })
        .filter(
          ({ montoCuota }) =>
            montoCuota >= CUOTA_MINIMA
        )
        .map(
          ({ cuotas, montoCuota }) =>
            `${cuotas} cuotas de ${formatARS(
              montoCuota
            )}`
        );

      setResultados(resultadosArray);
    } catch {
      setResultados([]);
      setTotal(0);
    }
  }, [expresion]);

  const agregar = (valor) => {
    setExpresion((prev) => prev + valor);
  };

  if (minimizada) {
    return (
      <div className={styles.miniCalculator}>
        <div>
          🧮 {formatARS(total || 0)}
        </div>

        <button
          onClick={() => setMinimizada(false)}
        >
          ⬆
        </button>
      </div>
    );
  }

  return (
    <div className={styles.cuotasContainer}>
      <button
        className={styles.closeButton}
        onClick={onClose}
      >
        ✕
      </button>

      <button
        className={styles.minimizeButton}
        onClick={() => setMinimizada(true)}
      >
        ─
      </button>

      <h3 className={styles.title}>
        Calculadora de Cuotas
      </h3>

      <input
        type="text"
        value={expresion}
        onChange={(e) =>
          setExpresion(e.target.value)
        }
        placeholder="suma aca el precio del producto"
        className={styles.calculatorInput}
      />

      <div className={styles.calculatorButtons}>
        <button onClick={() => agregar("7")}>7</button>
        <button onClick={() => agregar("8")}>8</button>
        <button onClick={() => agregar("9")}>9</button>
        <button onClick={() => agregar("/")}>÷</button>

        <button onClick={() => agregar("4")}>4</button>
        <button onClick={() => agregar("5")}>5</button>
        <button onClick={() => agregar("6")}>6</button>
        <button onClick={() => agregar("*")}>×</button>

        <button onClick={() => agregar("1")}>1</button>
        <button onClick={() => agregar("2")}>2</button>
        <button onClick={() => agregar("3")}>3</button>
        <button onClick={() => agregar("-")}>−</button>

        <button onClick={() => agregar("0")}>0</button>
        <button onClick={() => agregar("000")}>000</button>
        <button onClick={() => agregar(".")}>.</button>
        <button onClick={() => agregar("+")}>+</button>
      </div>

      <div className={styles.totalBox}>
        <strong>Total:</strong>{" "}
        {total > 0
          ? formatARS(total)
          : "$ 0"}
      </div>

      <button
        className={styles.viewButton}
        onClick={() =>
          setMostrarCuotas(!mostrarCuotas)
        }
      >
        {mostrarCuotas
          ? "Ocultar cuotas"
          : "Ver cuotas"}
      </button>

      <button
        className={styles.clearButton}
        onClick={() => {
          setExpresion("");
          setResultados([]);
          setTotal(0);
          setMostrarCuotas(false);

          localStorage.removeItem(
            "calculadoraExpresion"
          );
        }}
      >
        Limpiar
      </button>

      {mostrarCuotas && (
        <div className={styles.resultados}>
          {resultados.map((res, i) => (
            <p key={i}>{res}</p>
          ))}
        </div>
      )}
    </div>
  );
};

export default Cuotas;