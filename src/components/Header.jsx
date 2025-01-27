import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Header.css';

function Header({ cartItemCount }) {
    const navigate = useNavigate();
    const handleNavigateCart = () => navigate('/cart');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const handleToggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <header className="header">
            <Link to="/" className="brand">Grupo Ferreira Hogar</Link>
            <div className="nav-icons">
                <div className="icon" onClick={handleNavigateCart}>
                    <i className="fas fa-shopping-cart"></i>
                    <span className="badge">{cartItemCount}</span>
                </div>
                <div className="icon" onClick={handleToggleMenu}>
                    <i className="fas fa-bars"></i>
                </div>
            </div>
            <div className={`menu ${isMenuOpen ? 'open' : ''}`}>
                <div className="menu-header">
                    <button className="close-menu" onClick={handleToggleMenu}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <ul>
                    <li><Link to="/">Inicio</Link></li>
                    <li><Link to="/about">Sobre Nosotros</Link></li>
                    <li><Link to="/contact">Contacto</Link></li>
                </ul>
            </div>
        </header>
    );
}

export default Header;
