import React from 'react';
import { useMission } from '../context/MissionContext.js';

export default function ReviewFuel() {
  const { 
    mission, 
    updateMissionField, 
    takeoffWeight, 
    minimumDiversionFuel, 
    totalDistance, 
    tripFuelCalc,
    contingencyFuelCalc,
    alternateDistance,
    alternateFuelCalc,
    finalReserveFuelCalc,
    requiredBlockFuel,
    isBlockFuelSufficient
  } = useMission();

  const handleAutoLoadLegalFuel = () => {
    updateMissionField('alternateFuel', alternateFuelCalc);
    updateMissionField('finalReserveFuel', finalReserveFuelCalc);
    updateMissionField('blockFuel', requiredBlockFuel);
  };

  const routeBurn = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = mission.blockFuel - mission.taxiFuel - routeBurn;
  const legalLandingMargin = projectedLandingFuel - minimumDiversionFuel;

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
        <h2>⛽ Review Fuel Planning & Reserve Legality</h2>
        <p>Configure block fuel loads and verify regulatory reserve margins (CARs 705).</p>
      </div>

      {!isBlockFuelSufficient && (
        <div className="alert-banner danger" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 24px 0', background: 'rgba(255, 74, 74, 0.12)', border: '1px solid rgba(255, 74, 74, 0.25)', padding: '12px', borderRadius: '8px', color: '#fff', fontSize: '13px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>
            <strong>INSUFFICIENT BLOCK FUEL LOADED:</strong> Total block fuel load ({(mission.blockFuel || 0).toLocaleString()} lbs) is less than the legally required sum ({(requiredBlockFuel || 0).toLocaleString()} lbs). Load legal fuel or reduce payload.
          </span>
        </div>
      )}

      <div className="panel-body grid-2col">
        {/* Left Column: Input sliders / fields */}
        <div className="input-section glass-panel">
          <h3>Fuel Dispatch Setup</h3>
          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Block Fuel (lbs)</label>
              <input 
                type="number" 
                key={mission.blockFuel}
                defaultValue={mission.blockFuel}
                onBlur={(e) => updateMissionField('blockFuel', e.target.value, 2000, 30000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Taxi Fuel (lbs)</label>
              <input 
                type="number" 
                key={mission.taxiFuel}
                defaultValue={mission.taxiFuel}
                onBlur={(e) => updateMissionField('taxiFuel', e.target.value, 100, 2000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Alternate Fuel (lbs)</label>
              <input 
                type="number" 
                key={mission.alternateFuel}
                defaultValue={mission.alternateFuel}
                onBlur={(e) => updateMissionField('alternateFuel', e.target.value, 0, 10000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Final Reserve Fuel (lbs)</label>
              <input 
                type="number" 
                key={mission.finalReserveFuel}
                defaultValue={mission.finalReserveFuel}
                onBlur={(e) => updateMissionField('finalReserveFuel', e.target.value, 1000, 10000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Planned Fuel Burn (lbs)</label>
              <input 
                type="number" 
                key={mission.plannedFuelBurn}
                defaultValue={mission.plannedFuelBurn}
                onBlur={(e) => updateMissionField('plannedFuelBurn', e.target.value, 0, 25000)}
                className="touch-input-field"
              />
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-start' }}>
            <button
              onClick={handleAutoLoadLegalFuel}
              className="touch-action-btn primary"
              style={{
                background: 'rgba(0, 168, 150, 0.15)',
                border: '1px solid var(--accent-cyan)',
                color: '#fff',
                fontWeight: '600',
                padding: '10px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(0, 168, 150, 0.3)'}
              onMouseLeave={(e) => e.target.style.background = 'rgba(0, 168, 150, 0.15)'}
            >
              🔄 Auto-Load Legal Fuel ({(requiredBlockFuel || 0).toLocaleString()} lbs)
            </button>
          </div>
        </div>

        {/* Right Column: Status & Legality Breakdown */}
        <div className="results-section glass-panel highlight-accent">
          <h3>Fuel Legality Breakdown</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Takeoff Weight</span>
              <span className="value">{takeoffWeight.toLocaleString()} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Block Fuel</span>
              <span className="value" style={{ color: 'var(--accent-cyan)' }}>{(mission.blockFuel || 0).toLocaleString()} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Projected Landing Fuel</span>
              <span className={`value ${projectedLandingFuel < 0 ? 'text-danger' : 'text-success'}`}>
                {projectedLandingFuel.toLocaleString()} lbs
              </span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', fontWeight: '700', color: 'var(--text-secondary)', background: 'transparent' }}>
              <span>Fuel Category</span>
              <div style={{ display: 'flex', gap: '30px' }}>
                <span style={{ width: '95px', textAlign: 'right' }}>Planned</span>
                <span style={{ width: '95px', textAlign: 'right' }}>Required</span>
              </div>
            </div>

            <div className="table-row">
              <span>Planned Trip Fuel Burn</span>
              <div style={{ display: 'flex', gap: '30px' }}>
                <span style={{ width: '95px', textAlign: 'right', color: '#fff' }} className="num-val">{(mission.plannedFuelBurn || 0).toLocaleString()} lbs</span>
                <span style={{ width: '95px', textAlign: 'right', color: 'var(--text-secondary)' }} className="num-val">{tripFuelCalc.toLocaleString()} lbs</span>
              </div>
            </div>

            <div className="table-row">
              <span>Contingency Fuel (5%)</span>
              <div style={{ display: 'flex', gap: '30px' }}>
                <span style={{ width: '95px', textAlign: 'right', color: '#fff' }} className="num-val">{contingencyFuelCalc.toLocaleString()} lbs</span>
                <span style={{ width: '95px', textAlign: 'right', color: 'var(--text-secondary)' }} className="num-val">{contingencyFuelCalc.toLocaleString()} lbs</span>
              </div>
            </div>

            <div className="table-row">
              <span>Alternate Fuel ({alternateDistance} NM)</span>
              <div style={{ display: 'flex', gap: '30px' }}>
                <span style={{ width: '95px', textAlign: 'right', color: (mission.alternateFuel || 0) < alternateFuelCalc ? 'var(--accent-warn)' : '#fff' }} className="num-val">
                  {(mission.alternateFuel || 0).toLocaleString()} lbs
                </span>
                <span style={{ width: '95px', textAlign: 'right', color: 'var(--text-secondary)' }} className="num-val">
                  {alternateFuelCalc.toLocaleString()} lbs
                </span>
              </div>
            </div>

            <div className="table-row">
              <span>Final Reserve Fuel (30m)</span>
              <div style={{ display: 'flex', gap: '30px' }}>
                <span style={{ width: '95px', textAlign: 'right', color: (mission.finalReserveFuel || 0) < finalReserveFuelCalc ? 'var(--accent-warn)' : '#fff' }} className="num-val">
                  {(mission.finalReserveFuel || 0).toLocaleString()} lbs
                </span>
                <span style={{ width: '95px', textAlign: 'right', color: 'var(--text-secondary)' }} className="num-val">
                  {finalReserveFuelCalc.toLocaleString()} lbs
                </span>
              </div>
            </div>

            <div className="table-row" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '10px', marginTop: '10px' }}>
              <strong>Block Fuel / Min Legal</strong>
              <div style={{ display: 'flex', gap: '30px' }}>
                <strong style={{ width: '95px', textAlign: 'right', color: !isBlockFuelSufficient ? 'var(--accent-crit)' : 'var(--accent-green)' }} className="num-val">
                  {(mission.blockFuel || 0).toLocaleString()} lbs
                </strong>
                <strong style={{ width: '95px', textAlign: 'right', color: 'var(--accent-cyan)' }} className="num-val">
                  {requiredBlockFuel.toLocaleString()} lbs
                </strong>
              </div>
            </div>

            <div className="table-row">
              <strong>Minimum Diversion Fuel (MDF)</strong>
              <div style={{ display: 'flex', gap: '30px' }}>
                <strong style={{ width: '95px', textAlign: 'right', color: minimumDiversionFuel < (alternateFuelCalc + finalReserveFuelCalc) ? 'var(--accent-warn)' : '#fff' }} className="num-val">
                  {minimumDiversionFuel.toLocaleString()} lbs
                </strong>
                <strong style={{ width: '95px', textAlign: 'right', color: 'var(--accent-warn)' }} className="num-val">
                  {(alternateFuelCalc + finalReserveFuelCalc).toLocaleString()} lbs
                </strong>
              </div>
            </div>

            <div className="table-row" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '10px', marginTop: '10px' }}>
              <strong>Destination Margin above MDF</strong>
              <div style={{ display: 'flex', gap: '30px' }}>
                <strong style={{ width: '95px', textAlign: 'right', color: legalLandingMargin < 0 ? 'var(--accent-crit)' : 'var(--accent-green)' }} className="num-val">
                  {legalLandingMargin >= 0 ? `+${legalLandingMargin.toLocaleString()}` : `${legalLandingMargin.toLocaleString()}`} lbs
                </strong>
                <strong style={{ width: '95px', textAlign: 'right', color: 'var(--text-secondary)' }} className="num-val">
                  {(projectedLandingFuel - (alternateFuelCalc + finalReserveFuelCalc)).toLocaleString()} lbs
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
