import { useState } from "react";
import styles from "../styles/Cuotas.module.css";

// Configuración de cuotas e intereses
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

// Formatear número en ARS, redondeando a múltiplos de 1.000
const formatARS = (valor) => {
  const redondeado = Math.ceil(Number(valor) / 1000) * 1000;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(redondeado);
};

const Cuotas = () => {
  const [monto, setMonto] = useState("");
  const [resultados, setResultados] = useState([]);

  // Manejar cambio de input
  const handleChange = (e) => {
    let valor = e.target.value.replace(/\D/g, ""); // solo números
    setMonto(valor);
  };

  // Calcular cuotas
  const handleCalcular = () => {
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setResultados(["Por favor, ingrese un monto válido."]);
      return;
    }

    // Filtrar cuotas según el rango del monto
    const cuotasFiltradas = configuracionCuotas.filter((opcion) => {
      if (montoNum < 30000) return opcion.cuotas <= 2;
      if (montoNum >= 30000 && montoNum < 80000) return opcion.cuotas <= 3;
      if (montoNum >= 80000 && montoNum < 150000) return opcion.cuotas <= 6;
      if (montoNum >= 150000 && montoNum < 250000) return opcion.cuotas <= 9;
      if (montoNum >= 250000 && montoNum < 350000) return opcion.cuotas <= 12;
      if (montoNum >= 350000 && montoNum < 500000) return opcion.cuotas <= 18;
      return true; // monto >= 500.000
    });

    // Calcular cada cuota
    const resultadosArray = cuotasFiltradas.map(({ cuotas, interes }) => {
      const montoConInteres = montoNum * (1 + interes / 100);
      const montoCuota = Math.ceil(montoConInteres / cuotas / 1000) * 1000;
      return `Para ${cuotas} cuotas: ${formatARS(montoCuota)} por mes`;
    });

    setResultados(resultadosArray);
  };

  return (
    <div className={styles.cuotasContainer}>
      <h3 className={styles.title}>Calculadora de Cuotas</h3>
      <div className={styles.inputGroup}>
        <label htmlFor="monto">Ingrese monto:</label>
        <input
          type="text"
          id="monto"
          value={Number(monto).toLocaleString("es-AR")}
          onChange={handleChange}
          placeholder="0"
        />
        <button onClick={handleCalcular}>Calcular</button>
      </div>

      <div className={styles.resultados}>
        {resultados.map((res, i) => (
          <p key={i}>{res}</p>
        ))}
      </div>
    </div>
  );
};

export default Cuotas;
