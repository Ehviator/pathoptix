import React, { useState } from 'react';

export default function EmergencySuite() {
  const [inputs, setInputs] = useState({
    cruiseWeight: 115000, 
    oatDev: 10,
    antiIce: false,
    selectedTerrainAlt: 8000
  });

  const handleManualEntry = (key, value, min, max) => {
    let parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;
    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  const cruiseWeightKg = inputs.cruiseWeight / 2.20462;
  const baseCeiling = 28500; 
  const weightPenalty = (cruiseWeightKg - 40000) * 0.38;
  const tempPenalty = inputs.oatDev * 180;
  const antiIcePenalty = inputs.antiIce ? 1200 : 0;
  
  const oeiCeiling = Math.max(10000, Math.round(baseCeiling - weightPenalty - tempPenalty - antiIcePenalty));
  const oeiFL = Math.floor(oeiCeiling / 100);

  const driftdownSpeed = Math.round(198 + (cruiseWeightKg - 40000) * 0.0014 + inputs.oatDev * 0.2);
  const clearanceMargin = oeiCeiling - inputs.selectedTerrainAlt;

  const driftdownDistance = Math.round(58 + (cruiseWeightKg - 40000) * 0.0012 + inputs.oatDev * 0.4);
  const driftdownTimeMin = 13.5 + (cruiseWeightKg - 40000) * 0.0003 + inputs.oatDev * 0.08;
  const driftdownTime = `${Math.floor(driftdownTimeMin)}:${Math.round((driftdownTimeMin % 1) * 60).toString().padStart(2, '0')} min`;

  const oeiFuelFlowKg = 920 + (cruiseWeightKg - 40000) * 0.015 + inputs.oatDev * 5;
  const oeiFuelFlowLbs = Math.round(oeiFuelFlowKg * 2.20462);

  return (
    <div className="panel-container">
      <div className="panel-header warning-theme">
        <h2>Emergency OEI Driftdown Suite</h2>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel warning-border">
          <h3>OEI Parameters</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Current Weight (lbs)</label>
              <input 
                type="number" 
                key={`weight-${inputs.cruiseWeight}`}
                defaultValue={inputs.cruiseWeight}
                onBlur={(e) => handleManualEntry('cruiseWeight', e.target.value, 90000, 130000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>OAT Deviation (°C)</label>
              <input 
                type="number" 
                key={`oat-${inputs.oatDev}`}
                defaultValue={inputs.oatDev}
                onBlur={(e) => handleManualEntry('oatDev', e.target.value, -15, 25)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Terrain Altitude Constraint (ft)</label>
              <input 
                type="number" 
                key={`terrain-${inputs.selectedTerrainAlt}`}
                defaultValue={inputs.selectedTerrainAlt}
                onBlur={(e) => handleManualEntry('selectedTerrainAlt', e.target.value, 2000, 16000)}
                className="touch-input-field"
              />
            </div>
          </div>

          <div className="input-group-toggle" style={{ marginTop: '24px' }}>
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={inputs.antiIce} 
                onChange={(e) => setInputs(prev => ({ ...prev, antiIce: e.target.checked }))} 
              />
              <span className="toggle-label">Engine Anti-Ice active</span>
            </label>
          </div>
        </div>

        <div className="results-section glass-panel highlight-warning">
          <h3>OEI Driftdown Target Margins</h3>
          <div className="metrics-summary">
            <div className="metric-box warning-metric">
              <span className="label">OEI Net Ceiling</span>
              <span className="value">FL {oeiFL}</span>
            </div>
            <div className="metric-box warning-metric">
              <span className="label">Driftdown Speed</span>
              <span className="value">{driftdownSpeed} kt</span>
            </div>
            <div className="metric-box warning-metric">
              <span className="label">Clearance Margin</span>
              <span className={`value ${clearanceMargin < 2000 ? 'text-danger' : ''}`}>
                {clearanceMargin > 0 ? `+${clearanceMargin.toLocaleString()}` : clearanceMargin.toLocaleString()} ft
              </span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Driftdown Distance</span><span className="val highlight">{driftdownDistance} NM</span></div>
            <div className="table-row"><span>Time to Level-off</span><span>{driftdownTime}</span></div>
            <div className="table-row"><span>Single Engine Fuel Flow</span><span>{oeiFuelFlowLbs.toLocaleString()} lbs/h</span></div>
          </div>

          {clearanceMargin < 0 ? (
            <div className="alert-banner danger">
              <strong>CRITICAL:</strong> Terrain Clearance margin is **UNSAFE** ({clearanceMargin.toLocaleString()} ft). Driftdown level-off ceiling (FL {oeiFL}) is below the local terrain limit of {inputs.selectedTerrainAlt.toLocaleString()} ft. Plan escape route immediately!
            </div>
          ) : clearanceMargin < 2000 ? (
            <div className="alert-banner warning">
              <strong>Caution:</strong> Terrain clearance margin is narrow (+{clearanceMargin.toLocaleString()} ft). Maintain exact Green Dot driftdown speed ({driftdownSpeed} kt) to maximize flight path angle.
            </div>
          ) : (
            <div className="alert-banner info">
              <strong>OEI clearance margin:</strong> Terrain clearance is **SAFE**. Net OEI ceiling of {oeiCeiling.toLocaleString()} ft exceeds the local terrain constraint of {inputs.selectedTerrainAlt.toLocaleString()} ft by {clearanceMargin.toLocaleString()} ft.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
