import React, { useState } from 'react';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { calculateClimbPerformance } from '../engine/kinematics.js';

export default function CalculatorClimb() {
  const [inputs, setInputs] = useState({
    climbWeight: 115000, 
    targetAltitude: 35000, 
    isaDev: 0,
    fieldElevation: 600, // Departure field geometric elevation
    qnh: 29.92, // Altimeter setting inHg
    windBelow180: 0, // Wind component < FL180
    windAbove180: 20, // Wind component > FL180
    antiIce: false,
    atcSpeedRestriction: true // 250kt below 10,000 ft limit
  });

  const handleManualEntry = (key, value, min, max) => {
    let parsed = key === 'qnh' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) return;
    
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  // Performance Math Initialization
  const climbWeightKg = inputs.climbWeight / 2.20462;
  const baseClimbSpeedIAS = inputs.atcSpeedRestriction ? 250 : 290; 
  const targetedIAS = modulateClimbSpeed(290, climbWeightKg, inputs.isaDev);

  // Pressure Altitude & Environment Normalization
  const trueTargetAlt = calculateTruePressureAlt(inputs.targetAltitude, inputs.qnh);
  const trueFieldAlt = calculateTruePressureAlt(inputs.fieldElevation, inputs.qnh);
  const effectiveClimbAlt = Math.max(0, trueTargetAlt - trueFieldAlt);
  
  // Climb Heuristics
  const {
    timeToClimb,
    fuelBurned,
    climbDistance,
    averageROC,
    totalWindDisplacement
  } = calculateClimbPerformance(inputs, effectiveClimbAlt);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Climb Profile & Speed Optimizer</h2>
        <p>Integrates multi-tier winds, QNH offsets, and aerodynamic configurations to plot precise TOC distances.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Departure & Atmospheric Inputs</h3>

          <div className="input-grid-spatial">
            {/* Column 1 */}
            <div className="input-cell-spatial">
              <label>Gross Weight (lbs)</label>
              <input 
                type="number" 
                defaultValue={inputs.climbWeight}
                onBlur={(e) => handleManualEntry('climbWeight', e.target.value, 85000, 135000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Altitude (ft)</label>
              <input 
                type="number" 
                defaultValue={inputs.targetAltitude}
                onBlur={(e) => handleManualEntry('targetAltitude', e.target.value, 5000, 41000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Field Elev (ft)</label>
              <input 
                type="number" 
                defaultValue={inputs.fieldElevation}
                onBlur={(e) => handleManualEntry('fieldElevation', e.target.value, -500, 14000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Altimeter (QNH)</label>
              <input 
                type="number" 
                step="0.01"
                defaultValue={inputs.qnh}
                onBlur={(e) => handleManualEntry('qnh', e.target.value, 28.00, 31.00)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Avg Wind &lt; FL180</label>
              <input 
                type="number" 
                defaultValue={inputs.windBelow180}
                onBlur={(e) => handleManualEntry('windBelow180', e.target.value, -150, 150)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Avg Wind &gt; FL180</label>
              <input 
                type="number" 
                defaultValue={inputs.windAbove180}
                onBlur={(e) => handleManualEntry('windAbove180', e.target.value, -200, 200)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                defaultValue={inputs.isaDev}
                onBlur={(e) => handleManualEntry('isaDev', e.target.value, -30, 30)}
                className="touch-input-field"
              />
            </div>
          </div>

          {/* Configuration Toggles */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group-toggle">
              <label className="toggle-container">
                <input 
                  type="checkbox" 
                  checked={inputs.atcSpeedRestriction} 
                  onChange={(e) => setInputs(prev => ({ ...prev, atcSpeedRestriction: e.target.checked }))} 
                />
                <span className="toggle-label">ATC Restriction: Max 250 KIAS &lt; 10,000 ft</span>
              </label>
            </div>

            <div className="input-group-toggle">
              <label className="toggle-container">
                <input 
                  type="checkbox" 
                  checked={inputs.antiIce} 
                  onChange={(e) => setInputs(prev => ({ ...prev, antiIce: e.target.checked }))} 
                />
                <span className="toggle-label">Engine/Wing Anti-Ice ACTIVE (Bleed Penalty)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Top of Climb (TOC) Output</h3>
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
              <span className="label">Ground Distance</span>
              <span className="value">{climbDistance} NM</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Target Indicated Speed (IAS)</span><span className="val highlight">{targetedIAS} kt</span></div>
            <div className="table-row"><span>Initial Speed Schedule</span><span>{baseClimbSpeedIAS} kt</span></div>
            <div className="table-row"><span>Target Mach Transition</span><span>M 0.78</span></div>
            <div className="table-row"><span>Average Climb Rate (ROC)</span><span>+{averageROC.toLocaleString()} ft/min</span></div>
            <div className="table-row"><span>Effective Pressure Altitude</span><span>{effectiveClimbAlt.toLocaleString()} ft</span></div>
          </div>

          <div className="alert-banner info" style={{ marginTop: '24px' }}>
            <span><strong>Profile Note:</strong> Multi-tier wind integration active. Net atmospheric displacement tracking <strong>{Math.round(totalWindDisplacement)} NM</strong> against still-air baseline.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
