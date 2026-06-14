import React, { useState } from 'react';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';

export default function CalculatorClimb() {
  const [inputs, setInputs] = useState({
    climbWeight: 115000, // lbs
    targetAltitude: 35000, // ft
    isaDev: 0
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  const climbWeightKg = inputs.climbWeight / 2.20462;

  // Modulated climb speed schedule (Green Dot / Speed Schedule)
  const baseClimbSpeedIAS = 290; // Standard IAS speed for climb
  const targetedIAS = modulateClimbSpeed(baseClimbSpeedIAS, climbWeightKg, inputs.isaDev);

  // Performance outputs
  // Time to climb (approx 12 min base + weight penalty + temp penalty)
  const baseTimeToClimb = 12; // minutes
  const weightTimeFactor = (inputs.climbWeight - 90000) * 0.00012;
  const tempTimeFactor = inputs.isaDev > 0 ? inputs.isaDev * 0.15 : 0;
  const altTimeFactor = (inputs.targetAltitude - 25000) * 0.0003;
  const timeToClimb = Math.round(baseTimeToClimb + weightTimeFactor + tempTimeFactor + altTimeFactor);

  // Climb distance (approx 65 NM base + factors)
  const climbDistance = Math.round(55 + (climbWeightKg - 40000) * 0.00075 + (inputs.targetAltitude - 20000) * 0.0015 + inputs.isaDev * 0.25);

  // Fuel burned in climb (approx 1400 lbs base + factors)
  const baseClimbFuel = 1300; // lbs
  const weightFuelFactor = (inputs.climbWeight - 90000) * 0.015;
  const tempFuelFactor = inputs.isaDev > 0 ? inputs.isaDev * 12 : 0;
  const altFuelFactor = (inputs.targetAltitude - 25000) * 0.035;
  const fuelBurned = Math.round(baseClimbFuel + weightFuelFactor + tempFuelFactor + altFuelFactor);

  // Rate of climb (TOC average)
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

          <div className="input-group">
            <label>Current Aircraft Weight: {inputs.climbWeight.toLocaleString()} lbs</label>
            <input 
              type="range" 
              min="85000" 
              max="135000" 
              step="1000" 
              value={inputs.climbWeight} 
              onChange={(e) => handleInputChange('climbWeight', parseInt(e.target.value))} 
            />
            <span className="caption">Equivalent to {Math.round(climbWeightKg).toLocaleString()} kg.</span>
          </div>

          <div className="input-group">
            <label>Target Altitude (TOC): {inputs.targetAltitude.toLocaleString()} ft</label>
            <input 
              type="range" 
              min="15000" 
              max="41000" 
              step="1000" 
              value={inputs.targetAltitude} 
              onChange={(e) => handleInputChange('targetAltitude', parseInt(e.target.value))} 
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
