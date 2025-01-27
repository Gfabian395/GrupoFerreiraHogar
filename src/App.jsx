import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import CategoryManager from './components/CategoryManager';
import ProductList from './components/ProductList';
import ProductDetail from './components/ProductDetail';
import Cart from './components/Cart';
import Contact from './components/Contact'; // Importar el componente Contact
import Header from './components/Header';

function App() {
    const [cartItems, setCartItems] = useState([]);

    const addToCart = (product) => {
        setCartItems((prevCartItems) => {
            const existingProductIndex = prevCartItems.findIndex(item => item.id === product.id);
            const totalStock = product.stock.LosAndes4320 + product.stock.LosAndes4034;
            const totalInCart = existingProductIndex >= 0 ? prevCartItems[existingProductIndex].quantity : 0;

            if (totalInCart < totalStock) {
                if (existingProductIndex >= 0) {
                    const updatedCartItems = [...prevCartItems];
                    updatedCartItems[existingProductIndex].quantity += 1;
                    return updatedCartItems;
                } else {
                    return [...prevCartItems, { ...product, quantity: 1 }];
                }
            } else {
                alert('No hay suficiente stock disponible.');
                return prevCartItems;
            }
        });
    };

    const removeFromCart = (productId) => {
        setCartItems((prevCartItems) => prevCartItems.filter(item => item.id !== productId));
    };

    return (
        <Router>
            <Header cartItemCount={cartItems.length} />
            <Routes>
                <Route path="/" element={<CategoryManager />} />
                <Route path="/category/:id" element={<ProductList />} />
                <Route path="/category/:id/product/:productId" element={<ProductDetail addToCart={addToCart} />} />
                <Route path="/cart" element={<Cart cartItems={cartItems} removeFromCart={removeFromCart} />} />
                <Route path="/contact" element={<Contact />} /> {/* Ruta añadida */}
            </Routes>
        </Router>
    );
}

export default App;
