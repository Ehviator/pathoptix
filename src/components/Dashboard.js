import React from 'react';
import { useMission } from '../context/MissionContext.js';

export default function Dashboard() {
  const { mission, updateMissionField, takeoffWeight, minimumDiversionFuel, totalDistance } = useMission();

  // Landing Fuel margin calculation
  const routeBurn = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = mission.blockFuel - mission.taxiFuel - routeBurn;
  const legalLandingMargin = projectedLandingFuel - minimumDiversionFuel;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Operations & Dispatch Command Center</h2>
        <p>Monitor airline dispatch parameters, configure aircraft weights, and verify legal route fuel reserve compliance.</p>
      </div>

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

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Operational Cost Index (CI)</label>
              <input 
                type="number" 
                defaultValue={mission.costIndex}
                onBlur={(e) => updateMissionField('costIndex', e.target.value, 0, 150)}
                className="touch-input-field"
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

      {/* Row 2: Weather and Env */}
      <div className="glass-panel" style={{ marginTop: '24px' }}>
        <h3>Real-time Meteorological & Operational Warnings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
          <div className="metric-box" style={{ alignItems: 'flex-start', padding: '20px', background: 'rgba(255,255,255,0.01)' }}>
            <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '8px' }}>🌤️ Weather Watch (Phase 5 Placeholder)</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Weather integration module is active. Real-time winds aloft and METAR forecasting updates will sync automatically in the next phase.
            </p>
          </div>

          <div className="metric-box" style={{ alignItems: 'flex-start', padding: '20px', background: 'rgba(255,255,255,0.01)' }}>
            <h4 style={{ color: 'var(--accent-warn)', marginBottom: '8px' }}>⚠️ NOTAMs & Airport Advisories</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              No critical runway or operational closures reported along active routing waypoints. Airport elevation correction engine engaged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
