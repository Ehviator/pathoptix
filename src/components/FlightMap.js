import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import WaypointLog from './WaypointLog';

// Fix generic Leaflet marker icon asset mapping bugs inside single-page applications
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png',
});

// Custom component to dynamically re-center map view tracking frames when the route profile updates
function MapRefocus({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      try {
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) {
          // Delay execution to ensure browser has resolved element layout sizes
          const timer = setTimeout(() => {
            map.invalidateSize();
            if (map.getSize().x > 0) {
              map.fitBounds(bounds, { padding: [50, 50] });
            }
          }, 100);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        console.error("Map refocus layout safety fault:", e);
      }
    }
  }, [coords, map]);
  return null;
}

export default function FlightMap() {
  const [routeInput, setRouteString] = useState("YTZ SEDAR YOW");
  const [navDb, setNavDb] = useState(null);
  const [activeCoords, setActiveCoords] = useState([]);
  const [activeWaypoints, setActiveWaypoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/nav_db.json')
      .then(res => res.json())
      .then(data => {
        setNavDb(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Navigation database synchronization fault:", err);
        setLoading(false);
      });
  }, []);

  // Parse direct string entry logs down to precise spatial track arrays
  const parseFlightRoute = () => {
    if (!navDb || !navDb.waypoints) return;
    
    const elements = routeInput.toUpperCase().trim().split(/\s+/);
    const resolvedCoords = [];
    const resolvedWaypoints = [];

    elements.forEach(ident => {
      if (navDb.waypoints[ident]) {
        const fix = navDb.waypoints[ident];
        resolvedCoords.push([fix.lat, fix.lon]);
        resolvedWaypoints.push({ ident, ...fix });
      }
    });

    setActiveCoords(resolvedCoords);
    setActiveWaypoints(resolvedWaypoints);
  };

  useEffect(() => {
    if (navDb) parseFlightRoute();
  }, [navDb]);

  if (loading) return <div className="panel-container"><p>Synchronizing Navigation Databases...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Tactical Navigation Map & Route Advisor</h2>
        <p>Parses operational string logs, plots coordinates, and maps VOR/NDB fixes onto the flight deck interface.</p>
      </div>

      <div className="panel-body grid-2col">
        {/* Left Side: Route Entry Panel */}
        <div className="input-section glass-panel">
          <h3>Route Entry & Waypoints Log</h3>
          
          <div className="input-grid-spatial">
            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Flight Plan String Route</label>
              <input 
                type="text" 
                value={routeInput}
                onChange={(e) => setRouteString(e.target.value)}
                onBlur={parseFlightRoute}
                placeholder="e.g. YTZ SEDAR YOW"
                className="touch-input-field"
                style={{ textAlign: 'left', textTransform: 'uppercase', letterSpacing: '1px' }}
              />
            </div>
          </div>

          {/* Dynamic Waypoint Attribute Readout Rows */}
          <WaypointLog waypoints={activeWaypoints} />
        </div>

        {/* Right Side: Map Display View */}
        <div className="results-section glass-panel highlight-accent" style={{ padding: '12px', minHeight: '450px' }}>
          <div className="map-rendering-container">
            <MapContainer 
              center={[44.5, -76.5]} 
              zoom={6} 
              style={{ width: '100%', height: '100%', background: '#0a0c10' }}
              zoomControl={false} // Clean HUD display layout optimization
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
              />
              
              {activeCoords.length > 1 && (
                <Polyline 
                  positions={activeCoords} 
                  pathOptions={{ color: '#00f0ff', weight: 3, opacity: 0.85, dashArray: '4, 8' }} 
                />
              )}

              {activeWaypoints.map((wp, idx) => (
                <Marker position={[wp.lat, wp.lon]} key={`marker-${wp.ident}-${idx}`}>
                  <Popup>
                    <div style={{ color: '#000000', fontFamily: 'sans-serif', fontSize: '12px' }}>
                      <strong>{wp.ident}</strong><br />
                      Type: {wp.type}<br />
                      {wp.freq ? `Freq: ${wp.freq}` : ''}
                    </div>
                  </Popup>
                </Marker>
              ))}

              <MapRefocus coords={activeCoords} />
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
