import React, { useState, useEffect } from 'react';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D, getLegalMaxAltitude } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const [inputs, setInputs] = useState({
    speedMode: 'ECON', // Dual States: 'ECON' or 'MANUAL'
    weight: 115000, 
    flightLevel: 350,
    isaDev: 0,
    costIndex: 15,
    manualMach: 0.78, // Direct targeting parameter
    wind: 10,
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
        console.error("Database initialization fault:", err);
        setLoading(false);
      });
  }, []);

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      let nextVal = prev[key] + step;
      // Handle floating point precision rounding issues for manualMach
      if (key === 'manualMach') {
        nextVal = Math.round(nextVal * 100) / 100;
      }
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  const maxOperatingFL = getLegalMaxAltitude(inputs.weight);
  
  useEffect(() => {
    if (inputs.flightLevel > maxOperatingFL) {
      setInputs(prev => ({ ...prev, flightLevel: maxOperatingFL }));
    }
  }, [inputs.weight, maxOperatingFL]);

  // Performance Math Ingestion Pipelines
  const correctedCI = getCorrectedCostIndex(inputs.costIndex, inputs.wind);
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
    // MANUAL Mode Boundary Clamping
    if (inputs.flightLevel > 370 && resolvedMach > 0.80) {
      isOutOfEnvelope = true; // Protect high altitude buffet boundaries
    }
  }

  const isaTemp = getISATemperature(inputs.flightLevel * 100);
  const actualTemp = isaTemp + inputs.isaDev;
  const tas = Math.round(getTASFromMach(resolvedMach, actualTemp));
  const gs = Math.round(tas + inputs.wind);

  // High-Fidelity Performance Fuel Curves
  const baseFFKg = 1550; 
  const machFactor = (resolvedMach - 0.70) * 4200;
  const weightFactor = (weightKg - 40000) * 0.028;
  const altFactor = (inputs.flightLevel - 330) * -14;
  const antiIceFactor = inputs.antiIce ? 180 : 0;
  
  const fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor + antiIceFactor);
  const fuelFlowLbs = Math.round(fuelFlowKg * 2.20462);
  const specificRange = fuelFlowLbs > 0 ? Math.round((gs / fuelFlowLbs) * 1000) / 1000 : 0;
  const optimalFL = Math.min(maxOperatingFL, Math.round((410 - (inputs.weight - 85000) * 0.00018) / 10) * 10);

  if (loading) return <div className="panel-container"><p>Loading Performance Database...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Cruise Performance & Speed Advisor</h2>
        
        {/* Uniform Styling Segment: Primary State Toggles */}
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
            MANUAL SPEED SELECT (MACH)
          </button>
        </div>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>In-Flight Parameters</h3>

          <div className="input-group-tactile">
            <label>Gross Weight (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('weight', -1000, 85000, 130000)} className="btn-step">──</button>
              <span className="value-display">{inputs.weight.toLocaleString()} lbs</span>
              <button type="button" onClick={() => adjustInput('weight', 1000, 85000, 130000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Flight Level (FL)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('flightLevel', -10, 280, 410)} className="btn-step">──</button>
              <span className="value-display">FL {inputs.flightLevel}</span>
              <button type="button" onClick={() => adjustInput('flightLevel', 10, 280, maxOperatingFL)} className="btn-step">+</button>
            </div>
          </div>

          {/* Dynamic Context Input Rendering */}
          {inputs.speedMode === 'ECON' ? (
            <div className="input-group-tactile">
              <label>Cost Index (CI)</label>
              <div className="tactile-row">
                <button type="button" onClick={() => adjustInput('costIndex', -5, 0, 120)} className="btn-step">──</button>
                <span className="value-display">CI {inputs.costIndex}</span>
                <button type="button" onClick={() => adjustInput('costIndex', 5, 0, 120)} className="btn-step">+</button>
              </div>
            </div>
          ) : (
            <div className="input-group-tactile">
              <label>Target Cruise Mach</label>
              <div className="tactile-row">
                <button type="button" onClick={() => adjustInput('manualMach', -0.01, 0.70, 0.82)} className="btn-step">──</button>
                <span className="value-display">M {inputs.manualMach.toFixed(2)}</span>
                <button type="button" onClick={() => adjustInput('manualMach', 0.01, 0.70, 0.82)} className="btn-step">+</button>
              </div>
            </div>
          )}

          <div className="input-group-tactile">
            <label>Wind Component</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('wind', -5, -100, 100)} className="btn-step">──</button>
              <span className="value-display">{inputs.wind >= 0 ? `+${inputs.wind} TW` : `${Math.abs(inputs.wind)} HW`}</span>
              <button type="button" onClick={() => adjustInput('wind', 5, -100, 100)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>ISA Deviation</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('isaDev', -1, -20, 20)} className="btn-step">──</button>
              <span className="value-display">{inputs.isaDev > 0 ? `+${inputs.isaDev}` : inputs.isaDev}°C</span>
              <button type="button" onClick={() => adjustInput('isaDev', 1, -20, 20)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-toggle">
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={inputs.antiIce} 
                onChange={(e) => setInputs(prev => ({ ...prev, antiIce: e.target.checked }))} 
              />
              <span className="toggle-label">Engine Anti-Ice active</span>
            </label>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Calculated Targets</h3>

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
            <div className="table-row"><span>Max Operating Altitude</span><span>FL {maxOperatingFL}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
