import React, { useState, useEffect } from 'react';
import { useMission } from '../context/MissionContext.js';
import { useDatabase } from '../context/DatabaseContext.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { calculateColdTempCorrection } from '../engine/atmospheric.js';
import { calculateDescentProfile } from '../engine/descentEngine.js';

export default function CalculatorDescent() {
  const { mission, updateMissionField } = useMission();
  const { descentPerf, loading } = useDatabase();

  const [inputs, setInputs] = useState({
    targetAltitude: 3000,
    fieldElevation: 600, // Destination field geometric elevation
    arrivalQnh: 29.92,
    fpa: 3.0,
    descentSpeed: 280,
    speedTransitionAlt: 10000,
    destinationOAT: 15, // Destination Static Air Temperature (OAT)
    descentWind: 15, // Average wind component during the descent phase
    flightIdleIcing: false
  });

  // Automatically sync with global mission context updates (weather ingestion)
  useEffect(() => {
    setInputs(prev => ({
      ...prev,
      fieldElevation: mission.arrivalElev !== '' ? mission.arrivalElev : prev.fieldElevation,
      arrivalQnh: mission.arrivalQnh !== undefined && mission.arrivalQnh !== '' ? mission.arrivalQnh : prev.arrivalQnh,
      destinationOAT: mission.arrivalOat !== undefined && mission.arrivalOat !== '' ? mission.arrivalOat : prev.destinationOAT
    }));
  }, [mission.arrivalElev, mission.arrivalQnh, mission.arrivalOat]);

  const handleManualEntry = (key, value, min, max) => {
    let parsed = key === 'fpa' || key === 'arrivalQnh' || key === 'destinationOAT' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) return;

    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  // Cold Temperature & Pressure Altitude Normalization
  const correctedTargetAlt = calculateColdTempCorrection(inputs.targetAltitude, inputs.fieldElevation, inputs.destinationOAT);
  const trueTargetAlt = calculateTruePressureAlt(correctedTargetAlt, inputs.arrivalQnh);
  const altDiff = (mission.cruiseFL * 100) - trueTargetAlt;
  
  // ── Descent Engine Computations ───────────────────────────────────────────
  const {
    todDistance, timeFormatted, vsi, glideRatio,
    fuelBurned: fuelFlowLbs, decelerationDistance,
    isOutOfEnvelope, coldTempActive, coldTempCarsWarning,
  } = calculateDescentProfile({
    fpa:               inputs.fpa,
    altDiff,
    descentSpeed:      inputs.descentSpeed,
    speedTransitionAlt: inputs.speedTransitionAlt,
    trueTargetAlt,
    descentWind:       inputs.descentWind,
    flightIdleIcing:   inputs.flightIdleIcing,
    destinationOAT:    inputs.destinationOAT,
  }, descentPerf);

  if (loading || !descentPerf) return <div className="panel-container"><p>Synchronizing Descent Database...</p></div>;

  const showPlaceholder = !mission.weight || mission.weight < 50000;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Descent Energy & FPA Optimizer</h2>
        <p>Calculates precise TOD mapping by integrating QNH offsets, deceleration segments, and E-Jet flight idle behavior.</p>
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
          <h3>Vertical Profile Constraints</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Cruise Level (FL)</label>
              <input 
                type="number" 
                key={mission.cruiseFL}
                defaultValue={mission.cruiseFL}
                onBlur={(e) => updateMissionField('cruiseFL', e.target.value)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Altitude (ft)</label>
              <input 
                type="number" 
                key={inputs.targetAltitude}
                defaultValue={inputs.targetAltitude}
                onBlur={(e) => handleManualEntry('targetAltitude', e.target.value, 0, 15000)}
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
              <label>Arrival Altimeter (QNH)</label>
              <input 
                type="number" 
                key={inputs.arrivalQnh}
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

            <div className="input-cell-spatial">
              <label>Destination OAT (°C)</label>
              <input 
                type="number" 
                key={inputs.destinationOAT}
                defaultValue={inputs.destinationOAT}
                onBlur={(e) => handleManualEntry('destinationOAT', e.target.value, -50, 50)}
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
              <span className="value">{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : `${todDistance} NM`}</span>
            </div>
            <div className="metric-box">
              <span className="label">Time in Descent</span>
              <span className="value">{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : timeFormatted}</span>
            </div>
            <div className="metric-box">
              <span className="label">Average VSI</span>
              <span className="value">{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : `${vsi.toLocaleString()} ft/min`}</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Required Glide Ratio</span><span className="val highlight">{isOutOfEnvelope ? "---" : `${glideRatio} : 1`}</span></div>
            <div className="table-row"><span>True Target Altitude (QNH)</span><span>{isOutOfEnvelope ? "---" : `${trueTargetAlt.toLocaleString()} ft`}</span></div>
            <div className="table-row"><span>Deceleration Track Distance</span><span>{isOutOfEnvelope ? "---" : decelerationDistance > 0 ? `+${decelerationDistance.toFixed(1)} NM` : '0 NM'}</span></div>
            <div className="table-row"><span>Descent Fuel Burn</span><span>{isOutOfEnvelope ? "---" : `${fuelFlowLbs.toLocaleString()} lbs`}</span></div>
          </div>

          <div className="alert-banner info" style={{ marginTop: '24px' }}>
            {isOutOfEnvelope ? (
              <span className="text-danger"><strong>WARNING:</strong> Trajectory exceeds performance envelope boundaries. Lower cruise flight level or adjust target parameters.</span>
            ) : coldTempCarsWarning ? (
              <span style={{ color: 'var(--accent-warn)' }}><strong>CARs 602.35 CAUTION:</strong> OAT {inputs.destinationOAT}°C is at or below −15°C. Cold temperature altitude corrections are mandatory for all approach minima and en-route MEAs. Geometric target alt adjusted to {correctedTargetAlt.toLocaleString()} ft.</span>
            ) : coldTempActive ? (
              <span style={{ color: 'var(--accent-warn)' }}><strong>Winter Ops:</strong> Cold temperature correction active (OAT {inputs.destinationOAT}°C). Geometric target alt adjusted to {correctedTargetAlt.toLocaleString()} ft for safety.</span>
            ) : inputs.flightIdleIcing ? (
              <span style={{ color: 'var(--accent-warn)' }}><strong>WARNING:</strong> Flight Idle Icing active. Elevated FADEC thrust demands require an earlier TOD to prevent overshooting the vertical profile.</span>
            ) : decelerationDistance > 0 ? (
              <span><strong>Profile Note:</strong> Added {decelerationDistance.toFixed(1)} NM to TOD calculation to account for kinetic energy bleed at {inputs.speedTransitionAlt.toLocaleString()} ft.</span>
            ) : (
              <span><strong>Optimizer Recommendation:</strong> Clean descent profile mapped. Execute idle descent at calculated TOD.</span>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
