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

  const adjustInput = (key, step, min, max) => {
    setInputs(prev => {
      let nextVal = prev[key] + step;
      // Handle floating point precision rounding issues for prices and flight hours
      if (key === 'fuelPriceDeparture' || key === 'fuelPriceDestination') {
        nextVal = Math.round(nextVal * 100) / 100;
      } else if (key === 'flightDuration') {
        nextVal = Math.round(nextVal * 10) / 10;
      }
      if (nextVal < min || nextVal > max) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  // 1. Taxi Fuel Flows (LBS/min)
  const preModDualFlow = 45; // lbs/min total
  const preModSingleFlow = 23; // lbs/min total
  const postModDualFlow = 39; // lbs/min total
  const postModSingleFlow = 20; // lbs/min total

  const activePreFlow = inputs.engineMode === 'dual' ? preModDualFlow : preModSingleFlow;
  const activePostFlow = inputs.engineMode === 'dual' ? postModDualFlow : postModSingleFlow;

  const preModTotalFuel = activePreFlow * inputs.taxiDuration;
  const postModTotalFuel = activePostFlow * inputs.taxiDuration;
  const taxiSavings = preModTotalFuel - postModTotalFuel;

  const detPreModTotal = preModDualFlow * inputs.taxiDuration;
  const setPreModTotal = preModSingleFlow * inputs.taxiDuration;
  const setSavings = detPreModTotal - setPreModTotal;

  // 2. Tankering Break-Even Calculations
  const fuelDensity = 6.7;
  const departurePricePerLb = inputs.fuelPriceDeparture / fuelDensity;
  const destinationPricePerLb = inputs.fuelPriceDestination / fuelDensity;

  const tankeringPenaltyFactor = 0.04; 
  const penaltyFuelLbs = inputs.tankeredFuel * tankeringPenaltyFactor * inputs.flightDuration;
  const penaltyCost = penaltyFuelLbs * departurePricePerLb;

  const purchaseCost = inputs.tankeredFuel * departurePricePerLb;
  const valueAtDestination = inputs.tankeredFuel * destinationPricePerLb;
  const grossSavings = valueAtDestination - purchaseCost;
  const netSavings = grossSavings - penaltyCost;

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

          <div className="input-group-tactile">
            <label>Taxi Duration (min)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('taxiDuration', -1, 5, 45)} className="btn-step">──</button>
              <span className="value-display">{inputs.taxiDuration} min</span>
              <button type="button" onClick={() => adjustInput('taxiDuration', 1, 5, 45)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-toggle" style={{ borderTop: 'none', marginTop: '0', paddingTop: '0', marginBottom: '1.5rem' }}>
            <label>Engine Taxi Configuration</label>
            <div className="toggle-group" style={{ marginTop: '0.5rem' }}>
              <button 
                type="button"
                className={inputs.engineMode === 'single' ? 'active' : ''} 
                onClick={() => setInputs(prev => ({ ...prev, engineMode: 'single' }))}
              >SET</button>
              <button 
                type="button"
                className={inputs.engineMode === 'dual' ? 'active' : ''} 
                onClick={() => setInputs(prev => ({ ...prev, engineMode: 'dual' }))}
              >DET</button>
            </div>
          </div>

          <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

          <div className="input-group-tactile">
            <label>Departure Fuel Price</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('fuelPriceDeparture', -0.10, 2.00, 6.00)} className="btn-step">──</button>
              <span className="value-display">${inputs.fuelPriceDeparture.toFixed(2)} / gal</span>
              <button type="button" onClick={() => adjustInput('fuelPriceDeparture', 0.10, 2.00, 6.00)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Destination Fuel Price</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('fuelPriceDestination', -0.10, 2.00, 6.00)} className="btn-step">──</button>
              <span className="value-display">${inputs.fuelPriceDestination.toFixed(2)} / gal</span>
              <button type="button" onClick={() => adjustInput('fuelPriceDestination', 0.10, 2.00, 6.00)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Tankered Fuel Quantity (lbs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('tankeredFuel', -500, 1000, 15000)} className="btn-step">──</button>
              <span className="value-display">{inputs.tankeredFuel.toLocaleString()} lbs</span>
              <button type="button" onClick={() => adjustInput('tankeredFuel', 500, 1000, 15000)} className="btn-step">+</button>
            </div>
          </div>

          <div className="input-group-tactile">
            <label>Flight Duration (hrs)</label>
            <div className="tactile-row">
              <button type="button" onClick={() => adjustInput('flightDuration', -0.1, 0.5, 5.0)} className="btn-step">──</button>
              <span className="value-display">{inputs.flightDuration.toFixed(1)} hrs</span>
              <button type="button" onClick={() => adjustInput('flightDuration', 0.1, 0.5, 5.0)} className="btn-step">+</button>
            </div>
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
