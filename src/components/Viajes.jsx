import React, { useState } from 'react';
import { useLoadScript, GoogleMap, DirectionsRenderer, Autocomplete } from '@react-google-maps/api';
import styles from '../styles/Viajes.module.css';

// Bibliotecas necesarias de Google Maps (Autocomplete y Places)
const libraries = ['places'];
const TARIFA_POR_KM = 1000; // $1.000 ARS por kilómetro

// Lista de sucursales reales actualizadas
const SUCURSALES = [
  { id: 'suc1', nombre: 'Sucursal Los Andes 4320 (Bernal Oeste)', direccion: 'Los Andes 4320, B1876 Bernal Oeste, Provincia de Buenos Aires' },
  { id: 'suc2', nombre: 'Sucursal Los Andes 4034 (Bernal Oeste)', direccion: 'Los Andes 4034, B1876 Bernal Oeste, Provincia de Buenos Aires' },
  { id: 'suc3', nombre: 'Sucursal Aldo Emir Jofre 2440 (Quilmes)', direccion: 'Aldo Emir Jofre 2440, B1883 Quilmes, Provincia de Buenos Aires' },
];

export default function Viajes() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const [origen, setOrigen] = useState(SUCURSALES[0].direccion); // Por defecto la primera sucursal
  const [destino, setDestino] = useState('');
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [distanciaTexto, setDistanciaTexto] = useState('');
  const [distanciaValorKm, setDistanciaValorKm] = useState(0);
  const [duracion, setDuracion] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Referencia para el input de Autocompletado del Destino
  const [destAutocomplete, setDestAutocomplete] = useState(null);

  const onLoadDest = (autocomplete) => setDestAutocomplete(autocomplete);
  const onPlaceChangedDest = () => {
    if (destAutocomplete !== null) {
      setDestino(destAutocomplete.getPlace().formatted_address || destAutocomplete.getPlace().name);
    }
  };

  // Calcular la ruta utilizando Google Maps Directions Service
  const calcularRuta = (e) => {
    e.preventDefault();
    if (!origen || !destino) {
      setError('Por favor, selecciona una sucursal e ingresa el destino.');
      return;
    }

    setError('');
    setIsLoading(true);

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: origen,
        destination: destino,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        setIsLoading(false);
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirectionsResponse(result);
          const route = result.routes[0].legs[0];
          setDistanciaTexto(route.distance.text);
          setDuracion(route.duration.text);
          
          // route.distance.value está en metros, lo pasamos a kilómetros
          const km = route.distance.value / 1000;
          setDistanciaValorKm(km);
        } else {
          setError('No se pudo encontrar una ruta entre los puntos indicados.');
        }
      }
    );
  };

  if (!isLoaded) return <div className={styles.loading}>Cargando mapa...</div>;

  const costoTotal = Math.round(distanciaValorKm * TARIFA_POR_KM);

  return (
    <div className={styles.viajesContainer}>
      
      {/* MAPA DE FONDO (Ocupa toda la pantalla detrás) */}
      <div className={styles.mapWrapper}>
        <GoogleMap
          center={{ lat: -34.722, lng: -58.283 }} // Centrado en la zona de Bernal / Quilmes
          zoom={13}
          mapContainerStyle={{ width: '100%', height: '100%' }}
          options={{ zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
        >
          {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
        </GoogleMap>
      </div>

      {/* PANEL FLOTANTE SUPERIOR */}
      <div className={styles.floatingPanel}>
        <h2 className={styles.title}>Calculadora de Envíos</h2>
        
        <form onSubmit={calcularRuta} className={styles.form}>
          {/* Selector de Sucursales (Origen) */}
          <div className={styles.inputGroup}>
            <label>Sucursal de Origen:</label>
            <select
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              className={styles.input}
            >
              {SUCURSALES.map((suc) => (
                <option key={suc.id} value={suc.direccion}>
                  {suc.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Input de Destino con Google Autocomplete */}
          <div className={styles.inputGroup}>
            <label>Destino:</label>
            <Autocomplete onLoad={onLoadDest} onPlaceChanged={onPlaceChangedDest}>
              <input
                type="text"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Ej: Mitre 500, Quilmes"
                className={styles.input}
              />
            </Autocomplete>
          </div>

          <button type="submit" className={styles.button} disabled={isLoading}>
            {isLoading ? 'Calculando...' : 'Calcular Costo de Envío'}
          </button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        {/* Resultados y Cotización Flotantes */}
        {distanciaValorKm > 0 && (
          <div className={styles.resultCard}>
            <h3>Detalles del Viaje</h3>
            <p><strong>Distancia:</strong> {distanciaTexto}</p>
            <p><strong>Tiempo estimado:</strong> {duracion}</p>
            <p><strong>Tarifa aplicada:</strong> ${TARIFA_POR_KM} ARS / km</p>
            <div className={styles.totalBox}>
              <span>Costo Total:</span>
              <span className={styles.totalPrice}>${costoTotal.toLocaleString('es-AR')} ARS</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}