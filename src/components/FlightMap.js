import React, { useState, useEffect, useRef } from 'react';
import { useMission } from '../context/MissionContext.js';
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
  const { mission, updateMissionField, navDb, loading } = useMission();
  const [activeCoords, setActiveCoords] = useState([]);
  const [navLog, setNavLog] = useState([]);

  const [map, setMap] = useState(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const markersRef = useRef([]);
  const navLogRef = useRef([]);

  // Keep ref in sync
  useEffect(() => { navLogRef.current = navLog; }, [navLog]);

  const parseFlightRoute = (currentInput = mission.routeString) => {
    if (!navDb || !navDb.waypoints) return;
    
    const elements = currentInput.toUpperCase().trim().split(/\s+/);
    const resolvedCoords = [];
    const initializedLog = [];

    elements.forEach((ident, index) => {
      if (navDb.waypoints[ident]) {
        const fix = navDb.waypoints[ident];
        resolvedCoords.push([fix.lat, fix.lon]);
        
        // Look up existing matching waypoint log entry to preserve entered data
        const existing = navLogRef.current.find((item, idx) => item.ident === ident && idx === index) || 
                         navLogRef.current.find(item => item.ident === ident);

        initializedLog.push({
          ident,
          type: fix.type,
          lat: fix.lat,
          lon: fix.lon,
          wind: existing ? existing.wind : '',
          fl: existing ? existing.fl : '',
          sat: existing ? existing.sat : '',
          plannedFuel: existing ? existing.plannedFuel : '',
          actualFuel: existing ? existing.actualFuel : ''
        });
      }
    });

    setActiveCoords(resolvedCoords);
    setNavLog(initializedLog);
  };

  useEffect(() => {
    if (navDb) parseFlightRoute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navDb, mission.routeString]);

  // Leaflet Map Initialization Hook (waits until loading is done so mapContainerRef exists in DOM)
  useEffect(() => {
    if (loading) return;

    if (!map && mapContainerRef.current) {
      const localMap = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([44.5, -76.5], 6);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
        attribution: '&copy; CartoDB'
      }).addTo(localMap);

      mapRef.current = localMap;
      setMap(localMap);
    }
  }, [loading, map]);

  // Unmount cleanup hook (runs ONLY on component unmount to remove map cleanly)
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map polyline paths and markers when map instance, coords, or navLog updates
  useEffect(() => {
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
  }, [map, activeCoords, navLog]);

  const updateLogField = (index, key, value) => {
    let parsed = key === 'sat' || key === 'wind' || key === 'fl' ? parseInt(value, 10) : parseFloat(value);
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

  if (loading) return (
    <div className="panel-container">
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Synchronizing Navigation Databases...</p>
      </div>
    </div>
  );

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Tactical Navigation Map & Route Advisor</h2>
        <p>Parses operational string logs, plots coordinates, and compiles waypoint performance navlogs.</p>
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
                value={mission.routeString}
                onChange={(e) => {
                  const val = e.target.value;
                  updateMissionField('routeString', val);
                  parseFlightRoute(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
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
                const hasPlanned = row.plannedFuel !== '' && row.plannedFuel !== undefined;
                const hasActual = row.actualFuel !== '' && row.actualFuel !== undefined;
                const fuelDelta = hasPlanned && hasActual ? row.actualFuel - row.plannedFuel : null;
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
                      {fuelDelta === null ? (
                        <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                      ) : fuelDelta > 0 ? (
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

      {/* Compliance Reference Footer Block */}
      <footer style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
        <span>DATA REFERENCE: FCOM PART PI-ECON (EMB-195E2)</span>
        <span>AFM REVISION ID: REV 44 • DATABASE SYNC CYCLE: 2606</span>
      </footer>
    </div>
  );
}
