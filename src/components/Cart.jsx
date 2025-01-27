import React from 'react';
import './Cart.css'; // Asegúrate de tener estilos apropiados en Cart.css

function Cart({ cartItems, removeFromCart }) {
    const calculateSubtotal = (price, quantity) => price * quantity;
    const formatPrice = (price) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);
    const calculateTotal = () => cartItems.reduce((total, item) => total + calculateSubtotal(item.price, item.quantity), 0);

    return (
        <div>
            <h2>Carrito de Compras</h2>
            {cartItems.length === 0 ? (
                <p>No hay productos en el carrito.</p>
            ) : (
                <div>
                    <ul className="cart-list">
                        {cartItems.map((item, index) => (
                            <li key={index} className="cart-item">
                                <img src={item.imageUrl} alt={item.name} style={{ width: '250px' }} />
                                <div className="cart-details">
                                    <p><strong>Nombre:</strong> {item.name}</p>
                                    <p><strong>Precio:</strong> {formatPrice(item.price)}</p>
                                    <p><strong>Cantidad:</strong> {item.quantity}</p>
                                    <p><strong>Subtotal:</strong> {formatPrice(calculateSubtotal(item.price, item.quantity))}</p>
                                </div>
                                <button onClick={() => removeFromCart(item.id)} className="remove-button">Eliminar</button>
                            </li>
                        ))}
                    </ul>
                    <div className="cart-total">
                        <p><strong>Total de la compra:</strong> {formatPrice(calculateTotal())}</p>
                    </div>
                    <button className="finalize-purchase-button">Finalizar Compra</button>
                </div>
            )}
        </div>
    );
}

export default Cart;
