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

  // Descent computations
  const altDiff = (inputs.cruiseFL * 100) - inputs.targetAltitude;
  
  // Base TOD rule-of-thumb: 3 NM per 1,000 ft of altitude loss
  const baseTOD = (altDiff / 1000) * 3;
  
  // Adjust based on FPA (steeper angle = shorter distance)
  const fpaFactor = 3.0 / inputs.fpa;
  
  // Speed adjustment (higher speed = longer descent due to deceleration requirements)
  const speedFactor = 1.0 + (inputs.descentSpeed - 270) * 0.0025;
  
  // Wind factor (positive is tailwind, negative is headwind)
  // Tailwind increases descent distance, headwind decreases it
  const windCorrection = (inputs.windFactor * (altDiff / 1000) * 0.075);
  
  const todDistance = Math.round(Math.max(10, (baseTOD * fpaFactor * speedFactor) + windCorrection));

  // Average Ground Speed in descent (average TAS is approx 370 kt)
  const averageTAS = 370;
  const averageGS = Math.max(100, averageTAS + inputs.windFactor);

  // Time in descent
  const timeMin = (todDistance / averageGS) * 60;
  const timeFormatted = `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

  // Required Vertical Speed Indicator (VSI) in ft/min
  // VSI = GS * 101.268 * tan(FPA)
  const vsi = Math.round(-1 * averageGS * 101.268 * Math.tan((inputs.fpa * Math.PI) / 180));

  // Glide ratio calculation (horizontal distance / vertical height)
  // Distance in feet = todDistance * 6076.1
  const glideRatio = altDiff > 0 ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10 : 0;

  // Fuel burn approximation: ~1.4 kg per NM in idle descent
  const fuelBurn = Math.round(todDistance * 1.35 + (inputs.windFactor * 0.05));

  // Cabin rate of descent (passenger comfort limit)
  const cabinRate = Math.round(-320 + (vsi + 1800) * 0.08);

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
            <label>Average Wind in Descent: {inputs.windFactor > 0 ? `+${inputs.windFactor}` : inputs.windFactor} kt</label>
            <input 
              type="range" 
              min="-40" 
              max="60" 
              value={inputs.windFactor} 
              onChange={(e) => handleInputChange('windFactor', parseInt(e.target.value))} 
            />
            <span className="caption">Positive values represent tailwind (pushes TOD further back), negative headwind.</span>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Top-of-Descent (TOD) Calculations</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">TOD Distance</span>
              <span className="value">{todDistance} NM</span>
            </div>
            <div className="metric-box">
              <span className="label">Time to Descent</span>
              <span className="value">{timeFormatted}</span>
            </div>
            <div className="metric-box">
              <span className="label">Average VSI</span>
              <span className="value">{vsi.toLocaleString()} ft/min</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Required Glide Ratio</span>
              <span className="val highlight">{glideRatio} : 1</span>
            </div>
            <div className="table-row">
              <span>Descent Fuel Burn</span>
              <span>{fuelBurn} kg</span>
            </div>
            <div className="table-row">
              <span>Wind Adjusted Shift</span>
              <span>{windCorrection > 0 ? `+${Math.round(windCorrection)}` : Math.round(windCorrection)} NM</span>
            </div>
            <div className="table-row">
              <span>Cabin Rate of Descent</span>
              <span>{cabinRate} ft/min</span>
            </div>
          </div>

          <div className="alert-banner info">
            {inputs.fpa > 3.3 ? (
              <span><strong>Vertical profile notice:</strong> A steep FPA of {inputs.fpa.toFixed(1)}° may require partial speedbrake application to maintain airspeed at {inputs.descentSpeed} kt.</span>
            ) : inputs.fpa < 2.5 ? (
              <span><strong>Vertical profile notice:</strong> A shallow FPA of {inputs.fpa.toFixed(1)}° increases engine flight idle run times and fuel burn.</span>
            ) : (
              <span><strong>Optimal Descent Guidance:</strong> Standard idle descent uses M0.78 transitioned to {inputs.descentSpeed}kt. An FPA of {inputs.fpa.toFixed(1)}° provides a clean, throttle-idle path.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
