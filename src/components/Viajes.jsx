import React, { useState } from 'react';
import { useLoadScript, GoogleMap, DirectionsRenderer, Autocomplete, Circle, Marker, InfoWindow } from '@react-google-maps/api';
import styles from '../styles/Viajes.module.css';

// Bibliotecas necesarias de Google Maps (Autocomplete y Places)
const libraries = ['places'];
const TARIFA_POR_KM = 2000; // $1.000 ARS por kilómetro

// Lista de sucursales con coordenadas geográficas reales y exactas
const SUCURSALES = [
  { 
    id: 'suc1', 
    nombre: 'Sucursal Los Andes 4320 (Bernal Oeste)', 
    direccion: 'Los Andes 4320, B1876 Bernal Oeste, Provincia de Buenos Aires',
    coords: { lat: -34.7241133, lng: -58.3217973 } 
  },
  { 
    id: 'suc2', 
    nombre: 'Sucursal Los Andes 4034 (Bernal Oeste)', 
    direccion: 'Los Andes 4034, B1876 Bernal Oeste, Provincia de Buenos Aires',
    coords: { lat: -34.7225356, lng: -58.3200516 } 
  },
  { 
    id: 'suc3', 
    nombre: 'Sucursal Aldo Emir Jofre 2440 (Quilmes)', 
    direccion: 'Aldo Emir Jofre 2440, B1883 Quilmes, Provincia de Buenos Aires',
    coords: { lat: -34.7192629, lng: -58.322658 } 
  },
];

export default function Viajes() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  const [origen, setOrigen] = useState(SUCURSALES[0].direccion); 
  const [centroMapa, setCentroMapa] = useState(SUCURSALES[0].coords);
  const [sucursalActiva, setSucursalActiva] = useState(SUCURSALES[0]);
  const [mapInstance, setMapInstance] = useState(null);
  const [destino, setDestino] = useState('');
  const [directionsResponse, setDirectionsResponse] = useState(null);
  const [distanciaTexto, setDistanciaTexto] = useState('');
  const [distanciaValorKm, setDistanciaValorKm] = useState(0);
  const [duracion, setDuracion] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Cada vez que cambia el origen en el select, actualizamos las coordenadas y recentramos el mapa exactamente en esa sucursal
  const handleOrigenChange = (e) => {
    const nuevaDireccion = e.target.value;
    setOrigen(nuevaDireccion);
    
    const sucursalEncontrada = SUCURSALES.find(s => s.direccion === nuevaDireccion);
    if (sucursalEncontrada) {
      setCentroMapa(sucursalEncontrada.coords);
      setSucursalActiva(sucursalEncontrada);
      if (mapInstance) {
        mapInstance.panTo(sucursalEncontrada.coords);
        mapInstance.setZoom(13);
      }
    }
  };

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
          
          const km = route.distance.value / 1000;
          setDistanciaValorKm(km);
        } else {
          setError('No se pudo encontrar una ruta entre los puntos indicados.');
        }
      }
    );
  };

  if (!isLoaded) return <div className={styles.loading}>Cargando mapa...</div>;

  // Lógica: Si es <= 5 km es GRATIS (0). Si supera los 5 km, se cobra el total completo desde la sucursal.
  const costoTotal = distanciaValorKm <= 5 ? 0 : Math.round(distanciaValorKm * TARIFA_POR_KM);

  // Opciones de estilo para el círculo de 5 km
  const circleOptions = {
    strokeColor: '#1d4ed8',
    strokeOpacity: 0.9,
    strokeWeight: 3,
    fillColor: '#3b82f6',
    fillOpacity: 0.2,
    clickable: false,
    zIndex: 1,
  };

  return (
    <div className={styles.viajesContainer}>
      
      {/* MAPA DE FONDO (Ocupa toda la pantalla detrás) */}
      <div className={styles.mapWrapper}>
        <GoogleMap
          center={centroMapa} 
          zoom={13}
          onLoad={(map) => setMapInstance(map)}
          mapContainerStyle={{ width: '100%', height: '100%' }}
          options={{ zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
        >
          {mapInstance && (
            <>
              {/* Círculo exacto de 5 km (5000 metros) centrado en la sucursal activa */}
              <Circle
                center={centroMapa}
                radius={4000}
                options={circleOptions}
              />

              {/* Marcador exacto de la sucursal activa */}
              <Marker
                position={centroMapa}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                  scaledSize: new window.google.maps.Size(42, 42)
                }}
              />

              {/* Etiqueta flotante permanente con el nombre de la sucursal activa */}
              <InfoWindow position={centroMapa}>
                <div style={{ padding: '2px', color: '#1e293b', fontFamily: 'sans-serif' }}>
                  <strong style={{ fontSize: '13px', display: 'block', color: '#b91c1c' }}>📍 Sucursal de Origen</strong>
                  <span style={{ fontSize: '12px', fontWeight: '500' }}>{sucursalActiva.nombre}</span>
                </div>
              </InfoWindow>
            </>
          )}

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
              onChange={handleOrigenChange}
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
            
            {distanciaValorKm <= 5 ? (
              <p style={{ color: '#16a34a', fontWeight: 'bold', margin: '0.4rem 0' }}>
                ¡Envío bonificado (dentro del radio de 5 km)!
              </p>
            ) : (
              <p><strong>Tarifa aplicada:</strong> ${TARIFA_POR_KM} ARS / km (se cobra desde origen por superar los 5 km)</p>
            )}

            <div className={styles.totalBox}>
              <span>Costo Total:</span>
              <span className={styles.totalPrice}>
                {costoTotal === 0 ? 'GRATIS' : `$${costoTotal.toLocaleString('es-AR')} ARS`}
              </span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}