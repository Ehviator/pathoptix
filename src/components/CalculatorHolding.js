import React, { useState, useEffect } from 'react';
import { interpolate2D } from '../engine/interpolation.js';

export default function CalculatorHolding() {
  const [inputs, setInputs] = useState({
    weight: 105000, 
    altitude: 5000, 
    holdDuration: 20, 
    remainingFuel: 8000,
    iceState: 'OFF' 
  });

  const [holdingData, setHoldingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/holding_endurance.json')
      .then(res => res.json())
      .then(data => {
        setHoldingData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load holding database:", err);
        setLoading(false);
      });
  }, []);

  const handleManualEntry = (key, value, min, max) => {
    let parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;
    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  let fuelFlowPerHour = 2900; 
  let targetMatrixKey = 'anti_ice_off';

  if (inputs.iceState === 'ON') targetMatrixKey = 'anti_ice_on';
  if (inputs.iceState === 'ACCRETION') targetMatrixKey = 'ice_accretion';

  if (holdingData && holdingData.holding_fuel_matrix && holdingData.holding_fuel_matrix[targetMatrixKey]) {
    const matrix = holdingData.holding_fuel_matrix[targetMatrixKey];
    const interpResult = interpolate2D(
      inputs.weight,
      inputs.altitude,
      matrix.weights,
      matrix.altitudes,
      matrix.data
    );
    if (interpResult !== null) fuelFlowPerHour = Math.round(interpResult);
  }

  const fuelFlowPerMin = fuelFlowPerHour / 60;
  const plannedHoldBurn = Math.round(fuelFlowPerMin * inputs.holdDuration);

  const reserveFuelLimit = 2500;
  const usableHoldingFuel = Math.max(0, inputs.remainingFuel - reserveFuelLimit);
  const maxEnduranceMin = fuelFlowPerHour > 0 ? (usableHoldingFuel / fuelFlowPerHour) * 60 : 0;
  const maxEnduranceFormatted = `${Math.floor(maxEnduranceMin)} min`;

  let baseGreenDot = 185 + (inputs.weight - 85000) * 0.0011 + (inputs.altitude / 1000) * 0.5;
  if (inputs.iceState === 'ACCRETION') baseGreenDot += 28; 
  const bestHoldingSpeed = Math.round(baseGreenDot);

  if (loading) return <div className="panel-container"><p>Synchronizing Matrix...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Terminal Holding & Endurance Optimizer</h2>
        <div className="mode-toggle-bar">
          <button type="button" className={`btn-toggle ${inputs.iceState === 'OFF' ? 'active' : ''}`} onClick={() => setInputs(prev => ({ ...prev, iceState: 'OFF' }))}>Anti-Ice OFF</button>
          <button type="button" className={`btn-toggle ${inputs.iceState === 'ON' ? 'active' : ''}`} onClick={() => setInputs(prev => ({ ...prev, iceState: 'ON' }))}>Anti-Ice ON</button>
          <button type="button" className={`btn-toggle ${inputs.iceState === 'ACCRETION' ? 'active' : ''}`} onClick={() => setInputs(prev => ({ ...prev, iceState: 'ACCRETION' }))}>Ice Accretion</button>
        </div>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Holding Inputs</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Gross Weight (lbs)</label>
              <input 
                type="number" 
                key={`weight-${inputs.weight}`}
                defaultValue={inputs.weight}
                onBlur={(e) => handleManualEntry('weight', e.target.value, 85000, 130000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Holding Altitude (ft)</label>
              <input 
                type="number" 
                key={`alt-${inputs.altitude}`}
                defaultValue={inputs.altitude}
                onBlur={(e) => handleManualEntry('altitude', e.target.value, 1500, 25000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Fuel On-Board (lbs)</label>
              <input 
                type="number" 
                key={`fuel-${inputs.remainingFuel}`}
                defaultValue={inputs.remainingFuel}
                onBlur={(e) => handleManualEntry('remainingFuel', e.target.value, 3000, 15000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Hold Plan Time (min)</label>
              <input 
                type="number" 
                key={`holdTime-${inputs.holdDuration}`}
                defaultValue={inputs.holdDuration}
                onBlur={(e) => handleManualEntry('holdDuration', e.target.value, 5, 90)}
                className="touch-input-field"
              />
            </div>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Endurance Profile Output</h3>
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Planned Hold Burn</span>
              <span className="value">{plannedHoldBurn.toLocaleString()} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Maximum Endurance</span>
              <span className="value">{maxEnduranceFormatted}</span>
            </div>
            <div className="metric-box">
              <span className="label">Holding Fuel Flow</span>
              <span className="value">{fuelFlowPerHour.toLocaleString()} lbs/h</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Usable Fuel (Reserves Safe)</span><span className="val highlight">{usableHoldingFuel.toLocaleString()} lbs</span></div>
            <div className="table-row"><span>Best Endurance Speed</span><span className="val highlight">{bestHoldingSpeed} kt IAS</span></div>
            <div className="table-row"><span>Protected Fuel Reserve</span><span>{reserveFuelLimit.toLocaleString()} lbs</span></div>
          </div>

          {inputs.holdDuration > maxEnduranceMin ? (
            <div className="alert-banner danger">
              <strong>CRITICAL ALERT:</strong> Planned hold duration ({inputs.holdDuration} min) exceeds maximum endurance limit of {maxEnduranceFormatted}. Diversion or immediate landing priority is required.
            </div>
          ) : (maxEnduranceMin - inputs.holdDuration) < 15 ? (
            <div className="alert-banner warning">
              <strong>Caution:</strong> Narrow endurance safety margin. Hold exit leaves less than 15 minutes of fuel before reaching reserves. Coordinate with ATC.
            </div>
          ) : (
            <div className="alert-banner info">
              <strong>Holding clearance:</strong> Hold fuel burn is safe. Remaining fuel on-board permits hold with at least {Math.round(maxEnduranceMin - inputs.holdDuration)} minutes of buffer remaining.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
