import React, { useState } from 'react';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';

export default function CalculatorClimb() {
  const [inputs, setInputs] = useState({
    climbWeight: 115000, // lbs
    targetAltitude: 35000, // ft
    isaDev: 0
  });

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      const nextVal = prev[key] + step;
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  const climbWeightKg = inputs.climbWeight / 2.20462;

  // Modulated climb speed schedule (Green Dot / Speed Schedule)
  const baseClimbSpeedIAS = 290; // Standard IAS speed for climb
  const targetedIAS = modulateClimbSpeed(baseClimbSpeedIAS, climbWeightKg, inputs.isaDev);

  // Performance outputs
  const baseTimeToClimb = 12; // minutes
  const weightTimeFactor = (inputs.climbWeight - 90000) * 0.00012;
  const tempTimeFactor = inputs.isaDev > 0 ? inputs.isaDev * 0.15 : 0;
  const altTimeFactor = (inputs.targetAltitude - 25000) * 0.0003;
  const timeToClimb = Math.round(baseTimeToClimb + weightTimeFactor + tempTimeFactor + altTimeFactor);

  const climbDistance = Math.round(55 + (climbWeightKg - 40000) * 0.00075 + (inputs.targetAltitude - 20000) * 0.0015 + inputs.isaDev * 0.25);

  const baseClimbFuel = 1300; // lbs
  const weightFuelFactor = (inputs.climbWeight - 90000) * 0.015;
  const tempFuelFactor = inputs.isaDev > 0 ? inputs.isaDev * 12 : 0;
  const altFuelFactor = (inputs.targetAltitude - 25000) * 0.035;
  const fuelBurned = Math.round(baseClimbFuel + weightFuelFactor + tempFuelFactor + altFuelFactor);

  const averageROC = Math.round(inputs.targetAltitude / timeToClimb);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Climb Profile & Speed Optimizer</h2>
        <p>Calculates climb speeds, time to climb, fuel burn, and ground distance to Top of Climb (TOC).</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Climb Setup Inputs</h3>

          <div className="input-group-tactile">
            <label>Current Aircraft Weight (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('climbWeight', -1000, 85000, 135000)} className="btn-step">──</button>
              <span className="value-display">{inputs.climbWeight.toLocaleString()} lbs</span>
              <button type="button" onClick={() => adjustInput('climbWeight', 1000, 85000, 135000)} className="btn-step">+</button>
            </div>
            <span className="caption">Equivalent to {Math.round(climbWeightKg).toLocaleString()} kg.</span>
          </div>

          <div className="input-group-tactile">
            <label>Target Altitude (ft)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('targetAltitude', -1000, 15000, 41000)} className="btn-step">──</button>
              <span className="value-display">{inputs.targetAltitude.toLocaleString()} ft</span>
              <button type="button" onClick={() => adjustInput('targetAltitude', 1000, 15000, 41000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>ISA Deviation</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('isaDev', -1, -20, 20)} className="btn-step">──</button>
              <span className="value-display">{inputs.isaDev > 0 ? `+${inputs.isaDev}` : inputs.isaDev}°C</span>
              <button type="button" onClick={() => adjustInput('isaDev', 1, -20, 20)} className="btn-step">+</button>
            </div>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Climb Profile Output</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Time to Climb</span>
              <span className="value">{timeToClimb} min</span>
            </div>
            <div className="metric-box">
              <span className="label">Fuel Burned</span>
              <span className="value">{fuelBurned.toLocaleString()} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Climb Distance</span>
              <span className="value">{climbDistance} NM</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Target Indicated Speed (IAS)</span>
              <span className="val highlight">{targetedIAS} kt</span>
            </div>
            <div className="table-row">
              <span>Target Mach Schedule</span>
              <span>M 0.78</span>
            </div>
            <div className="table-row">
              <span>Average Climb Rate (ROC)</span>
              <span>+{averageROC.toLocaleString()} ft/min</span>
            </div>
            <div className="table-row">
              <span>Optimal Crossover Altitude</span>
              <span>FL {Math.round(290 + (targetedIAS - 290) * 0.1)}</span>
            </div>
          </div>

          <div className="alert-banner info">
            <strong>Climb guidance:</strong> Maintain constant speed of <strong>{targetedIAS} kt</strong> until crossover altitude, then follow constant <strong>M 0.78</strong>. High OAT values will extend distance to TOC.
          </div>
        </div>
      </div>
    </div>
  );
}
