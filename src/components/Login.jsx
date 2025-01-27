// src/components/Login.js

import React, { useState } from 'react';
import { login } from '../firebaseConfig'; // Asegúrate de tener configurada la autenticación en firebaseConfig.js

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(email, password);
            console.log('Inicio de sesión exitoso');
            // Redirigir al dashboard del vendedor
        } catch (error) {
            console.error('Error al iniciar sesión: ', error);
        }
    };

    return (
        <div>
            <h2>Inicio de Sesión</h2>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Email:</label>
                    <input 
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                    />
                </div>
                <div>
                    <label>Contraseña:</label>
                    <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                    />
                </div>
                <button type="submit">Iniciar Sesión</button>
            </form>
        </div>
    );
}

export default Login;
