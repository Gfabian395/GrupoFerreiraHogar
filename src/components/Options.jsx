import { useState } from "react";
import styles from "../styles/Options.module.css";
import "boxicons/css/boxicons.min.css";

export const Options = ({ actions }) => {
  const [open, setOpen] = useState(false);

  const handleClick = (fn) => {
    fn();
    setOpen(false);
  };

  return (
    <nav className={`${styles.menu} ${open ? styles.open : ""}`}>
      {/* BOTÓN CENTRAL */}
      <button
        type="button"
        className={`${styles.toggler} ${open ? styles.active : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Opciones"
      >
        <span />
        <span />
        <span />
      </button>

      {/* OPCIONES */}
      <ul>
        {actions.map((item, index) => (
          <li
            key={index}
            className={styles.menuItem}
            style={{ "--angle": item.angle }}
          >
            <button onClick={() => handleClick(item.action)}>
              <i className={`bx ${item.icon}`} />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};
