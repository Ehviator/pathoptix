import React, { useState, useEffect } from 'react';
import { useMission } from '../context/MissionContext.js';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { interpolate2D, interpolate1D } from '../engine/interpolation.js';

export default function CalculatorClimb() {
  const { mission, updateMissionField, climbPerf, loading } = useMission();

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
  
  // Matrix-based climb performance lookup
  const getClimbPerfForAlt = (alt, weight, isaDev) => {
    if (!climbPerf || !climbPerf.climb_profiles) return null;
    if (alt <= 0) return { time: 0, fuel: 0, dist: 0 };

    const profiles = climbPerf.climb_profiles;
    const altKeys = Object.keys(profiles).map(Number).sort((a, b) => a - b);

    // If altitude is below the first tier (15,000 ft), interpolate between Sea Level (0) and 15,000 ft
    if (alt < altKeys[0]) {
      const altHigh = altKeys[0];
      const profileHigh = profiles[altHigh.toString()];

      const timeHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.time_min);
      const fuelHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.fuel_lbs);
      const distHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.distance_nm);

      if (timeHigh === null || fuelHigh === null || distHigh === null) {
        return null;
      }

      return {
        time: interpolate1D(alt, 0, altHigh, 0, timeHigh),
        fuel: interpolate1D(alt, 0, altHigh, 0, fuelHigh),
        dist: interpolate1D(alt, 0, altHigh, 0, distHigh)
      };
    }

    // Bracket standard altitude search
    let altLow = altKeys[0];
    let altHigh = altKeys[altKeys.length - 1];

    if (alt >= altKeys[altKeys.length - 1]) {
      altLow = altHigh = altKeys[altKeys.length - 1];
    } else {
      for (let i = 0; i < altKeys.length - 1; i++) {
        if (alt >= altKeys[i] && alt <= altKeys[i + 1]) {
          altLow = altKeys[i];
          altHigh = altKeys[i + 1];
          break;
        }
      }
    }

    const profileLow = profiles[altLow.toString()];
    const profileHigh = profiles[altHigh.toString()];

    const timeLow = interpolate2D(weight, isaDev, profileLow.weights, profileLow.isa_headers, profileLow.time_min);
    const fuelLow = interpolate2D(weight, isaDev, profileLow.weights, profileLow.isa_headers, profileLow.fuel_lbs);
    const distLow = interpolate2D(weight, isaDev, profileLow.weights, profileLow.isa_headers, profileLow.distance_nm);

    if (altLow === altHigh) {
      if (timeLow === null || fuelLow === null || distLow === null) {
        return null;
      }
      return { time: timeLow, fuel: fuelLow, dist: distLow };
    } else {
      const timeHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.time_min);
      const fuelHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.fuel_lbs);
      const distHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.distance_nm);

      if (timeLow === null || timeHigh === null || fuelLow === null || fuelHigh === null || distLow === null || distHigh === null) {
        return null;
      }
      return {
        time: interpolate1D(alt, altLow, altHigh, timeLow, timeHigh),
        fuel: interpolate1D(alt, altLow, altHigh, fuelLow, fuelHigh),
        dist: interpolate1D(alt, altLow, altHigh, distLow, distHigh)
      };
    }
  };

  let timeToClimb = "---";
  let fuelBurned = "---";
  let climbDistance = "---";
  let isOutOfEnvelope = false;
  let totalWindDisplacement = 0;

  // Alternate profile variables
  let altTimeToClimb = 0;
  let altFuelBurned = 0;
  let altClimbDistance = 0;
  let timeDelta = 0;
  let fuelDelta = 0;
  let distDelta = 0;

  const perfTarget = getClimbPerfForAlt(trueTargetAlt, inputs.climbWeight, inputs.isaDev);
  const perfField = getClimbPerfForAlt(trueFieldAlt, inputs.climbWeight, inputs.isaDev);

  if (perfTarget === null || perfField === null) {
    isOutOfEnvelope = true;
  } else if (perfTarget && perfField) {
    const rawTime = perfTarget.time - perfField.time;
    const rawFuel = perfTarget.fuel - perfField.fuel;
    const rawDist = perfTarget.dist - perfField.dist;

    const atcPenaltyTime = inputs.atcSpeedRestriction && effectiveClimbAlt > 10000 ? 1.8 : 0;
    const antiIcePenaltyTime = inputs.antiIce ? (effectiveClimbAlt / 1000) * 0.06 : 0;
    const antiIceFuelPenalty = inputs.antiIce ? (effectiveClimbAlt / 1000) * 14 : 0;

    timeToClimb = Math.max(1, Math.round(rawTime + atcPenaltyTime + antiIcePenaltyTime));
    fuelBurned = Math.round(rawFuel + antiIceFuelPenalty);
    
    // Wind factor on distance
    const timeBelow180 = Math.min(timeToClimb, 10);
    const timeAbove180 = Math.max(0, timeToClimb - 10);
    const windEffectBelow = (inputs.windBelow180 * (timeBelow180 / 60));
    const windEffectAbove = (inputs.windAbove180 * (timeAbove180 / 60));
    totalWindDisplacement = windEffectBelow + windEffectAbove;

    climbDistance = Math.max(5, Math.round(rawDist + totalWindDisplacement));

    // Alternate Speed calculations (comparing custom IAS/Mach against standard 290/.76)
    const altIas = inputs.compareIas !== undefined ? inputs.compareIas : 290;
    const altMach = inputs.compareMach !== undefined ? inputs.compareMach : 0.76;

    const iasRatio = altIas / 290;

    // Slower speeds take slightly more time, but faster speeds take significantly more time due to drag & lower ROC
    const vDiff = altIas - 290;
    const timeMultIas = vDiff >= 0
      ? 1.0 + 0.6 * (vDiff / 290) + 2.0 * Math.pow(vDiff / 290, 2)
      : 1.0 + 0.25 * Math.abs(vDiff / 290);

    const mDiff = altMach - 0.76;
    const timeMultMach = mDiff >= 0
      ? 1.0 + 0.6 * (mDiff / 0.76) + 2.0 * Math.pow(mDiff / 0.76, 2)
      : 1.0 + 0.25 * Math.abs(mDiff / 0.76);

    const timeMult = 0.8 * timeMultIas + 0.2 * timeMultMach;

    // Fuel flow scales exponentially (V^2.2) due to aerodynamic drag
    const ffMultIas = Math.pow(altIas / 290, 2.2);
    const ffMachRatio = altMach / 0.76;
    const ffMultMach = Math.pow(ffMachRatio, 2.2);
    const ffMult = 0.8 * ffMultIas + 0.2 * ffMultMach;

    altTimeToClimb = Math.max(1, Math.round(timeToClimb * timeMult));
    altFuelBurned = Math.round(fuelBurned * timeMult * ffMult);

    const altDistStillAir = rawDist * iasRatio * timeMult;
    const altTimeBelow180 = Math.min(altTimeToClimb, 10);
    const altTimeAbove180 = Math.max(0, altTimeToClimb - 10);
    const altWindEffectBelow = (inputs.windBelow180 * (altTimeBelow180 / 60));
    const altWindEffectAbove = (inputs.windAbove180 * (altTimeAbove180 / 60));
    const altTotalWindDisplacement = altWindEffectBelow + altWindEffectAbove;

    altClimbDistance = Math.max(5, Math.round(altDistStillAir + altTotalWindDisplacement));

    timeDelta = altTimeToClimb - timeToClimb;
    fuelDelta = altFuelBurned - fuelBurned;
    distDelta = altClimbDistance - climbDistance;
  }

  const averageROC = timeToClimb > 0 && !isOutOfEnvelope ? Math.round(effectiveClimbAlt / timeToClimb) : 0;

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
