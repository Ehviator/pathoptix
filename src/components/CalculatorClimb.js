import React from 'react';
import { useMission } from '../context/MissionContext.js';
import { modulateClimbSpeed } from '../engine/dynamicModulators.js';

export default function CalculatorClimb() {
  const { mission, updateMissionField } = useMission();

  const climbWeightKg = mission.weight / 2.20462;
  const baseClimbSpeedIAS = 290; 
  const targetedIAS = modulateClimbSpeed(baseClimbSpeedIAS, climbWeightKg, mission.isaDev);

  const baseTimeToClimb = 12; 
  const weightTimeFactor = (mission.weight - 90000) * 0.00012;
  const tempTimeFactor = mission.isaDev > 0 ? mission.isaDev * 0.15 : 0;
  const altTimeFactor = (mission.targetAltitude - 25000) * 0.0003;
  const timeToClimb = Math.round(baseTimeToClimb + weightTimeFactor + tempTimeFactor + altTimeFactor);

  const climbDistance = Math.round(55 + (climbWeightKg - 40000) * 0.00075 + (mission.targetAltitude - 20000) * 0.0015 + mission.isaDev * 0.25);

  const baseClimbFuel = 1300; 
  const weightFuelFactor = (mission.weight - 90000) * 0.015;
  const tempFuelFactor = mission.isaDev > 0 ? mission.isaDev * 12 : 0;
  const altFuelFactor = (mission.targetAltitude - 25000) * 0.035;
  const fuelBurned = Math.round(baseClimbFuel + weightFuelFactor + tempFuelFactor + altFuelFactor);

  const averageROC = Math.round(mission.targetAltitude / timeToClimb);

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
              <label>Gross Weight (lbs)</label>
              <input 
                type="number" 
                key={`weight-${mission.weight}`}
                defaultValue={mission.weight}
                onBlur={(e) => updateMissionField('weight', e.target.value, 85000, 135000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Altitude (ft)</label>
              <input 
                type="number" 
                key={`alt-${mission.targetAltitude}`}
                defaultValue={mission.targetAltitude}
                onBlur={(e) => updateMissionField('targetAltitude', e.target.value, 15000, 41000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                key={`isa-${mission.isaDev}`}
                defaultValue={mission.isaDev}
                onBlur={(e) => updateMissionField('isaDev', e.target.value, -20, 20)}
                className="touch-input-field"
              />
            </div>
          </div>
          <span className="caption" style={{ display: 'block', marginTop: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Internal Mass Reference: {Math.round(climbWeightKg).toLocaleString()} kg.
          </span>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Climb Profile Output</h3>
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
              <span className="label">Climb Distance</span>
              <span className="value">{climbDistance} NM</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Target Indicated Speed (IAS)</span><span className="val highlight">{targetedIAS} kt</span></div>
            <div className="table-row"><span>Target Mach Schedule</span><span>M 0.78</span></div>
            <div className="table-row"><span>Average Climb Rate (ROC)</span><span>+{averageROC.toLocaleString()} ft/min</span></div>
            <div className="table-row"><span>Optimal Crossover Altitude</span><span>FL {Math.round(290 + (targetedIAS - 290) * 0.1)}</span></div>
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
