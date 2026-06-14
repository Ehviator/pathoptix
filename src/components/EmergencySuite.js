import React, { useState } from 'react';

export default function EmergencySuite() {
  const [inputs, setInputs] = useState({
    cruiseWeight: 115000, // in lbs
    oatDev: 10,
    antiIce: false,
    selectedTerrainAlt: 8000
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
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

          <div className="input-group">
            <label>Current Weight: {inputs.cruiseWeight.toLocaleString()} lbs</label>
            <input 
              type="range" 
              min="90000" 
              max="130000" 
              step="1000" 
              value={inputs.cruiseWeight} 
              onChange={(e) => handleInputChange('cruiseWeight', parseInt(e.target.value))} 
            />
            <span className="caption">Equivalent to {Math.round(cruiseWeightKg).toLocaleString()} kg.</span>
          </div>

          <div className="input-group">
            <label>OAT Deviation (from ISA): {inputs.oatDev > 0 ? `+${inputs.oatDev}` : inputs.oatDev}°C</label>
            <input 
              type="range" 
              min="-15" 
              max="25" 
              value={inputs.oatDev} 
              onChange={(e) => handleInputChange('oatDev', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Terrain Altitude to Clear: {inputs.selectedTerrainAlt.toLocaleString()} ft</label>
            <input 
              type="range" 
              min="2000" 
              max="16000" 
              step="500" 
              value={inputs.selectedTerrainAlt} 
              onChange={(e) => handleInputChange('selectedTerrainAlt', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group toggle-group-container">
            <label>Engine Anti-Ice Configuration</label>
            <div className="toggle-group">
              <button 
                className={inputs.antiIce === false ? 'active' : ''} 
                onClick={() => handleInputChange('antiIce', false)}
              >Engine Anti-Ice OFF</button>
              <button 
                className={inputs.antiIce === true ? 'active' : ''} 
                onClick={() => handleInputChange('antiIce', true)}
              >Engine Anti-Ice ON</button>
            </div>
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
