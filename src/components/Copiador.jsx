import React, { useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { dbViejo } from "../firebase/firebaseViejo";

const Copiador = () => {
  const [log, setLog] = useState([]);
  const [errores, setErrores] = useState([]);
  const [loading, setLoading] = useState(false);

  const escribirLog = (msg) => {
    setLog((prev) => [...prev, String(msg)]);
    console.log(msg);
  };

  // =========================================
  // MIGRAR CLIENTES
  // =========================================
  const importarClientes = async () => {
    escribirLog("🔍 Leyendo clientes viejos...");
    const snap = await getDocs(collection(dbViejo, "clientes"));

    escribirLog(`📦 Clientes encontrados: ${snap.size}`);

    for (const docViejo of snap.docs) {
      const c = docViejo.data();

      const q = query(
        collection(db, "clientes"),
        where("dni", "==", c.dni)
      );

      const existe = await getDocs(q);
      if (!existe.empty) {
        escribirLog(`⏭️ Cliente DNI ${c.dni} ya existe`);
        continue;
      }

      await addDoc(collection(db, "clientes"), {
        nombre: c.nombreCompleto,
        dni: c.dni,
        direccion: c.direccion || "",
        entreCalles: c.entrecalles || "",
        telefono1: c.telefono1 || "",
        telefono2: c.telefono2 || "",
        fotoUrl:
          c.imagenUrl ||
          "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        estado: "Activo",
      });

      escribirLog(`✅ Cliente ${c.nombreCompleto} importado`);
    }
  };

  // =========================================
  // MAPA DNI → ID CLIENTE NUEVO
  // =========================================
  const crearMapaClientes = async () => {
    escribirLog("🧠 Creando mapa DNI → clienteId...");
    const snap = await getDocs(collection(db, "clientes"));

    const mapa = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.dni) {
        mapa[data.dni] = d.id;
      }
    });

    escribirLog(`🧩 Mapa creado (${Object.keys(mapa).length} clientes)`);
    return mapa;
  };

  // =========================================
  // MIGRAR VENTAS
  // =========================================
  const importarVentas = async () => {
    escribirLog("🔍 Leyendo ventas viejas...");
    const snapVentas = await getDocs(collection(dbViejo, "ventas"));

    escribirLog(`📦 Ventas encontradas: ${snapVentas.size}`);

    const mapaClientes = await crearMapaClientes();

    for (const docVenta of snapVentas.docs) {
      const ventaVieja = docVenta.data();
      const dni = ventaVieja.clienteId;

      const clienteNuevoId = mapaClientes[dni];

      if (!clienteNuevoId) {
        setErrores((prev) => [
          ...prev,
          { dni, motivo: "Cliente no existe" },
        ]);
        escribirLog(`⚠️ Venta omitida - DNI ${dni} sin cliente`);
        continue;
      }

      // evitar duplicados
      const q = query(
        collection(db, "ventas"),
        where("clienteId", "==", clienteNuevoId),
        where("fecha", "==", ventaVieja.fecha)
      );

      const yaExiste = await getDocs(q);
      if (!yaExiste.empty) {
        setErrores((prev) => [
          ...prev,
          { dni, motivo: "Venta duplicada" },
        ]);
        escribirLog(`⏭️ Venta duplicada DNI ${dni}`);
        continue;
      }

      try {
        await addDoc(collection(db, "ventas"), {
          ...ventaVieja,
          clienteId: clienteNuevoId,
        });

        escribirLog(`✅ Venta importada (DNI ${dni})`);
      } catch (e) {
        setErrores((prev) => [
          ...prev,
          { dni, motivo: "Error al guardar" },
        ]);
        escribirLog(`❌ Error guardando venta DNI ${dni}`);
      }
    }
  };

  // =========================================
  // EJECUTAR TODO
  // =========================================
  const handleImportarTodo = async () => {
    setLoading(true);
    setLog([]);
    setErrores([]);

    try {
      await importarClientes();
      await importarVentas();
      escribirLog("🎉 MIGRACIÓN COMPLETA FINALIZADA");
    } catch (error) {
      console.error(error);
      escribirLog("❌ ERROR GENERAL EN LA MIGRACIÓN");
    } finally {
      setLoading(false);
    }
  };

return (
  <div style={{
    padding: "24px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    maxWidth: "800px",
    margin: "0 auto",
    fontFamily: "system-ui, sans-serif"
  }}>
    <h2 style={{
      color: "#1e293b",
      fontSize: "1.5rem",
      fontWeight: "600",
      marginTop: 0,
      marginBottom: "20px",
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }}>
      🧬 Migración completa
    </h2>

    <button
      onClick={handleImportarTodo}
      disabled={loading}
      style={{
        marginBottom: "24px",
        padding: "12px 24px",
        background: loading ? "#cbd5e1" : "#2563eb", /* Gris suave si carga, azul limpio si está activo */
        color: loading ? "#64748b" : "#ffffff",
        border: "none",
        borderRadius: "8px",
        fontSize: "15px",
        fontWeight: "600",
        cursor: loading ? "not-allowed" : "pointer",
        transition: "background 0.2s ease",
        boxShadow: loading ? "none" : "0 2px 4px rgba(37, 99, 235, 0.2)"
      }}
    >
      {loading ? "Migrando..." : "Migrar clientes + ventas"}
    </button>

    <div style={{ display: "flex", gap: "20px" }}>
      {/* Contenedor de Logs (Éxito / Proceso) */}
      <div
        style={{
          flex: 1,
          background: "#f8fafc", /* Un gris/azuladizo muy limpio */
          border: "1px solid #e2e8f0",
          color: "#334155",
          padding: "16px",
          borderRadius: "8px",
          maxHeight: "350px",
          overflowY: "auto",
          fontSize: "14px",
          lineHeight: "1.6",
          fontFamily: "monospace" /* Fuente mono para que los logs queden alineados */
        }}
      >
        <div style={{ fontWeight: "600", marginBottom: "8px", color: "#475569" }}>📋 Registro de actividad:</div>
        {log.map((l, i) => (
          <div key={i} style={{ padding: "2px 0", borderBottom: "1px solid #f1f5f9" }}>{l}</div>
        ))}
      </div>

      {/* Contenedor de Errores */}
      <div
        style={{
          flex: 1,
          background: "#fef2f2", /* Rojo/rosa muy suave de fondo */
          border: "1px solid #fee2e2", /* Borde rojo sutil */
          color: "#991b1b", /* Texto rojo oscuro legible */
          padding: "16px",
          borderRadius: "8px",
          maxHeight: "350px",
          overflowY: "auto",
          fontSize: "14px",
          lineHeight: "1.6"
        }}
      >
        <strong style={{ display: "block", marginBottom: "8px", color: "#991b1b" }}>
          ❌ Ventas con errores
        </strong>
        {errores.map((e, i) => (
          <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #fecaca" }}>
            <span style={{ fontWeight: "600" }}>DNI: {e.dni}</span> — <span style={{ opacity: 0.9 }}>{e.motivo}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);
};

export default Copiador;
