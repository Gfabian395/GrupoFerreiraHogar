// CartContext.js
import { createContext, useContext, useState } from "react";

const CartContext = createContext();
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [fragmentedCombos, setFragmentedCombos] = useState({});

  // ===============================
  // AGREGAR AL CARRITO (ANTI DUPLICADOS)
  // ===============================
  const addToCart = (producto) => {
    setItems((prev) => {
      // Si ya existe el mismo item con misma sucursal, no duplicar
      const existing = prev.find((i) => i.key === producto.key);
      if (existing) return prev;

      // Agregamos stockFull para el control de stock total
      return [...prev, { ...producto, stockFull: { ...producto.stockFull } }];
    });
  };

  // ===============================
  // ACTUALIZAR CANTIDAD
  // ===============================
  const updateQty = (key, delta) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.key !== key) return item;

          // Stock total disponible de todas las sucursales
          const totalStock = Object.values(item.stockFull).reduce(
            (a, b) => a + b,
            0
          );

          // Cantidad actual en carrito de este producto/variante
          const cartQtyForThisProduct = prev
            .filter((i) => i.id === item.id && i.variant === item.variant)
            .reduce((a, i) => a + i.qty, 0);

          // Nuevo qty limitado al stock total
          let newQty = Math.max(0, item.qty + delta);
          if (cartQtyForThisProduct + delta > totalStock) {
            newQty = item.qty + (totalStock - cartQtyForThisProduct);
          }

          return { ...item, qty: newQty };
        })
        .filter((item) => item.qty > 0)
    );
  };

  // ===============================
  // COMBOS FRAGMENTADOS
  // ===============================
  const isComboFragmented = (comboId, productId = null) =>
    fragmentedCombos[comboId] ||
    items.some(
      (i) =>
        i.fromCombo === comboId &&
        (productId ? i.id === productId : true)
    );

  const markComboFragmented = (comboId) => {
    setFragmentedCombos((prev) => ({
      ...prev,
      [comboId]: true,
    }));
  };

  // ===============================
  // HELPERS
  // ===============================
  const isComboSold = (comboId) =>
    items.some((i) => i.type === "combo" && i.id === comboId);

  const removeItem = (key) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const clearCart = () => {
    setItems([]);
    setFragmentedCombos({});
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        updateQty,
        removeItem,
        clearCart,
        isComboFragmented,
        markComboFragmented,
        isComboSold,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
