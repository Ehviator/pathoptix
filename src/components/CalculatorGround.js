import React, { useState } from 'react';

export default function CalculatorGround() {
  const [inputs, setInputs] = useState({
    taxiDuration: 15, 
    engineMode: 'single', 
    fuelPriceDeparture: 3.50, 
    fuelPriceDestination: 4.20, 
    tankeredFuel: 5000, 
    flightDuration: 2.0 
  });

  const handleManualEntry = (key, value, min, max) => {
    let parsed = (key === 'fuelPriceDeparture' || key === 'fuelPriceDestination' || key === 'flightDuration') 
      ? parseFloat(value) 
      : parseInt(value, 10);
      
    if (isNaN(parsed)) return;
    if (key === 'fuelPriceDeparture' || key === 'fuelPriceDestination') parsed = Math.round(parsed * 100) / 100;
    if (key === 'flightDuration') parsed = Math.round(parsed * 10) / 10;
    
    if (parsed < min) parsed = min;
    if (parsed > max) parsed = max;

    setInputs(prev => ({ ...prev, [key]: parsed }));
  };

  const preModDualFlow = 45; 
  const preModSingleFlow = 23; 
  const postModDualFlow = 39; 
  const postModSingleFlow = 20; 

  const activePreFlow = inputs.engineMode === 'dual' ? preModDualFlow : preModSingleFlow;
  const activePostFlow = inputs.engineMode === 'dual' ? postModDualFlow : postModSingleFlow;

  const preModTotalFuel = activePreFlow * inputs.taxiDuration;
  const postModTotalFuel = activePostFlow * inputs.taxiDuration;
  const taxiSavings = preModTotalFuel - postModTotalFuel;

  const detPreModTotal = preModDualFlow * inputs.taxiDuration;
  const setPreModTotal = preModSingleFlow * inputs.taxiDuration;
  const setSavings = detPreModTotal - setPreModTotal;

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
        <div className="mode-toggle-bar">
          <button 
            type="button" 
            className={`btn-toggle ${inputs.engineMode === 'single' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, engineMode: 'single' }))}
          >
            Single Engine Taxi (SET)
          </button>
          <button 
            type="button" 
            className={`btn-toggle ${inputs.engineMode === 'dual' ? 'active' : ''}`}
            onClick={() => setInputs(prev => ({ ...prev, engineMode: 'dual' }))}
          >
            Dual Engine Taxi (DET)
          </button>
        </div>
      </div>

      <div className="panel-body grid-2col">
        <div className="input-section glass-panel">
          <h3>Data Entry</h3>

          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Taxi Duration (min)</label>
              <input 
                type="number" 
                key={`taxi-${inputs.taxiDuration}`}
                defaultValue={inputs.taxiDuration}
                onBlur={(e) => handleManualEntry('taxiDuration', e.target.value, 5, 45)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Flight Duration (hrs)</label>
              <input 
                type="number" 
                step="0.1"
                key={`duration-${inputs.flightDuration}`}
                defaultValue={inputs.flightDuration}
                onBlur={(e) => handleManualEntry('flightDuration', e.target.value, 0.5, 5.0)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Departure $/Gal</label>
              <input 
                type="number" 
                step="0.01"
                key={`depPrice-${inputs.fuelPriceDeparture}`}
                defaultValue={inputs.fuelPriceDeparture}
                onBlur={(e) => handleManualEntry('fuelPriceDeparture', e.target.value, 2.00, 6.00)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Destination $/Gal</label>
              <input 
                type="number" 
                step="0.01"
                key={`destPrice-${inputs.fuelPriceDestination}`}
                defaultValue={inputs.fuelPriceDestination}
                onBlur={(e) => handleManualEntry('fuelPriceDestination', e.target.value, 2.00, 6.00)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial" style={{ gridColumn: 'span 2' }}>
              <label>Tankered Fuel Load (lbs)</label>
              <input 
                type="number" 
                key={`tanker-${inputs.tankeredFuel}`}
                defaultValue={inputs.tankeredFuel}
                onBlur={(e) => handleManualEntry('tankeredFuel', e.target.value, 1000, 15000)}
                className="touch-input-field"
              />
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
            <div className="table-row"><span>Pre vs Post Mod Flow</span><span>{activePreFlow} / {activePostFlow} lbs/min</span></div>
            <div className="table-row"><span>Mod Modification Savings</span><span className="val highlight">{taxiSavings} lbs</span></div>
            <div className="table-row"><span>Required Tanker Penalty Burn</span><span>{Math.round(penaltyFuelLbs)} lbs</span></div>
            <div className="table-row"><span>Break-Even Destination Price</span><span>${breakEvenDestinationPrice.toFixed(2)} / gal</span></div>
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
