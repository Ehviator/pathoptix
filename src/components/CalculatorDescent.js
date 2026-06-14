import React, { useState } from 'react';
import { useMission } from '../context/MissionContext.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { calculateDescentPerformance } from '../engine/kinematics.js';

export default function CalculatorDescent() {
  const { mission, updateMissionField } = useMission();

  const [inputs, setInputs] = useState({
    targetAltitude: 3000,
    arrivalQnh: 29.92,
    descentSpeed: 280,
    speedTransitionAlt: 10000,
    fpa: 3.0,
    descentWind: 15, // Average wind component during the descent phase
    flightIdleIcing: false
  });

  const handleManualEntry = (key, value, min, max) => {
    let parsed = key === 'fpa' || key === 'arrivalQnh' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) return;

    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  // Pressure Altitude & Environment Normalization
  const trueTargetAlt = calculateTruePressureAlt(inputs.targetAltitude, inputs.arrivalQnh);
  
  // Descent Heuristics
  const {
    todDistance,
    timeFormatted,
    vsi,
    glideRatio,
    fuelFlowLbs,
    cabinRate,
    decelerationDistance
  } = calculateDescentPerformance(inputs, mission.cruiseFL, trueTargetAlt);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Descent Energy & FPA Optimizer</h2>
        <p>Calculates precise TOD mapping by integrating QNH offsets, deceleration segments, and E-Jet flight idle behavior.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Vertical Profile Constraints</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Cruise Level (FL)</label>
              <input 
                type="number" 
                defaultValue={mission.cruiseFL}
                onBlur={(e) => updateMissionField('cruiseFL', e.target.value)}
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
              <label>Arrival Altimeter (QNH)</label>
              <input 
                type="number" 
                step="0.01"
                defaultValue={inputs.arrivalQnh}
                onBlur={(e) => handleManualEntry('arrivalQnh', e.target.value, 28.00, 31.00)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Path Angle (°)</label>
              <input 
                type="number" 
                step="0.1"
                defaultValue={inputs.fpa}
                onBlur={(e) => handleManualEntry('fpa', e.target.value, 2.0, 4.0)}
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
              <label>Speed Trans Alt (ft)</label>
              <input 
                type="number" 
                defaultValue={inputs.speedTransitionAlt}
                onBlur={(e) => handleManualEntry('speedTransitionAlt', e.target.value, 3000, 18000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Average Descent Wind Vector (kt)</label>
              <input 
                type="number" 
                defaultValue={inputs.descentWind}
                onBlur={(e) => handleManualEntry('descentWind', e.target.value, -200, 200)}
                className="touch-input-field"
              />
            </div>
          </div>

          <div className="input-group-toggle" style={{ marginTop: '24px' }}>
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={inputs.flightIdleIcing} 
                onChange={(e) => setInputs(prev => ({ ...prev, flightIdleIcing: e.target.checked }))} 
              />
              <span className="toggle-label" style={{ color: inputs.flightIdleIcing ? 'var(--accent-warn)' : 'inherit' }}>
                E-Jet Flight Idle Icing ACTIVE
              </span>
            </label>
            <span className="caption" style={{ display: 'block', marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              Requires elevated N1 thrust for bleed demand, increasing descent distance.
            </span>
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
            <div className="table-row"><span>True Target Altitude (QNH)</span><span>{trueTargetAlt.toLocaleString()} ft</span></div>
            <div className="table-row"><span>Deceleration Track Distance</span><span>{decelerationDistance > 0 ? `+${decelerationDistance.toFixed(1)} NM` : '0 NM'}</span></div>
            <div className="table-row"><span>Descent Fuel Burn</span><span>{fuelFlowLbs.toLocaleString()} lbs</span></div>
          </div>

          <div className="alert-banner info" style={{ marginTop: '24px' }}>
            {inputs.flightIdleIcing ? (
              <span style={{ color: 'var(--accent-warn)' }}><strong>WARNING:</strong> Flight Idle Icing active. Elevated FADEC thrust demands require an earlier TOD to prevent overshooting the vertical profile.</span>
            ) : decelerationDistance > 0 ? (
              <span><strong>Profile Note:</strong> Added {decelerationDistance.toFixed(1)} NM to TOD calculation to account for kinetic energy bleed at {inputs.speedTransitionAlt.toLocaleString()} ft.</span>
            ) : (
              <span><strong>Optimizer Recommendation:</strong> Clean descent profile mapped. Execute idle descent at calculated TOD.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
