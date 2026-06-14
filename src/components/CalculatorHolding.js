import React, { useState, useEffect } from 'react';
import { interpolate2D } from '../engine/interpolation.js';

export default function CalculatorHolding() {
  const [inputs, setInputs] = useState({
    weight: 105000, 
    altitude: 5000, 
    holdDuration: 20, 
    remainingFuel: 8000,
    iceState: 'OFF' // States: 'OFF', 'ON' (Anti-Ice), 'ACCRETION' (Structural Drag)
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

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      const nextVal = prev[key] + step;
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  let fuelFlowPerHour = 2900; // Baseline default fallback
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
    if (interpResult !== null) {
      fuelFlowPerHour = Math.round(interpResult);
    }
  }

  const fuelFlowPerMin = fuelFlowPerHour / 60;
  const plannedHoldBurn = Math.round(fuelFlowPerMin * inputs.holdDuration);

  // Reserve limit configuration parameters
  const reserveFuelLimit = 2500;
  const usableHoldingFuel = Math.max(0, inputs.remainingFuel - reserveFuelLimit);
  const maxEnduranceMin = fuelFlowPerHour > 0 ? (usableHoldingFuel / fuelFlowPerHour) * 60 : 0;
  const maxEnduranceFormatted = `${Math.floor(maxEnduranceMin)} min`;

  // Best holding speed (Green Dot matching ice accretion structural drag profiles)
  let baseGreenDot = 185 + (inputs.weight - 85000) * 0.0011 + (inputs.altitude / 1000) * 0.5;
  if (inputs.iceState === 'ACCRETION') baseGreenDot += 28; // Airframe icing speed penalty boundary adjustment
  const bestHoldingSpeed = Math.round(baseGreenDot);

  if (loading) return <div className="panel-container"><p>Loading Endurance Database...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Terminal Holding & Endurance Optimizer</h2>
        <div className="mode-toggle-bar">
          <button 
            type="button" 
            className={`btn-toggle ${inputs.iceState === 'OFF' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, iceState: 'OFF' }))}
          >
            Anti-Ice OFF
          </button>
          <button 
            type="button" 
            className={`btn-toggle ${inputs.iceState === 'ON' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, iceState: 'ON' }))}
          >
            Anti-Ice ON (+10.1%)
          </button>
          <button 
            type="button" 
            className={`btn-toggle ${inputs.iceState === 'ACCRETION' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, iceState: 'ACCRETION' }))}
          >
            Ice Accretion (+24.1%)
          </button>
        </div>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Holding Configuration Inputs</h3>

          <div className="input-group-tactile">
            <label>Current Aircraft Weight (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('weight', -1000, 85000, 130000)} className="btn-step">──</button>
              <span className="value-display">{inputs.weight.toLocaleString()} lbs</span>
              <button type="button" onClick={() => adjustInput('weight', 1000, 85000, 130000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Holding Altitude (ft)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('altitude', -1000, 1500, 25000)} className="btn-step">──</button>
              <span className="value-display">{inputs.altitude.toLocaleString()} ft</span>
              <button type="button" onClick={() => adjustInput('altitude', 1000, 1500, 25000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Remaining Fuel On-board (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('remainingFuel', -500, 3000, 15000)} className="btn-step">──</button>
              <span className="value-display">{inputs.remainingFuel.toLocaleString()} lbs</span>
              <button type="button" onClick={() => adjustInput('remainingFuel', 500, 3000, 15000)} className="btn-step">+</button>
            </div>
            <span className="caption">Standard reserve limit of 2,500 lbs will be protected.</span>
          </div>

          <div className="input-group-tactile">
            <label>Planned Hold Duration (min)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('holdDuration', -5, 5, 90)} className="btn-step">──</button>
              <span className="value-display">{inputs.holdDuration} min</span>
              <button type="button" onClick={() => adjustInput('holdDuration', 5, 5, 90)} className="btn-step">+</button>
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
            <div className="table-row">
              <span>Usable Hold Fuel (Reserves Protected)</span>
              <span className="val highlight">{usableHoldingFuel.toLocaleString()} lbs</span>
            </div>
            <div className="table-row">
              <span>Best Endurance Speed (Green Dot)</span>
              <span className="val highlight">{bestHoldingSpeed} kt IAS</span>
            </div>
            <div className="table-row">
              <span>Hourly Fuel Flow per Engine</span>
              <span>{Math.round(fuelFlowPerHour / 2).toLocaleString()} lbs/h</span>
            </div>
            <div className="table-row">
              <span>Protected Fuel Reserve</span>
              <span>{reserveFuelLimit.toLocaleString()} lbs</span>
            </div>
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
