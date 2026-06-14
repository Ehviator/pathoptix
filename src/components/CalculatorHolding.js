import React, { useState } from 'react';

export default function CalculatorHolding() {
  const [inputs, setInputs] = useState({
    weight: 105000, // lbs
    altitude: 10000, // ft
    holdDuration: 20, // minutes
    remainingFuel: 8000 // lbs
  });

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      const nextVal = prev[key] + step;
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  // Holding Fuel Flow calculation
  const baseHoldingFF = 2850; // lbs/h
  const weightFactor = (inputs.weight - 85000) * 0.0125;
  const altFactor = (inputs.altitude / 1000) * 15;
  
  const fuelFlowPerHour = Math.round(baseHoldingFF + weightFactor + altFactor);
  const fuelFlowPerMin = fuelFlowPerHour / 60;

  // Total fuel burned in the planned hold duration
  const plannedHoldBurn = Math.round(fuelFlowPerMin * inputs.holdDuration);

  // Maximum endurance estimation
  const reserveFuelLimit = 2500;
  const usableHoldingFuel = Math.max(0, inputs.remainingFuel - reserveFuelLimit);
  const maxEnduranceMin = (usableHoldingFuel / fuelFlowPerHour) * 60;
  const maxEnduranceFormatted = `${Math.floor(maxEnduranceMin)} min`;

  // Best holding speed (Green Dot speed)
  const bestHoldingSpeed = Math.round(185 + (inputs.weight - 85000) * 0.0011 + (inputs.altitude / 1000) * 0.5);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Terminal Holding & Endurance Optimizer</h2>
        <p>Dynamic calculations of fuel burn rates and maximum endurance limits during holding patterns.</p>
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
              <button type="button" onClick={() => adjustInput('altitude', -1000, 2000, 25000)} className="btn-step">──</button>
              <span className="value-display">{inputs.altitude.toLocaleString()} ft</span>
              <button type="button" onClick={() => adjustInput('altitude', 1000, 2000, 25000)} className="btn-step">+</button>
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
              <span className="value">{plannedHoldBurn} lbs</span>
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
              <span>{bestHoldingSpeed} kt IAS</span>
            </div>
            <div className="table-row">
              <span>Hourly Fuel Flow per Engine</span>
              <span>{Math.round(fuelFlowPerHour / 2)} lbs/h</span>
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
