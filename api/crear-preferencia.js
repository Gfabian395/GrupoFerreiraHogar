import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No hay items" });
    }

    // Validación fuerte para evitar errores después
    for (const item of items) {
      if (!item.id || !item.categoriaId || !item.variant || !item.branch) {
        return res.status(400).json({
          error: "Item incompleto (faltan id, categoriaId, variant o branch)",
        });
      }
    }

    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: items.map((item) => ({
          title: item.title,
          unit_price: Number(item.price),
          quantity: Number(item.quantity),
          currency_id: "ARS",
        })),

        // 🔥 Metadata limpia y consistente
        metadata: {
          items: items.map((item) => ({
            id: item.id,
            categoriaId: item.categoriaId,
            variant: item.variant,
            branch: item.branch,
            quantity: Number(item.quantity),
          })),
        },

        // 🔥 External reference para que el webhook siempre reciba los items
        external_reference: JSON.stringify(
          items.map((item) => ({
            id: item.id,
            categoriaId: item.categoriaId,
            variant: item.variant,
            branch: item.branch,
            quantity: Number(item.quantity),
          }))
        ),

        notification_url:
          "https://grupoferreirahogar.vercel.app/api/webhook",

        back_urls: {
          success: "https://grupoferreirahogar.vercel.app/success",
          failure: "https://grupoferreirahogar.vercel.app/failure",
          pending: "https://grupoferreirahogar.vercel.app/pending",
        },

        auto_return: "approved",
      },
    });
    
    return res.status(200).json({
      init_point: response.init_point,
    });

  } catch (error) {
    console.error("Error creando preferencia:", error);
    return res.status(500).json({
      error: "Error creando preferencia",
    });
  }
}