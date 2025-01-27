// src/components/Dashboard.js

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import './Dashboard.css';

function Dashboard() {
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
                <h2>Panel de Control del Vendedor</h2>
                <ul>
                    <li>
                        <Link to="/products">Gestionar Productos</Link>
                    </li>
                    {/* Puedes agregar más enlaces y funcionalidades según sea necesario */}
                </ul>
            </main>

            {showMenu && <div className="backdrop" onClick={handleToggleMenu}></div>}
        </div>
    );
}

export default Dashboard;
