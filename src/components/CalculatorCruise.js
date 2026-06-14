import React, { useState, useEffect } from 'react';
import { useMission } from '../context/MissionContext.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import {
  lookupCruiseMach,
  calculateCruiseFuelFlow,
  calculateCruiseSpeeds,
  calculateSpecificRange,
  buildStepClimbAdvisory,
} from '../engine/cruiseEngine.js';

export default function CalculatorCruise() {
  const { mission, updateMissionField, cruiseMatrix, maxOperatingFL, loading } = useMission();
  
  // Tactical UI and Structural parameters kept in local component state
  const [localState, setLocalState] = useState({
    speedMode: 'ECON', // 'ECON' or 'MANUAL'
    manualMach: 0.78,
    dragPenalty: 0.0 // MEL/CDL flat drag percentage increase
  });

  const handleLocalEntry = (key, value, min, max) => {
    let parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setLocalState(prev => ({ ...prev, [key]: parsed }));
  };

  // ── Cruise Engine Computations ────────────────────────────────────────────
  const boundedWind = Math.max(-200, Math.min(200, mission.wind || 0));
  const correctedCI = getCorrectedCostIndex(mission.costIndex, boundedWind);
  const weightLbs   = mission.weight;

  // 1. Mach resolution: matrix (ECON) or pilot entry (MANUAL)
  let resolvedMach    = localState.manualMach;
  let isOutOfEnvelope = false;

  if (localState.speedMode === 'ECON') {
    const { mach, isOutOfEnvelope: ooe } = lookupCruiseMach(
      weightLbs, mission.cruiseFL, correctedCI, cruiseMatrix
    );
    resolvedMach    = mach;
    isOutOfEnvelope = ooe;
  } else {
    // Envelope guardrail for manual mode
    if (mission.cruiseFL > 370 && resolvedMach > 0.80) isOutOfEnvelope = true;
  }

  // 2. Atmospheric speeds (physics-based Mach → TAS, not a linear heuristic)
  const { tas, gs } = calculateCruiseSpeeds(
    mission.cruiseFL, resolvedMach, mission.isaDev, boundedWind
  );

  // 3. Fuel flow (kg/hr scalar → lbs/hr output, all factors in engine module)
  const fuelFlowLbs = calculateCruiseFuelFlow({
    weightLbs,
    fl:          mission.cruiseFL,
    mach:        resolvedMach,
    isaDev:      mission.isaDev,
    antiIce:     mission.antiIce,
    cgMac:       mission.mac,
    dragPenalty: localState.dragPenalty,
  });

  // 4. Efficiency & step-climb advisory
  const specificRange = calculateSpecificRange(gs, fuelFlowLbs);
  const {
    optimalFL,
    nextStepFL,
    weightToBurnLbs: weightToBurn,
    minutesToStep: timeToStepMin,
    recommendation: stepRecommendation,
  } = buildStepClimbAdvisory(weightLbs, mission.cruiseFL, fuelFlowLbs);

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
                  key={`ci-${mission.costIndex}`}
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
                  key={`mach-${localState.manualMach}`}
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
                key={mission.mac}
                defaultValue={mission.mac !== '' && mission.mac !== undefined && mission.mac !== null ? mission.mac : 22.5}
                onBlur={(e) => updateMissionField('mac', e.target.value, 10, 40)}
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
            {stepRecommendation === 'AT_CEILING' ? (
              <span><strong>Step-Climb Advisor:</strong> Currently operating at or near structural aircraft ceiling (FL{maxOperatingFL}).</span>
            ) : stepRecommendation === 'BURN_BEFORE_STEP' ? (
              <span><strong>Step-Climb Advisor:</strong> Aircraft is too heavy for FL{nextStepFL}. Burn <strong>{weightToBurn.toLocaleString()} lbs</strong> (approx. {timeToStepMin} min at current FF) before initiating step.</span>
            ) : (
              <span><strong>Step-Climb Advisor:</strong> Aerodynamically capable of immediate step climb to <strong>FL{nextStepFL}</strong>. Verify wind matrix before initiating.</span>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
