import React, { useState } from 'react';

export default function CalculatorCruise() {
  const [inputs, setInputs] = useState({
    weight: 52000,
    flightLevel: 350,
    isaDev: 0,
    costIndex: 15,
    wind: 10
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Cruise Economic Profile & Speed Optimizer</h2>
        <p>Dynamic modulation of Mach/IAS speeds and fuel flow optimization based on cost index and flight level.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>In-Flight Cruise Settings</h3>

          <div className="input-group">
            <label>Current Aircraft Weight: {inputs.weight.toLocaleString()} kg</label>
            <input 
              type="range" 
              min="38000" 
              max="58000" 
              step="500" 
              value={inputs.weight} 
              onChange={(e) => handleInputChange('weight', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Flight Level (FL): FL {inputs.flightLevel}</label>
            <input 
              type="range" 
              min="280" 
              max="410" 
              step="10" 
              value={inputs.flightLevel} 
              onChange={(e) => handleInputChange('flightLevel', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>ISA Deviation: {inputs.isaDev > 0 ? `+${inputs.isaDev}` : inputs.isaDev}°C</label>
            <input 
              type="range" 
              min="-20" 
              max="20" 
              value={inputs.isaDev} 
              onChange={(e) => handleInputChange('isaDev', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Cost Index (CI): {inputs.costIndex}</label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={inputs.costIndex} 
              onChange={(e) => handleInputChange('costIndex', parseInt(e.target.value))} 
            />
            <span className="caption">CI=0 for Max Range Cruise (MRC), CI=100 for maximum speed.</span>
          </div>

          <div className="input-group">
            <label>Headwind / Tailwind Component: {inputs.wind} kt</label>
            <input 
              type="range" 
              min="-60" 
              max="80" 
              value={inputs.wind} 
              onChange={(e) => handleInputChange('wind', parseInt(e.target.value))} 
            />
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Economic Profile Target Output</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Target Speed</span>
              <span className="value">M 0.78 / 268 kt</span>
            </div>
            <div className="metric-box">
              <span className="label">Total Fuel Flow</span>
              <span className="value">1,940 kg/h</span>
            </div>
            <div className="metric-box">
              <span className="label">Specific Range</span>
              <span className="value">0.232 NM/kg</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Optimal Flight Level</span>
              <span className="val highlight">FL 370</span>
            </div>
            <div className="table-row">
              <span>True Airspeed (TAS)</span>
              <span>448 kt</span>
            </div>
            <div className="table-row">
              <span>Ground Speed (GS)</span>
              <span>{448 + inputs.wind} kt</span>
            </div>
            <div className="table-row">
              <span>Max Operating FL (MGM Limit)</span>
              <span>FL 410</span>
            </div>
          </div>

          <div className="alert-banner info">
            <strong>Optimizer recommendation:</strong> Climb to <strong>FL 370</strong> yields a <strong>1.8% fuel saving</strong>. Wind shear profiles indicate stable headwind velocity up to FL390.
          </div>
        </div>
      </div>
    </div>
  );
}
