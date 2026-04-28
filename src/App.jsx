import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase/firebaseConfig";

import NavBar from "./pages/NavBar";
import { Categorias } from "./pages/Categorias";
import { Productos } from "./pages/Productos";
import Clientes from "./pages/Clientes";
import Carrito from "./pages/Carrito";
import Ventas from "./pages/Ventas";
import ClientDetail from "./components/ClientDetail";
import LoginHome from "./pages/LoginHome";
import Configuracion from "./pages/Configuracion";
import { Caja } from "./pages/Caja";
import Finanzas from "./components/Finanzas";
import MigrarClientes from "./pages/MigrarClientes";
import { CartProvider } from "./context/CartContext";
import Notificaciones from "./components/Notificaciones";
import { Loader } from "./components/Loader";
import "./App.css";
import ProductoDetalle from "./components/ProductoDetalle";

function App() {
  const [usuario, setUsuario] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [loading, setLoading] = useState(true);

  // ================== Control de sesión ==================
  useEffect(() => {
    let unsubUserDoc = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (!user) {
        const guest = localStorage.getItem("guestUser");
        if (guest) {
          setUsuario(JSON.parse(guest));
          setBloqueado(false);
          setLoading(false);
          return;
        }

        setUsuario(null);
        setBloqueado(false);
        setLoading(false);
        return;
      }

      const ref = doc(db, "usuarios", user.uid);

      unsubUserDoc = onSnapshot(ref, (snap) => {
        if (!snap.exists() || snap.data().activo === false) {
          setBloqueado(true);
          setUsuario(null);
          setLoading(false);
          signOut(auth);
          return;
        }

        setUsuario({ uid: user.uid, ...snap.data() });
        setBloqueado(false);
        setLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  // ================== Logout ==================
  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem("guestUser");
    setUsuario(null);
    setBloqueado(false);
  };

  // ================== Login invitado ==================
  const handleGuestLogin = () => {
    const guestUser = {
      uid: "guest_" + Date.now(),
      nombre: "Invitado",
      email: "",
      role: "catalogo",
      activo: true,
    };
    localStorage.setItem("guestUser", JSON.stringify(guestUser));
    setUsuario(guestUser); // ✅ Actualiza estado global
    setBloqueado(false);
  };

  // ================== Rutas privadas ==================
  const PrivateRoute = ({ children, role }) => {
    if (loading) return <div className="loading"><Loader /></div>;
    if (!usuario || bloqueado) return <Navigate to="/login" replace />;

    if (role) {
      const rolesPermitidos = Array.isArray(role) ? role : [role];
      if (!rolesPermitidos.includes(usuario.role)) return <Navigate to="/categorias" replace />;
    }

    return children;
  };

  const PublicRoute = ({ children }) => {
    if (loading) return <div className="loading"><Loader /></div>;
    if (usuario && !bloqueado) return <Navigate to="/categorias" replace />;
    return children;
  };

  // ================== Render ==================
  return (
    <CartProvider>
      <Router>
        <Notificaciones />
        <div className="layout">
          {bloqueado && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.95)",
                zIndex: 99999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                pointerEvents: "none",
              }}
            >
              <h1>🚫 Usuario deshabilitado</h1>
            </div>
          )}

          {usuario && !bloqueado && <NavBar usuario={usuario} onLogout={handleLogout} />}

          <div className="content">
            <Routes>
              <Route
                path="/"
                element={
                  loading
                    ? <div className="loading"><Loader /></div>
                    : usuario && !bloqueado
                      ? <Navigate to="/categorias" replace />
                      : <LoginHome onGuestLogin={handleGuestLogin} />
                }
              />

              <Route path="/login" element={<PublicRoute><LoginHome onGuestLogin={handleGuestLogin} /></PublicRoute>} />

              <Route path="/categorias" element={<PrivateRoute role={["jefe", "encargado", "catalogo", "vendedor"]}><Categorias /></PrivateRoute>} />
              <Route path="/categorias/:categoriaId/productos" element={<PrivateRoute role={["jefe", "encargado", "catalogo", "vendedor"]}><Productos /></PrivateRoute>} />
              <Route path="/producto/:categoriaId/:productoId" element={<PrivateRoute role={["jefe", "encargado", "catalogo", "vendedor"]}> <ProductoDetalle /> </PrivateRoute>} />
              <Route path="/carrito" element={<PrivateRoute role={["jefe", "encargado", "catalogo", "vendedor"]}><Carrito /></PrivateRoute>} />

              {/* Solo usuarios reales */}
              <Route path="/clientes" element={<PrivateRoute role={["jefe", "encargado", "vendedor"]}><Clientes /></PrivateRoute>} />
              <Route path="/clientes/:id" element={<PrivateRoute role={["jefe", "encargado", "vendedor"]}><ClientDetail /></PrivateRoute>} />
              <Route path="/ventas" element={<PrivateRoute role={["jefe", "encargado", "vendedor"]}><Ventas /></PrivateRoute>} />
              <Route path="/configuracion" element={<PrivateRoute role={["jefe", "encargado", "vendedor"]}><Configuracion /></PrivateRoute>} />
              <Route path="/cierre-de-caja" element={<PrivateRoute role="jefe"><Caja /></PrivateRoute>} />
              <Route path="/finanzas" element={<PrivateRoute role="jefe"><Finanzas /></PrivateRoute>} />
              <Route path="/admin/migrar-clientes" element={<PrivateRoute role="jefe"><MigrarClientes /></PrivateRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </Router>
    </CartProvider>
  );
}

export default App;