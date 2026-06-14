import React, { useState } from 'react';

export default function CalculatorDescent() {
  const [inputs, setInputs] = useState({
    cruiseFL: 370,
    targetAltitude: 3000,
    descentSpeed: 270,
    fpa: 3.0,
    windFactor: 15,
    antiIce: false
  });

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      let nextVal = prev[key] + step;
      if (key === 'fpa') nextVal = Math.round(nextVal * 10) / 10;
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  const altDiff = (inputs.cruiseFL * 100) - inputs.targetAltitude;
  const baseTOD = (altDiff / 1000) * 3;
  const fpaFactor = 3.0 / inputs.fpa;
  const speedFactor = 1.0 + (inputs.descentSpeed - 270) * 0.0025;
  const windCorrection = (inputs.windFactor * (altDiff / 1000) * 0.075);
  
  const todDistance = Math.round(Math.max(10, (baseTOD * fpaFactor * speedFactor) + windCorrection));
  const averageTAS = 370;
  const averageGS = Math.max(100, averageTAS + inputs.windFactor);
  const timeMin = (todDistance / averageGS) * 60;
  const timeFormatted = `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

  const vsi = Math.round(-1 * averageGS * 101.268 * Math.tan((inputs.fpa * Math.PI) / 180));
  const glideRatio = altDiff > 0 ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10 : 0;

  // Anti-Ice engine flight-idle high thrust correction scaling
  const baseFuelBurnRate = inputs.antiIce ? 3.4 : 3.0; 
  const fuelFlowLbs = Math.round(todDistance * baseFuelBurnRate + (inputs.windFactor * 0.11));
  const cabinRate = Math.round(-320 + (vsi + 1800) * 0.08);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Descent Flight Path Angle & Profile Engine</h2>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Vertical Profile Inputs</h3>

          <div className="input-group-tactile">
            <label>Cruise Flight Level (FL)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('cruiseFL', -10, 150, 410)} className="btn-step">──</button>
              <span className="value-display">FL {inputs.cruiseFL}</span>
              <button type="button" onClick={() => adjustInput('cruiseFL', 10, 150, 410)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Target Altitude (ft)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('targetAltitude', -500, 0, 15000)} className="btn-step">──</button>
              <span className="value-display">{inputs.targetAltitude.toLocaleString()} ft</span>
              <button type="button" onClick={() => adjustInput('targetAltitude', 500, 0, 15000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Descent Speed Schedule (KIAS)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('descentSpeed', -5, 240, 310)} className="btn-step">──</button>
              <span className="value-display">{inputs.descentSpeed} kt</span>
              <button type="button" onClick={() => adjustInput('descentSpeed', 5, 240, 310)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Flight Path Angle (FPA)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('fpa', -0.1, 2.0, 4.0)} className="btn-step">──</button>
              <span className="value-display">{inputs.fpa.toFixed(1)}°</span>
              <button type="button" onClick={() => adjustInput('fpa', 0.1, 2.0, 4.0)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Average Wind in Descent</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('windFactor', -5, -200, 200)} className="btn-step">──</button>
              <span className="value-display">{inputs.windFactor >= 0 ? `+${inputs.windFactor} TW` : `${Math.abs(inputs.windFactor)} HW`}</span>
              <button type="button" onClick={() => adjustInput('windFactor', 5, -200, 200)} className="btn-step">+</button>
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

        <div className="results-section glass-panel highlight-accent">
          <h3>Top-of-Descent (TOD) Calculations</h3>
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">TOD Distance</span>
              <span className="value">{todDistance} NM</span>
            </div>
            <div className="metric-box">
              <span className="label">Time in Descent</span>
              <span className="value">{timeFormatted}</span>
            </div>
            <div className="metric-box">
              <span className="label">Average VSI</span>
              <span className="value">{vsi.toLocaleString()} ft/min</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Required Glide Ratio</span><span className="val highlight">{glideRatio} : 1</span></div>
            <div className="table-row"><span>Descent Fuel Burn</span><span>{fuelFlowLbs} lbs</span></div>
            <div className="table-row"><span>Cabin Vertical Velocity</span><span>{cabinRate} ft/min</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
