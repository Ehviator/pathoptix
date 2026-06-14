import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useMission } from '../context/MissionContext.js';
import L from 'leaflet';

const defaultIcon = L.icon({
  iconUrl: '/images/marker-icon.png',
  iconRetinaUrl: '/images/marker-icon-2x.png',
  shadowUrl: '/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = defaultIcon;

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

export default function ReviewRoute() {
  const { 
    mission, 
    navLog, 
    totalDistance, 
    updateNavLogField, 
    minimumDiversionFuel, 
    airportDb, 
    enrichAirport,
    unresolvedElements,
    takeoffWeight,
    terrainDb
  } = useMission();

  // Derive active map polyline coordinates dynamically from the global navLog waypoints
  const activeCoords = (navLog || [])
    .filter(wp => wp && typeof wp.lat === 'number' && Number.isFinite(wp.lat) && typeof wp.lon === 'number' && Number.isFinite(wp.lon))
    .map(wp => [wp.lat, wp.lon]);

  // --- VERTICAL PROFILE COMPUTATIONS ---
  const cruiseAlt = (mission.cruiseFL || 350) * 100;
  const depElev = mission.departureElev || 0;
  const arrElev = mission.arrivalElev || 0;
  const fpaAngle = mission.fpa || 3.0;

  // TOC distance estimate
  const climbAltDelta = Math.max(0, cruiseAlt - depElev);
  const climbDistanceEst = Math.round((climbAltDelta / 1000) * 2.5 * (1 + ((takeoffWeight - 100000) / 100000) * 0.2));

  // TOD distance estimate
  const descentAltDelta = Math.max(0, cruiseAlt - arrElev);
  const descentDistanceEst = Math.round((descentAltDelta / 1000) * (3.0 / fpaAngle) * 3);

  // Proportional scaling for short routes
  let climbDistance = climbDistanceEst;
  let descentDistance = descentDistanceEst;
  if (climbDistance + descentDistance > totalDistance) {
    const ratio = totalDistance / (climbDistance + descentDistance || 1);
    climbDistance = Math.round(climbDistance * ratio);
    descentDistance = Math.round(descentDistance * ratio);
  }

  // Get terrain height at points
  const getTerrainHeightLocal = (lat, lon) => {
    if (!terrainDb || !terrainDb.terrain_grid) return 0;
    const gridLat = Math.floor(lat);
    const gridLon = Math.floor(lon);
    const key = `${gridLat}_${gridLon}`;
    return terrainDb.terrain_grid[key] || 0;
  };

  let cumulativeDist = 0;
  const navLogWithAltitudes = (navLog || []).map((wp, i) => {
    let alt = cruiseAlt;
    if (i === 0) {
      cumulativeDist = 0;
      alt = depElev;
    } else {
      cumulativeDist += wp.legDistance || 0;
      if (cumulativeDist < climbDistance) {
        alt = depElev + (climbAltDelta * (cumulativeDist / (climbDistance || 1)));
      } else if (cumulativeDist > totalDistance - descentDistance) {
        const distFromDest = totalDistance - cumulativeDist;
        alt = arrElev + (descentAltDelta * (distFromDest / (descentDistance || 1)));
      }
    }

    return {
      ...wp,
      cumulativeDistance: cumulativeDist,
      altitude: Math.round(alt)
    };
  });

  const terrainPoints = [];
  if (navLog && navLog.length > 0 && terrainDb) {
    for (let i = 0; i < navLog.length; i++) {
      const wp = navLog[i];
      const wpHeight = getTerrainHeightLocal(wp.lat, wp.lon);
      const cumDist = navLogWithAltitudes[i].cumulativeDistance;
      terrainPoints.push({
        distance: cumDist,
        height: wpHeight
      });

      if (i < navLog.length - 1) {
        const nextWp = navLog[i + 1];
        const dist = nextWp.legDistance;
        const samplesCount = Math.min(5, Math.ceil(dist / 25));
        
        for (let s = 1; s < samplesCount; s++) {
          const ratio = s / samplesCount;
          const lat = wp.lat + (nextWp.lat - wp.lat) * ratio;
          const lon = wp.lon + (nextWp.lon - wp.lon) * ratio;
          const sampleDist = cumDist + dist * ratio;
          const sampleHeight = getTerrainHeightLocal(lat, lon);
          
          terrainPoints.push({
            distance: sampleDist,
            height: sampleHeight
          });
        }
      }
    }
    terrainPoints.sort((a, b) => a.distance - b.distance);
  }

  const getX = (dist) => {
    if (totalDistance === 0) return 60;
    return 60 + (dist / totalDistance) * 710;
  };

  const getY = (alt) => {
    return 145 - (alt / 45000) * 125;
  };

  const showPlaceholder = !mission.weight || mission.weight < 50000;

  if (showPlaceholder) {
    return (
      <div className="panel-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', margin: '24px 0' }}>
          <span style={{ fontSize: '32px', marginBottom: '16px' }}>📋</span>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--accent-cyan)' }}>No Active Dispatch Plan</h3>
          <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: '1.5' }}>
            Please configure dispatch weights and flight parameters on the **Create Flight** page first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>🗺️ Review Lateral Flight Route</h2>
        <p>Analyze route geometry, track coordinates, waypoint tracks, and ETEs.</p>
      </div>

      <div className="panel-body">
        {/* Unresolved Route Warning Banner */}
        {unresolvedElements && unresolvedElements.length > 0 && (
          <div className="alert-banner warning" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 20px 0', background: 'rgba(255, 183, 0, 0.12)', border: '1px solid rgba(255, 183, 0, 0.25)', borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>
              <strong>ROUTE WARNING:</strong> The following elements could not be fully resolved and are not plotted on the map: 
              {unresolvedElements.map((el, i) => (
                <span key={el.ident} style={{ marginLeft: '6px' }}>
                  <strong style={{ color: 'var(--accent-warn)' }}>{el.ident}</strong> 
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}> ({el.type.toLowerCase()})</span>
                  {i < unresolvedElements.length - 1 ? ',' : ''}
                </span>
              ))}
              . Verify these items in the route string. Terminal procedures (SIDs/STARs) will display direct segments.
            </span>
          </div>
        )}

        <div className="glass-panel highlight-accent" style={{ padding: '12px' }}>
          <div style={{ width: '100%', height: '480px', position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
            <MapContainer center={[44.5, -76.5]} zoom={6} style={{ width: '100%', height: '100%', background: '#0a0c10' }} zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" attribution='&copy; CartoDB' />
              {activeCoords.length > 1 && <Polyline positions={activeCoords} pathOptions={{ color: '#00f0ff', weight: 3, opacity: 0.85 }} />}
              {(navLog || [])
                .filter(wp => wp && typeof wp.lat === 'number' && Number.isFinite(wp.lat) && typeof wp.lon === 'number' && Number.isFinite(wp.lon))
                .map((wp, idx) => {
                  const isAirport = airportDb && airportDb.airports && airportDb.airports[wp.ident];
                  const enriched = isAirport ? enrichAirport(wp.ident, airportDb.airports[wp.ident]) : null;

                  return (
                    <Marker position={[wp.lat, wp.lon]} key={`marker-${wp.ident}-${idx}`}>
                      <Popup>
                        <div style={{ color: '#000000', fontSize: '12px', minWidth: '150px' }}>
                          <strong>{wp.ident}</strong> ({wp.type})
                          {enriched && enriched.name && (
                            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px', textTransform: 'capitalize' }}>
                              {enriched.name.toLowerCase()}
                            </div>
                          )}
                          {enriched && enriched.elevation !== undefined && (
                            <div style={{ fontSize: '11px', color: '#555' }}>Elev: {enriched.elevation} ft</div>
                          )}
                          {enriched && enriched.runways && enriched.runways.length > 0 && (
                            <div style={{ marginTop: '6px', borderTop: '1px solid #ddd', paddingTop: '4px' }}>
                              <strong style={{ fontSize: '10px', textTransform: 'uppercase', color: '#333', display: 'block', marginBottom: '2px' }}>Runways:</strong>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '10px' }}>
                                {enriched.runways.map(rwy => (
                                  <div key={rwy.ident}><strong>{rwy.ident}</strong>: {rwy.length} ft</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              <MapRefocus coords={activeCoords} />
            </MapContainer>
          </div>
        </div>

        {/* Vertical Flight Profile Graph */}
        {totalDistance > 0 && (
          <div className="glass-panel" style={{ marginTop: '24px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>📈 Vertical Flight Profile & Airspace Trajectory</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Vertical cross-section showing Estimated Top of Climb (TOC), Top of Descent (TOD), waypoint crossings, and terrain clearance elevations.
            </p>
            
            <div className="vertical-profile-wrapper" style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
              <svg viewBox="0 0 800 200" className="profile-svg" style={{ width: '100%', minWidth: '700px', height: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="routePathGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="routeTerrainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(139, 69, 19, 0.2)" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="rgba(139, 69, 19, 0.02)" stopOpacity="0.2" />
                  </linearGradient>
                </defs>

                {/* Altitude Grid Lines */}
                {[0, 10000, 20000, 30000, 40000].map(alt => {
                  const y = getY(alt);
                  const label = alt === 0 ? "MSL" : `FL${alt / 100}`;
                  return (
                    <g key={`grid-alt-${alt}`}>
                      <line x1="55" y1={y} x2="770" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                      <text x="15" y={y + 4} fill="rgba(255,255,255,0.4)" fontSize="10px" fontFamily="monospace">{label}</text>
                    </g>
                  );
                })}

                {/* Flight Path Filled Area */}
                <path
                  d={`
                    M 60 ${getY(depElev)}
                    L ${getX(climbDistance)} ${getY(cruiseAlt)}
                    L ${getX(totalDistance - descentDistance)} ${getY(cruiseAlt)}
                    L 770 ${getY(arrElev)}
                    L 770 160
                    L 60 160
                    Z
                  `}
                  fill="url(#routePathGrad)"
                />

                {/* Terrain Shading */}
                {terrainPoints.length > 0 && (
                  <path
                    d={`
                      M 60 160
                      ${terrainPoints.map(pt => `L ${getX(pt.distance)} ${getY(pt.height)}`).join(' ')}
                      L 770 160
                      Z
                    `}
                    fill="url(#routeTerrainGrad)"
                    stroke="rgba(139, 69, 19, 0.35)"
                    strokeWidth="1"
                  />
                )}

                {/* Flight Path Main Stroke Line */}
                <path
                  d={`
                    M 60 ${getY(depElev)}
                    L ${getX(climbDistance)} ${getY(cruiseAlt)}
                    L ${getX(totalDistance - descentDistance)} ${getY(cruiseAlt)}
                    L 770 ${getY(arrElev)}
                  `}
                  fill="none"
                  stroke="var(--accent-cyan)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* TOC Marker */}
                {climbDistance > 0 && (
                  <g transform={`translate(${getX(climbDistance)}, ${getY(cruiseAlt)})`}>
                    <circle r="4" fill="#00ff88" />
                    <line x1="0" y1="0" x2="0" y2={160 - getY(cruiseAlt)} stroke="rgba(0, 255, 136, 0.25)" strokeDasharray="2,2" />
                    <text y="-8" textAnchor="middle" fill="#00ff88" fontSize="9px" fontWeight="bold" fontFamily="sans-serif">TOC</text>
                    <text y="14" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8px" fontFamily="monospace">{climbDistance} NM</text>
                  </g>
                )}

                {/* TOD Marker */}
                {descentDistance > 0 && (
                  <g transform={`translate(${getX(totalDistance - descentDistance)}, ${getY(cruiseAlt)})`}>
                    <circle r="4" fill="#ff4d4d" />
                    <line x1="0" y1="0" x2="0" y2={160 - getY(cruiseAlt)} stroke="rgba(255, 77, 77, 0.25)" strokeDasharray="2,2" />
                    <text y="-8" textAnchor="middle" fill="#ff4d4d" fontSize="9px" fontWeight="bold" fontFamily="sans-serif">TOD</text>
                    <text y="14" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8px" fontFamily="monospace">-{descentDistance} NM</text>
                  </g>
                )}

                {/* Waypoint Markers and Vertical Droplines */}
                {(() => {
                  let lastAboveX = -Infinity;
                  let lastBelowX = -Infinity;
                  return navLogWithAltitudes.map((wp, idx) => {
                    const x = getX(wp.cumulativeDistance);
                    const y = getY(wp.altitude);
                    
                    const isDepOrArr = idx === 0 || idx === navLogWithAltitudes.length - 1;
                    
                    let labelPosition = null; // 'above' | 'below' | null
                    if (!isDepOrArr) {
                      if (x - lastAboveX >= 40) {
                        labelPosition = 'above';
                        lastAboveX = x;
                      } else if (x - lastBelowX >= 40) {
                        labelPosition = 'below';
                        lastBelowX = x;
                      }
                    }
                    
                    return (
                      <g key={`wp-marker-${wp.ident}-${idx}`}>
                        <circle cx={x} cy={y} r="3" fill="#ffffff" stroke="var(--accent-cyan)" strokeWidth="1" />
                        <line x1={x} y1={y} x2={x} y2="160" stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2" />
                        
                        {labelPosition && (
                          <g transform={`translate(${x}, ${y + (labelPosition === 'below' ? 22 : 0)})`}>
                            <text 
                              transform="rotate(-30)" 
                              x="8" 
                              y="-6" 
                              fill="#ffffff" 
                              fontSize="8px" 
                              fontWeight="bold" 
                              fontFamily="monospace"
                              style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                            >
                              {wp.ident}
                            </text>
                            <text 
                              transform="rotate(-30)" 
                              x="8" 
                              y="4" 
                              fill="rgba(255,255,255,0.5)" 
                              fontSize="7px" 
                              fontFamily="monospace"
                              style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                            >
                              FL{Math.round(wp.altitude / 100)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  });
                })()}

                {/* Ground/Distance Reference Line */}
                <line x1="55" y1="160" x2="770" y2="160" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                
                {/* Departure / Arrival Labels */}
                {navLogWithAltitudes.length > 0 && (
                  <>
                    <text x="60" y="176" textAnchor="middle" fill="#ffffff" fontSize="10px" fontWeight="bold">
                      {mission.departure}
                    </text>
                    <text x="770" y="176" textAnchor="middle" fill="#ffffff" fontSize="10px" fontWeight="bold">
                      {mission.arrival}
                    </text>
                  </>
                )}

                {/* Distance Axis Markers */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, index) => {
                  const dist = Math.round(totalDistance * ratio);
                  const x = getX(dist);
                  if (ratio === 0 || ratio === 1) return null;
                  return (
                    <g key={`dist-axis-${index}`}>
                      <line x1={x} y1="160" x2={x} y2="165" stroke="rgba(255,255,255,0.15)" />
                      <text x={x} y="176" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9px" fontFamily="monospace">
                        {dist} NM
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '6px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>TOC distance: </span>
                <strong style={{ color: '#00ff88' }}>{climbDistance} NM</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>TOD distance: </span>
                <strong style={{ color: '#ff4d4d' }}>{descentDistance} NM from Destination</strong> (Total: {totalDistance - descentDistance} NM)
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Cruise Altitude: </span>
                <strong style={{ color: 'var(--accent-cyan)' }}>FL{mission.cruiseFL}</strong>
              </div>
            </div>
          </div>
        )}

        {navLog.length > 0 && (
          <div className="glass-panel" style={{ marginTop: '24px', overflowX: 'auto' }}>
            <h3>Dynamic Waypoint Kinematics Log</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Fix</th>
                  <th style={{ padding: '12px' }}>Trk (°)</th>
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

                  const plannedDestFuel = navLog[navLog.length - 1].plannedFuel;
                  const remainingPlannedBurn = row.plannedFuel - plannedDestFuel;
                  const projectedFuelAtDestination = row.actualFuel - remainingPlannedBurn;
                  const isFuelIllegal = projectedFuelAtDestination < minimumDiversionFuel;

                  return (
                    <tr key={`${row.ident}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '15px' }}>
                        {row.ident}
                        <span style={{ display: 'block', fontSize: '10px', fontWeight: '400', color: 'rgba(255,255,255,0.4)' }}>{row.type}</span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#fff', fontWeight: '600' }}>
                        {row.trackAngle !== null && row.trackAngle !== undefined ? `${row.trackAngle.toString().padStart(3, '0')}°` : '--'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: 'var(--accent-cyan)', fontWeight: '600' }}>
                        {row.legDistance === 0 ? '--' : row.legDistance}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input key={`wind-${row.wind}`} type="number" defaultValue={row.wind} onBlur={(e) => updateNavLogField(idx, 'wind', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '60px' }} />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input key={`fl-${row.fl}`} type="number" defaultValue={row.fl} onBlur={(e) => updateNavLogField(idx, 'fl', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '60px' }} />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input key={`sat-${row.sat}`} type="number" defaultValue={row.sat} onBlur={(e) => updateNavLogField(idx, 'sat', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '60px' }} />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{row.tas} / </span><strong style={{ color: '#fff' }}>{row.gs}</strong>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', fontSize: '14px', color: '#ffb700' }}>
                        {timeFormatted}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <input key={`planned-${row.plannedFuel}`} type="number" defaultValue={row.plannedFuel} onBlur={(e) => updateNavLogField(idx, 'plannedFuel', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '70px' }} />
                        <input key={`actual-${row.actualFuel}`} type="number" defaultValue={row.actualFuel} onBlur={(e) => updateNavLogField(idx, 'actualFuel', e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px', color: '#fff', textAlign: 'center', width: '70px' }} />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace', fontSize: '13px' }}>
                        {isFuelIllegal ? (
                          <span style={{ color: 'var(--accent-crit)', fontWeight: 'bold' }}>DIVERT / MIN FUEL</span>
                        ) : fuelDelta > 0 ? (
                          <span style={{ color: '#39ff14' }}>+{fuelDelta}</span>
                        ) : fuelDelta < 0 ? (
                          <span style={{ color: '#ff4a4a' }}>{fuelDelta}</span>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
                  <td colSpan="9" style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>
                    REGULATORY OPERATIONAL FUEL MINIMUMS (TC / PART 121)
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--accent-warn)', fontSize: '14px', fontFamily: 'monospace' }}>
                    MDF: {minimumDiversionFuel.toLocaleString()} lbs
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
