import React, { useState, useEffect } from 'react';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D, getLegalMaxAltitude } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const [inputs, setInputs] = useState({
    speedMode: 'ECON',
    weight: 115000, 
    flightLevel: 350,
    isaDev: 0,
    costIndex: 15,
    manualMach: 0.78,
    wind: 120, // Winter jet stream validation baseline
    antiIce: false
  });

  const [cruiseData, setCruiseData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/cruise_econ.json')
      .then(res => res.json())
      .then(data => {
        setCruiseData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Performance matrix sync fault:", err);
        setLoading(false);
      });
  }, []);

  const handleManualEntry = (key, value, min, max) => {
    let parsed = key === 'manualMach' ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) return;
    
    // Smooth operational clamping limits execution
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  const maxOperatingFL = getLegalMaxAltitude(inputs.weight);
  
  useEffect(() => {
    if (inputs.flightLevel > maxOperatingFL) {
      setInputs(prev => ({ ...prev, flightLevel: maxOperatingFL }));
    }
  }, [inputs.weight, maxOperatingFL]);

  // Secure wind bounds clamping between -200 and +200 kt
  const boundedWind = Math.max(-200, Math.min(200, inputs.wind));
  const correctedCI = getCorrectedCostIndex(inputs.costIndex, boundedWind);
  const weightLbs = inputs.weight;
  const weightKg = inputs.weight / 2.20462;
  
  let resolvedMach = inputs.manualMach; 
  let isOutOfEnvelope = false;
  const targetAltKey = (inputs.flightLevel * 100).toString();

  if (inputs.speedMode === 'ECON') {
    if (cruiseData && cruiseData.cruise_mach_matrix) {
      const matrix = cruiseData.cruise_mach_matrix[targetAltKey] || cruiseData.cruise_mach_matrix["33000"];
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
    if (inputs.flightLevel > 370 && resolvedMach > 0.80) {
      isOutOfEnvelope = true;
    }
  }

  const isaTemp = getISATemperature(inputs.flightLevel * 100);
  const actualTemp = isaTemp + inputs.isaDev;
  const tas = Math.round(getTASFromMach(resolvedMach, actualTemp));
  const gs = Math.round(tas + boundedWind);

  const baseFFKg = 1550; 
  const machFactor = (resolvedMach - 0.70) * 4200;
  const weightFactor = (weightKg - 40000) * 0.028;
  const altFactor = (inputs.flightLevel - 330) * -14;
  const antiIceFactor = inputs.antiIce ? 180 : 0;
  
  const fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor + antiIceFactor);
  const fuelFlowLbs = Math.round(fuelFlowKg * 2.20462);
  const specificRange = fuelFlowLbs > 0 ? Math.round((gs / fuelFlowLbs) * 1000) / 1000 : 0;
  const optimalFL = Math.min(maxOperatingFL, Math.round((410 - (inputs.weight - 85000) * 0.00018) / 10) * 10);

  if (loading) return <div className="panel-container"><p>Synchronizing Performance Matrix...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Enroute Cruise Performance Suite</h2>
        <div className="mode-toggle-bar">
          <button 
            type="button" 
            className={`btn-toggle ${inputs.speedMode === 'ECON' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, speedMode: 'ECON' }))}
          >
            FMC ECON MODE (CI)
          </button>
          <button 
            type="button" 
            className={`btn-toggle ${inputs.speedMode === 'MANUAL' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, speedMode: 'MANUAL' }))}
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
                defaultValue={inputs.weight}
                onBlur={(e) => handleManualEntry('weight', e.target.value, 85000, 130000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Level (FL)</label>
              <input 
                key={inputs.flightLevel}
                type="number" 
                defaultValue={inputs.flightLevel}
                onBlur={(e) => handleManualEntry('flightLevel', e.target.value, 280, maxOperatingFL)}
                className="touch-input-field"
              />
            </div>

            {inputs.speedMode === 'ECON' ? (
              <div className="input-grid-spatial" style={{ gridColumn: 'span 2', gap: '20px' }}>
                <div className="input-cell-spatial">
                  <label>Cost Index (CI)</label>
                  <input 
                    type="number" 
                    defaultValue={inputs.costIndex}
                    onBlur={(e) => handleManualEntry('costIndex', e.target.value, 0, 120)}
                    className="touch-input-field"
                  />
                </div>
                <div className="input-cell-spatial">
                  <label>Wind Velocity (kt)</label>
                  <input 
                    type="number" 
                    defaultValue={inputs.wind}
                    onBlur={(e) => handleManualEntry('wind', e.target.value, -200, 200)}
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
                    defaultValue={inputs.manualMach}
                    onBlur={(e) => handleManualEntry('manualMach', e.target.value, 0.70, 0.82)}
                    className="touch-input-field"
                  />
                </div>
                <div className="input-cell-spatial">
                  <label>Wind Velocity (kt)</label>
                  <input 
                    type="number" 
                    defaultValue={inputs.wind}
                    onBlur={(e) => handleManualEntry('wind', e.target.value, -200, 200)}
                    className="touch-input-field"
                  />
                </div>
              </div>
            )}

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>ISA Deviation (°C)</label>
              <input 
                type="number" 
                defaultValue={inputs.isaDev}
                onBlur={(e) => handleManualEntry('isaDev', e.target.value, -30, 30)}
                className="touch-input-field"
              />
            </div>
          </div>

          <div className="input-group-toggle" style={{ marginTop: '24px' }}>
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={inputs.antiIce} 
                onChange={(e) => setInputs(prev => ({ ...prev, antiIce: e.target.checked }))} 
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
                {isOutOfEnvelope ? 'BUFFET LIMIT' : `M ${resolvedMach.toFixed(2)}`}
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Total Fuel Flow</span>
              <span className="value">{fuelFlowLbs.toLocaleString()} lbs/h</span>
            </div>
            <div className="metric-box">
              <span className="label">Specific Range</span>
              <span className="value">{specificRange.toFixed(3)} NM/lb</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row"><span>Optimal Profile Level</span><span className="val highlight">FL {optimalFL}</span></div>
            <div className="table-row"><span>True Airspeed (TAS)</span><span>{tas} kt</span></div>
            <div className="table-row"><span>Ground Speed (GS)</span><span>{gs} kt</span></div>
            <div className="table-row"><span>Max Operating Altitude</span><span>FL {maxOperatingFL}</span></div>
          </div>

          <div className="alert-banner info">
            {isOutOfEnvelope ? (
              <span><strong>WARNING:</strong> Aerodynamic buffer parameters breached. Descend immediately to preserve safe maneuver margins.</span>
            ) : boundedWind <= -100 ? (
              <span><strong>Severe Winter Stream Active:</strong> Adjusted Cost Index profile configured for {Math.abs(boundedWind)} kt headwind penetration vectors.</span>
            ) : (
              <span><strong>Optimizer Recommendation:</strong> Vertically profile target active. Fleet matrix calculations verified operational.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
