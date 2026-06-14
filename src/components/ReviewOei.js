import React, { useState } from 'react';
import { useMission } from '../context/MissionContext.js';
import { calculateDriftdownCeiling, calculateDriftdownTrajectory, calculateDistanceNM, calculateTrackAngle } from '../engine/kinematics.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';

function getTerrainHeight(lat, lon, terrainDb) {
  if (!terrainDb || !terrainDb.terrain_grid) return 0;
  const gridLat = Math.floor(lat);
  const gridLon = Math.floor(lon);
  const key = `${gridLat}_${gridLon}`;
  return terrainDb.terrain_grid[key] || 0;
}

function getTerrainHeightAtDistance(dist, terrainPoints) {
  if (!terrainPoints || terrainPoints.length === 0) return 0;
  if (dist <= terrainPoints[0].distance) return terrainPoints[0].height;
  if (dist >= terrainPoints[terrainPoints.length - 1].distance) return terrainPoints[terrainPoints.length - 1].height;
  
  for (let i = 0; i < terrainPoints.length - 1; i++) {
    const pt1 = terrainPoints[i];
    const pt2 = terrainPoints[i + 1];
    if (dist >= pt1.distance && dist <= pt2.distance) {
      const ratio = (dist - pt1.distance) / (pt2.distance - pt1.distance || 1);
      return Math.round(pt1.height + ratio * (pt2.height - pt1.height));
    }
  }
  return 0;
}

const oeiAlternates = {
  CYYZ: { name: 'Lester B. Pearson International', lat: 43.6761, lon: -79.6305 },
  CYTZ: { name: 'Billy Bishop Toronto City', lat: 43.6275, lon: -79.3961 },
  CYOW: { name: 'Macdonald-Cartier International', lat: 45.3225, lon: -75.6673 },
  CYUL: { name: 'Pierre Elliott Trudeau International', lat: 45.4705, lon: -73.7409 },
  CYHZ: { name: 'Halifax Stanfield International', lat: 44.8797, lon: -63.5102 },
  CYYT: { name: 'St. John\'s International', lat: 47.6186, lon: -52.7524 },
  CYQX: { name: 'Gander International', lat: 48.937, lon: -54.5681 },
  CYQM: { name: 'Greater Moncton Roméo LeBlanc', lat: 46.1161, lon: -64.6786 },
  CYQB: { name: 'Jean Lesage International', lat: 46.7912, lon: -71.3933 },
  CYWG: { name: 'Winnipeg James Armstrong Richardson', lat: 49.9099, lon: -97.2399 },
  CYYC: { name: 'Calgary International', lat: 51.1139, lon: -114.0203 },
  CYEG: { name: 'Edmonton International', lat: 53.3099, lon: -113.5795 },
  CYVR: { name: 'Vancouver International', lat: 49.1947, lon: -123.1825 },
  CYKA: { name: 'Kamloops Airport', lat: 50.7025, lon: -120.4486 },
  CYXC: { name: 'Cranbrook/Canadian Rockies', lat: 49.6121, lon: -115.782 },
  CYQT: { name: 'Thunder Bay Airport', lat: 48.372, lon: -89.3217 },
  CYLW: { name: 'Kelowna International', lat: 49.9561, lon: -119.3778 },
  CYYJ: { name: 'Victoria International', lat: 48.6472, lon: -123.4257 },
  CYDF: { name: 'Deer Lake Regional', lat: 49.2092, lon: -57.3944 }
};

