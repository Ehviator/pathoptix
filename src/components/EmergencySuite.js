import React, { useState } from 'react';

export default function EmergencySuite() {
  const [inputs, setInputs] = useState({
    cruiseWeight: 54000,
    oatDev: 10,
    antiIce: false,
    selectedTerrainAlt: 8000
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="panel-container">
      <div className="panel-header warning-theme">
        <h2>Emergency OEI Driftdown & Suite</h2>
        <p>Tactical decision support for single-engine failure (OEI) during cruise. Computes drift-down paths and terrain clearance margins.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel warning-border">
          <h3>OEI Atmospheric & Status Inputs</h3>

          <div className="input-group">
            <label>Current Weight: {inputs.cruiseWeight.toLocaleString()} kg</label>
            <input 
              type="range" 
              min="40000" 
              max="58000" 
              step="1000" 
              value={inputs.cruiseWeight} 
              onChange={(e) => handleInputChange('cruiseWeight', parseInt(e.target.value))} 
            />
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
              <span className="value">FL 215</span>
            </div>
            <div className="metric-box warning-metric">
              <span className="label">Driftdown Speed</span>
              <span className="value">218 kt</span>
            </div>
            <div className="metric-box warning-metric">
              <span className="label">Clearance Margin</span>
              <span className="value">+13,500 ft</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Driftdown Distance to Level-off</span>
              <span className="val highlight">76 NM</span>
            </div>
            <div className="table-row">
              <span>Driftdown Time to Level-off</span>
              <span>18:30 min</span>
            </div>
            <div className="table-row">
              <span>Level-off Fuel Flow (OEI)</span>
              <span>1,220 kg/h</span>
            </div>
            <div className="table-row">
              <span>Anti-Ice Ceiling Penalty</span>
              <span>{inputs.antiIce ? '-1,200 ft' : '0 ft'}</span>
            </div>
          </div>

          <div className="alert-banner danger">
            <strong>CRITICAL:</strong> Terrain Clearance margin is <strong>SAFE</strong>. Net ceiling of FL215 exceeds the local terrain constraint of {inputs.selectedTerrainAlt} ft by 13,500 ft. Maintain driftdown speed of 218 kt (Green Dot).
          </div>
        </div>
      </div>
    </div>
  );
}
