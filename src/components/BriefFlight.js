import React, { useMemo } from 'react';
import { useMission } from '../context/MissionContext.js';
import { calculateWindComponents } from '../services/airportService.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';
import { calculateDriftdownCeiling, calculateDriftdownTrajectory, calculateDistanceNM } from '../engine/kinematics.js';

export default function BriefFlight() {
  const { 
    mission, 
    navLog, 
    totalDistance, 
    takeoffWeight, 
    minimumDiversionFuel, 
    weather, 
    airportDb, 
    enrichAirport,
    tripFuelCalc,
    contingencyFuelCalc,
    alternateDistance,
    alternateFuelCalc,
    finalReserveFuelCalc,
    requiredBlockFuel,
    isBlockFuelSufficient,
    cruiseMatrix,
    driftdownDb,
    terrainDb
  } = useMission();

  const routeBurn = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = (mission.blockFuel || 0) - (mission.taxiFuel || 0) - routeBurn;
  const legalLandingMargin = projectedLandingFuel - minimumDiversionFuel;
  const isLandingFuelWarning = projectedLandingFuel < minimumDiversionFuel;

  // 1. Dispatch Brief Details
  const paxCount = mission.pax || 0;
  const zfw = mission.zeroFuelWeight || 0;
  const macVal = mission.mac || 22.5;

  // 2. Weather Enriched Airports
  const enrichedDep = useMemo(() => {
    if (!airportDb || !airportDb.airports || !mission.departure) return null;
    const base = airportDb.airports[mission.departure.toUpperCase().trim()];
    return base ? enrichAirport(mission.departure, base) : null;
  }, [airportDb, mission.departure, enrichAirport]);

  const enrichedArr = useMemo(() => {
    if (!airportDb || !airportDb.airports || !mission.arrival) return null;
    const base = airportDb.airports[mission.arrival.toUpperCase().trim()];
    return base ? enrichAirport(mission.arrival, base) : null;
  }, [airportDb, mission.arrival, enrichAirport]);

  const enrichedAlt = useMemo(() => {
    if (!airportDb || !airportDb.airports || !mission.alternate) return null;
    const base = airportDb.airports[mission.alternate.toUpperCase().trim()];
    return base ? enrichAirport(mission.alternate, base) : null;
  }, [airportDb, mission.alternate, enrichAirport]);

  // 3. Time formatted
  const totalTimeMins = mission.plannedEte || (navLog || []).reduce((sum, row) => {
    const legTimeMin = row.gs > 0 ? (row.legDistance / row.gs) * 60 : 0;
    return sum + legTimeMin;
  }, 0);
  const formattedTime = totalTimeMins > 0 
    ? `${Math.floor(totalTimeMins / 60)}h ${String(Math.round(totalTimeMins % 60)).padStart(2, '0')}m` 
    : '---';

  // 4. Performance burn rate
  const calcBurnRate = () => {
    if (!mission.cruiseFL || !takeoffWeight) return 0;
    let resolvedMach = 0.78;
    if (cruiseMatrix && cruiseMatrix.cruise_mach_matrix) {
      const targetAltKey = (mission.cruiseFL * 100).toString();
      const matrix = cruiseMatrix.cruise_mach_matrix[targetAltKey] || cruiseMatrix.cruise_mach_matrix["33000"];
      if (matrix) {
        const boundedWind = Math.max(-200, Math.min(200, mission.averageWindSpeed || 0));
        const correctedCI = getCorrectedCostIndex(mission.costIndex || 50, boundedWind);
        const weightLbs = takeoffWeight || 100000;
        const interpResult = interpolate2D(
          weightLbs,
          correctedCI,
          matrix.weights,
          matrix.cost_index_headers,
          matrix.data
        );
        if (interpResult !== null) {
          resolvedMach = Math.round(interpResult * 100) / 100;
        }
      }
    }

    const weightKg = takeoffWeight / 2.20462;
    const baseFFKg = 1550; 
    const machFactor = (resolvedMach - 0.70) * 4200;
    const weightFactor = (weightKg - 40000) * 0.028;
    const altFactor = (mission.cruiseFL - 330) * -14;
    
    let fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor);
    const cgMac = mission.mac !== '' && mission.mac !== undefined && mission.mac !== null ? mission.mac : 22.5;
    const cgModifier = cgMac > 28 ? -0.015 : cgMac < 20 ? 0.015 : 0; 
    fuelFlowKg = fuelFlowKg * (1 + cgModifier);

    return Math.round(fuelFlowKg * 2.20462);
  };
  const burnRate = calcBurnRate();

  const cruiseAlt = (mission.cruiseFL || 350) * 100;
  const depElev = mission.departureElev || 0;
  const arrElev = mission.arrivalElev || 0;
  const fpaAngle = mission.fpa || 3.0;

  // TOC/TOD distance
  const climbAltDelta = Math.max(0, cruiseAlt - depElev);
  const climbDistanceEst = Math.round((climbAltDelta / 1000) * 2.5 * (1 + ((takeoffWeight - 100000) / 100000) * 0.2));

  const descentAltDelta = Math.max(0, cruiseAlt - arrElev);
  const descentDistanceEst = Math.round((descentAltDelta / 1000) * (3.0 / fpaAngle) * 3);

  let climbDistance = climbDistanceEst;
  let descentDistance = descentDistanceEst;
  if (climbDistance + descentDistance > totalDistance) {
    const ratio = totalDistance / (climbDistance + descentDistance || 1);
    climbDistance = Math.round(climbDistance * ratio);
    descentDistance = Math.round(descentDistance * ratio);
  }

  // 5. OEI / Terrain Threats
  const ceilingAlt = calculateDriftdownCeiling(takeoffWeight || 100000, mission.isaDev || 0, driftdownDb);

  const getTerrainHeightLocal = (lat, lon) => {
    if (!terrainDb || !terrainDb.terrain_grid) return 0;
    const gridLat = Math.floor(lat);
    const gridLon = Math.floor(lon);
    const key = `${gridLat}_${gridLon}`;
    return terrainDb.terrain_grid[key] || 0;
  };

  const getTerrainThreats = () => {
    let threats = 0;
    let maxPeak = 0;
    
    if (navLog && navLog.length > 0 && terrainDb) {
      let cumulativeDist = 0;
      const navLogWithAlts = navLog.map((wp, i) => {
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
        return { ...wp, cumulativeDistance: cumulativeDist, altitude: Math.round(alt) };
      });

      const terrainPts = [];
      for (let i = 0; i < navLog.length; i++) {
        const wp = navLog[i];
        const wpHeight = getTerrainHeightLocal(wp.lat, wp.lon);
        const cumDist = navLogWithAlts[i].cumulativeDistance;
        terrainPts.push({ distance: cumDist, height: wpHeight });

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
            terrainPts.push({ distance: sampleDist, height: sampleHeight });
          }
        }
      }

      terrainPts.forEach(pt => {
        if (pt.height > maxPeak) maxPeak = pt.height;
        if (pt.height > ceilingAlt - 2000) {
          threats++;
        }
      });
    }

    return { count: threats, maxPeak };
  };
  const terrainResult = getTerrainThreats();

  // 6. Nearest diversion airports
  const getDiversionAirports = () => {
    if (!navLog || navLog.length === 0) return [];
    const midIdx = Math.floor(navLog.length / 2);
    const midWp = navLog[midIdx];

    const oeiAlternatesList = {
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

    return Object.entries(oeiAlternatesList).map(([icao, apt]) => {
      const d = calculateDistanceNM(midWp.lat, midWp.lon, apt.lat, apt.lon);
      return { icao, name: apt.name, distance: Math.round(d) };
    }).sort((a, b) => a.distance - b.distance).slice(0, 3);
  };
  const diversionAirports = getDiversionAirports();

  // 7. Icing Warning
  const isDepIcing = weather.departure && weather.departure.status === 'OK' && weather.departure.temperature <= 5;
  const isArrIcing = weather.arrival && weather.arrival.status === 'OK' && weather.arrival.temperature <= 5;
  const isIcingRisk = isDepIcing || isArrIcing;

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="panel-container brief-print-layout">
      {/* CSS Print Styles */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .brief-print-layout {
            padding: 0 !important;
            margin: 0 !important;
          }
          .brief-print-layout .glass-panel {
            background: none !important;
            border: 1px solid #000000 !important;
            color: #000000 !important;
            box-shadow: none !important;
            margin-bottom: 15px !important;
            page-break-inside: avoid;
          }
          .brief-print-layout h2, .brief-print-layout h3 {
            color: #000000 !important;
          }
          .brief-print-layout th {
            color: #000000 !important;
            border-bottom: 2px solid #000000 !important;
          }
          .brief-print-layout td {
            color: #000000 !important;
            border-bottom: 1px solid #dddddd !important;
          }
          .brief-print-layout button {
            display: none !important;
          }
          .app-header, .app-footer, .nav-tabs {
            display: none !important;
          }
        }
      `}</style>

      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>📋 PORTER AIRLINES FLIGHT BRIEFING PACKAGE</h2>
          <p>Consolidated enroute pilot dispatch release briefings, weather assessments, and OEI mountain escape briefs.</p>
        </div>
        <button
          onClick={handlePrint}
          style={{
            background: 'var(--accent-cyan)',
            border: 'none',
            borderRadius: '6px',
            color: '#000',
            fontWeight: 'bold',
            padding: '10px 18px',
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 0 12px var(--accent-cyan)',
            transition: 'var(--transition-smooth)'
          }}
          onMouseEnter={(e) => e.target.style.opacity = '0.9'}
          onMouseLeave={(e) => e.target.style.opacity = '1.0'}
        >
          Print Briefing Package
        </button>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '20px' }}>
        
        {/* SECTION 1: DISPATCH BRIEF */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✈️</span> Section 1: Dispatch Briefing
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Flight Number</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{mission.flightNumber || '---'}</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Tail Registration</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{mission.registration || '---'}</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Passengers (Pax)</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{paxCount} pax</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Cost Index (CI)</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{mission.costIndex}</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Zero Fuel Weight</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{zfw.toLocaleString()} lbs</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Takeoff Weight (TOW)</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{takeoffWeight.toLocaleString()} lbs</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>CG MAC %</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{macVal}%</div>
            </div>
          </div>
        </div>

        {/* SECTION 2: FUEL SUMMARY & PLANNING */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⛽</span> Section 2: Fuel Release & Planning
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Planned Block Fuel:</span>
                  <strong style={{ color: '#fff' }} className="num-val">{(mission.blockFuel || 0).toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Taxi Fuel Out:</span>
                  <strong style={{ color: '#fff' }} className="num-val">{(mission.taxiFuel || 0).toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Planned Trip Burn:</span>
                  <strong style={{ color: '#fff' }} className="num-val">{tripFuelCalc.toLocaleString()} lbs</strong>
                </div>
              </div>
            </div>

            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Contingency (5%):</span>
                  <strong style={{ color: '#fff' }} className="num-val">{contingencyFuelCalc.toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Alternate Fuel:</span>
                  <strong style={{ color: '#fff' }} className="num-val">{(mission.alternateFuel || 0).toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Final Reserve (Holding):</span>
                  <strong style={{ color: '#fff' }} className="num-val">{(mission.finalReserveFuel || 0).toLocaleString()} lbs</strong>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Minimum Diversion Fuel (MDF):</span>
                  <strong style={{ color: 'var(--accent-warn)' }} className="num-val">{minimumDiversionFuel.toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Projected Landing Fuel:</span>
                  <strong style={{ color: isLandingFuelWarning ? 'var(--accent-warn)' : 'var(--accent-cyan)' }} className="num-val">
                    {projectedLandingFuel.toLocaleString()} lbs
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Legality Margin:</span>
                  <strong style={{ color: legalLandingMargin >= 0 ? 'var(--accent-green)' : 'var(--accent-crit)', fontWeight: 'bold' }} className="num-val">
                    {legalLandingMargin >= 0 ? `+${legalLandingMargin.toLocaleString()} lbs (LEGAL)` : `${legalLandingMargin.toLocaleString()} lbs (UNDER-RESERVE)`}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: FLIGHT ROUTING & LOG */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🗺️</span> Section 3: Flight Plan Routing & Waypoint Log
          </h3>
          <div style={{ fontSize: '14px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', letterSpacing: '0.5px', marginBottom: '16px' }}>
            {mission.routeString || 'NO ACTIVE ROUTE'}
          </div>
          <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            <span>Planned Distance: <strong style={{ color: '#fff' }}>{totalDistance} NM</strong></span>
            <span>Total Flight Time (ETE): <strong style={{ color: '#ffb700' }}>{formattedTime}</strong></span>
          </div>

          {navLog && navLog.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Fix</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Trk (°)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Dist (NM)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Wind (kt)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>FL</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>SAT (°C)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>TAS/GS (kt)</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Leg ETE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Plan Fuel</th>
                  </tr>
                </thead>
                <tbody>
                  {navLog.map((row, idx) => {
                    const legTimeMin = row.gs > 0 ? (row.legDistance / row.gs) * 60 : 0;
                    const timeFormatted = row.legDistance === 0 ? "00:00" : `${Math.floor(legTimeMin).toString().padStart(2, '0')}:${Math.round((legTimeMin % 1) * 60).toString().padStart(2, '0')}`;

                    return (
                      <tr key={`brief-log-${row.ident}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                        <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>{row.ident}</td>
                        <td className="num-val" style={{ padding: '8px' }}>{row.trackAngle !== null && row.trackAngle !== undefined ? `${row.trackAngle.toString().padStart(3, '0')}°` : '--'}</td>
                        <td className="num-val" style={{ padding: '8px' }}>{row.legDistance === 0 ? '--' : row.legDistance}</td>
                        <td className="num-val" style={{ padding: '8px' }}>{row.wind} kt</td>
                        <td className="num-val" style={{ padding: '8px' }}>FL{row.fl}</td>
                        <td className="num-val" style={{ padding: '8px' }}>{row.sat}°C</td>
                        <td className="num-val" style={{ padding: '8px' }}>{row.tas} / {row.gs}</td>
                        <td className="num-val" style={{ padding: '8px' }}>{timeFormatted}</td>
                        <td className="num-val" style={{ padding: '8px', color: 'var(--accent-cyan)' }}>{row.plannedFuel.toLocaleString()} lbs</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SECTION 4: METEOROLOGICAL BRIEF (WEATHER) */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🌦️</span> Section 4: Meteorological Weather Briefing
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            {/* Departure Weather */}
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px', color: '#fff' }}>🛫 DEPARTURE: {mission.departure}</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
                {weather.departure && weather.departure.status === 'OK' ? weather.departure.raw : 'METAR Unavailable'}
              </div>
            </div>

            {/* Arrival Weather */}
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px', color: '#fff' }}>🛬 ARRIVAL: {mission.arrival}</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
                {weather.arrival && weather.arrival.status === 'OK' ? weather.arrival.raw : 'METAR Unavailable'}
              </div>
            </div>

            {/* Alternate Weather */}
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px', color: '#fff' }}>🔄 ALTERNATE: {mission.alternate || 'NONE'}</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
                {weather.alternate && weather.alternate.status === 'OK' ? weather.alternate.raw : 'METAR Unavailable'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5: PERFORMANCE PROJECTIONS */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> Section 5: Cruising & Climb/Descent Performance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Climb TOC Distance</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-green)' }}>{climbDistance} NM</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Descent TOD Distance</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-crit)' }}>{descentDistance} NM from Dest</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Cruising Flight Level</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>FL{mission.cruiseFL}</div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Average Burn Rate</span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{burnRate > 0 ? `${burnRate.toLocaleString()} lbs/hr` : '---'}</div>
            </div>
          </div>
        </div>

        {/* SECTION 6: OEI & DRIFTDOWN ANALYSIS */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> Section 6: One-Engine Inoperative (OEI) & Driftdown Release
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Single-Engine Service Ceiling:</span>
                  <strong style={{ color: '#fff' }}>FL{Math.round(ceilingAlt / 100)} ({ceilingAlt.toLocaleString()} ft)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Estimated Driftdown Slope Range:</span>
                  <strong style={{ color: '#fff' }}>{Math.round((cruiseAlt - ceilingAlt) / 1000 * 7.0)} NM</strong>
                </div>
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: '8px' }}>Nearest Rockies OEI Recovery Alternates</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {diversionAirports.length > 0 ? (
                  diversionAirports.map(apt => (
                    <div key={apt.icao} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#fff', fontWeight: '600' }}>{apt.icao} – {apt.name}</span>
                      <strong style={{ color: 'var(--accent-cyan)' }}>{apt.distance} NM</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No diversion database entries for route midpoint.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 7: THREAT ASSESSMENT & RISK REGISTER */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> Section 7: Enroute Threat Assessment & Risk Register
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Terrain threats check */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: terrainResult.count > 0 ? 'rgba(255, 0, 0, 0.08)' : 'rgba(0, 255, 0, 0.08)', border: terrainResult.count > 0 ? '1px solid rgba(255, 0, 0, 0.2)' : '1px solid rgba(0, 255, 0, 0.2)', padding: '10px 14px', borderRadius: '6px' }}>
              <span style={{ fontSize: '16px' }}>🏔️</span>
              <div style={{ fontSize: '13px', flex: 1 }}>
                <strong>Terrain Clearance threats: </strong>
                {terrainResult.count > 0 ? (
                  <span style={{ color: 'var(--accent-crit)' }}>
                    WARNING: {terrainResult.count} peak locations violate the 2,000 ft clearance margin relative to the OEI single-engine ceiling. Max peak: {terrainResult.maxPeak.toLocaleString()} ft.
                  </span>
                ) : (
                  <span style={{ color: 'var(--accent-green)' }}>
                    CLEAR. Single-engine ceiling (FL{Math.round(ceilingAlt / 100)}) maintains a safe margin (&gt;2,000 ft) over all peaks. Max peak: {terrainResult.maxPeak.toLocaleString()} ft.
                  </span>
                )}
              </div>
            </div>

            {/* Winter Ops check */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: isIcingRisk ? 'rgba(255, 191, 0, 0.08)' : 'rgba(0, 255, 0, 0.08)', border: isIcingRisk ? '1px solid rgba(255, 191, 0, 0.2)' : '1px solid rgba(0, 255, 0, 0.2)', padding: '10px 14px', borderRadius: '6px' }}>
              <span style={{ fontSize: '16px' }}>❄️</span>
              <div style={{ fontSize: '13px', flex: 1 }}>
                <strong>Winter Operations & Icing Risks: </strong>
                {isIcingRisk ? (
                  <span style={{ color: 'var(--accent-warn)' }}>
                    WARNING: Ground temperature is at or below 5°C. Ground/climb anti-ice system configurations required.
                  </span>
                ) : (
                  <span style={{ color: 'var(--accent-green)' }}>
                    NORMAL. All terminal temperatures are above icing risk limits.
                  </span>
                )}
              </div>
            </div>

            {/* Fuel Reserve check */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: isLandingFuelWarning ? 'rgba(255, 0, 0, 0.08)' : 'rgba(0, 255, 0, 0.08)', border: isLandingFuelWarning ? '1px solid rgba(255, 0, 0, 0.2)' : '1px solid rgba(0, 255, 0, 0.2)', padding: '10px 14px', borderRadius: '6px' }}>
              <span style={{ fontSize: '16px' }}>⛽</span>
              <div style={{ fontSize: '13px', flex: 1 }}>
                <strong>Fuel reserve safety: </strong>
                {isLandingFuelWarning ? (
                  <span style={{ color: 'var(--accent-crit)' }}>
                    CRITICAL: Destination remaining fuel ({projectedLandingFuel.toLocaleString()} lbs) is below the minimum diversion fuel ({minimumDiversionFuel.toLocaleString()} lbs).
                  </span>
                ) : (
                  <span style={{ color: 'var(--accent-green)' }}>
                    SAFE. Destination remaining fuel maintains legal reserve requirements.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 8: AIRPORT NOTES & RUNWAY CONFIG */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px 0', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏢</span> Section 8: Terminal Airport Notes & Runways Config
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            
            {/* Departure Runways */}
            {enrichedDep && (
              <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px', color: '#fff' }}>🛫 DEPARTURE: {enrichedDep.name} ({mission.departure})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {enrichedDep.runways.map(rwy => {
                    let windComponentStr = '';
                    if (weather.departure && weather.departure.status === 'OK' && weather.departure.windDir !== null) {
                      const comps = calculateWindComponents(
                        weather.departure.windDir,
                        weather.departure.windSpeed,
                        rwy.heading
                      );
                      const crosswind = Math.abs(comps.crosswind);
                      const hw = comps.headwind;
                      windComponentStr = `Winds: ${hw >= 0 ? `H${hw}` : `T${Math.abs(hw)}`} kt, Xw${crosswind} kt`;
                    }

                    return (
                      <div key={rwy.ident} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px' }}>
                        <span>Rwy <strong>{rwy.ident}</strong> ({rwy.length} × {rwy.width} ft)</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{windComponentStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Arrival Runways */}
            {enrichedArr && (
              <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '20px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px', color: '#fff' }}>🛬 ARRIVAL: {enrichedArr.name} ({mission.arrival})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {enrichedArr.runways.map(rwy => {
                    let windComponentStr = '';
                    if (weather.arrival && weather.arrival.status === 'OK' && weather.arrival.windDir !== null) {
                      const comps = calculateWindComponents(
                        weather.arrival.windDir,
                        weather.arrival.windSpeed,
                        rwy.heading
                      );
                      const crosswind = Math.abs(comps.crosswind);
                      const hw = comps.headwind;
                      windComponentStr = `Winds: ${hw >= 0 ? `H${hw}` : `T${Math.abs(hw)}`} kt, Xw${crosswind} kt`;
                    }

                    return (
                      <div key={rwy.ident} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px' }}>
                        <span>Rwy <strong>{rwy.ident}</strong> ({rwy.length} × {rwy.width} ft)</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{windComponentStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alternate Runways */}
            {enrichedAlt && (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px', color: '#fff' }}>🔄 ALTERNATE: {enrichedAlt.name} ({mission.alternate})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {enrichedAlt.runways.map(rwy => {
                    let windComponentStr = '';
                    if (weather.alternate && weather.alternate.status === 'OK' && weather.alternate.windDir !== null) {
                      const comps = calculateWindComponents(
                        weather.alternate.windDir,
                        weather.alternate.windSpeed,
                        rwy.heading
                      );
                      const crosswind = Math.abs(comps.crosswind);
                      const hw = comps.headwind;
                      windComponentStr = `Winds: ${hw >= 0 ? `H${hw}` : `T${Math.abs(hw)}`} kt, Xw${crosswind} kt`;
                    }

                    return (
                      <div key={rwy.ident} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px' }}>
                        <span>Rwy <strong>{rwy.ident}</strong> ({rwy.length} × {rwy.width} ft)</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{windComponentStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
