import React from 'react';
import { useMission } from '../context/MissionContext.js';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';
import { interpolate2D, interpolate1D } from '../engine/interpolation.js';

export default function CalculatorClimb() {
  const { mission, updateMissionField, climbPerf } = useMission();

  const hasIncompleteInputs = mission.weight === "" || mission.climbFL === "" || mission.isaDev === "";

  // Convert FL to feet for internal calculations (e.g., FL360 = 36000 ft)
  const targetAltFt = hasIncompleteInputs ? 0 : mission.climbFL * 100;
  const climbWeightKg = hasIncompleteInputs ? 0 : mission.weight / 2.20462;
  const baseClimbSpeedIAS = 290; 
  const targetedIAS = hasIncompleteInputs ? "---" : modulateClimbSpeed(baseClimbSpeedIAS, climbWeightKg, mission.isaDev);

  // --- Matrix-based climb performance interpolation ---
  let timeToClimb = "---";
  let fuelBurned = "---";
  let climbDistance = "---";
  let isOutOfEnvelope = false;

  // Helper function for 2D climb performance matrix lookup at a given altitude
  const getClimbPerfForAlt = (alt, weight, isaDev) => {
    if (!climbPerf || !climbPerf.climb_profiles) return null;
    if (alt <= 0) return { time: 0, fuel: 0, dist: 0 };

    const profiles = climbPerf.climb_profiles;
    const altKeys = Object.keys(profiles).map(Number).sort((a, b) => a - b);

    // If alt is below the lowest defined tier (15000), interpolate between 0 and 15000
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

    // Otherwise, standard bracket search
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

    // Interpolate at lower altitude tier
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

  const depElevFt = mission.departureElev === "" ? 0 : parseFloat(mission.departureElev);

  if (!hasIncompleteInputs && climbPerf && climbPerf.climb_profiles) {
    if (targetAltFt <= depElevFt) {
      isOutOfEnvelope = true;
    } else {
      const weight = mission.weight;
      const isaDev = mission.isaDev;

      // Iteration 1: Predict weight reduction mid-climb
      const initialFuelEstimate = Math.max(500, Math.min(5000, (targetAltFt - depElevFt) * 0.1));
      const weightFirst = weight - (initialFuelEstimate / 2);

      const perfCruiseFirst = getClimbPerfForAlt(targetAltFt, weightFirst, isaDev);
      const perfDepFirst = getClimbPerfForAlt(depElevFt, weightFirst, isaDev);

      if (!perfCruiseFirst || !perfDepFirst) {
        isOutOfEnvelope = true;
      } else {
        const fuelBurnFirst = perfCruiseFirst.fuel - perfDepFirst.fuel;

        // Iteration 2: Refine lookups using calculated average weight
        const weightSecond = weight - (fuelBurnFirst / 2);
        const perfCruiseSecond = getClimbPerfForAlt(targetAltFt, weightSecond, isaDev);
        const perfDepSecond = getClimbPerfForAlt(depElevFt, weightSecond, isaDev);

        if (!perfCruiseSecond || !perfDepSecond) {
          isOutOfEnvelope = true;
        } else {
          timeToClimb = Math.round(perfCruiseSecond.time - perfDepSecond.time);
          fuelBurned = Math.round(perfCruiseSecond.fuel - perfDepSecond.fuel);
          climbDistance = Math.round(perfCruiseSecond.dist - perfDepSecond.dist);

          if (timeToClimb < 0) timeToClimb = 0;
          if (fuelBurned < 0) fuelBurned = 0;
          if (climbDistance < 0) climbDistance = 0;
        }
      }
    }
  }

  const averageROC = hasIncompleteInputs || timeToClimb === "---" || timeToClimb === 0 ? "---" : Math.round((targetAltFt - depElevFt) / timeToClimb);
  const crossoverAlt = hasIncompleteInputs || targetedIAS === "---" ? "---" : Math.round(290 + (targetedIAS - 290) * 0.1);

  if (!climbPerf) return <div className="panel-container"><div className="loading-container"><div className="loading-spinner"></div><p>Synchronizing Climb Performance Database...</p></div></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Climb Profile & Speed Optimizer</h2>
        <p>Calculates climb speeds, time to climb, fuel burn, and ground distance to Top of Climb (TOC).</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Climb Setup Inputs</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Takeoff Weight (lbs)</label>
              <input 
                type="number" 
                key={`weight-${mission.weight}`}
                defaultValue={mission.weight}
                onBlur={(e) => updateMissionField('weight', e.target.value, 60000, 150000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Flight Level</label>
              <input 
                type="number" 
                key={`climbfl-${mission.climbFL}`}
                defaultValue={mission.climbFL}
                onBlur={(e) => updateMissionField('climbFL', e.target.value, 150, 410)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                key={`isa-${mission.isaDev}`}
                defaultValue={mission.isaDev}
                onBlur={(e) => updateMissionField('isaDev', e.target.value, -30, 30)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Departure Elevation (ft)</label>
              <input 
                type="number" 
                key={`depElev-${mission.departureElev}`}
                defaultValue={mission.departureElev}
                onBlur={(e) => updateMissionField('departureElev', e.target.value, 0, 10000)}
                className="touch-input-field"
              />
            </div>
          </div>
          <span className="caption" style={{ display: 'block', marginTop: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Internal Mass Reference: {hasIncompleteInputs ? "---" : Math.round(climbWeightKg).toLocaleString()} kg.
          </span>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Climb Profile Output</h3>
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Time to Climb</span>
              <span className={`value ${isOutOfEnvelope ? 'text-danger' : ''}`}>{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : hasIncompleteInputs ? "---" : `${timeToClimb} min`}</span>
            </div>
            <div className="metric-box">
              <span className="label">Fuel Burned</span>
              <span className={`value ${isOutOfEnvelope ? 'text-danger' : ''}`}>{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : hasIncompleteInputs ? "---" : `${fuelBurned.toLocaleString()} lbs`}</span>
            </div>
            <div className="metric-box">
              <span className="label">Climb Distance</span>
              <span className={`value ${isOutOfEnvelope ? 'text-danger' : ''}`}>{isOutOfEnvelope ? "EXCEEDS ENVELOPE" : hasIncompleteInputs ? "---" : `${climbDistance} NM`}</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Target Indicated Speed (IAS)</span><span className="val highlight">{hasIncompleteInputs ? "---" : `${targetedIAS} kt`}</span></div>
            <div className="table-row"><span>Target Mach Schedule</span><span>{hasIncompleteInputs ? "---" : "M 0.78"}</span></div>
            <div className="table-row"><span>Average Climb Rate (ROC)</span><span>{hasIncompleteInputs || averageROC === "---" ? "---" : `+${averageROC.toLocaleString()} ft/min`}</span></div>
            <div className="table-row"><span>Optimal Crossover Altitude</span><span>{hasIncompleteInputs || crossoverAlt === "---" ? "---" : `FL ${crossoverAlt}`}</span></div>
          </div>
        </div>
      </div>

      {/* Compliance Reference Footer Block */}
      <footer style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
        <span>DATA REFERENCE: EMBRAER E195-E2 AOM SECTION PI-CLB</span>
        <span>AFM REVISION ID: REV 44 • DATABASE SYNC CYCLE: 2606</span>
      </footer>
    </div>
  );
}
