import React from 'react';
import { useMission } from '../context/MissionContext.js';

export default function Dashboard() {
  const { mission, updateMissionField, takeoffWeight, minimumDiversionFuel, totalDistance, weather } = useMission();

  // Landing Fuel margin calculation
  const routeBurn = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = mission.blockFuel - mission.taxiFuel - routeBurn;
  const legalLandingMargin = projectedLandingFuel - minimumDiversionFuel;

  // Icing Risk Detection (OAT <= 5°C)
  const isDepIcing = weather.departure && weather.departure.status === 'OK' && weather.departure.temperature <= 5;
  const isArrIcing = weather.arrival && weather.arrival.status === 'OK' && weather.arrival.temperature <= 5;
  const isIcingRisk = isDepIcing || isArrIcing;

  const getMetarAgeStr = (obsTime) => {
    if (!obsTime) return '---';
    const ageMins = Math.floor((Date.now() / 1000 - obsTime) / 60);
    return ageMins <= 0 ? 'Just now' : `${ageMins}m ago`;
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

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Operations & Dispatch Command Center</h2>
        <p>Monitor airline dispatch parameters, configure aircraft weights, and verify legal route fuel reserve compliance.</p>
      </div>

      {/* UI Warning Feedback: Winter Operations & Icing Risk Banner */}
      {isIcingRisk && (
        <div className="alert-banner danger" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 24px 0', background: 'rgba(255, 74, 74, 0.12)', border: '1px solid rgba(255, 74, 74, 0.25)' }}>
          <span style={{ fontSize: '18px' }}>❄️</span>
          <span>
            <strong>WINTER OPS / ICING RISK:</strong> Surface temperature is below 5°C at one or more airports 
            ({isDepIcing ? `${mission.departure}: ${weather.departure.temperature}°C` : ''} 
            {isDepIcing && isArrIcing ? ', ' : ''} 
            {isArrIcing ? `${mission.arrival}: ${weather.arrival.temperature}°C` : ''}). 
            Ensure E-Jet Anti-Ice penalties are activated in the Climb and Descent tabs.
          </span>
        </div>
      )}

      <div className="panel-body grid-2col">
        {/* Left Column: Dispatch Config Inputs */}
        <div className="input-section glass-panel">
          <h3>Operations Dispatch Configuration</h3>
          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Zero Fuel Weight (lbs)</label>
              <input 
                type="number" 
                defaultValue={mission.zeroFuelWeight}
                onBlur={(e) => updateMissionField('zeroFuelWeight', e.target.value, 60000, 110000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Block Fuel (lbs)</label>
              <input 
                type="number" 
                defaultValue={mission.blockFuel}
                onBlur={(e) => updateMissionField('blockFuel', e.target.value, 2000, 30000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Taxi Fuel (lbs)</label>
              <input 
                type="number" 
                defaultValue={mission.taxiFuel}
                onBlur={(e) => updateMissionField('taxiFuel', e.target.value, 100, 2000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Alternate Fuel (lbs)</label>
              <input 
                type="number" 
                defaultValue={mission.alternateFuel}
                onBlur={(e) => updateMissionField('alternateFuel', e.target.value, 0, 10000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Final Reserve Fuel (lbs)</label>
              <input 
                type="number" 
                defaultValue={mission.finalReserveFuel}
                onBlur={(e) => updateMissionField('finalReserveFuel', e.target.value, 1000, 10000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Planned Fuel Burn (lbs)</label>
              <input 
                type="number" 
                defaultValue={mission.plannedFuelBurn}
                onBlur={(e) => updateMissionField('plannedFuelBurn', e.target.value, 0, 25000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Departure ICAO</label>
              <input 
                type="text" 
                key={mission.departure}
                defaultValue={mission.departure}
                onBlur={(e) => updateMissionField('departure', e.target.value.toUpperCase())}
                className="touch-input-field"
                placeholder="ICAO"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="input-cell-spatial">
              <label>Arrival ICAO</label>
              <input 
                type="text" 
                key={mission.arrival}
                defaultValue={mission.arrival}
                onBlur={(e) => updateMissionField('arrival', e.target.value.toUpperCase())}
                className="touch-input-field"
                placeholder="ICAO"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="input-cell-spatial">
              <label>Alternate ICAO</label>
              <input 
                type="text" 
                key={mission.alternate}
                defaultValue={mission.alternate}
                onBlur={(e) => updateMissionField('alternate', e.target.value.toUpperCase())}
                className="touch-input-field"
                placeholder="ICAO"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="input-cell-spatial">
              <label>Operational Cost Index (CI)</label>
              <input 
                type="number" 
                defaultValue={mission.costIndex}
                onBlur={(e) => updateMissionField('costIndex', e.target.value, 0, 150)}
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
                placeholder="e.g. CYOW CYMX CYYQ CYYT"
                style={{ textAlign: 'left', textTransform: 'uppercase', letterSpacing: '1px' }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Legality Status and Details */}
        <div className="results-section glass-panel highlight-accent">
          <h3>Dispatch Legality & Flight Status</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Takeoff Weight</span>
              <span className="value">{takeoffWeight.toLocaleString()} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Min Diversion Fuel</span>
              <span className="value" style={{ color: 'var(--accent-warn)' }}>{minimumDiversionFuel.toLocaleString()} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Landing Fuel Margin</span>
              <span className={`value ${legalLandingMargin < 0 ? 'text-danger' : 'text-success'}`}>
                {legalLandingMargin >= 0 ? `+${legalLandingMargin.toLocaleString()} lbs` : `${legalLandingMargin.toLocaleString()} lbs`}
              </span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Active Route String</span>
              <span className="val highlight" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}>
                {mission.routeString || "NO ACTIVE ROUTE"}
              </span>
            </div>
            <div className="table-row">
              <span>Planned Route Distance</span>
              <span>{totalDistance || 0} NM</span>
            </div>
            <div className="table-row">
              <span>Zero Fuel Weight (ZFW)</span>
              <span>{mission.zeroFuelWeight.toLocaleString()} lbs</span>
            </div>
            <div className="table-row">
              <span>Block Fuel Loaded</span>
              <span>{mission.blockFuel.toLocaleString()} lbs</span>
            </div>
          </div>

          {/* Regulatory Warning Alerts */}
          {legalLandingMargin < 0 ? (
            <div className="alert-banner danger" style={{ marginTop: '24px' }}>
              <span><strong>⚠️ DISPATCH ILLEGAL:</strong> Projected landing fuel margin ({projectedLandingFuel.toLocaleString()} lbs) is below Minimum Diversion Fuel (MDF) requirement of {minimumDiversionFuel.toLocaleString()} lbs. Adjust Block Fuel upward or optimize route fuel burn.</span>
            </div>
          ) : (
            <div className="alert-banner info" style={{ marginTop: '24px' }}>
              <span><strong>✓ DISPATCH LEGAL:</strong> Fuel loading plan meets Transport Canada / Part 121 alternate and reserve requirements. Legality margin: <strong>+{legalLandingMargin.toLocaleString()} lbs</strong>.</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Live Weather and Environmental Awareness */}
      <div className="glass-panel" style={{ marginTop: '24px' }}>
        <h3>Real-time Meteorological & Environmental Awareness</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginTop: '16px' }}>
          
          {/* Departure Weather Card */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Field Elevation: <strong>{weather.departure.elevation} ft</strong></span>
                    <span>Data Age: <strong>{getMetarAgeStr(weather.departure.obsTime)}</strong></span>
                  </div>
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
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Field Elevation: <strong>{weather.arrival.elevation} ft</strong></span>
                    <span>Data Age: <strong>{getMetarAgeStr(weather.arrival.obsTime)}</strong></span>
                  </div>
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

        </div>
      </div>
    </div>
  );
}
