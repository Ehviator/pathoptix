import React, { useState, useEffect } from 'react';
import { useMission } from '../context/MissionContext.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const { mission, updateMissionField, cruiseMatrix, maxOperatingFL, loading } = useMission();
  
  // Tactical UI and Structural parameters kept in local component state
  const [localState, setLocalState] = useState({
    speedMode: 'ECON', // 'ECON' or 'MANUAL'
    manualMach: 0.78,
    cgMac: 22.5, // Center of Gravity % Mean Aerodynamic Chord
    dragPenalty: 0.0 // MEL/CDL flat drag percentage increase
  });

  const handleLocalEntry = (key, value, min, max) => {
    let parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setLocalState(prev => ({ ...prev, [key]: parsed }));
  };

  // Performance Math Initialization
  const boundedWind = Math.max(-200, Math.min(200, mission.wind || 0));
  const correctedCI = getCorrectedCostIndex(mission.costIndex, boundedWind);
  const weightLbs = mission.weight;
  const weightKg = mission.weight / 2.20462;
  
  let resolvedMach = localState.manualMach; 
  let isOutOfEnvelope = false;
  const targetAltKey = (mission.cruiseFL * 100).toString();

  // Matrix Resolution
  if (localState.speedMode === 'ECON') {
    if (cruiseMatrix && cruiseMatrix.cruise_mach_matrix) {
      const matrix = cruiseMatrix.cruise_mach_matrix[targetAltKey] || cruiseMatrix.cruise_mach_matrix["33000"];
      const interpResult = interpolate2D(
        weightLbs,
        correctedCI,
        matrix.weights,
        matrix.cost_index_headers,
        matrix.data
      );
      if (interpResult === null) {
        isOutOfEnvelope = true;
        resolvedMach = 0.74; 
      } else {
        resolvedMach = Math.round(interpResult * 100) / 100;
      }
    }
  } else {
    // Envelope Guardrail for Manual Mode
    if (mission.cruiseFL > 370 && resolvedMach > 0.80) {
      isOutOfEnvelope = true;
    }
  }

  // Atmospheric Vectors
  const isaTemp = getISATemperature(mission.cruiseFL * 100);
  const actualTemp = isaTemp + mission.isaDev;
  const tas = Math.round(getTASFromMach(resolvedMach, actualTemp));
  const gs = Math.round(tas + boundedWind);

  // High-Fidelity Base Fuel Curve
  const baseFFKg = 1550; 
  const machFactor = (resolvedMach - 0.70) * 4200;
  const weightFactor = (weightKg - 40000) * 0.028;
  const altFactor = (mission.cruiseFL - 330) * -14;
  const antiIceFactor = mission.antiIce ? 180 : 0;
  
  let fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor + antiIceFactor);
  
  // Structural & Aerodynamic Modifiers
  // Aft CG (>25% MAC) reduces trim drag. Fwd CG (<20% MAC) increases trim drag.
  const cgModifier = localState.cgMac > 28 ? -0.015 : localState.cgMac < 20 ? 0.015 : 0; 
  const cdlModifier = localState.dragPenalty / 100;
  
  fuelFlowKg = fuelFlowKg * (1 + cgModifier + cdlModifier);
  const fuelFlowLbs = Math.round(fuelFlowKg * 2.20462);
  
  // Efficiencies and Targets
  const specificRange = fuelFlowLbs > 0 ? Math.round((gs / fuelFlowLbs) * 1000) / 1000 : 0;
  const optimalFL = Math.min(maxOperatingFL, Math.round((410 - (mission.weight - 85000) * 0.00018) / 10) * 10);
  
  // Step Climb Weight Predictor (Calculate weight to clear FL + 2000ft)
  const nextStepFL = mission.cruiseFL + 20;
  const stepClimbWeight = Math.max(80000, Math.round(85000 + ((410 - nextStepFL) / 0.00018)));
  const weightToBurn = mission.weight - stepClimbWeight;
  const timeToStepMin = fuelFlowLbs > 0 ? (weightToBurn / fuelFlowLbs) * 60 : 0;

  if (loading) return <div className="panel-container"><p>Synchronizing Performance Matrix...</p></div>;

  const showPlaceholder = !mission.weight || mission.weight < 50000;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Enroute Cruise Performance Suite</h2>
        <div className="mode-toggle-bar">
          <button 
            type="button" 
            className={`btn-toggle ${localState.speedMode === 'ECON' ? 'active' : ''}`}
            onClick={() => setLocalState(prev => ({ ...prev, speedMode: 'ECON' }))}
          >
            FMC ECON MODE (CI)
          </button>
          <button 
            type="button" 
            className={`btn-toggle ${localState.speedMode === 'MANUAL' ? 'active' : ''}`}
            onClick={() => setLocalState(prev => ({ ...prev, speedMode: 'MANUAL' }))}
          >
            MANUAL MACH TARGET
          </button>
        </div>
      </div>

      {showPlaceholder ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', margin: '24px 0' }}>
          <span style={{ fontSize: '32px', marginBottom: '16px' }}>📋</span>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--accent-cyan)' }}>No Active Dispatch Plan</h3>
          <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: '1.5' }}>
            Please configure dispatch weights and fuel on the **Operations Dashboard** to initialize performance optimization models.
          </p>
        </div>
      ) : (
        <div className="panel-body grid-2col">
          <div className="input-section glass-panel">
          <h3>Aircraft State & Atmospheric Data</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Gross Weight (lbs)</label>
              <input 
                type="number" 
                key={mission.weight}
                value={mission.weight}
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Level (FL)</label>
              <input 
                type="number" 
                key={mission.cruiseFL}
                defaultValue={mission.cruiseFL}
                onBlur={(e) => updateMissionField('cruiseFL', e.target.value)}
                className="touch-input-field"
              />
            </div>

            {localState.speedMode === 'ECON' ? (
              <div className="input-cell-spatial">
                <label>Cost Index (CI)</label>
                <input 
                  type="number" 
                  defaultValue={mission.costIndex}
                  onBlur={(e) => updateMissionField('costIndex', e.target.value)}
                  className="touch-input-field"
                />
              </div>
            ) : (
              <div className="input-cell-spatial">
                <label>Target Mach</label>
                <input 
                  type="number" 
                  step="0.01"
                  defaultValue={localState.manualMach}
                  onBlur={(e) => handleLocalEntry('manualMach', e.target.value, 0.70, 0.82)}
                  className="touch-input-field"
                />
              </div>
            )}

            <div className="input-cell-spatial">
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                defaultValue={mission.isaDev}
                onBlur={(e) => updateMissionField('isaDev', e.target.value)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>CG Index (% MAC)</label>
              <input 
                type="number" 
                step="0.1"
                defaultValue={localState.cgMac}
                onBlur={(e) => handleLocalEntry('cgMac', e.target.value, 10, 40)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>MEL/CDL Penalty (%)</label>
              <input 
                type="number" 
                step="0.1"
                defaultValue={localState.dragPenalty}
                onBlur={(e) => handleLocalEntry('dragPenalty', e.target.value, 0, 15)}
                className="touch-input-field"
              />
            </div>
            
            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Enroute Wind (kt)</label>
              <input 
                type="number" 
                defaultValue={mission.wind}
                onBlur={(e) => updateMissionField('wind', e.target.value)}
                className="touch-input-field"
              />
            </div>
          </div>

          <div className="input-group-toggle" style={{ marginTop: '24px' }}>
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={mission.antiIce} 
                onChange={(e) => updateMissionField('antiIce', e.target.checked)} 
              />
              <span className="toggle-label">Engine Bleed Anti-Ice ACTIVE</span>
            </label>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Flight Deck Cruise Targets</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Target Speed</span>
              <span className={`value ${isOutOfEnvelope ? 'text-danger' : ''}`}>
                {isOutOfEnvelope ? 'BUFFET LIMIT' : `M ${resolvedMach.toFixed(2)}`}
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Fuel Flow</span>
              <span className="value">{fuelFlowLbs.toLocaleString()} lbs/h</span>
            </div>
            <div className="metric-box">
              <span className="label">Specific Range</span>
              <span className="value">{specificRange.toFixed(3)} NM/lb</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Optimal Altitude</span><span className="val highlight">FL {optimalFL}</span></div>
            <div className="table-row"><span>True Airspeed (TAS)</span><span>{tas} kt</span></div>
            <div className="table-row"><span>Ground Speed (GS)</span><span>{gs} kt</span></div>
            <div className="table-row"><span>Max Operating Limit</span><span>FL {maxOperatingFL}</span></div>
          </div>

          <div className="alert-banner info" style={{ marginTop: '24px' }}>
            {weightToBurn > 0 ? (
              <span><strong>Step-Climb Advisor:</strong> Aircraft is too heavy for FL{nextStepFL}. Burn <strong>{weightToBurn.toLocaleString()} lbs</strong> (approx. {Math.round(timeToStepMin)} min) to reach aerodynamic step weight of {stepClimbWeight.toLocaleString()} lbs.</span>
            ) : nextStepFL <= 410 ? (
              <span><strong>Step-Climb Advisor:</strong> Aerodynamically capable of immediate step climb to <strong>FL{nextStepFL}</strong>. Check wind matrix before initiating climb.</span>
            ) : (
              <span><strong>Step-Climb Advisor:</strong> Currently operating at or near structural aircraft ceiling.</span>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
