import React, { useMemo } from 'react';
import { useMission } from '../context/MissionContext.js';
import { calculateWindComponents } from '../services/airportService.js';
import { calculateDriftdownCeiling } from '../engine/kinematics.js';

export default function ReviewWeather() {
  const {
    mission,
    weather,
    airportDb,
    enrichAirport,
    takeoffWeight,
    driftdownDb,
    refreshWeather,
  } = useMission();

  // Landing Fuel margin calculation
  const routeBurn = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = mission.blockFuel - mission.taxiFuel - routeBurn;

  // Icing Risk Detection (OAT <= 5°C)
  const isDepIcing = weather.departure && weather.departure.status === 'OK' && weather.departure.temperature <= 5;
  const isArrIcing = weather.arrival && weather.arrival.status === 'OK' && weather.arrival.temperature <= 5;
  const isIcingRisk = isDepIcing || isArrIcing;

  // --- WINDS ALOFT & UPPER TEMPERATURE COMPUTATIONS ---
  const calculateWindsAloft = () => {
    const fls = [180, 240, 300, 340, 390];
    const avgWindDir = mission.averageWindDir || 270;
    const avgWindSpeed = mission.averageWindSpeed || 0;
    const isaDev = mission.isaDev || 0;

    return fls.map(fl => {
      const alt = fl * 100;
      
      // Standard ISA Temperature
      let stdTemp = 15 - 1.98 * (alt / 1000);
      if (alt > 36089) {
        stdTemp = -56.5;
      }
      stdTemp = Math.round(stdTemp);
      const forecastTemp = stdTemp + isaDev;

      // Jetstream altitude scaling profile
      let scale = 1.0;
      if (fl === 180) scale = 0.5;
      else if (fl === 240) scale = 0.85;
      else if (fl === 300) scale = 1.1;
      else if (fl === 340) scale = 1.25;
      else if (fl === 390) scale = 1.05;

      const speed = Math.round(avgWindSpeed * scale);
      const windVector = speed > 0 ? `${avgWindDir}° @ ${speed} KT` : 'Calm';

      let turb = 'Nil';
      if (speed > 80) turb = 'MODERATE CAT';
      else if (speed > 50) turb = 'LIGHT-MOD CAT';
      else if (speed > 30) turb = 'LIGHT CAT';

      return {
        fl,
        stdTemp,
        forecastTemp,
        speed,
        dir: avgWindDir,
        vector: windVector,
        turb
      };
    });
  };
  const upperAirForecast = calculateWindsAloft();

  // OEI Service ceiling for warnings
  const ceilingAlt = calculateDriftdownCeiling(takeoffWeight || 100000, mission.isaDev || 0, driftdownDb);

  // Generate SigWx advisories
  const getSigWxAdvisories = () => {
    const advisories = [];
    const avgWindSpeed = mission.averageWindSpeed || 0;
    const avgWindDir = mission.averageWindDir || 270;
    const arrivalApt = mission.arrival || '';

    // 1. Jetstream core
    if (avgWindSpeed > 60) {
      advisories.push({
        title: 'JETSTREAM CORE WINDS ALOFT ALERT',
        desc: `Jetstream core observed at FL340-FL390 with peak speeds of ${Math.round(avgWindSpeed * 1.25)} KT from ${avgWindDir}°. Expect potential wind shear and associated Clear Air Turbulence (CAT).`,
        severity: 'warn'
      });
    }

    // 2. Mountain wave turbulence
    const rockiesDestinations = ['CYVR', 'CYYC', 'CYEG', 'CYKA', 'CYXC'];
    if (rockiesDestinations.includes(arrivalApt.toUpperCase().trim())) {
      advisories.push({
        title: 'MOUNTAIN WAVE TURBULENCE (MWT) ADVISORY',
        desc: 'Mountain Wave Activity forecasted over the Canadian Rockies / Selkirk ranges at FL240 and above. Downdrafts of 500-1000 FPM possible in lee waves. Crew should advise passengers and secure cabin.',
        severity: 'warn'
      });
    }

    // 3. Icing risk
    if (isIcingRisk) {
      advisories.push({
        title: 'TERMINAL ICING AND AIRFRAME INDUCTION WARNING',
        desc: 'Visible moisture in cloud layers below FL180 with temperatures between 0°C and -20°C suggests severe to moderate icing. Activate engine/wing anti-ice systems.',
        severity: 'danger'
      });
    }

    // 4. Low visibility categories
    const depCat = weather.departure?.flightCategory;
    const arrCat = weather.arrival?.flightCategory;
    if (depCat === 'IFR' || depCat === 'LIFR' || arrCat === 'IFR' || arrCat === 'LIFR') {
      advisories.push({
        title: 'TERMINAL INSTRUMENT CONDITIONS (IFR/LIFR) ACTIVE',
        desc: 'Low ceilings / visibility observed. Expect ILS or LNAV/VNAV approach procedures and possible ground delays/holding patterns.',
        severity: 'info'
      });
    }

    // Default convective outlook
    if (advisories.length === 0) {
      advisories.push({
        title: 'CONVECTIVE OUTLOOK & GENERAL SIGNIFICANT WEATHER',
        desc: 'NIL Significant Weather (SigWx) reported along the active route corridors. VFR/MVFR conditions predominate at terminals.',
        severity: 'success'
      });
    }

    return advisories;
  };
  const sigWxAdvisories = getSigWxAdvisories();

  const getMetarAge = (obsTime) => {
    if (!obsTime) return { label: '---', color: 'var(--text-secondary)' };
    const ageMins = Math.floor((Date.now() / 1000 - obsTime) / 60);
    const label = ageMins <= 0 ? 'Just now' : `${ageMins}m ago`;
    const color = ageMins > 90 ? 'var(--accent-crit)'
      : ageMins > 30 ? 'var(--accent-warn)'
      : 'var(--accent-green)';
    return { label, color };
  };

  const getCategoryStyle = (cat) => {
    const base = {
      padding: '4px 8px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.5px',
      textTransform: 'uppercase'
    };
    switch (cat) {
      case 'VFR':
        return { ...base, background: 'rgba(57, 255, 20, 0.15)', color: 'var(--accent-green)', border: '1px solid rgba(57, 255, 20, 0.3)' };
      case 'MVFR':
        return { ...base, background: 'rgba(0, 240, 255, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 240, 255, 0.3)' };
      case 'IFR':
        return { ...base, background: 'rgba(255, 74, 74, 0.15)', color: 'var(--accent-crit)', border: '1px solid rgba(255, 74, 74, 0.3)' };
      case 'LIFR':
        return { ...base, background: 'rgba(255, 0, 255, 0.15)', color: '#ff00ff', border: '1px solid rgba(255, 0, 255, 0.3)' };
      default:
        return { ...base, background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)' };
    }
  };

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
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>🌤️ Review Meteorological & Environmental Conditions</h2>
          <p>Monitor raw METAR updates, airport elevations, runway wind vectors, and icing conditions.</p>
        </div>
        <button
          onClick={refreshWeather}
          style={{ padding: '10px 18px', background: 'rgba(0, 212, 255, 0.12)', border: '1px solid var(--accent-cyan)', borderRadius: '8px', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}
        >
          ↻ Refresh METARs
        </button>
      </div>

      {isIcingRisk && (
        <div className="alert-banner danger" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 24px 0', background: 'rgba(255, 74, 74, 0.12)', border: '1px solid rgba(255, 74, 74, 0.25)', padding: '12px', borderRadius: '8px', color: '#fff', fontSize: '13px' }}>
          <span style={{ fontSize: '18px' }}>❄️</span>
          <span>
            <strong>WINTER OPS / ICING RISK:</strong> Surface temperature is below 5°C at one or more airports 
            ({isDepIcing ? `${mission.departure}: ${weather.departure.temperature}°C` : ''} 
            {isDepIcing && isArrIcing ? ', ' : ''} 
            {isArrIcing ? `${mission.arrival}: ${weather.arrival.temperature}°C` : ''}). 
            Ensure E195-E2 engine and wing anti-ice performance penalties are activated.
          </span>
        </div>
      )}

      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          
          {/* Departure Weather Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '15px', margin: 0, fontWeight: '600' }}>🛫 Departure Airport ({mission.departure || 'N/A'})</h4>
              {weather.departure && weather.departure.status === 'OK' && (
                <span style={getCategoryStyle(weather.departure.flightCategory)}>
                  {weather.departure.flightCategory}
                </span>
              )}
            </div>
            {weather.departure ? (
              weather.departure.status === 'OK' ? (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.85)', marginBottom: '16px', lineHeight: '1.4', wordBreak: 'break-all' }}>
                    {weather.departure.raw}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Winds</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{weather.departure.wind}</span>
                    </div>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>OAT</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: weather.departure.temperature <= 5 ? 'var(--accent-crit)' : '#fff' }}>
                        {weather.departure.temperature}°C
                      </span>
                    </div>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Altimeter</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{weather.departure.altimeter.toFixed(2)} inHg</span>
                    </div>
                  </div>
                  {enrichedDep && enrichedDep.runways && enrichedDep.runways.length > 0 && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runway Wind Components</span>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginTop: '8px' }}>
                        <thead>
                          <tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ padding: '6px 4px' }}>Rwy</th>
                            <th style={{ padding: '6px 4px' }}>Length</th>
                            <th style={{ padding: '6px 4px', textAlign: 'center' }}>Headwind</th>
                            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Crosswind</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrichedDep.runways.map(rwy => {
                            const windSpeed = weather.departure.windSpeed || 0;
                            const windDir = typeof weather.departure.windDirection === 'number' ? weather.departure.windDirection : 0;
                            const { headwind, crosswind } = calculateWindComponents(rwy.heading, windDir, windSpeed);
                            const isTailwind = headwind < 0;
                            const isLimitExceeded = crosswind > 30 || (isTailwind && Math.abs(headwind) > 10);
                            
                            return (
                              <tr key={rwy.ident} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '6px 4px', fontWeight: '700' }}>{rwy.ident}</td>
                                <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{rwy.length.toLocaleString()} ft</td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '600', color: isTailwind ? '#ff4a4a' : '#39ff14' }}>
                                  {isTailwind ? `T${Math.abs(headwind)} kt` : `H${headwind} kt`}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: '600', color: isLimitExceeded ? 'var(--accent-warn)' : '#fff' }}>
                                  {crosswind} kt
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(() => { const age = getMetarAge(weather.departure.obsTime); return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Field Elevation: <strong>{weather.departure.elevation} ft</strong></span>
                    <span>Data Age: <strong style={{ color: age.color }}>{age.label}</strong></span>
                  </div>
                  ); })()}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-crit)', fontSize: '13px', background: 'rgba(255,74,74,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,74,74,0.1)' }}>
                  <span>⚠️</span>
                  <span><strong>{weather.departure.status}:</strong> Departure weather offline. Standard atmospheric conditions applied.</span>
                </div>
              )
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', padding: '12px 0' }}>
                Enter departure ICAO or active route waypoints to load meteorological telemetry.
              </div>
            )}
          </div>

          {/* Arrival Weather Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '15px', margin: 0, fontWeight: '600' }}>🛬 Arrival Airport ({mission.arrival || 'N/A'})</h4>
              {weather.arrival && weather.arrival.status === 'OK' && (
                <span style={getCategoryStyle(weather.arrival.flightCategory)}>
                  {weather.arrival.flightCategory}
                </span>
              )}
            </div>
            {weather.arrival ? (
              weather.arrival.status === 'OK' ? (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.85)', marginBottom: '16px', lineHeight: '1.4', wordBreak: 'break-all' }}>
                    {weather.arrival.raw}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Winds</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{weather.arrival.wind}</span>
                    </div>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>OAT</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: weather.arrival.temperature <= 5 ? 'var(--accent-crit)' : '#fff' }}>
                        {weather.arrival.temperature}°C
                      </span>
                    </div>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Altimeter</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{weather.arrival.altimeter.toFixed(2)} inHg</span>
                    </div>
                  </div>
                  {enrichedArr && enrichedArr.runways && enrichedArr.runways.length > 0 && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runway Wind Components</span>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginTop: '8px' }}>
                        <thead>
                          <tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ padding: '6px 4px' }}>Rwy</th>
                            <th style={{ padding: '6px 4px' }}>Length</th>
                            <th style={{ padding: '6px 4px', textAlign: 'center' }}>Headwind</th>
                            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Crosswind</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrichedArr.runways.map(rwy => {
                            const windSpeed = weather.arrival.windSpeed || 0;
                            const windDir = typeof weather.arrival.windDirection === 'number' ? weather.arrival.windDirection : 0;
                            const { headwind, crosswind } = calculateWindComponents(rwy.heading, windDir, windSpeed);
                            const isTailwind = headwind < 0;
                            const isLimitExceeded = crosswind > 30 || (isTailwind && Math.abs(headwind) > 10);
                            
                            return (
                              <tr key={rwy.ident} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '6px 4px', fontWeight: '700' }}>{rwy.ident}</td>
                                <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{rwy.length.toLocaleString()} ft</td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '600', color: isTailwind ? '#ff4a4a' : '#39ff14' }}>
                                  {isTailwind ? `T${Math.abs(headwind)} kt` : `H${headwind} kt`}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: '600', color: isLimitExceeded ? 'var(--accent-warn)' : '#fff' }}>
                                  {crosswind} kt
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(() => { const age = getMetarAge(weather.arrival.obsTime); return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Field Elevation: <strong>{weather.arrival.elevation} ft</strong></span>
                    <span>Data Age: <strong style={{ color: age.color }}>{age.label}</strong></span>
                  </div>
                  ); })()}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-crit)', fontSize: '13px', background: 'rgba(255,74,74,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,74,74,0.1)' }}>
                  <span>⚠️</span>
                  <span><strong>{weather.arrival.status}:</strong> Arrival weather offline. Standard atmospheric conditions applied.</span>
                </div>
              )
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', padding: '12px 0' }}>
                Enter arrival ICAO or active route waypoints to load meteorological telemetry.
              </div>
            )}
          </div>

          {/* Alternate Weather Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ color: 'var(--accent-cyan)', fontSize: '15px', margin: 0, fontWeight: '600' }}>🛫 Alternate Airport ({mission.alternate || 'N/A'})</h4>
              {weather.alternate && weather.alternate.status === 'OK' && (
                <span style={getCategoryStyle(weather.alternate.flightCategory)}>
                  {weather.alternate.flightCategory}
                </span>
              )}
            </div>
            {weather.alternate ? (
              weather.alternate.status === 'OK' ? (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.85)', marginBottom: '16px', lineHeight: '1.4', wordBreak: 'break-all' }}>
                    {weather.alternate.raw}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Winds</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{weather.alternate.wind}</span>
                    </div>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>OAT</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: weather.alternate.temperature <= 5 ? 'var(--accent-crit)' : '#fff' }}>
                        {weather.alternate.temperature}°C
                      </span>
                    </div>
                    <div className="metric-box" style={{ padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                      <span className="label" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>Altimeter</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{weather.alternate.altimeter.toFixed(2)} inHg</span>
                    </div>
                  </div>
                  {enrichedAlt && enrichedAlt.runways && enrichedAlt.runways.length > 0 && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runway Wind Components</span>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginTop: '8px' }}>
                        <thead>
                          <tr style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ padding: '6px 4px' }}>Rwy</th>
                            <th style={{ padding: '6px 4px' }}>Length</th>
                            <th style={{ padding: '6px 4px', textAlign: 'center' }}>Headwind</th>
                            <th style={{ padding: '6px 4px', textAlign: 'right' }}>Crosswind</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrichedAlt.runways.map(rwy => {
                            const windSpeed = weather.alternate.windSpeed || 0;
                            const windDir = typeof weather.alternate.windDirection === 'number' ? weather.alternate.windDirection : 0;
                            const { headwind, crosswind } = calculateWindComponents(rwy.heading, windDir, windSpeed);
                            const isTailwind = headwind < 0;
                            const isLimitExceeded = crosswind > 30 || (isTailwind && Math.abs(headwind) > 10);
                            
                            return (
                              <tr key={rwy.ident} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '6px 4px', fontWeight: '700' }}>{rwy.ident}</td>
                                <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{rwy.length.toLocaleString()} ft</td>
                                <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '600', color: isTailwind ? '#ff4a4a' : '#39ff14' }}>
                                  {isTailwind ? `T${Math.abs(headwind)} kt` : `H${headwind} kt`}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: '600', color: isLimitExceeded ? 'var(--accent-warn)' : '#fff' }}>
                                  {crosswind} kt
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(() => { const age = getMetarAge(weather.alternate.obsTime); return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Field Elevation: <strong>{weather.alternate.elevation} ft</strong></span>
                    <span>Data Age: <strong style={{ color: age.color }}>{age.label}</strong></span>
                  </div>
                  ); })()}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-crit)', fontSize: '13px', background: 'rgba(255,74,74,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,74,74,0.1)' }}>
                  <span>⚠️</span>
                  <span><strong>{weather.alternate.status}:</strong> Alternate weather offline. Standard atmospheric conditions applied.</span>
                </div>
              )
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', padding: '12px 0' }}>
                Enter alternate ICAO or active route waypoints to load meteorological telemetry.
              </div>
            )}
          </div>

          {/* Winds Aloft & Upper Air Forecaster */}
          <div className="glass-panel" style={{ marginTop: '24px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>📊 Enroute Winds Aloft & Upper Temperature Layers</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Forecasted winds, temperatures, and ISA deviation forecast profiles across active flight level layers.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontSize: '11px' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Flight Level</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Altitude (ft)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Std ISA Temp (°C)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Forecast Temp (°C)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Wind Vector</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Estimated Turbulence</th>
                  </tr>
                </thead>
                <tbody>
                  {upperAirForecast.map(row => (
                    <tr key={row.fl} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', fontWeight: '700', color: 'var(--accent-cyan)' }}>FL{row.fl}</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace' }}>{(row.fl * 100).toLocaleString()} ft</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>{row.stdTemp}°C</td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: row.forecastTemp <= 5 ? '#00f0ff' : '#fff' }}>
                        {row.forecastTemp}°C ({mission.isaDev >= 0 ? `+${mission.isaDev}` : mission.isaDev} ISA)
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold' }}>{row.vector}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: row.turb !== 'Nil' ? 'var(--accent-warn)' : 'rgba(255,255,255,0.5)' }}>{row.turb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Significant Weather (SigWx) & Turbulence Advisories */}
          <div className="glass-panel" style={{ marginTop: '24px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>🚨 Significant Weather (SigWx) & Turbulence Advisories</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sigWxAdvisories.map((adv, index) => {
                let badgeColor = 'rgba(255,255,255,0.1)';
                let borderCol = 'rgba(255,255,255,0.2)';
                let icon = 'ℹ️';
                if (adv.severity === 'warn') {
                  badgeColor = 'rgba(255, 183, 0, 0.08)';
                  borderCol = 'rgba(255, 183, 0, 0.2)';
                  icon = '⚠️';
                } else if (adv.severity === 'danger') {
                  badgeColor = 'rgba(255, 74, 74, 0.08)';
                  borderCol = 'rgba(255, 74, 74, 0.2)';
                  icon = '🔴';
                } else if (adv.severity === 'success') {
                  badgeColor = 'rgba(0, 168, 150, 0.08)';
                  borderCol = 'rgba(0, 168, 150, 0.2)';
                  icon = '✅';
                }

                return (
                  <div key={index} style={{ display: 'flex', gap: '14px', background: badgeColor, border: `1px solid ${borderCol}`, borderRadius: '8px', padding: '14px' }}>
                    <span style={{ fontSize: '20px' }}>{icon}</span>
                    <div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{adv.title}</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{adv.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
