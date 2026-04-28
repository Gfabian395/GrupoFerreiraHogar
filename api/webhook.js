import { MercadoPagoConfig, Payment } from "mercadopago";
import { db } from "../src/firebase/firebaseAdmin.js";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export default async function handler(req, res) {
  try {
    console.log("Webhook recibido", req.body, req.query);

    const paymentId =
      req.query["data.id"] ||
      req.body?.data?.id ||
      req.body?.id;

    if (!paymentId) {
      console.log("No se recibió paymentId");
      return res.status(200).json({ ok: true });
    }

    const payment = await new Payment(client).get({ id: paymentId });

    if (payment.status !== "approved") {
      console.log("Pago no aprobado:", payment.status);
      return res.status(200).json({ ok: true });
    }

    let items;

    if (payment.external_reference) {
      try {
        items = JSON.parse(payment.external_reference);
      } catch (e) {
        console.log("Error parseando external_reference:", e);
      }
    }

    console.log("ITEMS DESDE EXTERNAL_REFERENCE:", items);

    if (!items || !Array.isArray(items)) {
      console.log("external_reference inválido o sin items");
      return res.status(200).json({ ok: true });
    }

    // 🔥 Protección doble procesamiento
    const pagoRef = db.collection("pagosProcesados").doc(String(paymentId));
    const pagoSnap = await pagoRef.get();

    if (pagoSnap.exists) {
      console.log("Pago ya procesado");
      return res.status(200).json({ ok: true });
    }

    for (const item of items) {
      try {
        if (!item.categoriaId || !item.id) {
          console.log("Item inválido:", item);
          continue;
        }

        const productRef = db
          .collection("categorias")
          .doc(String(item.categoriaId))
          .collection("productos")
          .doc(String(item.id));

        const snap = await productRef.get();

        if (!snap.exists) {
          console.log("Producto no encontrado:", item.id);
          continue;
        }

        const data = snap.data();

        if (!Array.isArray(data.variantes)) {
          console.log("Producto sin variantes:", item.id);
          continue;
        }

        const nuevasVariantes = data.variantes.map((v) => {

          const attrFirestore = String(v.attr).trim().toLowerCase();
          const attrItem = String(item.variant).trim().toLowerCase();

          // Si no coincide la variante, seguimos
          if (attrFirestore !== attrItem) return v;

          // Buscamos la sucursal real ignorando mayúsculas/espacios
          const branchKey = Object.keys(v.stock || {}).find(
            key => key.trim().toLowerCase() === String(item.branch).trim().toLowerCase()
          );

          if (!branchKey) {
            console.log("Sucursal no encontrada:", item.branch);
            return v;
          }

          const stockActual = v.stock?.[branchKey] ?? 0;
          const cantidad = Number(item.quantity);

          if (stockActual < cantidad) {
            console.log("Stock insuficiente:", item.id);
            return v;
          }

          console.log(
            `Descontando ${cantidad} de ${item.id} - Variante: ${v.attr} - Sucursal: ${branchKey}`
          );

          return {
            ...v,
            stock: {
              ...v.stock,
              [branchKey]: stockActual - cantidad,
            },
          };
        });

        await productRef.update({ variantes: nuevasVariantes });

      } catch (e) {
        console.error("Error actualizando item:", item, e);
      }
    }

    await pagoRef.set({ createdAt: new Date() });

    console.log("Webhook procesado OK:", paymentId);

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Webhook error REAL:", error);
    return res.status(500).json({ error: error.message });
  }
}