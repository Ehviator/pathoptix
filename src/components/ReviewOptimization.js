import React, { useState, useEffect } from 'react';
import { useMission } from '../context/MissionContext.js';
import { getCorrectedCostIndex } from '../engine/dynamicModulators.js';
import { interpolate2D, interpolate1D } from '../engine/interpolation.js';
import { getTASFromMach, getISATemperature } from '../engine/atmospheric.js';
import { calculateTruePressureAlt } from '../engine/thermodynamics.js';
import { calculateColdTempCorrection } from '../engine/atmospheric.js';

export default function ReviewOptimization() {
  const { 
    mission, 
    totalDistance, 
    climbPerf, 
    descentPerf, 
    cruiseMatrix, 
    takeoffWeight,
    loading 
  } = useMission();

  // Fleet Extrapolator Sliders
  const [fleetSize, setFleetSize] = useState(30);
  const [annualFlights, setAnnualFlights] = useState(1200);
  const [fuelCost, setFuelCost] = useState(0.45); // USD/CAD per lb

  // Helper: Climb profile lookup
  const getClimbPerfForAlt = (alt, weight, isaDev) => {
    if (!climbPerf || !climbPerf.climb_profiles) return null;
    if (alt <= 0) return { time: 0, fuel: 0, dist: 0 };

    const profiles = climbPerf.climb_profiles;
    const altKeys = Object.keys(profiles).map(Number).sort((a, b) => a - b);

    if (alt < altKeys[0]) {
      const altHigh = altKeys[0];
      const profileHigh = profiles[altHigh.toString()];

      const timeHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.time_min);
      const fuelHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.fuel_lbs);
      const distHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.distance_nm);

      if (timeHigh === null || fuelHigh === null || distHigh === null) return null;

      return {
        time: interpolate1D(alt, 0, altHigh, 0, timeHigh),
        fuel: interpolate1D(alt, 0, altHigh, 0, fuelHigh),
        dist: interpolate1D(alt, 0, altHigh, 0, distHigh)
      };
    }

    let altLow = altKeys[0];
    let altHigh = altKeys[altKeys.length - 1];

    if (alt >= altKeys[altKeys.length - 1]) {
      altLow = altHigh = altKeys[altKeys.length - 1];
    } else {
      for (let i = 0; i < altKeys.length - 1; i++) {
        if (alt >= altKeys[i] && alt <= altKeys[i + 1]) {
          altLow = altKeys[i];
          altHigh = altKeys[i + 1];
          break;
        }
      }
    }

    const profileLow = profiles[altLow.toString()];
    const profileHigh = profiles[altHigh.toString()];

    const timeLow = interpolate2D(weight, isaDev, profileLow.weights, profileLow.isa_headers, profileLow.time_min);
    const fuelLow = interpolate2D(weight, isaDev, profileLow.weights, profileLow.isa_headers, profileLow.fuel_lbs);
    const distLow = interpolate2D(weight, isaDev, profileLow.weights, profileLow.isa_headers, profileLow.distance_nm);

    if (altLow === altHigh) {
      if (timeLow === null || fuelLow === null || distLow === null) return null;
      return { time: timeLow, fuel: fuelLow, dist: distLow };
    } else {
      const timeHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.time_min);
      const fuelHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.fuel_lbs);
      const distHigh = interpolate2D(weight, isaDev, profileHigh.weights, profileHigh.isa_headers, profileHigh.distance_nm);

      if (timeLow === null || timeHigh === null || fuelLow === null || fuelHigh === null || distLow === null || distHigh === null) {
        return null;
      }
      return {
        time: interpolate1D(alt, altLow, altHigh, timeLow, timeHigh),
        fuel: interpolate1D(alt, altLow, altHigh, fuelLow, fuelHigh),
        dist: interpolate1D(alt, altLow, altHigh, distLow, distHigh)
      };
    }
  };

  // Helper: Descent profile lookup
  const getDescentPerfForFpa = (fpaKey, diff, speed) => {
    if (!descentPerf || !descentPerf.descent_profiles) return null;
    const profile = descentPerf.descent_profiles[fpaKey];
    if (!profile) return null;

    const dist = interpolate2D(diff, speed, profile.alt_diff_headers, profile.speed_headers, profile.distance_nm);
    const time = interpolate2D(diff, speed, profile.alt_diff_headers, profile.speed_headers, profile.time_min);
    const fuel = interpolate2D(diff, speed, profile.alt_diff_headers, profile.speed_headers, profile.fuel_lbs);

    if (dist === null || time === null || fuel === null) return null;
    return { dist, time, fuel };
  };

  const getDescentPerf = (fpa, diff, speed) => {
    if (!descentPerf || !descentPerf.descent_profiles) return null;
    const profiles = descentPerf.descent_profiles;
    const fpaKeys = Object.keys(profiles).map(Number).sort((a, b) => a - b);

    let fpaLow = fpaKeys[0];
    let fpaHigh = fpaKeys[fpaKeys.length - 1];

    if (fpa <= fpaKeys[0]) {
      fpaLow = fpaHigh = fpaKeys[0];
    } else if (fpa >= fpaKeys[fpaKeys.length - 1]) {
      fpaLow = fpaHigh = fpaKeys[fpaKeys.length - 1];
    } else {
      for (let i = 0; i < fpaKeys.length - 1; i++) {
        if (fpa >= fpaKeys[i] && fpa <= fpaKeys[i + 1]) {
          fpaLow = fpaKeys[i];
          fpaHigh = fpaKeys[i + 1];
          break;
        }
      }
    }

    const lowResult = getDescentPerfForFpa(fpaLow.toFixed(1), diff, speed);
    const highResult = getDescentPerfForFpa(fpaHigh.toFixed(1), diff, speed);

    if (!lowResult || !highResult) return null;

    if (fpaLow === fpaHigh) return lowResult;

    return {
      dist: interpolate1D(fpa, fpaLow, fpaHigh, lowResult.dist, highResult.dist),
      time: interpolate1D(fpa, fpaLow, fpaHigh, lowResult.time, highResult.time),
      fuel: interpolate1D(fpa, fpaLow, fpaHigh, lowResult.fuel, highResult.fuel)
    };
  };

  // Helper: Bilinear profile simulation enroute
  const calculateTripPerformance = (fl, ci, weight, wind, isaDev) => {
    if (!climbPerf || !descentPerf || !cruiseMatrix) return null;

    // 1. Climb phase
    const depElev = mission.departureElev || 600;
    const depQnh = mission.departureQnh || 29.92;
    const trueTargetAltClimb = calculateTruePressureAlt(fl * 100, depQnh);
    const trueFieldAlt = calculateTruePressureAlt(depElev, depQnh);
    
    const perfTarget = getClimbPerfForAlt(trueTargetAltClimb, weight, isaDev);
    const perfField = getClimbPerfForAlt(trueFieldAlt, weight, isaDev);

    let climbTime = 0;
    let climbFuel = 0;
    let climbDist = 0;
    let isOutOfEnvelope = false;

    if (perfTarget && perfField) {
      climbTime = Math.max(1, perfTarget.time - perfField.time);
      climbFuel = Math.max(10, perfTarget.fuel - perfField.fuel);
      climbDist = Math.max(2, perfTarget.dist - perfField.dist);
    } else {
      isOutOfEnvelope = true;
    }

    // 2. Descent phase
    const arrElev = mission.arrivalElev || 600;
    const arrQnh = mission.arrivalQnh || 29.92;
    const arrOat = mission.arrivalOat !== undefined && mission.arrivalOat !== '' ? mission.arrivalOat : 15;
    const correctedTargetAlt = calculateColdTempCorrection(3000, arrElev, arrOat);
    const trueTargetAltDescent = calculateTruePressureAlt(correctedTargetAlt, arrQnh);
    const altDiffDescent = Math.max(0, (fl * 100) - trueTargetAltDescent);

    const dbResultDescent = getDescentPerf(3.0, altDiffDescent, 280);

    let descentTime = 0;
    let descentFuel = 0;
    let descentDist = 0;

    if (dbResultDescent) {
      const boundedWind = Math.max(-200, Math.min(200, wind));
      const windSign = boundedWind >= 0 ? 1 : -1;
      const windCorrection = windSign * Math.log10(1 + Math.abs(boundedWind) * 0.15) * (altDiffDescent / 1000) * 1.65;
      descentDist = Math.round(Math.max(10, dbResultDescent.dist + windCorrection));
      
      const averageTAS = Math.round(350 - (altDiffDescent / 1000) * 2);
      const averageGS = Math.max(100, averageTAS + boundedWind);
      descentTime = (descentDist / averageGS) * 60;
      descentFuel = Math.round(dbResultDescent.fuel + (boundedWind * 0.11));
    } else {
      isOutOfEnvelope = true;
    }

    // 3. Scale segments if too short
    let cruiseDist = totalDistance - climbDist - descentDist;
    if (cruiseDist < 0) {
      const sum = climbDist + descentDist;
      const ratio = totalDistance / (sum || 1);
      climbDist *= ratio;
      descentDist *= ratio;
      climbTime *= ratio;
      descentTime *= ratio;
      climbFuel *= ratio;
      descentFuel *= ratio;
      cruiseDist = 0;
    }

    // 4. Cruise phase
    let resolvedMach = 0.78;
    const targetAltKey = (fl * 100).toString();
    const boundedWind = Math.max(-200, Math.min(200, wind));
    const correctedCI = getCorrectedCostIndex(ci, boundedWind);

    if (cruiseMatrix && cruiseMatrix.cruise_mach_matrix) {
      const matrix = cruiseMatrix.cruise_mach_matrix[targetAltKey] || cruiseMatrix.cruise_mach_matrix["33000"];
      if (matrix) {
        const interpResult = interpolate2D(
          weight,
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
      } else {
        isOutOfEnvelope = true;
      }
    }

    const isaTemp = getISATemperature(fl * 100);
    const actualTemp = isaTemp + isaDev;
    const tas = Math.round(getTASFromMach(resolvedMach, actualTemp));
    const gs = Math.max(100, Math.round(tas + boundedWind));

    const weightKg = weight / 2.20462;
    const baseFFKg = 1550;
    const machFactor = (resolvedMach - 0.70) * 4200;
    const weightFactor = (weightKg - 40000) * 0.028;
    const altFactor = (fl - 330) * -14;
    const antiIceFactor = mission.antiIce ? 180 : 0;

    let fuelFlowKg = Math.max(1200, baseFFKg + machFactor + weightFactor + altFactor + antiIceFactor);
    const cgMac = mission.mac !== '' && mission.mac !== undefined && mission.mac !== null ? mission.mac : 24.5;
    const cgModifier = cgMac > 28 ? -0.015 : cgMac < 20 ? 0.015 : 0;
    fuelFlowKg = fuelFlowKg * (1 + cgModifier);
    const fuelFlowLbs = Math.round(fuelFlowKg * 2.20462);

    const cruiseTime = gs > 0 ? (cruiseDist / gs) * 60 : 0;
    const cruiseFuel = (cruiseTime / 60) * fuelFlowLbs;

    const totalTime = climbTime + cruiseTime + descentTime;
    const totalFuel = climbFuel + cruiseFuel + descentFuel;

    return {
      climbTime,
      climbFuel,
      climbDist,
      cruiseTime,
      cruiseFuel,
      cruiseDist,
      descentTime,
      descentFuel,
      descentDist,
      totalTime,
      totalFuel,
      mach: resolvedMach,
      fuelFlow: fuelFlowLbs,
      isOutOfEnvelope
    };
  };

  const showPlaceholder = !mission.weight || mission.weight < 50000;

  if (loading || !climbPerf || !descentPerf || !cruiseMatrix) {
    return (
      <div className="panel-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Synchronizing Performance and Optimization Matrices...</p>
        </div>
      </div>
    );
  }

  if (showPlaceholder) {
    return (
      <div className="panel-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', margin: '24px 0' }}>
          <span style={{ fontSize: '32px', marginBottom: '16px' }}>📊</span>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--accent-cyan)' }}>No Active Dispatch Plan</h3>
          <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: '1.5' }}>
            Please configure dispatch weights and flight parameters on the **Create Flight** page first to initialize fuel optimization analytics.
          </p>
        </div>
      </div>
    );
  }

  // --- 1. ALTITUDE OPTIMIZATION (FL350 vs FL370 vs Active) ---
  const activeFL = mission.cruiseFL || 350;
  const activeCI = mission.costIndex || 50;
  const activeWind = mission.wind || 0;
  const activeIsa = mission.isaDev || 0;

  const perfFL350 = calculateTripPerformance(350, activeCI, takeoffWeight, activeWind, activeIsa);
  const perfFL370 = calculateTripPerformance(370, activeCI, takeoffWeight, activeWind, activeIsa);
  const perfActive = calculateTripPerformance(activeFL, activeCI, takeoffWeight, activeWind, activeIsa);

  // Determine optimum cruise FL enroute
  let optimumFL = activeFL;
  let maxSR = 0;
  const flRows = [280, 310, 330, 350, 370, 390, 410];
  flRows.forEach(flVal => {
    const res = calculateTripPerformance(flVal, activeCI, takeoffWeight, activeWind, activeIsa);
    if (res && !res.isOutOfEnvelope) {
      const sr = res.fuelFlow > 0 ? (res.mach * 573) / res.fuelFlow : 0; 
      if (sr > maxSR) {
        maxSR = sr;
        optimumFL = flVal;
      }
    }
  });

  const fl350Fuel = perfFL350 ? Math.round(perfFL350.totalFuel) : 0;
  const fl370Fuel = perfFL370 ? Math.round(perfFL370.totalFuel) : 0;
  const activeFuel = perfActive ? Math.round(perfActive.totalFuel) : 0;

  const altSavedLbs = fl350Fuel > 0 && fl370Fuel > 0 ? Math.max(0, fl350Fuel - fl370Fuel) : 0;
  const altSavedPct = fl350Fuel > 0 ? ((altSavedLbs / fl350Fuel) * 100).toFixed(1) : '0.0';

  // --- 2. COST INDEX OPTIMIZATION (CI 20 vs CI 40 vs Active) ---
  const perfCI20 = calculateTripPerformance(activeFL, 20, takeoffWeight, activeWind, activeIsa);
  const perfCI40 = calculateTripPerformance(activeFL, 40, takeoffWeight, activeWind, activeIsa);

  const ci20Fuel = perfCI20 ? Math.round(perfCI20.totalFuel) : 0;
  const ci40Fuel = perfCI40 ? Math.round(perfCI40.totalFuel) : 0;

  const ciSavedLbs = ci20Fuel > 0 && ci40Fuel > 0 ? Math.max(0, ci40Fuel - ci20Fuel) : 0;
  const ciSavedPct = ci40Fuel > 0 ? ((ciSavedLbs / ci40Fuel) * 100).toFixed(1) : '0.0';

  // --- 3. STEP CLIMB OPTIMIZATION ---
  // Model: start cruise at FL350, step up to FL370 halfway through cruise
  const getStepClimbPerf = () => {
    if (!climbPerf || !descentPerf || !cruiseMatrix) return null;
    
    // Step climb parameters
    const depElev = mission.departureElev || 600;
    const depQnh = mission.departureQnh || 29.92;
    const trueTarget350 = calculateTruePressureAlt(35000, depQnh);
    const trueFieldAlt = calculateTruePressureAlt(depElev, depQnh);

    // Initial climb to FL350
    const climb350 = getClimbPerfForAlt(trueTarget350, takeoffWeight, activeIsa);
    const climbField = getClimbPerfForAlt(trueFieldAlt, takeoffWeight, activeIsa);

    if (!climb350 || !climbField) return null;
    const cTime = Math.max(1, climb350.time - climbField.time);
    const cFuel = Math.max(10, climb350.fuel - climbField.fuel);
    const cDist = Math.max(2, climb350.dist - climbField.dist);

    // Descent from FL370
    const arrElev = mission.arrivalElev || 600;
    const arrQnh = mission.arrivalQnh || 29.92;
    const arrOat = mission.arrivalOat !== undefined && mission.arrivalOat !== '' ? mission.arrivalOat : 15;
    const correctedTargetAlt = calculateColdTempCorrection(3000, arrElev, arrOat);
    const trueTargetAltDescent = calculateTruePressureAlt(correctedTargetAlt, arrQnh);
    const altDiffDescent = Math.max(0, 37000 - trueTargetAltDescent);

    const desc370 = getDescentPerf(3.0, altDiffDescent, 280);
    if (!desc370) return null;
    
    const boundedWind = Math.max(-200, Math.min(200, activeWind));
    const windSign = boundedWind >= 0 ? 1 : -1;
    const windCorrection = windSign * Math.log10(1 + Math.abs(boundedWind) * 0.15) * (altDiffDescent / 1000) * 1.65;
    const dDist = Math.round(Math.max(10, desc370.dist + windCorrection));
    
    const averageTAS = Math.round(350 - (altDiffDescent / 1000) * 2);
    const averageGS = Math.max(100, averageTAS + boundedWind);
    const dTime = (dDist / averageGS) * 60;
    const dFuel = Math.round(desc370.fuel + (boundedWind * 0.11));

    const cruiseDistTotal = totalDistance - cDist - dDist;
    if (cruiseDistTotal < 80) return null; // Too short enroute for step climb

    // Divide enroute cruise: 1st half at FL350, 2nd half at FL370
    const d1 = cruiseDistTotal / 2;
    const d_step = 15; // 15 NM step climb segment
    const t_step = 2.5; // 2.5 mins
    const f_step = 130; // 130 lbs burned in climb maneuver
    const d2 = Math.max(0, cruiseDistTotal / 2 - d_step);

    // Cruise 1: FL350
    const w1 = takeoffWeight - cFuel;
    const resFL350 = calculateTripPerformance(350, activeCI, w1, activeWind, activeIsa);
    if (!resFL350) return null;
    const crTime1 = resFL350.fuelFlow > 0 ? (d1 / (resFL350.mach * 573 + boundedWind)) * 60 : 0;
    const crFuel1 = (crTime1 / 60) * resFL350.fuelFlow;

    // Cruise 2: FL370
    const w2 = w1 - crFuel1 - f_step;
    const resFL370 = calculateTripPerformance(370, activeCI, w2, activeWind, activeIsa);
    if (!resFL370) return null;
    const crTime2 = resFL370.fuelFlow > 0 ? (d2 / (resFL370.mach * 573 + boundedWind)) * 60 : 0;
    const crFuel2 = (crTime2 / 60) * resFL370.fuelFlow;

    const totalStepFuel = cFuel + crFuel1 + f_step + crFuel2 + dFuel;
    const totalStepTime = cTime + crTime1 + t_step + crTime2 + dTime;

    return {
      totalFuel: totalStepFuel,
      totalTime: totalStepTime
    };
  };

  const perfStepClimb = getStepClimbPerf();
  const stepClimbFuel = perfStepClimb ? Math.round(perfStepClimb.totalFuel) : 0;
  
  // Savings enroute calculations
  const stepSavingsLbs = fl350Fuel > 0 && stepClimbFuel > 0 ? Math.max(0, fl350Fuel - stepClimbFuel) : 0;
  const stepSavingsPct = fl350Fuel > 0 ? ((stepSavingsLbs / fl350Fuel) * 100).toFixed(1) : '0.0';

  // --- 4. WIND & ALTITUDE SENSITIVITY MATRIX CALCULATIONS ---
  const windCols = [-60, -40, -20, 0, 20, 40, 60];
  
  // Calculate grid data
  const gridData = flRows.map(fl => {
    return windCols.map(windVal => {
      const res = calculateTripPerformance(fl, activeCI, takeoffWeight, windVal, activeIsa);
      return {
        fl,
        wind: windVal,
        fuel: res ? Math.round(res.totalFuel) : null,
        time: res ? res.totalTime : null,
        isOutOfEnvelope: res ? res.isOutOfEnvelope : true
      };
    });
  });

  // Find column optimums (which FL has lowest fuel burn for each wind column)
  const columnOptimums = windCols.map((_, colIdx) => {
    let minFuel = Infinity;
    let optimalFl = null;
    flRows.forEach((fl, rowIdx) => {
      const cell = gridData[rowIdx][colIdx];
      if (cell.fuel && !cell.isOutOfEnvelope && cell.fuel < minFuel) {
        minFuel = cell.fuel;
        optimalFl = fl;
      }
    });
    return optimalFl;
  });

  // Find closest wind column to current enroute wind
  let closestColIdx = 0;
  let minDiff = Infinity;
  windCols.forEach((w, idx) => {
    const diff = Math.abs(w - activeWind);
    if (diff < minDiff) {
      minDiff = diff;
      closestColIdx = idx;
    }
  });

  const activeOptimumFL = columnOptimums[closestColIdx];

  // Dynamic sensitivity analysis text
  const getSensitivityGuidance = () => {
    if (activeOptimumFL && activeOptimumFL !== activeFL) {
      const activeCell = gridData[flRows.indexOf(activeFL)][closestColIdx];
      const optCell = gridData[flRows.indexOf(activeOptimumFL)][closestColIdx];
      if (activeCell && optCell && activeCell.fuel && optCell.fuel) {
        const diff = activeCell.fuel - optCell.fuel;
        return `🔴 ACTIVE ALTITUDE IS SUB-OPTIMAL: Cruising at FL${activeFL} under current winds (${activeWind} kt) is burning approx ${diff.toLocaleString()} lbs more fuel than the optimal flight level FL${activeOptimumFL}. Consider requesting a flight level adjustment to FL${activeOptimumFL}.`;
      }
    }
    
    // If current is optimal, check crossover points to the left/right
    let crossoverText = '';
    if (closestColIdx > 0) {
      const optLeft = columnOptimums[closestColIdx - 1];
      if (optLeft && optLeft !== activeFL) {
        crossoverText += `If headwinds increase (moving toward ${windCols[closestColIdx - 1]} kt), the optimal altitude shifts down to FL${optLeft} to decrease climb penalty and stay below buffet margins. `;
      }
    }
    if (closestColIdx < windCols.length - 1) {
      const optRight = columnOptimums[closestColIdx + 1];
      if (optRight && optRight !== activeFL) {
        crossoverText += `If tailwinds increase (moving toward +${windCols[closestColIdx + 1]} kt), the optimal altitude shifts up to FL${optRight} to capture higher true airspeeds at lower fuel flows.`;
      }
    }
    
    return `🟢 ACTIVE ALTITUDE IS OPTIMAL: Cruising at FL${activeFL} is the most fuel-efficient altitude under current winds (${activeWind} kt). ` + (crossoverText || "Flight margins are stable across wind conditions.");
  };

  const sensitivityGuidanceText = getSensitivityGuidance();

  // Total recommendations
  const totalRecommendedSavings = Math.max(altSavedLbs, ciSavedLbs, stepSavingsLbs);

  // --- 5. ANNUAL FLEET SAVINGS COMPUTATIONS ---
  const totalAnnualFlights = fleetSize * annualFlights;
  const annualFuelSavedLbs = totalRecommendedSavings * totalAnnualFlights;
  const annualFuelSavedGals = Math.round(annualFuelSavedLbs / 6.7);
  const annualFinancialSavings = Math.round(annualFuelSavedLbs * fuelCost);
  const annualCO2Tons = Math.round((annualFuelSavedLbs * 3.16) / 2204.62);

  // Formats
  const fmtTime = (mins) => {
    if (isNaN(mins) || mins === null) return '---';
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>📊 Fuel Optimization &amp; Fleet Analytics</h2>
        <p>Analyze enroute trajectory profiles, compare altimetry/CI savings, and calculate annual fleet operational metrics.</p>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Top summary scoreboard */}
        <div className="glass-panel highlight-accent" style={{ 
          padding: '24px', 
          background: 'linear-gradient(135deg, rgba(12, 27, 42, 0.95), rgba(0, 168, 150, 0.15))',
          border: '1px solid rgba(0, 168, 150, 0.3)',
          borderRadius: '12px'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💡</span> OPTIMAL STRATEGY RECOMMENDATIONS
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="metric-box">
              <span className="label">Optimum Altitude</span>
              <span className="value" style={{ color: '#00f0ff' }}>FL{optimumFL}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Highest specific aerodynamic range enroute
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Altitude Opt Savings</span>
              <span className="value" style={{ color: altSavedLbs > 0 ? '#00f0ff' : 'var(--text-secondary)' }}>
                {altSavedLbs > 0 ? `-${altSavedLbs.toLocaleString()} lbs` : '0 lbs'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                FL370 vs FL350 ({altSavedPct}%)
              </span>
            </div>
            <div className="metric-box">
              <span className="label">CI 20 vs 40 Savings</span>
              <span className="value" style={{ color: ciSavedLbs > 0 ? '#00f0ff' : 'var(--text-secondary)' }}>
                {ciSavedLbs > 0 ? `-${ciSavedLbs.toLocaleString()} lbs` : '0 lbs'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Lower speed schedule ({ciSavedPct}%)
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Enroute Step Climb Savings</span>
              <span className="value" style={{ color: stepSavingsLbs > 0 ? '#00f0ff' : 'var(--text-secondary)' }}>
                {stepSavingsLbs > 0 ? `-${stepSavingsLbs.toLocaleString()} lbs` : 'N/A'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                FL350 ➔ FL370 ({stepSavingsPct}%)
              </span>
            </div>
          </div>
        </div>

        {/* 1. Altitude comparison table */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>Altimetry Trajectory Optimization (FL350 vs FL370)</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Comparing total flight enroute profiles including climb penalty and descent glide paths across flight levels.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="performance-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Flight Level</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Cruise Mach</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Cruise FF (lbs/hr)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Enroute ETE</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Total Fuel Burn</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Variance</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Envelope Status</th>
                </tr>
              </thead>
              <tbody>
                {/* FL350 */}
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>FL350</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfFL350 ? `M ${perfFL350.mach.toFixed(2)}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfFL350 ? `${perfFL350.fuelFlow.toLocaleString()}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfFL350 ? fmtTime(perfFL350.totalTime) : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: '#fff' }}>{perfFL350 ? `${fl350Fuel.toLocaleString()} lbs` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: 'var(--text-secondary)' }}>Baseline</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: '#00a896', fontWeight: 'bold' }}>✓ COMPLIANT</td>
                </tr>
                {/* FL370 */}
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,168,150,0.05)' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>FL370</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfFL370 ? `M ${perfFL370.mach.toFixed(2)}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfFL370 ? `${perfFL370.fuelFlow.toLocaleString()}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfFL370 ? fmtTime(perfFL370.totalTime) : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: '#00f0ff', fontWeight: 'bold' }}>{perfFL370 ? `${fl370Fuel.toLocaleString()} lbs` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: altSavedLbs > 0 ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: 'bold' }}>
                    {altSavedLbs > 0 ? `-${altSavedLbs.toLocaleString()} lbs (-${altSavedPct}%)` : 'No Savings'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px', color: perfFL370?.isOutOfEnvelope ? 'var(--accent-crit)' : '#00a896', fontWeight: 'bold' }}>
                    {perfFL370?.isOutOfEnvelope ? '⚠️ BUFFET LIMIT' : '✓ COMPLIANT'}
                  </td>
                </tr>
                {/* Active FL */}
                {activeFL !== 350 && activeFL !== 370 && (
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>FL{activeFL} (Active)</td>
                    <td style={{ textAlign: 'right', padding: '10px' }}>{perfActive ? `M ${perfActive.mach.toFixed(2)}` : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px' }}>{perfActive ? `${perfActive.fuelFlow.toLocaleString()}` : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px' }}>{perfActive ? fmtTime(perfActive.totalTime) : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px', color: '#fff' }}>{perfActive ? `${activeFuel.toLocaleString()} lbs` : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px', color: activeFuel < fl350Fuel ? 'var(--accent-green)' : 'var(--accent-crit)', fontWeight: 'bold' }}>
                      {activeFuel < fl350Fuel 
                        ? `-${(fl350Fuel - activeFuel).toLocaleString()} lbs` 
                        : `+${(activeFuel - fl350Fuel).toLocaleString()} lbs`
                      }
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px', color: perfActive?.isOutOfEnvelope ? 'var(--accent-crit)' : '#00a896', fontWeight: 'bold' }}>
                      {perfActive?.isOutOfEnvelope ? '⚠️ OUT OF ENV' : '✓ COMPLIANT'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. CI comparison table */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>Cost Index Optimization (CI 20 vs CI 40)</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Evaluating speed schedules. Lower cost index limits throttle and fuel flow enroute at the cost of flight time.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="performance-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Cost Index Setting</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Cruise Mach</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Cruise FF (lbs/hr)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>ETE enroute</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Trip Fuel Burn</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Fuel Saved</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>Schedule Delta</th>
                </tr>
              </thead>
              <tbody>
                {/* CI 40 */}
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>CI 40</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfCI40 ? `M ${perfCI40.mach.toFixed(2)}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfCI40 ? `${perfCI40.fuelFlow.toLocaleString()}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfCI40 ? fmtTime(perfCI40.totalTime) : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: '#fff' }}>{perfCI40 ? `${ci40Fuel.toLocaleString()} lbs` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: 'var(--text-secondary)' }}>Baseline</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: '#ffb700', fontWeight: 'bold' }}>Standard</td>
                </tr>
                {/* CI 20 */}
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,168,150,0.05)' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>CI 20</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfCI20 ? `M ${perfCI20.mach.toFixed(2)}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfCI20 ? `${perfCI20.fuelFlow.toLocaleString()}` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px' }}>{perfCI20 ? fmtTime(perfCI20.totalTime) : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: '#00f0ff', fontWeight: 'bold' }}>{perfCI20 ? `${ci20Fuel.toLocaleString()} lbs` : '---'}</td>
                  <td style={{ textAlign: 'right', padding: '10px', color: ciSavedLbs > 0 ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: 'bold' }}>
                    {ciSavedLbs > 0 ? `-${ciSavedLbs.toLocaleString()} lbs (-${ciSavedPct}%)` : 'No Savings'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px', color: 'var(--accent-warn)', fontWeight: 'bold' }}>
                    {perfCI20 && perfCI40 ? `+${Math.round(perfCI20.totalTime - perfCI40.totalTime)} mins enroute` : '---'}
                  </td>
                </tr>
                {/* Active CI */}
                {activeCI !== 20 && activeCI !== 40 && (
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>CI {activeCI} (Active)</td>
                    <td style={{ textAlign: 'right', padding: '10px' }}>{perfActive ? `M ${perfActive.mach.toFixed(2)}` : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px' }}>{perfActive ? `${perfActive.fuelFlow.toLocaleString()}` : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px' }}>{perfActive ? fmtTime(perfActive.totalTime) : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px', color: '#fff' }}>{perfActive ? `${activeFuel.toLocaleString()} lbs` : '---'}</td>
                    <td style={{ textAlign: 'right', padding: '10px', color: activeFuel < ci40Fuel ? 'var(--accent-green)' : 'var(--accent-crit)', fontWeight: 'bold' }}>
                      {activeFuel < ci40Fuel 
                        ? `-${(ci40Fuel - activeFuel).toLocaleString()} lbs` 
                        : `+${(activeFuel - ci40Fuel).toLocaleString()} lbs`
                      }
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px', color: '#fff' }}>
                      {perfActive && perfCI40 ? `${perfActive.totalTime > perfCI40.totalTime ? '+' : ''}${Math.round(perfActive.totalTime - perfCI40.totalTime)} mins` : '---'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Step Climb Section */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>Tactical Enroute Step Climb (FL350 ➔ FL370)</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Examines the feasibility and benefits of climbing mid-way through cruise as aircraft weight decreases.
          </p>
          
          {stepClimbFuel === 0 ? (
            <div style={{ padding: '16px', background: 'rgba(255,74,74,0.08)', border: '1px solid rgba(255,74,74,0.2)', borderRadius: '8px', color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
              ⚠️ **STEP CLIMB NOT FEASIBLE**: Flight distance is too short to execute a step climb enroute. Enroute cruise must be at least 80 NM to allow a stable climb and level cruise transition.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span>Constant Alt (FL350) Fuel:</span>
                  <strong>{fl350Fuel.toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span>Constant Alt (FL370) Fuel:</span>
                  <strong>{fl370Fuel.toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,168,150,0.05)' }}>
                  <span>Step Climb (FL350 ➔ FL370) Fuel:</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{stepClimbFuel.toLocaleString()} lbs</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: 'var(--accent-green)', fontWeight: 'bold' }}>
                  <span>Net Step Climb Savings:</span>
                  <span>-{stepSavingsLbs.toLocaleString()} lbs (-{stepSavingsPct}%)</span>
                </div>
              </div>

              <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.5' }}>
                <strong style={{ color: '#fff', display: 'block', marginBottom: '6px' }}>Step Climb Mechanics:</strong>
                Stepping up to FL370 enroute allows the aircraft to bypass initial structural buffet limits at takeoff weight, cruising the first half of the route at FL350. As fuel burns off, the ceiling increases, making it aerodynamic to step climb to FL370 and reduce fuel flow by <strong>{perfFL370 ? Math.round(perfFL350.fuelFlow - perfFL370.fuelFlow) : 100} lbs/hr</strong> for the remainder of cruise.
              </div>
            </div>
          )}
        </div>

        {/* 4. Wind & Altitude Sensitivity Matrix */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--accent-cyan)' }}>💨 Wind &amp; Altitude Sensitivity Matrix</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Cross-reference enroute flight levels against wind components to find optimal altitudes enroute. Teal cells represent the optimal flight level for each wind component column.
          </p>

          <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold', color: '#fff' }}>Flight Level</th>
                  {windCols.map(w => (
                    <th key={w} style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>
                      {w === 0 ? '0 kt (Calm)' : w > 0 ? `+${w} kt (Tail)` : `${w} kt (Head)`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Render from FL410 down to FL280 */}
                {flRows.slice().reverse().map((fl, rowIdxReversed) => {
                  const actualRowIdx = flRows.indexOf(fl);
                  return (
                    <tr key={fl} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: fl === activeFL ? 'var(--accent-cyan)' : '#fff' }}>
                        FL{fl} {fl === activeFL && '✈️'}
                      </td>
                      {windCols.map((windVal, colIdx) => {
                        const cell = gridData[actualRowIdx][colIdx];
                        const isOptimum = columnOptimums[colIdx] === fl;
                        const isActiveState = fl === activeFL && colIdx === closestColIdx;

                        let bgStyle = 'transparent';
                        let borderStyle = '1px solid rgba(255,255,255,0.03)';
                        let cellTextColor = 'rgba(255,255,255,0.85)';

                        if (isOptimum) {
                          bgStyle = 'rgba(0, 168, 150, 0.1)';
                          borderStyle = '1px solid rgba(0, 168, 150, 0.4)';
                        }
                        if (isActiveState) {
                          bgStyle = 'rgba(0, 240, 255, 0.15)';
                          borderStyle = '2px solid var(--accent-cyan)';
                          cellTextColor = 'var(--accent-cyan)';
                        }

                        if (cell.isOutOfEnvelope) {
                          return (
                            <td 
                              key={windVal} 
                              style={{ 
                                padding: '10px', 
                                textAlign: 'center', 
                                color: 'rgba(255,74,74,0.6)', 
                                background: 'rgba(255,74,74,0.02)',
                                border: borderStyle,
                                fontWeight: '500'
                              }}
                            >
                              BUFFET LIMIT
                            </td>
                          );
                        }

                        return (
                          <td 
                            key={windVal}
                            style={{ 
                              padding: '10px', 
                              textAlign: 'center', 
                              background: bgStyle,
                              border: borderStyle,
                              color: cellTextColor,
                              transition: 'var(--transition-smooth)'
                            }}
                          >
                            <div style={{ fontWeight: isOptimum ? 'bold' : 'normal' }}>
                              {(cell.fuel || 0).toLocaleString()} lbs
                            </div>
                            <div style={{ fontSize: '10px', opacity: 0.7 }}>
                              {fmtTime(cell.time)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ 
            padding: '16px', 
            background: activeOptimumFL !== activeFL ? 'rgba(255, 183, 0, 0.08)' : 'rgba(0, 168, 150, 0.08)',
            border: '1px solid ' + (activeOptimumFL !== activeFL ? 'rgba(255, 183, 0, 0.25)' : 'rgba(0, 168, 150, 0.25)'),
            borderRadius: '8px', 
            fontSize: '13px', 
            lineHeight: '1.5',
            color: '#fff'
          }}>
            <strong style={{ color: activeOptimumFL !== activeFL ? '#ffb700' : 'var(--accent-cyan)', display: 'block', marginBottom: '4px' }}>
              ℹ️ Tactical Altimetry Guidance:
            </strong>
            {sensitivityGuidanceText}
          </div>
        </div>

        {/* 5. Annual Fleet Savings Simulator */}
        <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(180deg, rgba(12, 27, 42, 0.95), rgba(6, 15, 25, 0.95))', border: '1px solid rgba(0, 168, 150, 0.2)' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--accent-cyan)' }}>📊 Annual Fleet Savings Extrapolator</h3>
          <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Scale the recommended optimization gains across the entire active fleet to project annual budget and environmental offsets.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '30px', alignItems: 'center' }}>
            
            {/* Left: Interactive Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-cell-spatial" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                  <span>E195-E2 Fleet Size</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>{fleetSize} aircraft</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={fleetSize} 
                  onChange={(e) => setFleetSize(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)', background: 'rgba(255,255,255,0.06)' }}
                />
              </div>

              <div className="input-cell-spatial" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                  <span>Annual Flights per Aircraft</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>{annualFlights} flights</span>
                </div>
                <input 
                  type="range" 
                  min="100" 
                  max="2000" 
                  step="50"
                  value={annualFlights} 
                  onChange={(e) => setAnnualFlights(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)', background: 'rgba(255,255,255,0.06)' }}
                />
              </div>

              <div className="input-cell-spatial" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                  <span>Jet A-1 Fuel Cost ($/lb)</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>${fuelCost.toFixed(2)} / lb</span>
                </div>
                <input 
                  type="range" 
                  min="0.20" 
                  max="1.20" 
                  step="0.05"
                  value={fuelCost} 
                  onChange={(e) => setFuelCost(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)', background: 'rgba(255,255,255,0.06)' }}
                />
              </div>
            </div>

            {/* Right: Scoreboard Outputs */}
            <div style={{ 
              background: 'rgba(0,0,0,0.3)', 
              border: '1px solid rgba(255,255,255,0.06)', 
              borderRadius: '12px', 
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Annual Operations</span>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', marginTop: '2px' }}>
                  {totalAnnualFlights.toLocaleString()} flights/year
                </div>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Annual Fuel Saved</span>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00f0ff', marginTop: '2px' }}>
                  {annualFuelSavedLbs.toLocaleString()} lbs
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  ≈ {annualFuelSavedGals.toLocaleString()} gallons (Jet A-1)
                </span>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Annual Budget Savings</span>
                <div style={{ fontSize: '28px', fontWeight: 'extrabold', color: '#00f0ff', marginTop: '2px', textShadow: '0 0 10px rgba(0,240,255,0.2)' }}>
                  ${annualFinancialSavings.toLocaleString()} CAD/USD
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Carbon Emissions Reduced (CO₂)</span>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00a896', marginTop: '2px' }}>
                  {annualCO2Tons.toLocaleString()} Metric Tons
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Calculated based on IATA 3.16x emissions coefficient
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
