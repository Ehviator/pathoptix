import React, { useState, useEffect } from 'react';
import { useMission } from '../context/MissionContext.js';
import { useDatabase } from '../context/DatabaseContext.js';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { calculateClimbProfile, calculateAlternateClimbProfile } from '../engine/climbEngine.js';

export default function CalculatorClimb() {
  const { mission, updateMissionField } = useMission();
  const { climbPerf, loading } = useDatabase();

  const [inputs, setInputs] = useState({
    climbWeight: 115000, 
    targetAltitude: 35000, 
    isaDev: 0,
    fieldElevation: 600, // Departure field geometric elevation
    qnh: 29.92, // Altimeter setting inHg
    windBelow180: 0, // Wind component < FL180
    windAbove180: 20, // Wind component > FL180
    antiIce: false,
    atcSpeedRestriction: true, // 250kt below 10,000 ft limit
    compareIas: 270,
    compareMach: 0.74
  });

  // Automatically sync with global mission context updates (weather ingestion & weights)
  useEffect(() => {
    setInputs(prev => ({
      ...prev,
      climbWeight: mission.weight ? mission.weight : prev.climbWeight,
      isaDev: mission.isaDev !== '' ? mission.isaDev : prev.isaDev,
      fieldElevation: mission.departureElev !== '' ? mission.departureElev : prev.fieldElevation,
      qnh: mission.departureQnh !== undefined && mission.departureQnh !== '' ? mission.departureQnh : prev.qnh,
      targetAltitude: mission.cruiseFL !== '' ? mission.cruiseFL * 100 : prev.targetAltitude
    }));
  }, [mission.weight, mission.isaDev, mission.departureElev, mission.departureQnh, mission.cruiseFL]);

  const handleManualEntry = (key, value, min, max) => {
    let parsed = ['qnh', 'compareMach'].includes(key) ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) return;
    
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));

    if (key === 'targetAltitude') {
      updateMissionField('cruiseFL', Math.round(parsed / 100));
    }
  };

  // Performance Math Initialization
  const climbWeightKg = inputs.climbWeight / 2.20462;
  const baseClimbSpeedIAS = inputs.atcSpeedRestriction ? 250 : 290; 
  const targetedIAS = modulateClimbSpeed(290, climbWeightKg, inputs.isaDev);

  // Pressure Altitude & Environment Normalization
  const trueTargetAlt = calculateTruePressureAlt(inputs.targetAltitude, inputs.qnh);
  const trueFieldAlt = calculateTruePressureAlt(inputs.fieldElevation, inputs.qnh);
  const effectiveClimbAlt = Math.max(0, trueTargetAlt - trueFieldAlt);
  
  // ── Climb Engine Computations ─────────────────────────────────────────────
  const baseProfile = calculateClimbProfile({
    pressureTargetAlt:    trueTargetAlt,
    pressureFieldAlt:     trueFieldAlt,
    weightLbs:            inputs.climbWeight,
    isaDev:               inputs.isaDev,
    atcSpeedRestriction:  inputs.atcSpeedRestriction,
    antiIce:              inputs.antiIce,
    windBelow180:         inputs.windBelow180,
    windAbove180:         inputs.windAbove180,
  }, climbPerf);

  const {
    timeToClimb, fuelBurned, climbDistance,
    averageROC, totalWindDisplacement,
    isOutOfEnvelope,
  } = baseProfile;

  const altProfile = isOutOfEnvelope
    ? { altTimeToClimb: 0, altFuelBurned: 0, altClimbDistance: 0, timeDelta: 0, fuelDelta: 0, distDelta: 0 }
    : calculateAlternateClimbProfile(baseProfile, {
        compareIas:   inputs.compareIas,
        compareMach:  inputs.compareMach,
        windBelow180: inputs.windBelow180,
        windAbove180: inputs.windAbove180,
      });

  const { altTimeToClimb, altFuelBurned, altClimbDistance, timeDelta, fuelDelta, distDelta } = altProfile;

  if (loading || !climbPerf) return <div className="panel-container"><p>Synchronizing Climb Database...</p></div>;

  const showPlaceholder = !mission.weight || mission.weight < 50000;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Climb Profile & Speed Optimizer</h2>
        <p>Integrates multi-tier winds, QNH offsets, and aerodynamic configurations to plot precise TOC distances.</p>
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
            <h3>Departure & Atmospheric Inputs</h3>

            <div className="input-grid-spatial">
              {/* Column 1 */}
              <div className="input-cell-spatial">
                <label>Gross Weight (lbs)</label>
                <input 
                  type="number" 
                  value={mission.weight || inputs.climbWeight}
                  disabled
                  style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  className="touch-input-field"
                />
              </div>

              <div className="input-cell-spatial">
                <label>Target Altitude (ft)</label>
                <input 
                  type="number" 
                  key={inputs.targetAltitude}
                  defaultValue={inputs.targetAltitude}
                  onBlur={(e) => handleManualEntry('targetAltitude', e.target.value, 5000, 41000)}
                  className="touch-input-field"
                />
              </div>

              <div className="input-cell-spatial">
                <label>Field Elev (ft)</label>
                <input 
                  type="number" 
                  key={inputs.fieldElevation}
                  defaultValue={inputs.fieldElevation}
                  onBlur={(e) => handleManualEntry('fieldElevation', e.target.value, -500, 14000)}
                  className="touch-input-field"
                />
              </div>

              <div className="input-cell-spatial">
                <label>Altimeter (QNH)</label>
                <input 
                  type="number" 
                  key={inputs.qnh}
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
                  key={inputs.isaDev}
                  defaultValue={inputs.isaDev}
                  onBlur={(e) => handleManualEntry('isaDev', e.target.value, -30, 30)}
                  className="touch-input-field"
                />
              </div>
            </div>

            <h3 style={{ marginTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>Climb Speed Comparison (MCDU Override)</h3>
            <div className="input-grid-spatial" style={{ marginTop: '12px' }}>
              <div className="input-cell-spatial">
                <label>Compare Target IAS (kt)</label>
                <input 
                  type="number" 
                  key={inputs.compareIas}
                  defaultValue={inputs.compareIas}
                  onBlur={(e) => handleManualEntry('compareIas', e.target.value, 250, 320)}
                  className="touch-input-field"
                />
              </div>

              <div className="input-cell-spatial">
                <label>Compare Target Mach</label>
                <input 
                  type="number" 
                  step="0.01"
                  key={inputs.compareMach}
                  defaultValue={inputs.compareMach}
                  onBlur={(e) => handleManualEntry('compareMach', e.target.value, 0.70, 0.80)}
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
                <span className="value">{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : `${timeToClimb} min`}</span>
              </div>
              <div className="metric-box">
                <span className="label">Fuel Burned</span>
                <span className="value">{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : `${fuelBurned.toLocaleString()} lbs`}</span>
              </div>
              <div className="metric-box">
                <span className="label">Ground Distance</span>
                <span className="value">{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : `${climbDistance} NM`}</span>
              </div>
            </div>

            <div className="performance-table">
              <div className="table-row"><span>Target Indicated Speed (IAS)</span><span className="val highlight">{targetedIAS} kt</span></div>
              <div className="table-row"><span>Initial Speed Schedule</span><span>{baseClimbSpeedIAS} kt</span></div>
              <div className="table-row"><span>Target Mach Transition</span><span>M 0.76</span></div>
              <div className="table-row"><span>Average Climb Rate (ROC)</span><span>{isOutOfEnvelope ? "---" : `+${averageROC.toLocaleString()} ft/min`}</span></div>
              <div className="table-row"><span>Effective Pressure Altitude</span><span>{effectiveClimbAlt.toLocaleString()} ft</span></div>
            </div>

            <h3 style={{ marginTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>Speed Profile Comparison</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Baseline Profile</h4>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>290 kt / M 0.76</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  <div>Time: <strong>{isOutOfEnvelope ? "---" : `${timeToClimb} min`}</strong></div>
                  <div>Fuel: <strong>{isOutOfEnvelope ? "---" : `${fuelBurned.toLocaleString()} lbs`}</strong></div>
                  <div>Dist: <strong>{isOutOfEnvelope ? "---" : `${climbDistance} NM`}</strong></div>
                </div>
              </div>

              <div style={{ background: 'rgba(5, 11, 20, 0.4)', border: '1px solid var(--accent-cyan)', borderRadius: '8px', padding: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--accent-cyan)' }}>Alternate Speed</h4>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '8px' }}>{inputs.compareIas} kt / M {inputs.compareMach.toFixed(2)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  <div>Time: <strong>{isOutOfEnvelope ? "---" : `${altTimeToClimb} min`}</strong> <span style={{ color: timeDelta < 0 ? 'var(--accent-green)' : timeDelta > 0 ? 'var(--accent-crit)' : 'var(--text-secondary)' }}>({timeDelta >= 0 ? `+${timeDelta}` : timeDelta} min)</span></div>
                  <div>Fuel: <strong>{isOutOfEnvelope ? "---" : `${altFuelBurned.toLocaleString()} lbs`}</strong> <span style={{ color: fuelDelta < 0 ? 'var(--accent-green)' : fuelDelta > 0 ? 'var(--accent-crit)' : 'var(--text-secondary)' }}>({fuelDelta >= 0 ? `+${fuelDelta.toLocaleString()}` : fuelDelta.toLocaleString()} lbs)</span></div>
                  <div>Dist: <strong>{isOutOfEnvelope ? "---" : `${altClimbDistance} NM`}</strong> <span style={{ color: 'var(--text-secondary)' }}>({distDelta >= 0 ? `+${distDelta}` : distDelta} NM)</span></div>
                </div>
              </div>
            </div>

            <div className="alert-banner info" style={{ marginTop: '24px' }}>
              {isOutOfEnvelope ? (
                <span className="text-danger"><strong>WARNING:</strong> Flight configuration exceeds performance envelope boundaries. Lower the gross weight or target flight level.</span>
              ) : (
                <span><strong>Profile Note:</strong> Multi-tier wind integration active. Net atmospheric displacement tracking <strong>{Math.round(totalWindDisplacement)} NM</strong> against still-air baseline.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
