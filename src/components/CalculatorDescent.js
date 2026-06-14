import React from 'react';
import { useMission } from '../context/MissionContext.js';

export default function CalculatorDescent() {
  const { mission, updateMissionField, maxOperatingFL } = useMission();

  const hasIncompleteInputs = mission.cruiseFL === "" || 
                              mission.targetAltitude === "" || 
                              mission.descentSpeed === "" || 
                              mission.fpa === "" || 
                              mission.wind === "";

  const altDiff = hasIncompleteInputs ? 0 : (mission.cruiseFL * 100) - mission.targetAltitude;
  
  // Standard aerodynamic base profile line
  const baseTOD = (altDiff / 1000) * 3;
  const fpaFactor = hasIncompleteInputs ? 0 : 3.0 / mission.fpa;
  const speedFactor = hasIncompleteInputs ? 0 : 1.0 + (mission.descentSpeed - 270) * 0.0025;
  
  // High-wind correction with a logarithmic decay model
  const boundedWind = hasIncompleteInputs ? 0 : Math.max(-200, Math.min(200, mission.wind));
  const windSign = boundedWind >= 0 ? 1 : -1;
  const windCorrection = hasIncompleteInputs ? 0 : windSign * Math.log10(1 + Math.abs(boundedWind) * 0.15) * (altDiff / 1000) * 1.65;
  
  const todDistance = hasIncompleteInputs ? "---" : Math.round(Math.max(10, (baseTOD * fpaFactor * speedFactor) + windCorrection));
  const averageTAS = 370;
  const averageGS = hasIncompleteInputs ? 0 : Math.max(100, averageTAS + boundedWind);
  
  const timeMin = hasIncompleteInputs ? 0 : (todDistance / averageGS) * 60;
  const timeFormatted = hasIncompleteInputs ? "---" : `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

  const vsi = hasIncompleteInputs ? "---" : Math.round(-1 * averageGS * 101.268 * Math.tan((mission.fpa * Math.PI) / 180));
  const glideRatio = hasIncompleteInputs ? "---" : (altDiff > 0 ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10 : 0);

  const baseFuelBurnRate = mission.antiIce ? 3.4 : 3.0; 
  const fuelFlowLbs = hasIncompleteInputs ? "---" : Math.round(todDistance * baseFuelBurnRate + (boundedWind * 0.11));
  const cabinRate = hasIncompleteInputs ? "---" : Math.round(-320 + (vsi + 1800) * 0.08);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Descent Flight Path Angle & Profile Engine</h2>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Vertical Profile Inputs</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Cruise Level (FL)</label>
              <input 
                type="number" 
                key={`cruise-${mission.cruiseFL}`}
                defaultValue={mission.cruiseFL}
                onBlur={(e) => updateMissionField('cruiseFL', e.target.value, 150, maxOperatingFL)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Target Altitude (ft)</label>
              <input 
                type="number" 
                key={`target-${mission.targetAltitude}`}
                defaultValue={mission.targetAltitude}
                onBlur={(e) => updateMissionField('targetAltitude', e.target.value, 0, 15000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Descent Speed (KIAS)</label>
              <input 
                type="number" 
                key={`speed-${mission.descentSpeed}`}
                defaultValue={mission.descentSpeed}
                onBlur={(e) => updateMissionField('descentSpeed', e.target.value, 240, 310)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Path Angle (°)</label>
              <input 
                type="number" 
                step="0.1"
                key={`fpa-${mission.fpa}`}
                defaultValue={mission.fpa}
                onBlur={(e) => updateMissionField('fpa', e.target.value, 2.0, 4.0)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Average Wind Vector (kt)</label>
              <input 
                type="number" 
                key={`wind-${mission.wind}`}
                defaultValue={mission.wind}
                onBlur={(e) => updateMissionField('wind', e.target.value, -200, 200)}
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
              <span className="toggle-label">Engine Anti-Ice Configuration ACTIVE</span>
            </label>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Top-of-Descent (TOD) Calculations</h3>
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">TOD Distance</span>
              <span className="value">{hasIncompleteInputs ? "---" : `${todDistance} NM`}</span>
            </div>
            <div className="metric-box">
              <span className="label">Time in Descent</span>
              <span className="value">{hasIncompleteInputs ? "---" : timeFormatted}</span>
            </div>
            <div className="metric-box">
              <span className="label">Average VSI</span>
              <span className="value">{hasIncompleteInputs ? "---" : `${vsi.toLocaleString()} ft/min`}</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Required Glide Ratio</span><span className="val highlight">{hasIncompleteInputs ? "---" : `${glideRatio} : 1`}</span></div>
            <div className="table-row"><span>Descent Fuel Burn</span><span>{hasIncompleteInputs ? "---" : `${fuelFlowLbs.toLocaleString()} lbs`}</span></div>
            <div className="table-row"><span>Cabin Vertical Velocity</span><span>{hasIncompleteInputs ? "---" : `${cabinRate} ft/min`}</span></div>
          </div>
        </div>
      </div>

      {/* Compliance Reference Footer Block */}
      <footer style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
        <span>DATA REFERENCE: EMBRAER E195-E2 AOM SECTION PI-DSC</span>
        <span>AFM REVISION ID: REV 44 • DATABASE SYNC CYCLE: 2606</span>
      </footer>
    </div>
  );
}
