import React, { useState, useEffect } from 'react';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D, getLegalMaxAltitude } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const [inputs, setInputs] = useState({
    weight: 115000, // in lbs
    flightLevel: 350,
    isaDev: 0,
    costIndex: 15,
    wind: 10,
    antiIce: false // Operational bleed draw state parameter
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
        console.error("Failed to load cruise database:", err);
        setLoading(false);
      });
  }, []);

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      const nextVal = prev[key] + step;
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  const handleTypeInput = (key, val, min, max) => {
    let parsed = parseInt(val, 10);
    if (isNaN(parsed)) return;
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;
    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  const maxOperatingFL = getLegalMaxAltitude(inputs.weight);
  
  // Guardrail: Automatically down-clamp altitude input if weight boundaries contract
  useEffect(() => {
    if (inputs.flightLevel > maxOperatingFL) {
      setInputs(prev => ({ ...prev, flightLevel: maxOperatingFL }));
    }
  }, [inputs.weight, maxOperatingFL]);

  // Dynamic calculations and conversions
  const correctedCI = getCorrectedCostIndex(inputs.costIndex, inputs.wind);
  const weightLbs = inputs.weight;
  const weightKg = inputs.weight / 2.20462;
  
  let targetMach = 0.74; // Standard safe operational baseline speed
  let isOutOfEnvelope = false;

  // Resolve dynamic altitude key matrix string (e.g., FL350 -> "35000")
  const targetAltKey = (inputs.flightLevel * 100).toString();

  if (cruiseData && cruiseData.cruise_mach_matrix) {
    // Dynamic altitude fallback verification loop
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
      targetMach = 0.74; 
    } else {
      targetMach = Math.round(interpResult * 100) / 100;
    }
  }

  // Atmospheric calculations
  const isaTemp = getISATemperature(inputs.flightLevel * 100);
  const actualTemp = isaTemp + inputs.isaDev;

  // Airspeed vectors
  const tas = Math.round(getTASFromMach(targetMach, actualTemp));
  const gs = Math.round(tas + inputs.wind);

  // High-fidelity performance curves (modulated by weight, Mach, temperature, altitude, and pneumatic draws)
  const baseFFKg = 1550; 
  const machFactor = (targetMach - 0.70) * 4200;
  const weightFactor = (weightKg - 40000) * 0.028;
  const altFactor = (inputs.flightLevel - 330) * -14;
  const antiIceFactor = inputs.antiIce ? 180 : 0; // Flight-idle compressor bleed penalty factor
  
  const fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor + antiIceFactor);
  const fuelFlowLbs = Math.round(fuelFlowKg * 2.20462);

  // Specific Range performance parameter calculation
  const specificRange = fuelFlowLbs > 0 ? Math.round((gs / fuelFlowLbs) * 1000) / 1000 : 0;

  // Optimal Flight Level boundaries evaluation
  const optimalFL = Math.min(maxOperatingFL, Math.round((410 - (inputs.weight - 85000) * 0.00018) / 10) * 10);

  if (loading) return <div className="panel-container"><p>Loading Performance Database...</p></div>;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Cruise Economic Profile & Speed Optimizer</h2>
        <p>Dynamic modulation of Mach/IAS speeds and fuel flow optimization based on cost index and flight level (Units: LBS).</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>In-Flight Cruise Settings</h3>

          {/* High-Tactility Cockpit Entry Blocks */}
          <div className="input-group-tactile">
            <label>Current Aircraft Weight (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('weight', -1000, 85000, 130000)} className="btn-step">──</button>
              <input 
                type="number" 
                value={inputs.weight} 
                onChange={(e) => handleTypeInput('weight', e.target.value, 85000, 130000)}
                className="input-display"
              />
              <button type="button" onClick={() => adjustInput('weight', 1000, 85000, 130000)} className="btn-step">+</button>
            </div>
            <span className="caption">Equivalent to {Math.round(weightKg).toLocaleString()} kg.</span>
          </div>

          <div className="input-group-tactile">
            <label>Flight Level (FL)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('flightLevel', -10, 280, 410)} className="btn-step">──</button>
              <input 
                type="number" 
                value={inputs.flightLevel} 
                className="input-display"
                disabled
              />
              <button type="button" onClick={() => adjustInput('flightLevel', 10, 280, maxOperatingFL)} className="btn-step">+</button>
            </div>
            <span className="caption-limit">Max Aerodynamic Operating Ceiling: FL {maxOperatingFL}</span>
          </div>

          <div className="input-group-tactile">
            <label>ISA Deviation</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('isaDev', -1, -20, 20)} className="btn-step">──</button>
              <span className="value-display">{inputs.isaDev > 0 ? `+${inputs.isaDev}` : inputs.isaDev}°C</span>
              <button type="button" onClick={() => adjustInput('isaDev', 1, -20, 20)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Cost Index (CI)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('costIndex', -5, 0, 120)} className="btn-step">──</button>
              <span className="value-display">CI {inputs.costIndex}</span>
              <button type="button" onClick={() => adjustInput('costIndex', 5, 0, 120)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Wind Component</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('wind', -5, -100, 100)} className="btn-step">──</button>
              <span className="value-display">{inputs.wind >= 0 ? `+${inputs.wind} TW` : `${Math.abs(inputs.wind)} HW`}</span>
              <button type="button" onClick={() => adjustInput('wind', 5, -100, 100)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-toggle">
            <label className="toggle-container">
              <input 
                type="checkbox" 
                checked={inputs.antiIce} 
                onChange={(e) => setInputs(prev => ({ ...prev, antiIce: e.target.checked }))} 
              />
              <span className="toggle-label">Engine Anti-Ice Configuration ACTIVE</span>
            </label>
          </div>
        </div>

        {/* Results Render Target */}
        <div className="results-section glass-panel highlight-accent">
          <h3>Economic Profile Target Output</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Target Speed</span>
              <span className={`value ${isOutOfEnvelope ? 'text-danger' : ''}`}>
                {isOutOfEnvelope ? 'OUT OF ENV' : `M ${targetMach.toFixed(2)}`}
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
            <div className="table-row">
              <span>Optimal Flight Level</span>
              <span className="val highlight">FL {optimalFL}</span>
            </div>
            <div className="table-row">
              <span>True Airspeed (TAS)</span>
              <span>{tas} kt</span>
            </div>
            <div className="table-row">
              <span>Ground Speed (GS)</span>
              <span>{gs} kt</span>
            </div>
            <div className="table-row">
              <span>Wind-Adjusted Cost Index</span>
              <span>{correctedCI}</span>
            </div>
            <div className="table-row">
              <span>Max Operating FL</span>
              <span>FL {maxOperatingFL}</span>
            </div>
          </div>

          <div className="alert-banner info">
            {isOutOfEnvelope ? (
              <span><strong>WARNING:</strong> Flight level/weight intersection falls into an aerodynamic envelope gap. Decrease flight level to restore 1.3g buffet margin guardrail.</span>
            ) : inputs.flightLevel < optimalFL ? (
              <span><strong>Optimizer recommendation:</strong> Climb to <strong>FL {optimalFL}</strong> clears denser atmospheric layers safely.</span>
            ) : inputs.flightLevel > optimalFL ? (
              <span><strong>Optimizer recommendation:</strong> Descent to <strong>FL {optimalFL}</strong> offers better thrust-to-drag and wind profile efficiency.</span>
            ) : (
              <span><strong>Optimizer recommendation:</strong> Cruise at <strong>FL {inputs.flightLevel}</strong> is currently optimal for aircraft weight.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
