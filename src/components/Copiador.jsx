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
    <div>
      <h2>🧬 Migración completa</h2>

      <button
        onClick={handleImportarTodo}
        disabled={loading}
        style={{
          marginBottom: "1rem",
          padding: "10px 20px",
          background: loading ? "#999" : "#111",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Migrando..." : "Migrar clientes + ventas"}
      </button>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div
          style={{
            flex: 1,
            background: "#f4f4f4",
            padding: "1rem",
            borderRadius: "6px",
            maxHeight: "300px",
            overflowY: "auto",
            fontSize: "14px",
          }}
        >
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            background: "#ffecec",
            padding: "1rem",
            borderRadius: "6px",
            maxHeight: "300px",
            overflowY: "auto",
            fontSize: "14px",
          }}
        >
          <strong>❌ Ventas con errores</strong>
          {errores.map((e, i) => (
            <div key={i}>
              DNI: {e.dni} — {e.motivo}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Copiador;
