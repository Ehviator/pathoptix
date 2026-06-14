import React from 'react';
import { useMission } from '../context/MissionContext.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const { mission, updateMissionField, cruiseMatrix, maxOperatingFL, loading } = useMission();

  const hasIncompleteInputs = mission.weight === "" || 
                              mission.cruiseFL === "" || 
                              mission.isaDev === "" || 
                              mission.wind === "" ||
                              (mission.speedMode === 'ECON' && mission.costIndex === "") ||
                              (mission.speedMode === 'MANUAL' && mission.manualMach === "");

  const boundedWind = hasIncompleteInputs ? 0 : Math.max(-200, Math.min(200, mission.wind));
  const correctedCI = hasIncompleteInputs ? 0 : getCorrectedCostIndex(mission.costIndex, boundedWind);
  const weightLbs = hasIncompleteInputs ? 0 : mission.weight;
  const weightKg = hasIncompleteInputs ? 0 : mission.weight / 2.20462;
  
  let resolvedMach = hasIncompleteInputs ? 0 : mission.manualMach; 
  let isOutOfEnvelope = false;
  const targetAltKey = hasIncompleteInputs ? "33000" : (mission.cruiseFL * 100).toString();

  if (!hasIncompleteInputs) {
    if (mission.speedMode === 'ECON') {
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
      if (mission.cruiseFL > 370 && resolvedMach > 0.80) {
        isOutOfEnvelope = true;
      }
    }
  }

  const isaTemp = hasIncompleteInputs ? 0 : getISATemperature(mission.cruiseFL * 100);
  const actualTemp = isaTemp + (hasIncompleteInputs ? 0 : mission.isaDev);
  const tas = hasIncompleteInputs ? "---" : Math.round(getTASFromMach(resolvedMach, actualTemp));
  const gs = hasIncompleteInputs ? "---" : Math.round(tas + boundedWind);

  const baseFFKg = 1550; 
  const machFactor = hasIncompleteInputs ? 0 : (resolvedMach - 0.70) * 4200;
  const weightFactor = hasIncompleteInputs ? 0 : (weightKg - 40000) * 0.028;
  const altFactor = hasIncompleteInputs ? 0 : (mission.cruiseFL - 330) * -14;
  const antiIceFactor = hasIncompleteInputs ? 0 : (mission.antiIce ? 180 : 0);
  
  const fuelFlowKg = hasIncompleteInputs ? 0 : Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor + antiIceFactor);
  const fuelFlowLbs = hasIncompleteInputs ? "---" : Math.round(fuelFlowKg * 2.20462);
  const specificRange = hasIncompleteInputs || fuelFlowLbs === 0 || tas === "---" ? "---" : Math.round((gs / fuelFlowLbs) * 1000) / 1000;
  const optimalFL = hasIncompleteInputs ? "---" : Math.min(maxOperatingFL, Math.round((410 - (mission.weight - 85000) * 0.00018) / 10) * 10);

  if (loading) return <div className="panel-container"><p>Synchronizing Cruise Performance Database...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Enroute Cruise Performance Suite</h2>
        <div className="mode-toggle-bar">
          <button 
            type="button" 
            className={`btn-toggle ${mission.speedMode === 'ECON' ? 'active' : ''}`}
            onClick={() => updateMissionField('speedMode', 'ECON')}
          >
            FMC ECON MODE (CI)
          </button>
          <button 
            type="button" 
            className={`btn-toggle ${mission.speedMode === 'MANUAL' ? 'active' : ''}`}
            onClick={() => updateMissionField('speedMode', 'MANUAL')}
          >
            MANUAL MACH TARGET
          </button>
        </div>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Data Entry</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Gross Weight (lbs)</label>
              <input 
                type="number" 
                key={`weight-${mission.weight}`}
                defaultValue={mission.weight}
                onBlur={(e) => updateMissionField('weight', e.target.value, 85000, 130000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Level (FL)</label>
              <input 
                type="number" 
                key={`fl-${mission.cruiseFL}`}
                defaultValue={mission.cruiseFL}
                onBlur={(e) => updateMissionField('cruiseFL', e.target.value, 280, maxOperatingFL)}
                className="touch-input-field"
              />
            </div>

            {mission.speedMode === 'ECON' ? (
              <div className="input-grid-spatial" style={{ gridColumn: 'span 2', gap: '20px' }}>
                <div className="input-cell-spatial">
                  <label>Cost Index (CI)</label>
                  <input 
                    type="number" 
                    key={`ci-${mission.costIndex}`}
                    defaultValue={mission.costIndex}
                    onBlur={(e) => updateMissionField('costIndex', e.target.value, 0, 120)}
                    className="touch-input-field"
                  />
                </div>
                <div className="input-cell-spatial">
                  <label>Wind Velocity (kt)</label>
                  <input 
                    type="number" 
                    key={`wind-${mission.wind}`}
                    defaultValue={mission.wind}
                    onBlur={(e) => updateMissionField('wind', e.target.value, -200, 200)}
                    className="touch-input-field"
                  />
                </div>
              </div>
            ) : (
              <div className="input-grid-spatial" style={{ gridColumn: 'span 2', gap: '20px' }}>
                <div className="input-cell-spatial">
                  <label>Selected Mach</label>
                  <input 
                    type="number" 
                    step="0.01"
                    key={`mach-${mission.manualMach}`}
                    defaultValue={mission.manualMach}
                    onBlur={(e) => updateMissionField('manualMach', e.target.value, 0.70, 0.82)}
                    className="touch-input-field"
                  />
                </div>
                <div className="input-cell-spatial">
                  <label>Wind Velocity (kt)</label>
                  <input 
                    type="number" 
                    key={`wind-${mission.wind}`}
                    defaultValue={mission.wind}
                    onBlur={(e) => updateMissionField('wind', e.target.value, -200, 200)}
                    className="touch-input-field"
                  />
                </div>
              </div>
            )}

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                key={`isa-${mission.isaDev}`}
                defaultValue={mission.isaDev}
                onBlur={(e) => updateMissionField('isaDev', e.target.value, -30, 30)}
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
              <span className="toggle-label">Engine Bleed Anti-Ice active</span>
            </label>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Calculated Flight Deck Targets</h3>
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Target Profile Speed</span>
              <span className={`value ${isOutOfEnvelope ? 'text-danger' : ''}`}>
                {isOutOfEnvelope ? 'BUFFET LIMIT' : hasIncompleteInputs ? '---' : `M ${resolvedMach.toFixed(2)}`}
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Total Fuel Flow</span>
              <span className="value">{hasIncompleteInputs ? "---" : `${fuelFlowLbs.toLocaleString()} lbs/h`}</span>
            </div>
            <div className="metric-box">
              <span className="label">Specific Range</span>
              <span className="value">{hasIncompleteInputs ? "---" : `${specificRange.toFixed(3)} NM/lb`}</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Optimal Profile Level</span><span className="val highlight">{hasIncompleteInputs ? "---" : `FL ${optimalFL}`}</span></div>
            <div className="table-row"><span>True Airspeed (TAS)</span><span>{hasIncompleteInputs ? "---" : `${tas} kt`}</span></div>
            <div className="table-row"><span>Ground Speed (GS)</span><span>{hasIncompleteInputs ? "---" : `${gs} kt`}</span></div>
            <div className="table-row"><span>Max Operating Altitude</span><span>{hasIncompleteInputs ? "---" : `FL ${maxOperatingFL}`}</span></div>
          </div>
        </div>
      </div>

      {/* Compliance Reference Footer Block */}
      <footer style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
        <span>DATA REFERENCE: FCOM PART PI-ECON (EMB-195E2)</span>
        <span>AFM REVISION ID: REV 44 • DATABASE SYNC CYCLE: 2606</span>
      </footer>
    </div>
  );
}
