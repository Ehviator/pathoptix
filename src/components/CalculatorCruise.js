import React, { useState, useEffect } from 'react';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';

export default function CalculatorCruise() {
  const [inputs, setInputs] = useState({
    weight: 115000, // in lbs
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
  
  // Weight is in lbs already, matching database matrix headers
  const weightLbs = inputs.weight;
  const weightKg = inputs.weight / 2.20462;
  
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

  // Fuel Flow Model in kg/h (modulated by Mach, weight, OAT, and altitude)
  const baseFFKg = 1600; 
  const machFactor = (targetMach - 0.70) * 4000;
  const weightFactor = (weightKg - 40000) * 0.025;
  const tempFactor = inputs.isaDev * 10;
  const altFactor = (inputs.flightLevel - 330) * -12;
  
  const fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + tempFactor + altFactor);
  // Convert Fuel Flow from KG to LBS (Porter Airlines requirement)
  const fuelFlowLbs = Math.round(fuelFlowKg * 2.20462);

  // Specific Range: NM per lb of fuel (Porter Airlines requirement)
  const specificRange = fuelFlowLbs > 0 ? Math.round((gs / fuelFlowLbs) * 1000) / 1000 : 0;

  // Optimal Flight Level (higher altitude is optimal for lower weights)
  const optimalFL = Math.round((410 - (inputs.weight - 85000) * 0.00018) / 10) * 10;
  const maxOperatingFL = 410; // Structural limit

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Cruise Economic Profile & Speed Optimizer</h2>
        <p>Dynamic modulation of Mach/IAS speeds and fuel flow optimization based on cost index and flight level (Units: LBS).</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>In-Flight Cruise Settings</h3>

          <div className="input-group">
            <label>Current Aircraft Weight: {inputs.weight.toLocaleString()} lbs</label>
            <input 
              type="range" 
              min="85000" 
              max="130000" 
              step="1000" 
              value={inputs.weight} 
              onChange={(e) => handleInputChange('weight', parseInt(e.target.value))} 
            />
            <span className="caption">Equivalent to {Math.round(weightKg).toLocaleString()} kg.</span>
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
