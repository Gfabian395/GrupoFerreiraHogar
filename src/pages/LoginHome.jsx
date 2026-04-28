import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import Login from "../components/Login";
import { Loader } from "../components/Loader";

const LoginHome = ({ onGuestLogin }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && location.pathname === "/login") {
        navigate("/categorias", { replace: true });
      }
      setLoading(false);
    });

    return () => unsub();
  }, [navigate, location.pathname]);

  if (loading) return <div className="loading"><Loader /></div>;

  return <Login onGuestLogin={onGuestLogin} />;
};

export default LoginHome;