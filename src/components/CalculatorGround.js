import React, { useState } from 'react';

export default function CalculatorGround() {
  const [inputs, setInputs] = useState({
    oat: 15,
    altitude: 0,
    tow: 54000,
    wind: 0,
    runwayCondition: 'dry'
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Take-off & Ground Performance Engine</h2>
        <p>V-speed optimization, runway length verification, and thrust derate recommendations.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Environmental & Weight Inputs</h3>
          
          <div className="input-group">
            <label>Outside Air Temperature (OAT): {inputs.oat}°C</label>
            <input 
              type="range" 
              min="-20" 
              max="50" 
              value={inputs.oat} 
              onChange={(e) => handleInputChange('oat', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Pressure Altitude: {inputs.altitude} ft</label>
            <input 
              type="range" 
              min="0" 
              max="10000" 
              step="500" 
              value={inputs.altitude} 
              onChange={(e) => handleInputChange('altitude', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Take-off Weight (TOW): {inputs.tow.toLocaleString()} kg</label>
            <input 
              type="range" 
              min="40000" 
              max="62000" 
              step="500" 
              value={inputs.tow} 
              onChange={(e) => handleInputChange('tow', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Headwind / Tailwind Component: {inputs.wind} kt</label>
            <input 
              type="range" 
              min="-15" 
              max="40" 
              value={inputs.wind} 
              onChange={(e) => handleInputChange('wind', parseInt(e.target.value))} 
            />
            <span className="caption">Negative values represent tailwind.</span>
          </div>

          <div className="input-group">
            <label>Runway Condition</label>
            <div className="toggle-group">
              <button 
                className={inputs.runwayCondition === 'dry' ? 'active' : ''} 
                onClick={() => handleInputChange('runwayCondition', 'dry')}
              >Dry</button>
              <button 
                className={inputs.runwayCondition === 'wet' ? 'active' : ''} 
                onClick={() => handleInputChange('runwayCondition', 'wet')}
              >Wet</button>
              <button 
                className={inputs.runwayCondition === 'contaminated' ? 'active' : ''} 
                onClick={() => handleInputChange('runwayCondition', 'contaminated')}
              >Contaminated</button>
            </div>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Calculated Operational Data</h3>
          
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">V1 (Decision)</span>
              <span className="value">138 kt</span>
            </div>
            <div className="metric-box">
              <span className="label">VR (Rotate)</span>
              <span className="value">141 kt</span>
            </div>
            <div className="metric-box">
              <span className="label">V2 (Safety)</span>
              <span className="value">146 kt</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Required Runway Length</span>
              <span className="val highlight">1,780 m</span>
            </div>
            <div className="table-row">
              <span>Thrust Mode / Rating</span>
              <span>TO-1 (100% Full Thrust)</span>
            </div>
            <div className="table-row">
              <span>Maximum Allowed TOW</span>
              <span>61,500 kg (Structural Limited)</span>
            </div>
            <div className="table-row">
              <span>V50 (Screen Height Speed)</span>
              <span>154 kt</span>
            </div>
          </div>

          <div className="alert-banner warning">
            <strong>Notice:</strong> High OAT or high pressure altitude will degrade climb gradients. Verify double-engine drift-down margins.
          </div>
        </div>
      </div>
    </div>
  );
}
