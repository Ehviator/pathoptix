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

  const handleManualEntry = (key, value, min, max) => {
    let parsed = key === 'fpa' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) return;
    
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));
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

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Cruise Flight Level (FL)</label>
              <input 
                type="number" 
                defaultValue={inputs.cruiseFL}
                onBlur={(e) => handleManualEntry('cruiseFL', e.target.value, 150, 410)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Altitude (ft)</label>
              <input 
                type="number" 
                defaultValue={inputs.targetAltitude}
                onBlur={(e) => handleManualEntry('targetAltitude', e.target.value, 0, 15000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Descent Speed (KIAS)</label>
              <input 
                type="number" 
                defaultValue={inputs.descentSpeed}
                onBlur={(e) => handleManualEntry('descentSpeed', e.target.value, 240, 310)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Path Angle (FPA)</label>
              <input 
                type="number" 
                step="0.1"
                defaultValue={inputs.fpa}
                onBlur={(e) => handleManualEntry('fpa', e.target.value, 2.0, 4.0)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Average Wind (kt)</label>
              <input 
                type="number" 
                defaultValue={inputs.windFactor}
                onBlur={(e) => handleManualEntry('windFactor', e.target.value, -200, 200)}
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
