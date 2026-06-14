import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';

// Resolve generic Leaflet marker asset resolution faults inside SPAs
if (L && L.Icon && L.Icon.Default) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/images/marker-icon-2x.png',
    iconUrl: '/images/marker-icon.png',
    shadowUrl: '/images/marker-shadow.png',
  });
}

export default function FlightMap() {
  const [routeInput, setRouteString] = useState("YTZ SEDAR YOW");
  const [navDb, setNavDb] = useState(null);
  const [activeCoords, setActiveCoords] = useState([]);
  const [navLog, setNavLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const markersRef = useRef([]);

  // Synchronize aeronautical waypoint spatial database
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

  const parseFlightRoute = () => {
    if (!navDb || !navDb.waypoints) return;
    
    const elements = routeInput.toUpperCase().trim().split(/\s+/);
    const resolvedCoords = [];
    const initializedLog = [];

    elements.forEach(ident => {
      if (navDb.waypoints[ident]) {
        const fix = navDb.waypoints[ident];
        resolvedCoords.push([fix.lat, fix.lon]);
        
        // Instantiate deep tracking parameters for each verified route fix
        initializedLog.push({
          ident,
          type: fix.type,
          lat: fix.lat,
          lon: fix.lon,
          wind: 0,
          fl: 350,
          sat: -45,
          plannedFuel: 5000,
          actualFuel: 5000
        });
      }
    });

    setActiveCoords(resolvedCoords);
    setNavLog(initializedLog);
  };

  useEffect(() => {
    if (navDb) parseFlightRoute();
  }, [navDb]);

  // Leaflet Map Initialization Hook
  useEffect(() => {
    if (!mapRef.current && mapContainerRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([44.5, -76.5], 6);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
        attribution: '&copy; CartoDB'
      }).addTo(map);

      mapRef.current = map;
    }

    // Unmount cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map polyline paths and markers when coords / navLog updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old polyline
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    // Clear old markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Render new polyline
    if (activeCoords.length > 1) {
      const polyline = L.polyline(activeCoords, {
        color: '#00f0ff',
        weight: 3,
        opacity: 0.85
      }).addTo(map);
      polylineRef.current = polyline;
    }

    // Render new markers
    const newMarkers = [];
    navLog.forEach(wp => {
      const marker = L.marker([wp.lat, wp.lon])
        .addTo(map)
        .bindPopup(`<strong>${wp.ident}</strong> (${wp.type})`);
      newMarkers.push(marker);
    });
    markersRef.current = newMarkers;

    // Refocus map bounds to fit flight path
    if (activeCoords.length > 0) {
      try {
        const bounds = L.latLngBounds(activeCoords);
        if (bounds.isValid()) {
          const timer = setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [40, 40] });
          }, 150);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        console.error("Geospatial reframing exception:", e);
      }
    }
  }, [activeCoords, navLog]);

  const updateLogField = (index, key, value) => {
    let parsed = key === 'sat' || key === 'wind' ? parseInt(value, 10) : parseFloat(value);
    if (isNaN(parsed)) parsed = 0;

    // Wind constraints safety-clamping boundary verification
    if (key === 'wind') {
      if (parsed < -200) parsed = -200;
      if (parsed > 200) parsed = 200;
    }

    setNavLog(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: parsed };
      return updated;
    });
  };

  if (loading) return <div className="panel-container"><p>Synchronizing Navigation Databases...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Flight Map & Waypoint Navlog</h2>
        <p>Input operational route configurations to compile performance metrics and track fuel profile deltas.</p>
      </div>

      <div className="panel-body grid-2col">
        {/* Route Entry Input Box */}
        <div className="input-section glass-panel">
          <h3>Flight Route Setup</h3>
          <div className="input-grid-spatial">
            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>String Route Sequence (Fix / VOR / NDB)</label>
              <input 
                type="text" 
                value={routeInput}
                onChange={(e) => setRouteString(e.target.value)}
                onBlur={parseFlightRoute}
                className="touch-input-field"
                style={{ textAlign: 'left', textTransform: 'uppercase', letterSpacing: '1px' }}
              />
            </div>
          </div>
        </div>

        {/* Height-Secured Spatial Leaflet Viewport Frame */}
        <div className="results-section glass-panel highlight-accent" style={{ padding: '12px' }}>
          <div 
            ref={mapContainerRef} 
            style={{ width: '100%', height: '450px', position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#0a0c10' }}
          />
        </div>
      </div>

      {/* Direct Manual Entry Tactical Navlog Table Container */}
      {navLog.length > 0 && (
        <div className="glass-panel" style={{ marginTop: '24px', overflowX: 'auto' }}>
          <h3>Waypoint Progress Log (Direct Entry)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Fix</th>
                <th style={{ padding: '12px' }}>Wind (kt)</th>
                <th style={{ padding: '12px' }}>Altitude (FL)</th>
                <th style={{ padding: '12px' }}>SAT (°C)</th>
                <th style={{ padding: '12px' }}>Planned Fuel (lbs)</th>
                <th style={{ padding: '12px' }}>Actual Fuel (lbs)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Fuel Variance</th>
              </tr>
            </thead>
            <tbody>
              {navLog.map((row, idx) => {
                const fuelDelta = row.actualFuel - row.plannedFuel;
                return (
                  <tr key={`${row.ident}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '14px 12px', textAlign: 'left', fontWeight: '700', fontSize: '16px' }}>
                      {row.ident}
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: '400', color: 'rgba(255,255,255,0.4)' }}>{row.type}</span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input 
                        type="number" 
                        key={`wind-${idx}-${row.wind}`}
                        defaultValue={row.wind}
                        onBlur={(e) => updateLogField(idx, 'wind', e.target.value)}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', textAlign: 'center', width: '80px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input 
                        type="number" 
                        key={`fl-${idx}-${row.fl}`}
                        defaultValue={row.fl}
                        onBlur={(e) => updateLogField(idx, 'fl', e.target.value)}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', textAlign: 'center', width: '80px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input 
                        type="number" 
                        key={`sat-${idx}-${row.sat}`}
                        defaultValue={row.sat}
                        onBlur={(e) => updateLogField(idx, 'sat', e.target.value)}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', textAlign: 'center', width: '80px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input 
                        type="number" 
                        key={`pf-${idx}-${row.plannedFuel}`}
                        defaultValue={row.plannedFuel}
                        onBlur={(e) => updateLogField(idx, 'plannedFuel', e.target.value)}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', textAlign: 'center', width: '100px' }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input 
                        type="number" 
                        key={`af-${idx}-${row.actualFuel}`}
                        defaultValue={row.actualFuel}
                        onBlur={(e) => updateLogField(idx, 'actualFuel', e.target.value)}
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px', color: '#fff', textAlign: 'center', width: '100px' }}
                      />
                    </td>
                    <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', fontSize: '15px' }}>
                      {fuelDelta > 0 ? (
                        <span style={{ color: '#39ff14' }}>+{fuelDelta.toLocaleString()} lbs</span>
                      ) : fuelDelta < 0 ? (
                        <span style={{ color: '#ff4a4a' }}>{fuelDelta.toLocaleString()} lbs</span>
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>ON PROFILE</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
