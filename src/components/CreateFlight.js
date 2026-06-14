import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMission } from '../context/MissionContext.js';
import AirportAutocomplete from './AirportAutocomplete.js';
import { parseWsiBrief } from '../services/wsiParser.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';
import { calculateDriftdownCeiling, calculateDistanceNM } from '../engine/kinematics.js';
import { extractTextFromPdf } from '../services/pdfExtractor.js';




export default function CreateFlight() {
  const { 
    mission, 
    updateMissionField, 
    updateMissionFields, 
    airportDb,
    navLog,
    totalDistance,
    takeoffWeight,
    minimumDiversionFuel,
    tripFuelCalc,
    contingencyFuelCalc,
    alternateFuelCalc,
    finalReserveFuelCalc,
    cruiseMatrix,
    driftdownDb,
    terrainDb,
    weather
  } = useMission();

  const [pasteText, setPasteText] = useState('');

  // PDF upload states
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfSuccess, setPdfSuccess] = useState('');

  // OFP Wireless Relay states
  const [relayStatus, setRelayStatus] = useState('connecting'); // 'connected' | 'offline' | 'connecting' | 'receiving'
  const [relayLastCheck, setRelayLastCheck] = useState(null);
  const relayProcessingRef = useRef(false);


  // Intercept shared flight plan from system share sheet
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('shared-flight-plan')) {
      // Clean query parameter from URL bar to prevent re-triggering on reload
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setPdfLoading(true);
      setPdfError('');
      setPdfSuccess('');

      const CACHE_NAME = 'pathoptix-v9';
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await cache.match('/shared-pdf.pdf');
          if (response) {
            const arrayBuffer = await response.arrayBuffer();
            // Delete from cache so it is consumed only once
            await cache.delete('/shared-pdf.pdf');
            
            const extractedText = await extractTextFromPdf(arrayBuffer);
            const parsedFields = parseWsiBrief(extractedText);

            if (parsedFields && (parsedFields.departure || parsedFields.arrival || parsedFields.routeString)) {
              updateMissionFields(parsedFields);
              setPdfSuccess(`Shared Flight Plan successfully loaded: ${parsedFields.flightNumber || 'POIXXX'} (${parsedFields.departure || '??'} ➔ ${parsedFields.arrival || '??'})`);
            } else {
              setPdfError("Shared PDF loaded, but no valid WSI flight plan parameters were found in the text.");
            }
          }
        } catch (err) {
          console.error("Error loading shared flight plan from cache:", err);
          setPdfError(`Failed to load shared flight plan: ${err.message}`);
        } finally {
          setPdfLoading(false);
        }
      });
    }
  }, []);

  // ─── OFP WIRELESS RELAY: Poll server for incoming flight plans ───
  const processRelayOFP = useCallback(async () => {
    if (relayProcessingRef.current) return;
    relayProcessingRef.current = true;

    setPdfLoading(true);
    setPdfError('');
    setPdfSuccess('');

    try {
      const res = await fetch('/api/upload-ofp');
      if (res.status === 200) {
        setRelayStatus('receiving');
        const arrayBuffer = await res.arrayBuffer();

        const extractedText = await extractTextFromPdf(arrayBuffer);
        const parsedFields = parseWsiBrief(extractedText);

        if (parsedFields && (parsedFields.departure || parsedFields.arrival || parsedFields.routeString)) {
          updateMissionFields(parsedFields);
          setPdfSuccess(
            `📡 Wireless Relay: Flight Plan received and loaded — ` +
            `${parsedFields.flightNumber || 'POIXXX'} ` +
            `(${parsedFields.departure || '??'} ➔ ${parsedFields.arrival || '??'})`
          );
        } else {
          setPdfError('Relay PDF received but no valid flight plan parameters were found in the document.');
        }
      }
    } catch (err) {
      console.error('[OFP Relay] Error processing incoming PDF:', err);
      setPdfError(`Relay ingestion failed: ${err.message}`);
    } finally {
      setPdfLoading(false);
      relayProcessingRef.current = false;
      setRelayStatus('connected');
    }
  }, [updateMissionFields]);

  useEffect(() => {
    let alive = true;

    const pollRelay = async () => {
      try {
        const res = await fetch('/api/upload-ofp/status');
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          setRelayStatus('connected');
          setRelayLastCheck(Date.now());

          if (data.pending) {
            await processRelayOFP();
          }
        } else {
          setRelayStatus('offline');
        }
      } catch {
        if (alive) setRelayStatus('offline');
      }
    };

    // Initial check
    pollRelay();

    // Poll every 3 seconds
    const intervalId = setInterval(pollRelay, 3000);

    return () => {
      alive = false;
      clearInterval(intervalId);
    };
  }, [processRelayOFP]);



  // --- OPERATIONS DASHBOARD CALCULATIONS ---
  const routeBurn = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = (mission.blockFuel || 0) - (mission.taxiFuel || 0) - routeBurn;
  const isLandingFuelWarning = projectedLandingFuel < minimumDiversionFuel;

  // 1. Route Summary Time
  const totalTimeMins = mission.plannedEte || (navLog || []).reduce((sum, row) => {
    const legTimeMin = row.gs > 0 ? (row.legDistance / row.gs) * 60 : 0;
    return sum + legTimeMin;
  }, 0);
  const formattedTime = totalTimeMins > 0 
    ? `${Math.floor(totalTimeMins / 60)}h ${String(Math.round(totalTimeMins % 60)).padStart(2, '0')}m` 
    : '---';

  const alternateName = airportDb?.airports?.[mission.alternate?.toUpperCase()?.trim()]?.name || '';
  const alternateDisplay = mission.alternate 
    ? `${mission.alternate.toUpperCase()}${alternateName ? ` (${alternateName})` : ''}` 
    : 'None';

  // 2. Fuel Summary
  const contingencyFuel = contingencyFuelCalc || Math.round(routeBurn * 0.05);
  const alternateFuel = mission.alternateFuel || 0;
  const reserveFuel = alternateFuel + contingencyFuel;
  const holdingFuel = mission.finalReserveFuel || 0;

  // 3. Performance Summary Burn Rate
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

  // 4. OEI Summary
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
      const cruiseAlt = (mission.cruiseFL || 350) * 100;
      const depElev = mission.departureElev || 0;
      const arrElev = mission.arrivalElev || 0;
      const fpaAngle = mission.fpa || 3.0;

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

  const getDiversionAirports = () => {
    if (!navLog || navLog.length === 0) return '---';
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

    const withDist = Object.entries(oeiAlternatesList).map(([icao, apt]) => {
      const d = calculateDistanceNM(midWp.lat, midWp.lon, apt.lat, apt.lon);
      return { icao, name: apt.name, distance: Math.round(d) };
    }).sort((a, b) => a.distance - b.distance);

    return withDist.slice(0, 3).map(apt => `${apt.icao} (${apt.distance} NM)`).join(', ');
  };
  const diversionAirportsStr = getDiversionAirports();

  const handleDatalinkPaste = (e) => {
    const text = e.target.value;
    setPasteText(text);
    if (!text) return;

    try {
      const parsed = parseWsiBrief(text);
      if (parsed) {
        Object.entries(parsed).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            updateMissionField(key, val);
          }
        });
      }
    } catch (err) {
      console.error("Error parsing pasted WSI flight plan:", err);
    }
  };
  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>📝 Create Flight Release &amp; Ingestion</h2>
        <p>Paste digital ACARS releases or receive flight plans wirelessly to initialize EFB mission data.</p>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Active Operations Command Dashboard */}
        {navLog && navLog.length > 0 && (
          <div className="glass-panel" style={{ 
            padding: '24px', 
            border: '1px solid rgba(0, 255, 255, 0.2)', 
            background: 'linear-gradient(135deg, rgba(10, 10, 12, 0.95), rgba(5, 5, 6, 0.95))',
            borderRadius: '12px',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🖥️</span> ACTIVE FLIGHT OPERATIONS DASHBOARD
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Real-time mission-critical routing, fuel burn projections, and terrain clearance analysis.
                </p>
              </div>
              <div style={{ background: 'rgba(0, 255, 255, 0.08)', border: '1px solid var(--accent-cyan)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 'bold', letterSpacing: '1px' }}>
                {mission.flightNumber || 'POIXXX'} | {mission.registration || 'C-GKPL'}
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              
              {/* Route Summary */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'var(--transition-smooth)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span>🗺️</span> ROUTE SUMMARY
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Route:</span>
                    <strong style={{ color: '#fff' }}>{mission.departure} ➔ {mission.arrival}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Distance:</span>
                    <strong style={{ color: '#fff' }}>{totalDistance} NM</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Est Time:</span>
                    <strong style={{ color: 'var(--accent-warn)' }}>{formattedTime}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Alternates:</span>
                    <strong style={{ color: '#fff', fontSize: '11px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={alternateDisplay}>
                      {alternateDisplay}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Fuel Summary */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span>⛽</span> FUEL SUMMARY
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Trip Burn:</span>
                    <strong style={{ color: '#fff' }}>{tripFuelCalc.toLocaleString()} lbs</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Reserve:</span>
                    <strong style={{ color: '#fff' }} title={`Alt: ${alternateFuel.toLocaleString()} + Cont: ${contingencyFuel.toLocaleString()}`}>
                      {reserveFuel.toLocaleString()} lbs
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Holding:</span>
                    <strong style={{ color: '#fff' }}>{holdingFuel.toLocaleString()} lbs</strong>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '13px', 
                    borderTop: '1px solid rgba(255,255,255,0.03)', 
                    paddingTop: '6px',
                    color: isLandingFuelWarning ? 'var(--accent-warn)' : 'var(--accent-cyan)'
                  }}>
                    <span>Dest Remaining:</span>
                    <strong style={{ fontWeight: 'bold' }}>{projectedLandingFuel.toLocaleString()} lbs</strong>
                  </div>
                </div>
              </div>

              {/* Performance Summary */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span>⚡</span> PERFORMANCE SUMMARY
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Cruise Altitude:</span>
                    <strong style={{ color: '#fff' }}>FL{mission.cruiseFL || '---'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Cost Index:</span>
                    <strong style={{ color: '#fff' }}>{mission.costIndex}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Burn Rate:</span>
                    <strong style={{ color: '#fff' }}>{burnRate > 0 ? `${burnRate.toLocaleString()} lbs/hr` : '---'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Takeoff Weight:</span>
                    <strong style={{ color: '#fff' }}>{takeoffWeight.toLocaleString()} lbs</strong>
                  </div>
                </div>
              </div>

              {/* OEI Summary */}
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span>⚠️</span> OEI SUMMARY
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>SE Ceiling:</span>
                    <strong style={{ color: '#fff' }}>FL{Math.round(ceilingAlt / 100)} ({ceilingAlt.toLocaleString()} ft)</strong>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '13px',
                    color: terrainResult.count > 0 ? 'var(--accent-warn)' : 'var(--accent-green)'
                  }}>
                    <span>Terrain Threats:</span>
                    <strong style={{ fontWeight: 'bold' }}>
                      {terrainResult.count > 0 ? `${terrainResult.count} peaks` : 'Clear (>2,000 ft)'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Diversion Airports:</span>
                    <strong style={{ color: '#fff', fontSize: '10px', wordBreak: 'break-all' }} title={diversionAirportsStr}>
                      {diversionAirportsStr}
                    </strong>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Paste briefing releases */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>WSI Pilotbrief &amp; ACARS Flight Plan Ingestion</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Send flight plans wirelessly using the iOS Shortcut relay, or paste raw flight plan text below as a backup to auto-populate flight parameters.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '16px' }}>
            
            {/* Left: Wireless OFP Relay Status */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {/* Wireless OFP Relay Status Indicator */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: relayStatus === 'receiving'
                  ? 'rgba(0, 255, 255, 0.08)'
                  : relayStatus === 'connected'
                    ? 'rgba(0, 255, 0, 0.06)'
                    : 'rgba(255, 0, 0, 0.06)',
                border: '1px solid ' + (
                  relayStatus === 'receiving'
                    ? 'rgba(0, 255, 255, 0.3)'
                    : relayStatus === 'connected'
                      ? 'rgba(0, 255, 0, 0.2)'
                      : 'rgba(255, 0, 0, 0.2)'
                ),
                transition: 'var(--transition-smooth)'
              }}>
                {/* Pulsing dot */}
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: relayStatus === 'receiving'
                    ? 'var(--accent-cyan)'
                    : relayStatus === 'connected'
                      ? 'var(--accent-green)'
                      : 'var(--accent-crit)',
                  boxShadow: relayStatus === 'connected'
                    ? '0 0 6px rgba(0, 255, 0, 0.6)'
                    : relayStatus === 'receiving'
                      ? '0 0 10px rgba(0, 255, 255, 0.8)'
                      : '0 0 6px rgba(255, 0, 0, 0.6)',
                  animation: relayStatus === 'connected' || relayStatus === 'receiving'
                    ? 'pulse-dot 2s ease-in-out infinite'
                    : 'none',
                  flexShrink: 0
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
                    {relayStatus === 'receiving' && '📡 RECEIVING FLIGHT PLAN...'}
                    {relayStatus === 'connected' && '📡 WIRELESS RELAY ACTIVE'}
                    {relayStatus === 'connecting' && '📡 CONNECTING TO RELAY...'}
                    {relayStatus === 'offline' && '📡 RELAY OFFLINE'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {relayStatus === 'connected' && 'Listening for incoming WSI flight plans via iOS Shortcut'}
                    {relayStatus === 'receiving' && 'Processing PDF pages and extracting flight parameters...'}
                    {relayStatus === 'connecting' && 'Establishing connection to PathOptix relay server...'}
                    {relayStatus === 'offline' && 'Server unreachable — use raw text paste backup instead'}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Text Area Ingestion */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Paste Raw Briefing Text (Manual Backup)
              </label>
              <textarea
                placeholder="Paste ACARS Flight Plan or WSI Briefing text here..."
                value={pasteText}
                onChange={handleDatalinkPaste}
                className="touch-input-field"
                rows={5}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  resize: 'none',
                  flex: 1
                }}
              />
            </div>

          </div>

          {/* Feedback Messages */}
          {pdfLoading && (
            <div className="alert-banner info" style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(0,255,255,0.08)', border: '1px solid rgba(0,255,255,0.25)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#fff', marginBottom: '10px' }}>
              <div className="loading-spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid var(--accent-cyan)' }}></div>
              <span>Reading briefing PDF pages and extracting performance variables...</span>
            </div>
          )}

          {pdfError && (
            <div className="alert-banner danger" style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#fff', marginBottom: '10px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span>{pdfError}</span>
            </div>
          )}

          {pdfSuccess && (
            <div className="alert-banner success" style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(0,255,0,0.08)', border: '1px solid rgba(0,255,0,0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#fff', marginBottom: '10px' }}>
              <span style={{ fontSize: '16px' }}>✓</span>
              <span>{pdfSuccess}</span>
            </div>
          )}

        </div>

        {/* Flight Information Panel */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>Core Mission Parameters</h3>
          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Flight Number</label>
              <input 
                type="text" 
                key={mission.flightNumber}
                defaultValue={mission.flightNumber}
                onBlur={(e) => updateMissionField('flightNumber', e.target.value.toUpperCase())}
                className="touch-input-field"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="input-cell-spatial">
              <label>Aircraft Registration</label>
              <input 
                type="text" 
                key={mission.registration}
                defaultValue={mission.registration}
                onBlur={(e) => updateMissionField('registration', e.target.value.toUpperCase())}
                className="touch-input-field"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <AirportAutocomplete 
              label="Departure ICAO"
              value={mission.departure}
              onSelect={(val) => updateMissionField('departure', val)}
              airportDb={airportDb}
            />

            <AirportAutocomplete 
              label="Arrival ICAO"
              value={mission.arrival}
              onSelect={(val) => updateMissionField('arrival', val)}
              airportDb={airportDb}
            />

            <AirportAutocomplete 
              label="Alternate ICAO"
              value={mission.alternate}
              onSelect={(val) => updateMissionField('alternate', val)}
              airportDb={airportDb}
            />

            <div className="input-cell-spatial">
              <label>Zero Fuel Weight (lbs)</label>
              <input 
                type="number" 
                key={mission.zeroFuelWeight}
                defaultValue={mission.zeroFuelWeight}
                onBlur={(e) => updateMissionField('zeroFuelWeight', e.target.value, 60000, 110000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Cost Index (CI)</label>
              <input 
                type="number" 
                key={mission.costIndex}
                defaultValue={mission.costIndex}
                onBlur={(e) => updateMissionField('costIndex', e.target.value, 0, 150)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Passengers (Pax)</label>
              <input 
                type="number" 
                key={mission.pax}
                defaultValue={mission.pax}
                onBlur={(e) => updateMissionField('pax', e.target.value, 0, 150)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>MAC %</label>
              <input 
                type="number" 
                key={mission.mac}
                defaultValue={mission.mac}
                onBlur={(e) => updateMissionField('mac', e.target.value, 0, 50)}
                step="0.1"
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Cruise FL</label>
              <input 
                type="number" 
                key={mission.cruiseFL}
                defaultValue={mission.cruiseFL}
                onBlur={(e) => updateMissionField('cruiseFL', e.target.value, 100, 410)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Average Wind Dir (°)</label>
              <input 
                type="number" 
                key={mission.averageWindDir}
                defaultValue={mission.averageWindDir}
                onBlur={(e) => updateMissionField('averageWindDir', e.target.value, 0, 360)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Average Wind Speed (kt)</label>
              <input 
                type="number" 
                key={mission.averageWindSpeed}
                defaultValue={mission.averageWindSpeed}
                onBlur={(e) => updateMissionField('averageWindSpeed', e.target.value, 0, 150)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Flight Plan String Route</label>
              <input 
                type="text" 
                key={mission.routeString}
                defaultValue={mission.routeString}
                onBlur={(e) => updateMissionField('routeString', e.target.value.toUpperCase())}
                className="touch-input-field"
                style={{ textAlign: 'left', textTransform: 'uppercase', letterSpacing: '1px' }}
              />
            </div>


          </div>
        </div>


      </div>
    </div>
  );
}
