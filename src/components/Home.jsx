// src/components/Home.js

import React, { useState } from 'react';
import Header from './Header';
import CategoryManager from './CategoryManager';
import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
    const [showMenu, setShowMenu] = useState(false);

    const handleToggleMenu = () => setShowMenu(!showMenu);

    return (
        <div>
            <Header toggleMenu={handleToggleMenu} />
            {showMenu && (
                <div className="offcanvas-menu show">
                    <div className="offcanvas-header">
                        <h5>Menú</h5>
                        <button className="close-btn" onClick={handleToggleMenu}>&times;</button>
                    </div>
                    <nav className="offcanvas-body">
                        <Link to="/">Inicio</Link>
                        <Link to="/dashboard">Dashboard</Link>
                        <Link to="/products">Productos</Link>
                    </nav>
                </div>
            )}
            <main>
                <h1>Página de Inicio</h1>
                <CategoryManager />
            </main>

            {showMenu && <div className="backdrop" onClick={handleToggleMenu}></div>}
        </div>
    );
}

export default Home;
