import React, { useState } from 'react';

export default function EmergencySuite() {
  const [inputs, setInputs] = useState({
    cruiseWeight: 115000, // in lbs
    oatDev: 10,
    antiIce: false,
    selectedTerrainAlt: 8000
  });

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      const nextVal = prev[key] + step;
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  // Convert weight to KG internally for calculations
  const cruiseWeightKg = inputs.cruiseWeight / 2.20462;

  // OEI (One Engine Inoperative) Ceiling calculation
  const baseCeiling = 28500; // Standard OEI ceiling at 40,000 kg
  const weightPenalty = (cruiseWeightKg - 40000) * 0.38;
  const tempPenalty = inputs.oatDev * 180;
  const antiIcePenalty = inputs.antiIce ? 1200 : 0;
  
  const oeiCeiling = Math.max(10000, Math.round(baseCeiling - weightPenalty - tempPenalty - antiIcePenalty));
  const oeiFL = Math.floor(oeiCeiling / 100);

  // Driftdown Speed (Green Dot)
  const driftdownSpeed = Math.round(198 + (cruiseWeightKg - 40000) * 0.0014 + inputs.oatDev * 0.2);

  // Clearance Margin over terrain
  const clearanceMargin = oeiCeiling - inputs.selectedTerrainAlt;

  // Driftdown Distance & Time to level-off
  const driftdownDistance = Math.round(58 + (cruiseWeightKg - 40000) * 0.0012 + inputs.oatDev * 0.4);
  const driftdownTimeMin = 13.5 + (cruiseWeightKg - 40000) * 0.0003 + inputs.oatDev * 0.08;
  const driftdownTime = `${Math.floor(driftdownTimeMin)}:${Math.round((driftdownTimeMin % 1) * 60).toString().padStart(2, '0')} min`;

  // Level-off Fuel Flow (OEI) - Single Engine fuel flow in lbs/h (Porter Airlines requirement)
  const oeiFuelFlowKg = 920 + (cruiseWeightKg - 40000) * 0.015 + inputs.oatDev * 5;
  const oeiFuelFlowLbs = Math.round(oeiFuelFlowKg * 2.20462);

  return (
    <div className="panel-container">
      <div className="panel-header warning-theme">
        <h2>Emergency OEI Driftdown & Suite</h2>
        <p>Tactical decision support for single-engine failure (OEI) during cruise. Computes drift-down paths and terrain clearance margins (Units: LBS).</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel warning-border">
          <h3>OEI Atmospheric & Status Inputs</h3>

          <div className="input-group-tactile">
            <label>Current Weight (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('cruiseWeight', -1000, 90000, 130000)} className="btn-step">──</button>
              <span className="value-display">{inputs.cruiseWeight.toLocaleString()} lbs</span>
              <button type="button" onClick={() => adjustInput('cruiseWeight', 1000, 90000, 130000)} className="btn-step">+</button>
            </div>
            <span className="caption">Equivalent to {Math.round(cruiseWeightKg).toLocaleString()} kg.</span>
          </div>

          <div className="input-group-tactile">
            <label>OAT Deviation (from ISA)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('oatDev', -1, -15, 25)} className="btn-step">──</button>
              <span className="value-display">{inputs.oatDev > 0 ? `+${inputs.oatDev}` : inputs.oatDev}°C</span>
              <button type="button" onClick={() => adjustInput('oatDev', 1, -15, 25)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Terrain Altitude to Clear (ft)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('selectedTerrainAlt', -500, 2000, 16000)} className="btn-step">──</button>
              <span className="value-display">{inputs.selectedTerrainAlt.toLocaleString()} ft</span>
              <button type="button" onClick={() => adjustInput('selectedTerrainAlt', 500, 2000, 16000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-toggle">
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={inputs.antiIce} 
                onChange={(e) => setInputs(prev => ({ ...prev, antiIce: e.target.checked }))} 
              />
              <span className="toggle-label">Engine Anti-Ice Configuration ACTIVE</span>
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
            <div className="table-row">
              <span>Driftdown Distance to Level-off</span>
              <span className="val highlight">{driftdownDistance} NM</span>
            </div>
            <div className="table-row">
              <span>Driftdown Time to Level-off</span>
              <span>{driftdownTime}</span>
            </div>
            <div className="table-row">
              <span>Level-off Fuel Flow (OEI)</span>
              <span>{oeiFuelFlowLbs.toLocaleString()} lbs/h</span>
            </div>
            <div className="table-row">
              <span>Anti-Ice Ceiling Penalty</span>
              <span>{inputs.antiIce ? '-1,200 ft' : '0 ft'}</span>
            </div>
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
