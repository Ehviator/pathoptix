import React, { useState } from 'react';

export default function CalculatorGround() {
  const [inputs, setInputs] = useState({
    taxiDuration: 15, // minutes
    engineMode: 'single', // 'single' (SET) or 'dual' (DET)
    fuelPriceDeparture: 3.50, // $ per gallon
    fuelPriceDestination: 4.20, // $ per gallon
    tankeredFuel: 5000, // lbs
    flightDuration: 2.0 // hours
  });

  const handleInputChange = (key, val) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  };

  // 1. Taxi Fuel Flows (LBS/min)
  // Pre-Mod flows
  const preModDualFlow = 45; // lbs/min total
  const preModSingleFlow = 23; // lbs/min total

  // Post-Mod flows (Engine software update mod)
  const postModDualFlow = 39; // lbs/min total
  const postModSingleFlow = 20; // lbs/min total

  // Determine active flows
  const activePreFlow = inputs.engineMode === 'dual' ? preModDualFlow : preModSingleFlow;
  const activePostFlow = inputs.engineMode === 'dual' ? postModDualFlow : postModSingleFlow;

  const preModTotalFuel = activePreFlow * inputs.taxiDuration;
  const postModTotalFuel = activePostFlow * inputs.taxiDuration;
  const taxiSavings = preModTotalFuel - postModTotalFuel;

  // Single Engine Taxi Analysis
  const detPreModTotal = preModDualFlow * inputs.taxiDuration;
  const setPreModTotal = preModSingleFlow * inputs.taxiDuration;
  const setSavings = detPreModTotal - setPreModTotal;

  // 2. Tankering Break-Even Calculations
  // Porter uses standard Jet-A density ~6.7 lbs/gallon for conversion
  const fuelDensity = 6.7;
  const departurePricePerLb = inputs.fuelPriceDeparture / fuelDensity;
  const destinationPricePerLb = inputs.fuelPriceDestination / fuelDensity;

  // Tankering burn penalty factor: ~4.0% of tankered fuel is burned per hour of flight
  const tankeringPenaltyFactor = 0.04; 
  const penaltyFuelLbs = inputs.tankeredFuel * tankeringPenaltyFactor * inputs.flightDuration;
  const penaltyCost = penaltyFuelLbs * departurePricePerLb;

  // Financial impact
  const purchaseCost = inputs.tankeredFuel * departurePricePerLb;
  const valueAtDestination = inputs.tankeredFuel * destinationPricePerLb;
  const grossSavings = valueAtDestination - purchaseCost;
  const netSavings = grossSavings - penaltyCost;

  // Break-even price delta per gallon
  // Net savings = 0 => destinationPrice = departurePrice * (1 + penaltyFactor * flightDuration)
  const breakEvenDestinationPrice = inputs.fuelPriceDeparture * (1 + (tankeringPenaltyFactor * inputs.flightDuration));
  const profitMargin = inputs.fuelPriceDestination - breakEvenDestinationPrice;

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Ground Taxi & Tankering Optimizer</h2>
        <p>Pre-Mod vs. Post-Mod taxi fuel efficiency, Single-Engine Taxi (SET) analysis, and tankering break-even engines.</p>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Ground & Fuel Price Inputs</h3>

          <div className="input-group">
            <label>Taxi Out / In Duration: {inputs.taxiDuration} minutes</label>
            <input 
              type="range" 
              min="5" 
              max="45" 
              step="1" 
              value={inputs.taxiDuration} 
              onChange={(e) => handleInputChange('taxiDuration', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Engine Taxi Configuration</label>
            <div className="toggle-group">
              <button 
                className={inputs.engineMode === 'single' ? 'active' : ''} 
                onClick={() => handleInputChange('engineMode', 'single')}
              >Single Engine Taxi (SET)</button>
              <button 
                className={inputs.engineMode === 'dual' ? 'active' : ''} 
                onClick={() => handleInputChange('engineMode', 'dual')}
              >Dual Engine Taxi (DET)</button>
            </div>
          </div>

          <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

          <div className="input-group">
            <label>Departure Fuel Price: ${inputs.fuelPriceDeparture.toFixed(2)} / gal</label>
            <input 
              type="range" 
              min="2.00" 
              max="6.00" 
              step="0.05" 
              value={inputs.fuelPriceDeparture} 
              onChange={(e) => handleInputChange('fuelPriceDeparture', parseFloat(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Destination Fuel Price: ${inputs.fuelPriceDestination.toFixed(2)} / gal</label>
            <input 
              type="range" 
              min="2.00" 
              max="6.00" 
              step="0.05" 
              value={inputs.fuelPriceDestination} 
              onChange={(e) => handleInputChange('fuelPriceDestination', parseFloat(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Tankered Fuel Quantity: {inputs.tankeredFuel.toLocaleString()} lbs</label>
            <input 
              type="range" 
              min="1000" 
              max="15000" 
              step="500" 
              value={inputs.tankeredFuel} 
              onChange={(e) => handleInputChange('tankeredFuel', parseInt(e.target.value))} 
            />
          </div>

          <div className="input-group">
            <label>Flight Duration: {inputs.flightDuration.toFixed(1)} hours</label>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.1" 
              value={inputs.flightDuration} 
              onChange={(e) => handleInputChange('flightDuration', parseFloat(e.target.value))} 
            />
          </div>
        </div>

        <div className="results-section glass-panel highlight-accent">
          <h3>Operational Efficiency Output</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Taxi Fuel Burn</span>
              <span className="value">{postModTotalFuel} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">SET Fuel Savings</span>
              <span className="value">{setSavings} lbs</span>
            </div>
            <div className="metric-box">
              <span className="label">Net Tanker Save</span>
              <span className={`value ${netSavings < 0 ? 'text-danger' : 'text-success'}`}>
                ${netSavings.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Pre-Mod vs. Post-Mod Fuel Flow</span>
              <span>{activePreFlow} vs. {activePostFlow} lbs/min</span>
            </div>
            <div className="table-row">
              <span>Mod Modification Savings</span>
              <span className="val highlight">{taxiSavings} lbs</span>
            </div>
            <div className="table-row">
              <span>Required Tankering penalty burn</span>
              <span>{Math.round(penaltyFuelLbs)} lbs (${Math.round(penaltyCost)})</span>
            </div>
            <div className="table-row">
              <span>Break-Even Destination Price</span>
              <span>${breakEvenDestinationPrice.toFixed(2)} / gal</span>
            </div>
            <div className="table-row">
              <span>Fuel Price Delta</span>
              <span>${(inputs.fuelPriceDestination - inputs.fuelPriceDeparture).toFixed(2)} / gal</span>
            </div>
          </div>

          {netSavings > 0 ? (
            <div className="alert-banner info">
              <strong>TANKERING APPROVED:</strong> Tankering saves <strong>${netSavings.toFixed(2)}</strong>. Destination price exceeds break-even price of <strong>${breakEvenDestinationPrice.toFixed(2)}/gal</strong> by <strong>${profitMargin.toFixed(2)}/gal</strong>.
            </div>
          ) : (
            <div className="alert-banner danger">
              <strong>TANKERING REJECTED:</strong> Tankering loses <strong>${Math.abs(netSavings).toFixed(2)}</strong>. The flight penalty fuel burn ({Math.round(penaltyFuelLbs)} lbs) outweighs the fuel price differential. Buy fuel at destination.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
