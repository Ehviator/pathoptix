import React, { useState } from 'react';
import { useMission } from '../context/MissionContext.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { calculateColdTempCorrection } from '../engine/atmospheric.js';
import { interpolate2D, interpolate1D } from '../engine/interpolation.js';

export default function CalculatorDescent() {
  const { mission, updateMissionField, descentPerf, loading } = useMission();

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
  
  // Matrix-based descent performance lookup
  const getDescentPerfForFpa = (fpaKey, diff, speed) => {
    if (!descentPerf || !descentPerf.descent_profiles) return null;
    const profile = descentPerf.descent_profiles[fpaKey];
    if (!profile) return null;

    const dist = interpolate2D(diff, speed, profile.alt_diff_headers, profile.speed_headers, profile.distance_nm);
    const time = interpolate2D(diff, speed, profile.alt_diff_headers, profile.speed_headers, profile.time_min);
    const fuel = interpolate2D(diff, speed, profile.alt_diff_headers, profile.speed_headers, profile.fuel_lbs);

    if (dist === null || time === null || fuel === null) return null;
    return { dist, time, fuel };
  };

  const getDescentPerf = (fpa, diff, speed) => {
    if (!descentPerf || !descentPerf.descent_profiles) return null;
    const profiles = descentPerf.descent_profiles;
    const fpaKeys = Object.keys(profiles).map(Number).sort((a, b) => a - b);

    let fpaLow = fpaKeys[0];
    let fpaHigh = fpaKeys[fpaKeys.length - 1];

    if (fpa <= fpaKeys[0]) {
      fpaLow = fpaHigh = fpaKeys[0];
    } else if (fpa >= fpaKeys[fpaKeys.length - 1]) {
      fpaLow = fpaHigh = fpaKeys[fpaKeys.length - 1];
    } else {
      for (let i = 0; i < fpaKeys.length - 1; i++) {
        if (fpa >= fpaKeys[i] && fpa <= fpaKeys[i + 1]) {
          fpaLow = fpaKeys[i];
          fpaHigh = fpaKeys[i + 1];
          break;
        }
      }
    }

    const lowResult = getDescentPerfForFpa(fpaLow.toFixed(1), diff, speed);
    const highResult = getDescentPerfForFpa(fpaHigh.toFixed(1), diff, speed);

    if (!lowResult || !highResult) return null;

    if (fpaLow === fpaHigh) return lowResult;

    // Linear interpolate between FPA tiers
    return {
      dist: interpolate1D(fpa, fpaLow, fpaHigh, lowResult.dist, highResult.dist),
      time: interpolate1D(fpa, fpaLow, fpaHigh, lowResult.time, highResult.time),
      fuel: interpolate1D(fpa, fpaLow, fpaHigh, lowResult.fuel, highResult.fuel)
    };
  };

  let todDistance = "---";
  let timeFormatted = "---";
  let vsi = "---";
  let glideRatio = "---";
  let fuelFlowLbs = "---";
  let decelerationDistance = 0;
  let isOutOfEnvelope = false;

  const dbResult = getDescentPerf(inputs.fpa, altDiff, inputs.descentSpeed);

  if (dbResult === null) {
    isOutOfEnvelope = true;
  } else if (dbResult) {
    // E-Jet Specific FADEC Flight Idle Icing Penalty (Higher N1 = Shallower Descent)
    const icingDistancePenalty = inputs.flightIdleIcing ? 1.15 : 1.0;

    // Horizontal Deceleration Segment (Level or shallow flight to bleed speed at transition altitude)
    decelerationDistance = trueTargetAlt < inputs.speedTransitionAlt && inputs.descentSpeed > 250 
      ? Math.max(0, (inputs.descentSpeed - 250) * 0.15) 
      : 0;
    
    // High-wind correction with a logarithmic decay model
    const boundedWind = Math.max(-200, Math.min(200, inputs.descentWind));
    const windSign = boundedWind >= 0 ? 1 : -1;
    const windCorrection = windSign * Math.log10(1 + Math.abs(boundedWind) * 0.15) * (altDiff / 1000) * 1.65;
    
    todDistance = Math.round(Math.max(10, (dbResult.dist * icingDistancePenalty) + windCorrection + decelerationDistance));
    
    // Kinematics and Timings
    const averageTAS = Math.round(350 - (altDiff / 1000) * 2);
    const averageGS = Math.max(100, averageTAS + boundedWind);
    
    const timeMin = (todDistance / averageGS) * 60;
    timeFormatted = `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

    vsi = Math.round(-1 * averageGS * 101.268 * Math.tan((inputs.fpa * Math.PI) / 180));
    glideRatio = altDiff > 0 ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10 : 0;

    // Fuel & Cabin metrics
    fuelFlowLbs = Math.round(dbResult.fuel * icingDistancePenalty + (boundedWind * 0.11));
  }

  if (loading || !descentPerf) return <div className="panel-container"><p>Synchronizing Descent Database...</p></div>;

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
              <label>Field Elev (ft)</label>
              <input 
                type="number" 
                defaultValue={inputs.fieldElevation}
                onBlur={(e) => handleManualEntry('fieldElevation', e.target.value, -500, 14000)}
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

            <div className="input-cell-spatial">
              <label>Destination OAT (°C)</label>
              <input 
                type="number" 
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
            ) : inputs.flightIdleIcing ? (
              <span style={{ color: 'var(--accent-warn)' }}><strong>WARNING:</strong> Flight Idle Icing active. Elevated FADEC thrust demands require an earlier TOD to prevent overshooting the vertical profile.</span>
            ) : inputs.destinationOAT <= 0 ? (
              <span style={{ color: 'var(--accent-warn)' }}><strong>Winter Ops:</strong> Cold temperature correction active. Geometric target alt adjusted to {correctedTargetAlt.toLocaleString()} ft for safety.</span>
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
