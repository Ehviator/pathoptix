import React, { useState } from 'react';

export default function CalculatorDescent() {
  const [inputs, setInputs] = useState({
    cruiseFL: 370,
    targetAltitude: 3000,
    descentSpeed: 270,
    fpa: 3.0,
    windFactor: 15
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Descent Flight Path Angle & Profile Engine</h2>
        <p>Top-of-Descent (TOD) location calculators, speed schedules, and vertical path tracking.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Vertical Profile Inputs</h3>

          <div className="input-group">
            <label>Cruise Flight Level (FL): FL {inputs.cruiseFL}</label>
            <input 
              type="range" 
              min="150" 
              max="410" 
              step="10" 
              value={inputs.cruiseFL} 
              onChange={(e) => handleInputChange('cruiseFL', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Target Altitude: {inputs.targetAltitude.toLocaleString()} ft</label>
            <input 
              type="range" 
              min="0" 
              max="15000" 
              step="500" 
              value={inputs.targetAltitude} 
              onChange={(e) => handleInputChange('targetAltitude', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Descent Speed Schedule: {inputs.descentSpeed} kt</label>
            <input 
              type="range" 
              min="240" 
              max="310" 
              step="5" 
              value={inputs.descentSpeed} 
              onChange={(e) => handleInputChange('descentSpeed', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Flight Path Angle (FPA): {inputs.fpa.toFixed(1)}°</label>
            <input 
              type="range" 
              min="2.0" 
              max="4.0" 
              step="0.1" 
              value={inputs.fpa} 
              onChange={(e) => handleInputChange('fpa', parseFloat(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Average Wind in Descent: {inputs.windFactor} kt</label>
            <input 
              type="range" 
              min="-40" 
              max="60" 
              value={inputs.windFactor} 
              onChange={(e) => handleInputChange('windFactor', parseInt(e.target.value))} 
            />
            <span className="caption">Tailwind increases descent distance, headwind reduces it.</span>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Top-of-Descent (TOD) Calculations</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">TOD Distance</span>
              <span className="value">118 NM</span>
            </div>
            <div className="metric-box">
              <span className="label">Time to Descent</span>
              <span className="value">16:15 min</span>
            </div>
            <div className="metric-box">
              <span className="label">Average VSI</span>
              <span className="value">-2,100 ft/min</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Required Glide Ratio</span>
              <span className="val highlight">19.1 : 1</span>
            </div>
            <div className="table-row">
              <span>Descent Fuel Burn</span>
              <span>180 kg</span>
            </div>
            <div className="table-row">
              <span>Wind Adjusted TOD Distance</span>
              <span>{(118 + (inputs.windFactor * 0.1)).toFixed(1)} NM</span>
            </div>
            <div className="table-row">
              <span>Cabin Rate of Descent</span>
              <span>-350 ft/min</span>
            </div>
          </div>

          <div className="alert-banner info">
            <strong>Optimal Descent Guidance:</strong> Standard E195-E2 idle descent uses M0.78 transitioned to 270kt. An FPA of 3.0° provides a clean idle path under current wind conditions.
          </div>
        </div>
      </div>
    </div>
  );
}
