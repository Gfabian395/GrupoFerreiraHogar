import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "../styles/NavBar.module.css";
import "boxicons/css/boxicons.min.css";
import { useCart } from "../context/CartContext";

const menuItems = [
  { icon: "bx bx-grid-alt", label: "Categorias", path: "/categorias" },
  { icon: "bx bx-cart", label: "Carrito", path: "/carrito" },
  { icon: "bx bx-user", label: "Clientes", path: "/clientes", role: ["jefe","encargado", "vendedor"] },
  { icon: "bx bx-pie-chart-alt-2", label: "Cierre de Caja", path: "/cierre-de-caja", role: ["jefe"] },
  { icon: "bx bx-cog", label: "Configuracion", path: "/configuracion"/* , role: ["jefe","vendedor"] */ },
  { icon: "bx bx-transfer", label: "Migrar clientes", path: "/admin/migrar-clientes", role: ["jefe"] },
];

const NavBar = ({ usuario, onLogout }) => {
  const [active, setActive] = useState(false);
  const { items } = useCart();
  const location = useLocation();

  const toggleSidebar = () => setActive(!active);

  return (
    <nav className={`${styles.sidebar} ${active ? styles.active : ""}`}>
      <div className={styles["logo-menu"]}>
        <h2 className={styles.logo}>Grupo Ferreira</h2>
        <img
          src="/Logo---Otoño.png"
          alt="Menú"
          className={styles["toggle-btn"]}
          onClick={toggleSidebar}
        />
      </div>

      <ul className={styles.list}>
        {menuItems.map((item, index) => {
          // filtramos por rol: invitado = catalogo
          if (item.role) {
            const rolesPermitidos = Array.isArray(item.role) ? item.role : [item.role];
            if (!rolesPermitidos.includes(usuario.role)) return null;
          }

          const isActive = location.pathname === item.path;

          return (
            <li
              key={index}
              className={`${styles["list-item"]} ${isActive ? styles["item-active"] : ""}`}
            >
              <Link to={item.path}>
                <i className={item.icon}></i>
                <span className={styles["link-name"]} style={{ "--i": index + 1 }}>
                  {item.label}
                </span>

                {item.label === "Carrito" && items.length > 0 && (
                  <span className={styles.badge}>{items.length}</span>
                )}
              </Link>
            </li>
          );
        })}

        {usuario && (
          <li className={`${styles["list-item"]} ${styles["logout-item"]}`}>
            <a
              onClick={onLogout}
              style={{ cursor: "pointer" }}
            >
              <i className="bx bx-log-out"></i>
              <span className={styles["link-name"]} style={{ "--i": menuItems.length + 1 }}>
                Cerrar Sesión
              </span>
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
};

export default NavBar;