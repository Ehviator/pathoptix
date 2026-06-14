import React, { useState } from 'react';

export default function CalculatorGround() {
  const [inputs, setInputs] = useState({
    oat: 15,
    altitude: 0,
    tow: 54000,
    wind: 0,
    runwayCondition: 'dry'
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  // V-speeds calculations
  const baseV2 = 132;
  const weightV2Shift = (inputs.tow - 40000) * 0.00065;
  const tempV2Shift = inputs.oat * 0.12;
  const altV2Shift = (inputs.altitude / 1000) * 0.35;
  
  const v2 = Math.round(baseV2 + weightV2Shift + tempV2Shift + altV2Shift);
  const vr = Math.round(v2 - 4 - (inputs.wind * 0.05));
  
  const runwayFactorV1 = inputs.runwayCondition === 'wet' ? 5 : inputs.runwayCondition === 'contaminated' ? 12 : 0;
  const v1 = Math.round(vr - 3 - runwayFactorV1);

  // Required Runway Length calculation
  const baseLength = 1380;
  const weightLengthFactor = (inputs.tow - 40000) * 0.038;
  const tempLengthFactor = Math.max(0, inputs.oat - 15) * 14;
  const altLengthFactor = (inputs.altitude / 1000) * 85;
  const windLengthFactor = inputs.wind * 9; // headwind reduces runway length, tailwind increases it (since wind range goes from tailwind negative to headwind positive)
  
  const runwayMultiplier = inputs.runwayCondition === 'wet' ? 1.22 : inputs.runwayCondition === 'contaminated' ? 1.58 : 1.0;
  
  const requiredRunway = Math.round((baseLength + weightLengthFactor + tempLengthFactor + altLengthFactor - windLengthFactor) * runwayMultiplier);

  // Maximum allowed TOW based on temperature and altitude constraints
  const structuralMTOW = 61500;
  const tempLimitMTOW = Math.max(0, inputs.oat - 30) * 350;
  const altLimitMTOW = (inputs.altitude / 1000) * 750;
  const maxAllowedTOW = Math.round(structuralMTOW - tempLimitMTOW - altLimitMTOW);

  // Thrust Mode determination
  let thrustMode = "TO-1 (100% Full Thrust)";
  if (requiredRunway < 1500 && inputs.tow < 46000) {
    thrustMode = "TO-3 (Flex Derate 15%)";
  } else if (requiredRunway < 1850 && inputs.tow < 52000) {
    thrustMode = "TO-2 (Flex Derate 10%)";
  }

  // Safety V50 screen speed
  const v50 = Math.round(v2 + 8);

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Take-off & Ground Performance Engine</h2>
        <p>V-speed optimization, runway length verification, and thrust derate recommendations.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Environmental & Weight Inputs</h3>
          
          <div className="input-group">
            <label>Outside Air Temperature (OAT): {inputs.oat}°C</label>
            <input 
              type="range" 
              min="-20" 
              max="50" 
              value={inputs.oat} 
              onChange={(e) => handleInputChange('oat', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Pressure Altitude: {inputs.altitude.toLocaleString()} ft</label>
            <input 
              type="range" 
              min="0" 
              max="10000" 
              step="500" 
              value={inputs.altitude} 
              onChange={(e) => handleInputChange('altitude', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Take-off Weight (TOW): {inputs.tow.toLocaleString()} kg</label>
            <input 
              type="range" 
              min="40000" 
              max="62000" 
              step="500" 
              value={inputs.tow} 
              onChange={(e) => handleInputChange('tow', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Headwind / Tailwind Component: {inputs.wind} kt</label>
            <input 
              type="range" 
              min="-15" 
              max="40" 
              value={inputs.wind} 
              onChange={(e) => handleInputChange('wind', parseInt(e.target.value))} 
            />
            <span className="caption">Positive values represent headwind, negative represent tailwind.</span>
          </div>

          <div className="input-group">
            <label>Runway Condition</label>
            <div className="toggle-group">
              <button 
                className={inputs.runwayCondition === 'dry' ? 'active' : ''} 
                onClick={() => handleInputChange('runwayCondition', 'dry')}
              >Dry</button>
              <button 
                className={inputs.runwayCondition === 'wet' ? 'active' : ''} 
                onClick={() => handleInputChange('runwayCondition', 'wet')}
              >Wet</button>
              <button 
                className={inputs.runwayCondition === 'contaminated' ? 'active' : ''} 
                onClick={() => handleInputChange('runwayCondition', 'contaminated')}
              >Contaminated</button>
            </div>
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Calculated Operational Data</h3>
          
          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">V1 (Decision)</span>
              <span className="value">{v1} kt</span>
            </div>
            <div className="metric-box">
              <span className="label">VR (Rotate)</span>
              <span className="value">{vr} kt</span>
            </div>
            <div className="metric-box">
              <span className="label">V2 (Safety)</span>
              <span className="value">{v2} kt</span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Required Runway Length</span>
              <span className="val highlight">{requiredRunway.toLocaleString()} m</span>
            </div>
            <div className="table-row">
              <span>Thrust Mode / Rating</span>
              <span>{thrustMode}</span>
            </div>
            <div className="table-row">
              <span>Maximum Allowed TOW</span>
              <span>{maxAllowedTOW.toLocaleString()} kg</span>
            </div>
            <div className="table-row">
              <span>V50 (Screen Height Speed)</span>
              <span>{v50} kt</span>
            </div>
          </div>

          {inputs.tow > maxAllowedTOW ? (
            <div className="alert-banner danger">
              <strong>CRITICAL:</strong> Take-off weight ({inputs.tow.toLocaleString()} kg) exceeds the maximum allowed climb/field limit of {maxAllowedTOW.toLocaleString()} kg. Reduce payload or wait for lower temperature.
            </div>
          ) : inputs.oat > 35 || inputs.altitude > 4000 ? (
            <div className="alert-banner warning">
              <strong>Caution:</strong> High temperature or high altitude airfield detected. Climb gradients will be degraded. Double-check OEI level-off ceiling.
            </div>
          ) : (
            <div className="alert-banner info">
              <strong>Runway margin:</strong> Ground parameters are within normal E195-E2 envelopes. Flex thrust is recommended to extend PW1900G engine hot-section life.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
