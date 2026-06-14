import React, { useState } from 'react';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';

export default function CalculatorClimb() {
  const [inputs, setInputs] = useState({
    climbWeight: 115000, 
    targetAltitude: 35000, 
    isaDev: 0
  });

  const handleManualEntry = (key, value, min, max) => {
    let parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;
    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  const climbWeightKg = inputs.climbWeight / 2.20462;
  const baseClimbSpeedIAS = 290; 
  const targetedIAS = modulateClimbSpeed(baseClimbSpeedIAS, climbWeightKg, inputs.isaDev);

  const baseTimeToClimb = 12; 
  const weightTimeFactor = (inputs.climbWeight - 90000) * 0.00012;
  const tempTimeFactor = inputs.isaDev > 0 ? inputs.isaDev * 0.15 : 0;
  const altTimeFactor = (inputs.targetAltitude - 25000) * 0.0003;
  const timeToClimb = Math.round(baseTimeToClimb + weightTimeFactor + tempTimeFactor + altTimeFactor);

  const climbDistance = Math.round(55 + (climbWeightKg - 40000) * 0.00075 + (inputs.targetAltitude - 20000) * 0.0015 + inputs.isaDev * 0.25);

  const baseClimbFuel = 1300; 
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

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Gross Weight (lbs)</label>
              <input 
                type="number" 
                key={`weight-${inputs.climbWeight}`}
                defaultValue={inputs.climbWeight}
                onBlur={(e) => handleManualEntry('climbWeight', e.target.value, 85000, 135000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Altitude (ft)</label>
              <input 
                type="number" 
                key={`alt-${inputs.targetAltitude}`}
                defaultValue={inputs.targetAltitude}
                onBlur={(e) => handleManualEntry('targetAltitude', e.target.value, 15000, 41000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                key={`isa-${inputs.isaDev}`}
                defaultValue={inputs.isaDev}
                onBlur={(e) => handleManualEntry('isaDev', e.target.value, -20, 20)}
                className="touch-input-field"
              />
            </div>
          </div>
          <span className="caption" style={{ display: 'block', marginTop: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Internal Mass Reference: {Math.round(climbWeightKg).toLocaleString()} kg.
          </span>
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
            <div className="table-row"><span>Target Indicated Speed (IAS)</span><span className="val highlight">{targetedIAS} kt</span></div>
            <div className="table-row"><span>Target Mach Schedule</span><span>M 0.78</span></div>
            <div className="table-row"><span>Average Climb Rate (ROC)</span><span>+{averageROC.toLocaleString()} ft/min</span></div>
            <div className="table-row"><span>Optimal Crossover Altitude</span><span>FL {Math.round(290 + (targetedIAS - 290) * 0.1)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