export default function ReviewOei() {
  const { 
    mission, 
    navLog, 
    totalDistance, 
    takeoffWeight, 
    driftdownDb, 
    terrainDb 
  } = useMission();

  const [isSimulatingOEI, setIsSimulatingOEI] = useState(false);
  const [failWaypointIndex, setFailWaypointIndex] = useState(-1);

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

  let cumulativeDist = 0;
  const navLogWithAltitudes = navLog.map((wp, i) => {
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
  if (navLog.length > 0 && terrainDb) {
    for (let i = 0; i < navLog.length; i++) {
      const wp = navLog[i];
      const wpHeight = getTerrainHeight(wp.lat, wp.lon, terrainDb);
      const cumDist = navLogWithAltitudes[i].cumulativeDistance;
      terrainPoints.push({
        distance: cumDist,
        height: wpHeight,
        lat: wp.lat,
        lon: wp.lon,
        ident: wp.ident,
        segmentIndex: i
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
          const sampleHeight = getTerrainHeight(lat, lon, terrainDb);
          
          terrainPoints.push({
            distance: sampleDist,
            height: sampleHeight,
            lat: lat,
            lon: lon,
            ident: `${wp.ident}-${nextWp.ident} (Sample)`,
            segmentIndex: i
          });
        }
      }
    }
    terrainPoints.sort((a, b) => a.distance - b.distance);
  }

  // 1. Calculate active single-engine ceiling globally
  const activeCeilingAlt = calculateDriftdownCeiling(takeoffWeight, mission.isaDev || 0, driftdownDb);

  // 2. Extract highest peak along the route
  let highestPoint = null;
  let maxPeakHeight = 0;
  terrainPoints.forEach(pt => {
    if (pt.height > maxPeakHeight) {
      maxPeakHeight = pt.height;
      highestPoint = pt;
    }
  });

  // 3. Find nearest waypoint to the highest peak
  let nearestFix = null;
  let distToNearestFix = Infinity;
  if (highestPoint && navLog.length > 0) {
    navLog.forEach(wp => {
      const d = calculateDistanceNM(highestPoint.lat, highestPoint.lon, wp.lat, wp.lon);
      if (d < distToNearestFix) {
        distToNearestFix = d;
        nearestFix = wp;
      }
    });
  }

  const getTerrainClass = (height) => {
    if (height >= 5000) {
      return { 
        label: 'Alpine / Mountainous', 
        color: 'var(--accent-crit)', 
        bg: 'rgba(255, 0, 0, 0.1)', 
        requiredBuffer: 2000 
      };
    }
    if (height >= 1500) {
      return { 
        label: 'Foothills / Moderate', 
        color: 'var(--accent-warn)', 
        bg: 'rgba(255, 191, 0, 0.1)', 
        requiredBuffer: 1000 
      };
    }
    return { 
      label: 'Prairie / Lowland', 
      color: 'var(--accent-green)', 
      bg: 'rgba(0, 255, 0, 0.1)', 
      requiredBuffer: 1000 
    };
  };

  const peakClass = getTerrainClass(maxPeakHeight);
  const cruiseClearance = cruiseAlt - maxPeakHeight;
  const oeiCeilingClearance = activeCeilingAlt - maxPeakHeight;

  const getMountainZones = () => {
    const zones = [];
    if (navLog.length < 2) return zones;

    for (let i = 0; i < navLog.length - 1; i++) {
      const wp1 = navLogWithAltitudes[i];
      const wp2 = navLogWithAltitudes[i + 1];
      
      const segmentPoints = terrainPoints.filter(pt => pt.segmentIndex === i);
      let segmentMaxHeight = 0;
      segmentPoints.forEach(pt => {
        if (pt.height > segmentMaxHeight) {
          segmentMaxHeight = pt.height;
        }
      });
      
      const segmentClass = getTerrainClass(segmentMaxHeight);
      const segmentFlightAlt = Math.max(wp1.altitude, wp2.altitude);
      const cruiseMargin = segmentFlightAlt - segmentMaxHeight;
      const oeiMargin = activeCeilingAlt - segmentMaxHeight;
      
      zones.push({
        fromIdent: wp1.ident,
        toIdent: wp2.ident,
        distance: wp2.legDistance || 0,
        maxElevation: segmentMaxHeight,
        classification: segmentClass.label,
        color: segmentClass.color,
        bg: segmentClass.bg,
        requiredBuffer: segmentClass.requiredBuffer,
        cruiseMargin,
        oeiMargin,
        isCruiseCompliant: cruiseMargin >= segmentClass.requiredBuffer,
        isOeiCompliant: oeiMargin >= segmentClass.requiredBuffer,
      });
    }
    return zones;
  };

  const mountainZones = getMountainZones();

  // OEI calculations
  let ceilingAlt = activeCeilingAlt;
  let driftdownDistance = 0;
  let altLoss = 0;
  let failDist = 0;
  let terrainViolations = [];
  let worstClearance = Infinity;
  let suggestedAlternate = null;
  const escapeRoutes = [];
  const driftdownProfileSteps = [];

  if (isSimulatingOEI && failWaypointIndex >= 0 && failWaypointIndex < navLog.length) {
    const failWp = navLogWithAltitudes[failWaypointIndex];
    failDist = failWp.cumulativeDistance;
    
    const traj = calculateDriftdownTrajectory(cruiseAlt, ceilingAlt);
    driftdownDistance = traj.driftdownDistance;
    altLoss = traj.altLoss;

    terrainPoints.forEach(pt => {
      if (pt.distance >= failDist) {
        let oeiAlt = ceilingAlt;
        if (pt.distance < failDist + driftdownDistance) {
          const ratio = (pt.distance - failDist) / (driftdownDistance || 1);
          oeiAlt = cruiseAlt - ratio * altLoss;
        }
        const clearance = oeiAlt - pt.height;
        if (clearance < worstClearance) {
          worstClearance = clearance;
        }
        if (clearance < 2000) {
          terrainViolations.push(pt);
        }
      }
    });

    let minAltDist = Infinity;
    Object.entries(oeiAlternates).forEach(([icao, apt]) => {
      const d = calculateDistanceNM(failWp.lat, failWp.lon, apt.lat, apt.lon);
      if (d < minAltDist) {
        minAltDist = d;
        suggestedAlternate = { icao, name: apt.name, distance: d };
      }
    });

    // Phase 7 Diversion calculations
    const plannedFuelAtFail = failWp.plannedFuel || 0;
    const oeiTAS = Math.round(230 * (1 + (activeCeilingAlt / 1000) * 0.015));
    const fuelFlowPph = 3600;
    const requiredHoldingFuel = Math.round(1150 + 0.005 * takeoffWeight);

    Object.entries(oeiAlternates).forEach(([icao, apt]) => {
      const dist = calculateDistanceNM(failWp.lat, failWp.lon, apt.lat, apt.lon);
      const bearing = calculateTrackAngle(failWp.lat, failWp.lon, apt.lat, apt.lon);
      const timeMin = Math.round((dist / oeiTAS) * 60);
      const fuelBurn = Math.round((timeMin / 60) * fuelFlowPph);
      const landingFuel = plannedFuelAtFail - fuelBurn;
      const isLegal = landingFuel >= requiredHoldingFuel;
      
      escapeRoutes.push({
        icao,
        name: apt.name,
        distance: dist,
        bearing,
        timeMin,
        fuelBurn,
        landingFuel,
        requiredHoldingFuel,
        isLegal
      });
    });
    escapeRoutes.sort((a, b) => a.distance - b.distance);

    // Phase 7 Driftdown profile steps construction
    const levelOffDist = failDist + driftdownDistance;
    const sampleDistances = [failDist];
    for (let d = failDist + 10; d < levelOffDist; d += 10) {
      sampleDistances.push(d);
    }
    sampleDistances.push(levelOffDist);
    navLogWithAltitudes.forEach(wp => {
      if (wp.cumulativeDistance > levelOffDist) {
        sampleDistances.push(wp.cumulativeDistance);
      }
    });

    const uniqueDistances = Array.from(new Set(sampleDistances)).sort((a, b) => a - b);
    uniqueDistances.forEach(dist => {
      if (dist > totalDistance) return;
      
      let oeiAlt = ceilingAlt;
      let phase = 'Level Flight';
      if (dist < levelOffDist) {
        const ratio = (dist - failDist) / (driftdownDistance || 1);
        oeiAlt = cruiseAlt - ratio * altLoss;
        phase = 'Driftdown Slope';
      } else if (dist === levelOffDist) {
        oeiAlt = ceilingAlt;
        phase = 'Level-Off Point';
      }
      
      const terrainHeight = getTerrainHeightAtDistance(dist, terrainPoints);
      const clearance = oeiAlt - terrainHeight;
      const stepClass = getTerrainClass(terrainHeight);
      
      let nearestWp = null;
      let minDist = Infinity;
      navLog.forEach(wp => {
        const wpDist = navLogWithAltitudes[navLog.indexOf(wp)].cumulativeDistance;
        const d = Math.abs(dist - wpDist);
        if (d < minDist) {
          minDist = d;
          nearestWp = wp;
        }
      });

      driftdownProfileSteps.push({
        distance: dist,
        distFromFail: dist - failDist,
        altitude: Math.round(oeiAlt),
        terrainHeight,
        clearance,
        phase,
        nearestFix: nearestWp ? nearestWp.ident : 'N/A',
        isCompliant: clearance >= stepClass.requiredBuffer,
        requiredBuffer: stepClass.requiredBuffer
      });
    });
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
        <h2>⚠️ Review Vertical Terrain & OEI Clearance</h2>
        <p>Analyze enroute terrain elevation buffers and single-engine failure driftdown trajectories.</p>
      </div>

      <div className="panel-body">
        {/* Profile Card / SVG */}
        <div className="glass-panel profile-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>📈 Vertical Navigation & Terrain Profile</h3>
          
          <div className="vertical-profile-wrapper" style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg viewBox="0 0 800 180" className="profile-svg" style={{ width: '100%', minWidth: '700px', height: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', overflow: 'visible' }}>
              <defs>
                <linearGradient id="flightPathGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(139, 69, 19, 0.25)" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="rgba(139, 69, 19, 0.05)" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              {[0, 10000, 20000, 30000, 40000].map(alt => {
                const y = getY(alt);
                const label = alt === 0 ? "MSL" : `FL${alt / 100}`;
                return (
                  <g key={`grid-${alt}`}>
                    <line x1="55" y1={y} x2="770" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                    <text x="15" y={y + 4} fill="rgba(255,255,255,0.4)" fontSize="10px" fontFamily="monospace">{label}</text>
                  </g>
                );
              })}

              {totalDistance > 0 && (
                <path
                  d={`
                    M 60 ${getY(depElev)}
                    L ${getX(climbDistance)} ${getY(cruiseAlt)}
                    L ${getX(totalDistance - descentDistance)} ${getY(cruiseAlt)}
                    L 770 ${getY(arrElev)}
                    L 770 145
                    L 60 145
                    Z
                  `}
                  fill="url(#flightPathGrad)"
                />
              )}

              {terrainPoints.length > 0 && (
                <path
                  d={`
                    M 60 145
                    ${terrainPoints.map(pt => `L ${getX(pt.distance)} ${getY(pt.height)}`).join(' ')}
                    L 770 145
                    Z
                  `}
                  fill="url(#terrainGrad)"
                  stroke="rgba(139, 69, 19, 0.4)"
                  strokeWidth="1.5"
                />
              )}

              {totalDistance > 0 && (
                <path
                  d={`
                    M 60 ${getY(depElev)}
                    L ${getX(climbDistance)} ${getY(cruiseAlt)}
                    L ${getX(totalDistance - descentDistance)} ${getY(cruiseAlt)}
                    L 770 ${getY(arrElev)}
                  `}
                  fill="none"
                  stroke="var(--accent-cyan)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {totalDistance > 0 && climbDistance > 0 && (
                <g transform={`translate(${getX(climbDistance)}, ${getY(cruiseAlt)})`}>
                  <circle r="4" fill="var(--accent-green)" />
                  <text y="-10" textAnchor="middle" fill="var(--accent-green)" fontSize="10px" fontWeight="bold">TOC</text>
                </g>
              )}

              {totalDistance > 0 && descentDistance > 0 && (
                <g transform={`translate(${getX(totalDistance - descentDistance)}, ${getY(cruiseAlt)})`}>
                  <circle r="4" fill="var(--accent-crit)" />
                  <text y="-10" textAnchor="middle" fill="var(--accent-crit)" fontSize="10px" fontWeight="bold">TOD</text>
                </g>
              )}

              {isSimulatingOEI && (
                <g>
                  <line
                    x1={getX(failDist)}
                    y1={getY(cruiseAlt)}
                    x2={getX(failDist)}
                    y2="145"
                    stroke="var(--accent-crit)"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                  <circle cx={getX(failDist)} cy={getY(cruiseAlt)} r="5" fill="var(--accent-crit)" />
                  <text x={getX(failDist)} y={getY(cruiseAlt) - 15} fill="var(--accent-crit)" fontSize="10px" fontWeight="bold" textAnchor="middle">OEI FAIL</text>

                  <path
                    d={`
                      M ${getX(failDist)} ${getY(cruiseAlt)}
                      L ${getX(Math.min(totalDistance, failDist + driftdownDistance))} ${getY(ceilingAlt)}
                      ${totalDistance > failDist + driftdownDistance ? `L 770 ${getY(ceilingAlt)}` : ''}
                    `}
                    fill="none"
                    stroke="var(--accent-warn)"
                    strokeWidth="2.5"
                    strokeDasharray="5,3"
                    strokeLinecap="round"
                  />
                  
                  {totalDistance > failDist + driftdownDistance && (
                    <text
                      x={770}
                      y={getY(ceilingAlt) - 8}
                      fill="var(--accent-warn)"
                      fontSize="9px"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      SE CEILING: FL{ceilingAlt / 100}
                    </text>
                  )}
                </g>
              )}

              <line x1="55" y1="145" x2="775" y2="145" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

              {totalDistance > 0 && navLogWithAltitudes.map((wp, idx) => {
                const x = getX(wp.cumulativeDistance);
                const y = getY(wp.altitude);

                return (
                  <g key={`vp-wp-${wp.ident}-${idx}`} className="profile-waypoint-group">
                    <line x1={x} y1={y} x2={x} y2="145" stroke="rgba(255,255,255,0.12)" strokeDasharray="2,2" />
                    <circle 
                      cx={x} 
                      cy={y} 
                      r="3.5" 
                      fill="#fff" 
                      stroke="var(--accent-cyan)" 
                      strokeWidth="1.5"
                      className="profile-waypoint-dot"
                />
                <text 
                  x={x} 
                  y="160" 
                  textAnchor="middle" 
                  fill="rgba(255,255,255,0.85)" 
                  fontSize="9px" 
                  fontFamily="monospace"
                  transform={`rotate(-20, ${x}, 160)`}
                >
                  {wp.ident}
                </text>
                <text 
                  x={x} 
                  y={y - 8} 
                  textAnchor="middle" 
                  fill="rgba(255,255,255,0.5)" 
                  fontSize="8px"
                  fontFamily="monospace"
                >
                  {wp.altitude >= 18000 ? `FL${wp.altitude / 100}` : `${wp.altitude}ft`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* OEI Controls */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>Engine Failure Analyzer:</span>
          <select 
            value={failWaypointIndex} 
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              setFailWaypointIndex(idx);
              setIsSimulatingOEI(idx >= 0);
            }}
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: '#fff',
              padding: '6px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="-1">-- SELECT FIX OF FAILURE --</option>
            {navLog.map((wp, idx) => (
              <option key={`opt-fail-${wp.ident}`} value={idx}>{wp.ident} ({wp.type})</option>
            ))}
          </select>
          {isSimulatingOEI && (
            <button
              onClick={() => {
                setIsSimulatingOEI(false);
                setFailWaypointIndex(-1);
              }}
              style={{
                background: 'rgba(255,0,0,0.15)',
                border: '1px solid var(--accent-crit)',
                color: 'var(--accent-crit)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          )}
        </div>

            {isSimulatingOEI && suggestedAlternate && (
              <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', padding: '14px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <span>Single-Engine Ceiling: <strong style={{ color: 'var(--accent-cyan)' }}>{ceilingAlt.toLocaleString()} ft (FL{ceilingAlt / 100})</strong></span>
                  <span>Driftdown Distance: <strong style={{ color: 'var(--accent-warn)' }}>{driftdownDistance} NM</strong></span>
                  <span>Worst Clearance: <strong style={{ color: worstClearance < 2000 ? 'var(--accent-crit)' : 'var(--accent-green)' }}>{worstClearance.toLocaleString()} ft</strong></span>
                </div>
                {terrainViolations.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-crit)', fontSize: '13px', fontWeight: '600', marginTop: '4px' }}>
                    <span>⚠️</span>
                    <span>
                      TERRAIN CLEARANCE VIOLATION DETECTED! Clearance falls below required 2,000 ft margin. 
                      SUGGESTED ESCAPE ALTERNATE: <strong style={{ color: '#fff' }}>{suggestedAlternate.icao}</strong> ({suggestedAlternate.name}, Dist: {suggestedAlternate.distance} NM).
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', fontSize: '13px', fontWeight: '600', marginTop: '4px' }}>
                    <span>✓</span>
                    <span>OEI DRIFTDOWN CLEAR: Single-engine flight path satisfies required 2,000 ft terrain clearance.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Phase 7 FLAGSHIP: Simulated OEI Details & suitability Analysis */}
        {isSimulatingOEI && failWaypointIndex >= 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
            {/* Failure Point Details & Suitability Alternate Airports */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🚨</span> OEI Diversion Suitability & Escape Airports
              </h3>
              
              {/* Failure point card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '14px', background: 'rgba(255, 0, 0, 0.04)', border: '1px solid rgba(255, 0, 0, 0.1)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                <div>Failure Point: <strong style={{ color: '#fff' }}>{navLogWithAltitudes[failWaypointIndex].ident}</strong></div>
                <div>Position: <strong style={{ color: '#fff' }}>{navLogWithAltitudes[failWaypointIndex].lat.toFixed(4)}°N, {navLogWithAltitudes[failWaypointIndex].lon.toFixed(4)}°W</strong></div>
                <div>Distance from Dep: <strong style={{ color: '#fff' }} className="num-val">{failDist} NM</strong></div>
                <div>Planned Fuel remaining: <strong style={{ color: 'var(--accent-cyan)' }} className="num-val">{(navLogWithAltitudes[failWaypointIndex].plannedFuel || 0).toLocaleString()} lbs</strong></div>
              </div>

              {/* Suitability alternatess list */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                      <th style={{ padding: '10px 8px' }}>Escape Airport</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Distance</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Heading/Track</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Diversion Time</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Fuel Burn</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Projected Landing Fuel</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Legality Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escapeRoutes.map((route, idx) => (
                      <tr key={`esc-${route.icao}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{ fontWeight: 'bold', color: '#fff' }}>{route.icao}</span>
                          <span style={{ fontSize: '11px', display: 'block', color: 'rgba(255,255,255,0.5)' }}>{route.name}</span>
                        </td>
                        <td style={{ padding: '12px 8px', fontWeight: '600', color: idx === 0 ? 'var(--accent-green)' : '#fff' }} className="num-val">
                          {route.distance} NM {idx === 0 && <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--accent-green)', marginLeft: '4px' }}>(CLOSEST)</span>}
                        </td>
                        <td style={{ padding: '12px 8px' }} className="num-val">
                          {route.bearing.toString().padStart(3, '0')}°
                        </td>
                        <td style={{ padding: '12px 8px' }} className="num-val">
                          {route.timeMin} mins
                        </td>
                        <td style={{ padding: '12px 8px' }} className="num-val">
                          {route.fuelBurn.toLocaleString()} lbs
                        </td>
                        <td style={{ padding: '12px 8px', fontWeight: '600', color: route.isLegal ? 'var(--accent-cyan)' : 'var(--accent-crit)' }} className="num-val">
                          {route.landingFuel.toLocaleString()} lbs
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            backgroundColor: route.isLegal ? 'rgba(0, 255, 0, 0.15)' : 'rgba(255, 0, 0, 0.15)',
                            color: route.isLegal ? 'var(--accent-green)' : 'var(--accent-crit)'
                          }}>
                            {route.isLegal ? '✓ LEGAL DIVERSION' : '⚠️ LOW RESERVES'}
                          </span>
                          <span style={{ fontSize: '9px', display: 'block', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                            (min req: {route.requiredHoldingFuel.toLocaleString()} lbs)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '12px 0 0 0', fontStyle: 'italic' }}>
                * Diversion computations assume constant OEI Cruise speed of 230 kt IAS (standard air density TAS: ~{Math.round(230 * (1 + (activeCeilingAlt / 1000) * 0.015))} kt) and fuel flow of 3,600 lbs/hr.
              </p>
            </div>

            {/* Driftdown Profile & Terrain Overlay Log */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📉</span> OEI Driftdown Profile & Terrain Overlay
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.4' }}>
                Step-by-step performance profile showing coordinates, flight altitudes, and terrain elevations along the driftdown slope and subsequent level cruise path.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Relative Dist</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Route Dist</th>
                      <th style={{ padding: '10px 8px' }}>Flight Phase</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>OEI Altitude</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Terrain Height</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Clearance Margin</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Safety Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driftdownProfileSteps.map((step, idx) => (
                      <tr key={`dd-step-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: step.phase === 'Level-Off Point' ? 'rgba(0,255,255,0.02)' : 'transparent' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold', color: '#fff' }} className="num-val">
                          +{step.distFromFail.toFixed(1)} NM
                        </td>
                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.7)' }} className="num-val">
                          {step.distance.toFixed(1)} NM
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            color: step.phase === 'Driftdown Slope' ? 'var(--accent-warn)' : (step.phase === 'Level-Off Point' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.6)'),
                            fontWeight: step.phase === 'Level-Off Point' ? 'bold' : 'normal'
                          }}>
                            {step.phase}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold', color: '#fff' }} className="num-val">
                          {step.altitude.toLocaleString()} ft
                        </td>
                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.85)' }} className="num-val">
                          {step.terrainHeight.toLocaleString()} ft
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: '600', color: step.isCompliant ? 'var(--accent-green)' : 'var(--accent-crit)' }} className="num-val">
                          {step.clearance.toLocaleString()} ft
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            backgroundColor: step.isCompliant ? 'rgba(0, 255, 0, 0.15)' : 'rgba(255, 0, 0, 0.15)',
                            color: step.isCompliant ? 'var(--accent-green)' : 'var(--accent-crit)'
                          }}>
                            {step.isCompliant ? 'COMPLIANT' : 'VIOLATION'}
                          </span>
                          <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>
                            (req: {step.requiredBuffer.toLocaleString()} ft)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Guide card when OEI is not simulated */
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', marginTop: '20px', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>💡</span>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--accent-cyan)', fontSize: '14px' }}>Simulate Engine Failure (OEI)</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Select a waypoint in the failure analyzer control dropdown above to run a driftdown trajectory simulation, scan terrain clearance overlays, and view sorted escape alternates suitability.
            </p>
          </div>
        )}

        {/* Terrain & OEI Clearance Margins Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '20px' }}>
          {/* Card 1: Highest Peak */}
          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⛰️</span> Highest Route Terrain
            </h4>
            <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '8px 0', color: '#fff' }}>
              {maxPeakHeight > 0 ? `${maxPeakHeight.toLocaleString()} ft` : '0 ft'} <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'rgba(255,255,255,0.5)' }}>MSL</span>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>Nearest Fix: <strong>{nearestFix ? nearestFix.ident : 'None'}</strong> {nearestFix ? `(${distToNearestFix.toFixed(1)} NM)` : ''}</div>
              <div>Position: <strong>{highestPoint ? `${highestPoint.lat.toFixed(4)}°N, ${highestPoint.lon.toFixed(4)}°W` : 'N/A'}</strong></div>
              <div style={{ marginTop: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor: peakClass.bg,
                  color: peakClass.color
                }}>
                  {peakClass.label}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Cruise Clearance */}
          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✈️</span> Cruise Terrain Margin
            </h4>
            <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '8px 0', color: cruiseClearance >= peakClass.requiredBuffer ? 'var(--accent-green)' : 'var(--accent-crit)' }} className="num-val">
              {cruiseClearance.toLocaleString()} ft
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>Cruise Altitude: <strong>FL{mission.cruiseFL} ({cruiseAlt.toLocaleString()} ft)</strong></div>
              <div>Required Buffer: <strong>{peakClass.requiredBuffer.toLocaleString()} ft</strong></div>
              <div style={{ marginTop: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor: cruiseClearance >= peakClass.requiredBuffer ? 'rgba(0, 255, 0, 0.15)' : 'rgba(255, 0, 0, 0.15)',
                  color: cruiseClearance >= peakClass.requiredBuffer ? 'var(--accent-green)' : 'var(--accent-crit)'
                }}>
                  {cruiseClearance >= peakClass.requiredBuffer ? 'COMPLIANT' : 'VIOLATION'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: OEI Clearance */}
          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> OEI Clearance Margin
            </h4>
            <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '8px 0', color: oeiCeilingClearance >= peakClass.requiredBuffer ? 'var(--accent-green)' : 'var(--accent-crit)' }} className="num-val">
              {oeiCeilingClearance.toLocaleString()} ft
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>SE Ceiling: <strong>FL{activeCeilingAlt / 100} ({activeCeilingAlt.toLocaleString()} ft)</strong></div>
              <div>Driftdown: <strong>{isSimulatingOEI ? (worstClearance === Infinity ? 'N/A' : `${worstClearance.toLocaleString()} ft worst`) : 'Select fail point below'}</strong></div>
              <div style={{ marginTop: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor: oeiCeilingClearance >= peakClass.requiredBuffer ? 'rgba(0, 255, 0, 0.15)' : 'rgba(255, 0, 0, 0.15)',
                  color: oeiCeilingClearance >= peakClass.requiredBuffer ? 'var(--accent-green)' : 'var(--accent-crit)'
                }}>
                  {oeiCeilingClearance >= peakClass.requiredBuffer ? 'CEILING COMPLIANT' : 'ESCAPE ROUTE REQ'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Mountain Crossing Zone Analyzer */}
        <div className="glass-panel" style={{ padding: '20px', marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧭</span> Mountain Crossing Zone Analyzer
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.4' }}>
            Segment-by-segment analysis of the flight route. Segments crossing mountainous regions (elevation &ge; 5,000 ft) require a minimum 2,000 ft clearance margin, while lowlands require a 1,000 ft margin.
          </p>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  <th style={{ padding: '10px 8px' }}>Route Segment</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Leg Distance</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Max Peak (MSL)</th>
                  <th style={{ padding: '10px 8px' }}>Terrain Classification</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Cruise Margin</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>OEI Margin</th>
                </tr>
              </thead>
              <tbody>
                {mountainZones.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No flight path segments configured.
                    </td>
                  </tr>
                ) : (
                  mountainZones.map((zone, idx) => (
                    <tr key={`zone-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 'bold', color: '#fff' }}>
                        {zone.fromIdent} &rarr; {zone.toIdent}
                      </td>
                      <td style={{ padding: '12px 8px', color: 'rgba(255,255,255,0.85)' }} className="num-val">
                        {zone.distance} NM
                      </td>
                      <td style={{ padding: '12px 8px', color: 'rgba(255,255,255,0.85)' }} className="num-val">
                        {zone.maxElevation.toLocaleString()} ft
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          backgroundColor: zone.bg,
                          color: zone.color
                        }}>
                          {zone.classification}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }} className="num-val">
                        <span style={{
                          fontWeight: '600',
                          color: zone.isCruiseCompliant ? 'var(--accent-green)' : 'var(--accent-crit)'
                        }}>
                          {zone.cruiseMargin.toLocaleString()} ft
                        </span>
                        <span style={{
                          fontSize: '9px',
                          marginLeft: '6px',
                          color: 'rgba(255,255,255,0.4)'
                        }}>
                          (req: {zone.requiredBuffer.toLocaleString()} ft)
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }} className="num-val">
                        <span style={{
                          fontWeight: '600',
                          color: zone.isOeiCompliant ? 'var(--accent-green)' : 'var(--accent-crit)'
                        }}>
                          {zone.oeiMargin.toLocaleString()} ft
                        </span>
                        {!zone.isOeiCompliant && (
                          <span style={{
                            marginLeft: '8px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            backgroundColor: 'rgba(255, 0, 0, 0.15)',
                            color: 'var(--accent-crit)'
                          }}>
                            ESCAPE REQ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Waypoint Terrain Elevation Log */}
        <div className="glass-panel" style={{ padding: '20px', marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋</span> Waypoint Terrain Elevation Log
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.4' }}>
            Full list of flight waypoints, their coordinates, profile altitudes, terrain elevation at the fix point, and calculated safety margins.
          </p>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  <th style={{ padding: '10px 8px' }}>Waypoint</th>
                  <th style={{ padding: '10px 8px' }}>Type</th>
                  <th style={{ padding: '10px 8px' }}>Coordinates</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Cumulative Distance</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Profile Alt</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Terrain Height</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Normal Margin</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>OEI Margin</th>
                </tr>
              </thead>
              <tbody>
                {navLogWithAltitudes.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No waypoints configured.
                    </td>
                  </tr>
                ) : (
                  navLogWithAltitudes.map((wp, idx) => {
                    const wpHeight = getTerrainHeight(wp.lat, wp.lon, terrainDb);
                    const normalMargin = wp.altitude - wpHeight;
                    const oeiMargin = activeCeilingAlt - wpHeight;
                    const wpClass = getTerrainClass(wpHeight);

                    return (
                      <tr key={`wp-log-${idx}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold', color: '#fff' }}>{wp.ident}</td>
                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{wp.type}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                          {wp.lat.toFixed(4)}°, {wp.lon.toFixed(4)}°
                        </td>
                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.85)' }} className="num-val">{wp.cumulativeDistance} NM</td>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold', color: 'var(--accent-cyan)' }} className="num-val">
                          {wp.altitude.toLocaleString()} ft
                        </td>
                        <td style={{ padding: '10px 8px', color: '#fff' }} className="num-val">
                          {wpHeight.toLocaleString()} ft
                          {wpHeight > 0 && (
                            <span style={{
                              display: 'inline-block',
                              marginLeft: '8px',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              fontSize: '8px',
                              fontWeight: 'bold',
                              backgroundColor: wpClass.bg,
                              color: wpClass.color
                            }}>
                              {wpClass.label.split(' ')[0]}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: '600', color: normalMargin >= wpClass.requiredBuffer ? 'var(--accent-green)' : 'var(--accent-crit)' }} className="num-val">
                          {normalMargin.toLocaleString()} ft
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: '600', color: oeiMargin >= wpClass.requiredBuffer ? 'var(--accent-green)' : 'var(--accent-crit)' }} className="num-val">
                          {oeiMargin.toLocaleString()} ft
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
