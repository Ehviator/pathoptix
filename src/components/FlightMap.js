import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useMission } from '../context/MissionContext.js';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapRefocus({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      try {
        const bounds = L.latLngBounds(coords);
        if (bounds.isValid()) {
          const timer = setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [40, 40] });
          }, 150);
          return () => clearTimeout(timer);
        }
      } catch (e) {
        console.error("Map bounds refocus error:", e);
      }
    }
  }, [coords, map]);
  return null;
}

export default function FlightMap() {
  const { mission, updateMissionField, loading, navLog, totalDistance, updateNavLogField } = useMission();

  // Derive active map polyline coordinates dynamically from the global navLog waypoints
  const activeCoords = navLog.map(wp => [wp.lat, wp.lon]);

  if (loading) return <div className="panel-container"><p>Synchronizing Navigation Databases...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Tactical Navigation Map & Route Advisor</h2>
        <p>Parses operational string logs, plots coordinates, and calculates live kinematics (Distance, GS, ETE).</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Route Entry & Overview</h3>
          <div className="input-grid-spatial">
            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Flight Plan String Route</label>
              <input 
                type="text" 
                value={mission.routeString}
                onChange={(e) => updateMissionField('routeString', e.target.value)}
                className="touch-input-field"
                style={{ textAlign: 'left', textTransform: 'uppercase', letterSpacing: '1px' }}
              />
            </div>
          </div>
          <div className="metrics-summary" style={{ marginTop: '24px' }}>
            <div className="metric-box" style={{ width: '100%' }}>
              <span className="label">Total Route Distance</span>
              <span className="value">{totalDistance} NM</span>
            </div>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent" style={{ padding: '12px' }}>
          <div style={{ width: '100%', height: '450px', position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
            <MapContainer center={[44.5, -76.5]} zoom={6} style={{ width: '100%', height: '100%', background: '#0a0c10' }} zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" attribution='&copy; CartoDB' />
              {activeCoords.length > 1 && <Polyline positions={activeCoords} pathOptions={{ color: '#00f0ff', weight: 3, opacity: 0.85 }} />}
              {navLog.map((wp, idx) => (
                <Marker position={[wp.lat, wp.lon]} key={`marker-${wp.ident}-${idx}`}>
                  <Popup><div style={{ color: '#000000', fontSize: '12px' }}><strong>{wp.ident}</strong> ({wp.type})</div></Popup>
                </Marker>
              ))}
              <MapRefocus coords={activeCoords} />
            </MapContainer>
          </div>
        </div>
      </div>

      {navLog.length > 0 && (
        <div className="glass-panel" style={{ marginTop: '24px', overflowX: 'auto' }}>
          <h3>Dynamic Waypoint Kinematics Log</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Fix</th>
                <th style={{ padding: '12px' }}>Dist (NM)</th>
                <th style={{ padding: '12px' }}>Wind (kt)</th>
                <th style={{ padding: '12px' }}>FL</th>
                <th style={{ padding: '12px' }}>SAT (°C)</th>
                <th style={{ padding: '12px' }}>TAS/GS (kt)</th>
                <th style={{ padding: '12px' }}>Leg ETE</th>
                <th style={{ padding: '12px' }}>Plan / Act Fuel</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Fuel Var</th>
              </tr>
            </thead>
            <tbody>
              {navLog.map((row, idx) => {
                const fuelDelta = row.actualFuel - row.plannedFuel;
                const legTimeMin = row.gs > 0 ? (row.legDistance / row.gs) * 60 : 0;
                const timeFormatted = row.legDistance === 0 ? "00:00" : `${Math.floor(legTimeMin).toString().padStart(2, '0')}:${Math.round((legTimeMin % 1) * 60).toString().padStart(2, '0')}`;

                return (
                  <tr key={`${row.ident}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '15px' }}>
                      {row.ident}
                      <span style={{ display: 'block', fontSize: '10px', fontWeight: '400', color: 'rgba(255,255,255,0.4)' }}>{row.type}</span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                      {row.legDistance === 0 ? '--' : row.legDistance}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input type="number" defaultValue={row.wind} onBlur={(e) => updateNavLogField(idx, 'wind', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '60px' }} />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input type="number" defaultValue={row.fl} onBlur={(e) => updateNavLogField(idx, 'fl', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '60px' }} />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input type="number" defaultValue={row.sat} onBlur={(e) => updateNavLogField(idx, 'sat', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '60px' }} />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{row.tas} / </span><strong style={{ color: '#fff' }}>{row.gs}</strong>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', fontSize: '14px', color: '#ffb700' }}>
                      {timeFormatted}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <input type="number" defaultValue={row.plannedFuel} onBlur={(e) => updateNavLogField(idx, 'plannedFuel', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '70px' }} />
                      <input type="number" defaultValue={row.actualFuel} onBlur={(e) => updateNavLogField(idx, 'actualFuel', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '70px' }} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', fontSize: '14px' }}>
                      {fuelDelta > 0 ? <span style={{ color: '#39ff14' }}>+{fuelDelta}</span> : fuelDelta < 0 ? <span style={{ color: '#ff4a4a' }}>{fuelDelta}</span> : <span style={{ color: 'rgba(255,255,255,0.4)' }}>OK</span>}
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
