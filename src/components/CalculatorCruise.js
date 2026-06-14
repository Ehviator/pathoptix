import React, { useState, useEffect } from 'react';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const [inputs, setInputs] = useState({
    weight: 52000,
    flightLevel: 350,
    isaDev: 0,
    costIndex: 15,
    wind: 10
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

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  // Perform dynamic calculations
  const correctedCI = getCorrectedCostIndex(inputs.costIndex, inputs.wind);
  
  // Convert Weight from KG to LBS for matrix query
  const weightLbs = inputs.weight * 2.20462;
  
  let targetMach = 0.78; // Fallback default
  if (cruiseData && cruiseData.cruise_mach_matrix && cruiseData.cruise_mach_matrix["33000"]) {
    const matrix = cruiseData.cruise_mach_matrix["33000"];
    // Bounded search
    targetMach = interpolate2D(
      weightLbs,
      correctedCI,
      matrix.weights,
      matrix.cost_index_headers,
      matrix.data
    );
  }

  // Round target Mach to 2 decimal places
  targetMach = Math.round(targetMach * 100) / 100;

  // Temperature calculations
  const isaTemp = getISATemperature(inputs.flightLevel * 100);
  const actualTemp = isaTemp + inputs.isaDev;

  // Speeds
  const tas = Math.round(getTASFromMach(targetMach, actualTemp));
  const gs = Math.round(tas + inputs.wind);

  // Fuel Flow Model (modulated by Mach, weight, OAT, and altitude)
  const baseFF = 1600; // Base fuel flow kg/h for twin engine E195-E2
  const machFactor = (targetMach - 0.70) * 4000;
  const weightFactor = (inputs.weight - 40000) * 0.025;
  const tempFactor = inputs.isaDev * 10;
  const altFactor = (inputs.flightLevel - 330) * -12;
  
  const fuelFlow = Math.round(Math.max(1200, baseFF + machFactor + weightFactor + tempFactor + altFactor));

  // Specific Range: NM per kg of fuel
  const specificRange = fuelFlow > 0 ? Math.round((gs / fuelFlow) * 1000) / 1000 : 0;

  // Optimal Flight Level (higher altitude is optimal for lower weights)
  const optimalFL = Math.round((410 - (inputs.weight - 38000) * 0.0004) / 10) * 10;
  const maxOperatingFL = 410; // Structural limit

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Cruise Economic Profile & Speed Optimizer</h2>
        <p>Dynamic modulation of Mach/IAS speeds and fuel flow optimization based on cost index and flight level.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>In-Flight Cruise Settings</h3>

          <div className="input-group">
            <label>Current Aircraft Weight: {inputs.weight.toLocaleString()} kg</label>
            <input 
              type="range" 
              min="38000" 
              max="58000" 
              step="500" 
              value={inputs.weight} 
              onChange={(e) => handleInputChange('weight', parseInt(e.target.value))} 
            />
            <span className="caption">Equivalent to {(inputs.weight * 2.20462).toLocaleString(undefined, {maximumFractionDigits: 0})} lbs.</span>
          </div>

          <div className="input-group">
            <label>Flight Level (FL): FL {inputs.flightLevel}</label>
            <input 
              type="range" 
              min="280" 
              max="410" 
              step="10" 
              value={inputs.flightLevel} 
              onChange={(e) => handleInputChange('flightLevel', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>ISA Deviation: {inputs.isaDev > 0 ? `+${inputs.isaDev}` : inputs.isaDev}°C</label>
            <input 
              type="range" 
              min="-20" 
              max="20" 
              value={inputs.isaDev} 
              onChange={(e) => handleInputChange('isaDev', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Cost Index (CI): {inputs.costIndex}</label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={inputs.costIndex} 
              onChange={(e) => handleInputChange('costIndex', parseInt(e.target.value))} 
            />
            <span className="caption">CI=0 for Max Range Cruise (MRC), CI=100 for maximum speed.</span>
          </div>

          <div className="input-group">
            <label>Headwind / Tailwind Component: {inputs.wind} kt</label>
            <input 
              type="range" 
              min="-60" 
              max="80" 
              value={inputs.wind} 
              onChange={(e) => handleInputChange('wind', parseInt(e.target.value))} 
            />
            <span className="caption">Negative values indicate headwind, positive values tailwind.</span>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Economic Profile Target Output</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Target Speed</span>
              <span className="value">M {targetMach.toFixed(2)}</span>
            </div>
            <div className="metric-box">
              <span className="label">Total Fuel Flow</span>
              <span className="value">{fuelFlow.toLocaleString()} kg/h</span>
            </div>
            <div className="metric-box">
              <span className="label">Specific Range</span>
              <span className="value">{specificRange.toFixed(3)} NM/kg</span>
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
            {inputs.flightLevel < optimalFL ? (
              <span><strong>Optimizer recommendation:</strong> Climb to <strong>FL {optimalFL}</strong> yields a <strong>{((optimalFL - inputs.flightLevel) * 0.4).toFixed(1)}% fuel saving</strong>.</span>
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
