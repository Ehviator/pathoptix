import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getLegalMaxAltitude } from '../engine/interpolation.js';
import { calculateDistanceNM, estimateTAS, calculateTrackAngle } from '../engine/kinematics.js';
import { fetchAirportWeather } from '../services/awcApi.js';
import { enrichAirport } from '../services/airportService.js';

const MissionContext = createContext(null);

// Non-destructive flight route parser & reconciliation algorithm
export const parseFlightRoute = (routeString, currentNavLog, database, cruiseFL, airways, blockFuel, taxiFuel, plannedFuelBurn, alternateFuel, finalReserveFuel, pdfNavLogData) => {
  if (!database || !database.waypoints) return { newLog: [], newDistance: 0, unresolvedElements: [] };

  const elements = routeString.toUpperCase().trim().split(/\s+/).filter(Boolean);
  const waypointsToLog = [];

  // Parse unresolved elements (unknown fixes, SIDs, STARs, or waypoints with invalid coordinates)
  const unresolved = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el === 'DCT') continue; // Ignore DCT completely

    const isProcedure = /^[A-Z]+\d[A-Z]?$/.test(el);
    if (isProcedure) continue; // Omit SID/STAR procedures from warnings

    const fix = database.waypoints[el];
    if (!fix) {
      if (!airways || !airways[el]) {
        unresolved.push({
          ident: el,
          type: 'UNKNOWN',
          reason: 'Not found in navigation database'
        });
        console.warn(`[Route Parser] Unrecognized route element "${el}".`);
      }
    } else if (typeof fix.lat !== 'number' || isNaN(fix.lat) || typeof fix.lon !== 'number' || isNaN(fix.lon)) {
      unresolved.push({
        ident: el,
        type: 'INVALID_COORDS',
        reason: 'Missing or invalid coordinates'
      });
      console.warn(`[Route Parser] Rejected waypoint "${el}" due to missing or invalid coordinates: lat=${fix.lat}, lon=${fix.lon}`);
    }
  }

  for (let i = 0; i < elements.length; i++) {
    const ident = elements[i];
    if (ident === 'DCT') continue; // Ignore DCT completely
    const fix = database.waypoints[ident];
    if (fix && typeof fix.lat === 'number' && !isNaN(fix.lat) && typeof fix.lon === 'number' && !isNaN(fix.lon)) {
      // Check if there was an airway immediately preceding it (e.g., Waypoint, Airway, Waypoint)
      if (i >= 2 && airways && airways[elements[i - 1]]) {
        const airwayIdent = elements[i - 1];
        const startWp = elements[i - 2];
        const endWp = ident;

        const airwayWps = airways[airwayIdent];
        if (airwayWps) {
          const startIndex = airwayWps.indexOf(startWp);
          const endIndex = airwayWps.indexOf(endWp);

          if (startIndex !== -1 && endIndex !== -1) {
            let intermediates = [];
            if (startIndex < endIndex) {
              // Moving forward along airway
              intermediates = airwayWps.slice(startIndex + 1, endIndex);
            } else {
              // Moving backward along airway
              intermediates = airwayWps.slice(endIndex + 1, startIndex).reverse();
            }

            intermediates.forEach(wpName => {
              const wpFix = database.waypoints[wpName];
              if (wpFix && typeof wpFix.lat === 'number' && !isNaN(wpFix.lat) && typeof wpFix.lon === 'number' && !isNaN(wpFix.lon)) {
                if (!waypointsToLog.includes(wpName)) {
                  waypointsToLog.push(wpName);
                }
              } else {
                console.warn(`[Route Parser] Airway intermediate waypoint "${wpName}" rejected due to invalid/missing coordinates or missing database entry.`);
                if (wpFix) {
                  unresolved.push({
                    ident: wpName,
                    type: 'INVALID_COORDS',
                    reason: 'Airway intermediate fix has invalid coordinates'
                  });
                }
              }
            });
          }
        }
      }

      if (!waypointsToLog.includes(ident)) {
        waypointsToLog.push(ident);
      }
    }
  }

  // Pass 1: calculate total distance and cumulative distances
  let accumulatedDistance = 0;
  const cumulativeDistances = [];
  for (let i = 0; i < waypointsToLog.length; i++) {
    const ident = waypointsToLog[i];
    const fix = database.waypoints[ident];
    let legDist = 0;
    if (i > 0) {
      const prevIdent = waypointsToLog[i - 1];
      const prevFix = database.waypoints[prevIdent];
      if (prevFix && fix && typeof prevFix.lat === 'number' && !isNaN(prevFix.lat) && typeof prevFix.lon === 'number' && !isNaN(prevFix.lon) && typeof fix.lat === 'number' && !isNaN(fix.lat) && typeof fix.lon === 'number' && !isNaN(fix.lon)) {
        legDist = calculateDistanceNM(prevFix.lat, prevFix.lon, fix.lat, fix.lon);
      }
      accumulatedDistance += legDist;
    }
    cumulativeDistances.push(accumulatedDistance);
  }
  const totalRouteDistance = accumulatedDistance;

  // Pass 2: build newLog
  const newLog = [];
  const consumedIndices = new Set();
  const takeoffFuel = (blockFuel || 0) - (taxiFuel || 0);
  // Fallback: if plannedFuelBurn is empty or 0, use block - taxi - alternate - reserve
  const plannedBurn = plannedFuelBurn || Math.max(0, (blockFuel || 0) - (taxiFuel || 0) - (alternateFuel || 0) - (finalReserveFuel || 0));

  for (let i = 0; i < waypointsToLog.length; i++) {
    const ident = waypointsToLog[i];
    const fix = database.waypoints[ident];
    const legDist = i > 0 ? cumulativeDistances[i] - cumulativeDistances[i - 1] : 0;
    const cumulativeDistance = cumulativeDistances[i];

    // Calculate proportional fuel
    let calculatedFuel = takeoffFuel;
    if (totalRouteDistance > 0) {
      calculatedFuel = Math.max(0, Math.round(takeoffFuel - (plannedBurn * (cumulativeDistance / totalRouteDistance))));
    }

    // Calculate track angle from preceding waypoint
    let trackAngle = null;
    if (i > 0) {
      const prevIdent = waypointsToLog[i - 1];
      const prevFix = database.waypoints[prevIdent];
      if (prevFix && fix && typeof prevFix.lat === 'number' && !isNaN(prevFix.lat) && typeof prevFix.lon === 'number' && !isNaN(prevFix.lon) && typeof fix.lat === 'number' && !isNaN(fix.lat) && typeof fix.lon === 'number' && !isNaN(fix.lon)) {
        trackAngle = calculateTrackAngle(prevFix.lat, prevFix.lon, fix.lat, fix.lon);
      }
    }

    // Match existing waypoint in current navLog to preserve its custom pilot inputs
    let existing = null;
    for (let j = 0; j < currentNavLog.length; j++) {
      if (currentNavLog[j].ident === ident && !consumedIndices.has(j)) {
        existing = currentNavLog[j];
        consumedIndices.add(j);
        break;
      }
    }

    const pdfWp = pdfNavLogData ? pdfNavLogData[ident] : null;

    if (existing) {
      // Re-evaluate TAS/GS kinematics while keeping custom inputs, overlaying PDF data if available
      const fl = pdfWp ? pdfWp.fl : existing.fl;
      const sat = pdfWp ? pdfWp.sat : existing.sat;
      const wind = pdfWp ? pdfWp.wind : existing.wind;
      const plannedFuel = pdfWp ? pdfWp.plannedFuel : (existing.isManualPlanned ? existing.plannedFuel : calculatedFuel);
      const actualFuel = pdfWp ? pdfWp.actualFuel : (existing.isManualActual ? existing.actualFuel : calculatedFuel);

      const currentTAS = estimateTAS(fl, sat);
      newLog.push({
        ...existing,
        legDistance: legDist,
        fl,
        sat,
        wind,
        tas: currentTAS,
        gs: Math.max(100, currentTAS + wind),
        plannedFuel,
        actualFuel,
        trackAngle
      });
    } else {
      // Initialize new waypoint with defaults, overlaying PDF data if available
      const fl = pdfWp ? pdfWp.fl : (cruiseFL || 350);
      const sat = pdfWp ? pdfWp.sat : -45;
      const wind = pdfWp ? pdfWp.wind : 0;
      const plannedFuel = pdfWp ? pdfWp.plannedFuel : calculatedFuel;
      const actualFuel = pdfWp ? pdfWp.actualFuel : calculatedFuel;

      const initialTAS = estimateTAS(fl, sat);
      newLog.push({
        ident,
        type: fix.type,
        lat: fix.lat,
        lon: fix.lon,
        legDistance: legDist,
        wind,
        fl,
        sat,
        tas: initialTAS,
        gs: Math.max(100, initialTAS + wind),
        plannedFuel,
        actualFuel,
        trackAngle
      });
    }
  }

  return { newLog, newDistance: totalRouteDistance, unresolvedElements: unresolved };
};

export function MissionProvider({ children }) {
  const [mission, setMission] = useState({
    departure: '',
    arrival: '',
    alternate: '',
    zeroFuelWeight: '', 
    blockFuel: '',
    taxiFuel: '',
    alternateFuel: '',
    finalReserveFuel: '',
    costIndex: '',
    isaDev: '',
    cruiseFL: '',
    fuelOnBoard: '',
    routeString: '',
    antiIce: false,
    aircraftConfig: 'E195E2_STD',
    targetAltitude: '',
    descentSpeed: '',
    fpa: '',
    manualMach: '',
    speedMode: 'ECON',
    wind: '',
    tripDistance: '',
    plannedFuelBurn: '',
    climbFL: '',
    departureElev: '',
    departureQnh: 29.92,
    arrivalQnh: 29.92,
    arrivalElev: '',
    arrivalOat: '',
    pax: '',
    mac: '',
    flightNumber: '',
    averageWindDir: '',
    averageWindSpeed: '',
    registration: '',
    plannedEte: ''
  });

  const [navDb, setNavDb] = useState(null);
  const [cruiseMatrix, setCruiseMatrix] = useState(null);
  const [climbPerf, setClimbPerf] = useState(null);
  const [descentPerf, setDescentPerf] = useState(null);
  const [airwaysDb, setAirwaysDb] = useState(null);
  const [driftdownDb, setDriftdownDb] = useState(null);
  const [terrainDb, setTerrainDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unresolvedElements, setUnresolvedElements] = useState([]);

  // Global Flight Log and Distance States
  const [navLog, setNavLog] = useState([]);
  const [totalDistance, setTotalDistance] = useState(0);

  // Global Weather State
  const [weather, setWeather] = useState({
    departure: null,
    arrival: null,
    alternate: null
  });

  // Parallel asynchronous database initialization
  useEffect(() => {
    Promise.all([
      fetch('/data/nav_db.json').then(res => res.json()),
      fetch('/data/cruise_econ.json').then(res => res.json()),
      fetch('/data/climb_perf.json').then(res => res.json()),
      fetch('/data/descent_fpa.json').then(res => res.json()),
      fetch('/data/airways_db.json').then(res => res.json()),
      fetch('/data/driftdown_oei.json').then(res => res.json()),
      fetch('/data/terrain_db.json').then(res => res.json())
    ])
    .then(([navs, cruise, climb, descent, airways, driftdown, terrain]) => {
      setNavDb(navs);
      setCruiseMatrix(cruise);
      setClimbPerf(climb);
      setDescentPerf(descent);
      setAirwaysDb(airways);
      setDriftdownDb(driftdown);
      setTerrainDb(terrain);
      setLoading(false);
    })
    .catch(err => {
      console.error("Critical fault syncing core databases:", err);
      setLoading(false);
    });
  }, []);

  // Load airport database asynchronously
  const [airportDb, setAirportDb] = useState(null);
  useEffect(() => {
    fetch('/data/airport_db.json')
      .then(res => res.json())
      .then(data => {
        setAirportDb(data);
      })
      .catch(err => {
        console.error("Warning: Failed to load airport database:", err);
      });
  }, []);

  // Auto-populate field elevations from local airportDb
  useEffect(() => {
    if (airportDb && airportDb.airports) {
      const depData = airportDb.airports[mission.departure.toUpperCase().trim()];
      const arrData = airportDb.airports[mission.arrival.toUpperCase().trim()];
      
      setMission(prev => {
        let needsUpdate = false;
        const updates = {};
        
        if (depData && prev.departureElev !== depData.elevation) {
          updates.departureElev = depData.elevation;
          needsUpdate = true;
        }
        if (arrData && prev.arrivalElev !== arrData.elevation) {
          updates.arrivalElev = arrData.elevation;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [airportDb, mission.departure, mission.arrival]);



  // Safe ref tracking to read the latest navLog state without causing infinite rendering loops in useEffect
  const navLogRef = useRef([]);
  const pdfNavLogDataRef = useRef({});

  useEffect(() => {
    navLogRef.current = navLog;
  }, [navLog]);

  // Synchronize NavLog when routeString, cruiseFL, navDb, blockFuel, taxiFuel, or plannedFuelBurn changes
  useEffect(() => {
    if (navDb) {
      const { newLog, newDistance, unresolvedElements: unresolved } = parseFlightRoute(
        mission.routeString,
        navLogRef.current,
        navDb,
        mission.cruiseFL,
        airwaysDb,
        mission.blockFuel,
        mission.taxiFuel,
        mission.plannedFuelBurn,
        mission.alternateFuel,
        mission.finalReserveFuel,
        pdfNavLogDataRef.current
      );
      setNavLog(newLog);
      setTotalDistance(newDistance);
      setUnresolvedElements(unresolved || []);

      // Auto-extract departure and arrival from routeString
      const elements = mission.routeString.toUpperCase().trim().split(/\s+/).filter(Boolean);
      if (elements.length >= 2) {
        const dep = elements[0];
        const arr = elements[elements.length - 1];
        setMission(prev => {
          if (prev.departure !== dep || prev.arrival !== arr) {
            return { ...prev, departure: dep, arrival: arr };
          }
          return prev;
        });
      }
    }
  }, [navDb, mission.routeString, mission.cruiseFL, airwaysDb, mission.blockFuel, mission.taxiFuel, mission.plannedFuelBurn, mission.alternateFuel, mission.finalReserveFuel]);

  // Keep routeString synchronized with departure and arrival changes
  useEffect(() => {
    setMission(prev => {
      const dep = prev.departure.toUpperCase().trim();
      const arr = prev.arrival.toUpperCase().trim();

      if (!dep && !arr) return prev;

      const elements = prev.routeString.toUpperCase().trim().split(/\s+/).filter(Boolean);
      let newElements = [...elements];

      if (newElements.length === 0) {
        if (dep && arr) {
          return { ...prev, routeString: `${dep} ${arr}` };
        } else if (dep) {
          return { ...prev, routeString: dep };
        } else if (arr) {
          return { ...prev, routeString: arr };
        }
      } else {
        if (dep && newElements[0] !== dep) {
          newElements[0] = dep;
        }
        if (arr && newElements.length > 1 && newElements[newElements.length - 1] !== arr) {
          newElements[newElements.length - 1] = arr;
        } else if (arr && newElements.length === 1 && newElements[0] !== arr) {
          newElements.push(arr);
        }

        const newRoute = newElements.join(' ');
        if (newRoute !== prev.routeString) {
          return { ...prev, routeString: newRoute };
        }
      }
      return prev;
    });
  }, [mission.departure, mission.arrival]);

  // Fetch airport weather when departure or arrival change
  useEffect(() => {
    let active = true;

    async function fetchWeather() {
      const depCode = mission.departure;
      const arrCode = mission.arrival;
      const altCode = mission.alternate;

      if (!depCode && !arrCode && !altCode) {
        if (active) {
          setWeather({ departure: null, arrival: null, alternate: null });
        }
        return;
      }

      // Concurrently fetch weather for departure, arrival, and alternate
      const [depWeather, arrWeather, altWeather] = await Promise.all([
        depCode ? fetchAirportWeather(depCode) : Promise.resolve(null),
        arrCode ? fetchAirportWeather(arrCode) : Promise.resolve(null),
        altCode ? fetchAirportWeather(altCode) : Promise.resolve(null)
      ]);

      if (!active) return;

      setWeather({
        departure: depWeather,
        arrival: arrWeather,
        alternate: altWeather
      });

      // Dispatch updates to mission context state
      setMission(prev => {
        const updates = {};

        if (depWeather && depWeather.status === 'OK') {
          updates.departureQnh = depWeather.altimeter;
          updates.departureElev = depWeather.elevation;
          
          if (depWeather.temperature !== null && depWeather.temperature !== undefined) {
            // Calculate ISA Deviation at field: OAT - Standard Temperature
            // Standard Temperature = 15 - 1.98 * (elevation / 1000)
            const stdTemp = 15.0 - 1.98 * (depWeather.elevation / 1000.0);
            updates.isaDev = Math.round(depWeather.temperature - stdTemp);
          }
        }

        if (arrWeather && arrWeather.status === 'OK') {
          updates.arrivalQnh = arrWeather.altimeter;
          updates.arrivalElev = arrWeather.elevation;
          updates.arrivalOat = arrWeather.temperature;
        }

        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }

    fetchWeather();

    return () => {
      active = false;
    };
  }, [mission.departure, mission.arrival, mission.alternate]);

  // Operations Math and Legal Fuel Calculations
  const takeoffWeight = (mission.zeroFuelWeight || 0) + (mission.blockFuel || 0) - (mission.taxiFuel || 0);

  // CARs 705 Calculated Legal Reserves
  const tripFuelCalc = mission.plannedFuelBurn || 0;
  const contingencyFuelCalc = Math.round(tripFuelCalc * 0.05);

  let alternateDistance = 0;
  if (airportDb && airportDb.airports && mission.arrival && mission.alternate) {
    const arrApt = airportDb.airports[mission.arrival.toUpperCase().trim()];
    const altApt = airportDb.airports[mission.alternate.toUpperCase().trim()];
    if (arrApt && altApt && arrApt.coords && altApt.coords) {
      alternateDistance = Math.round(calculateDistanceNM(
        arrApt.coords[0], arrApt.coords[1],
        altApt.coords[0], altApt.coords[1]
      ));
    }
  }

  const alternateFuelCalc = alternateDistance > 0 ? Math.round(alternateDistance * 12.5 + 400) : 0;
  const finalReserveFuelCalc = Math.round(1150 + 0.005 * takeoffWeight);
  const requiredBlockFuel = (mission.taxiFuel || 0) + tripFuelCalc + contingencyFuelCalc + alternateFuelCalc + finalReserveFuelCalc;
  const isBlockFuelSufficient = (mission.blockFuel || 0) >= requiredBlockFuel;

  const minimumDiversionFuel = (mission.alternateFuel || 0) + (mission.finalReserveFuel || 0);

  // Wrap mission with calculated takeoffWeight to prevent breaking downstream performance equations
  const missionWithWeight = {
    ...mission,
    weight: takeoffWeight
  };

  const updateMissionField = (key, value, min, max) => {
    if (key === 'routeString') {
      pdfNavLogDataRef.current = {};
    }
    setMission(prev => {
      let updatedVal = value;
      if (value === "" || value === null || value === undefined) {
        return { ...prev, [key]: "" };
      }

      const numericKeys = [
        'zeroFuelWeight', 'blockFuel', 'taxiFuel', 'alternateFuel', 'finalReserveFuel',
        'cruiseFL', 'costIndex', 'isaDev', 'fuelOnBoard', 'targetAltitude', 
        'descentSpeed', 'fpa', 'manualMach', 'wind', 'tripDistance', 'plannedFuelBurn', 
        'climbFL', 'departureElev', 'departureQnh', 'arrivalQnh', 'arrivalElev', 'arrivalOat',
        'pax', 'mac', 'averageWindDir', 'averageWindSpeed', 'plannedEte'
      ];

      if (numericKeys.includes(key)) {
        updatedVal = ['fpa', 'manualMach', 'tripDistance', 'plannedFuelBurn', 'departureQnh', 'arrivalQnh', 'mac'].includes(key) ? parseFloat(value) : parseInt(value, 10);
        if (isNaN(updatedVal)) return prev;
        
        if (min !== undefined && updatedVal < min) updatedVal = min;
        if (max !== undefined && updatedVal > max) updatedVal = max;
      }
      return { ...prev, [key]: updatedVal };
    });
  };

  const updateMissionFields = (fields) => {
    if (fields.navLogCustomData) {
      const dataMap = {};
      fields.navLogCustomData.forEach(wp => {
        dataMap[wp.ident] = wp;
      });
      pdfNavLogDataRef.current = dataMap;
    }
    setMission(prev => {
      const next = { ...prev };
      const numericKeys = [
        'zeroFuelWeight', 'blockFuel', 'taxiFuel', 'alternateFuel', 'finalReserveFuel',
        'cruiseFL', 'costIndex', 'isaDev', 'fuelOnBoard', 'targetAltitude', 
        'descentSpeed', 'fpa', 'manualMach', 'wind', 'tripDistance', 'plannedFuelBurn', 
        'climbFL', 'departureElev', 'departureQnh', 'arrivalQnh', 'arrivalElev', 'arrivalOat',
        'pax', 'mac', 'averageWindDir', 'averageWindSpeed', 'plannedEte'
      ];

      Object.entries(fields).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) {
          next[key] = "";
          return;
        }

        let updatedVal = value;
        if (numericKeys.includes(key)) {
          updatedVal = ['fpa', 'manualMach', 'tripDistance', 'plannedFuelBurn', 'departureQnh', 'arrivalQnh', 'mac'].includes(key) ? parseFloat(value) : parseInt(value, 10);
          if (isNaN(updatedVal)) return;
        }
        next[key] = updatedVal;
      });
      return next;
    });
  };


  const updateNavLogField = (index, key, value) => {
    let parsed = key === 'sat' || key === 'wind' || key === 'fl' ? parseInt(value, 10) : parseFloat(value);
    if (isNaN(parsed)) parsed = 0;

    if (key === 'wind') {
      if (parsed < -200) parsed = -200;
      if (parsed > 200) parsed = 200;
    }

    setNavLog(prev => {
      const updated = [...prev];
      const extra = {};
      if (key === 'plannedFuel') extra.isManualPlanned = true;
      if (key === 'actualFuel') extra.isManualActual = true;

      updated[index] = { ...updated[index], [key]: parsed, ...extra };
      
      if (['wind', 'fl', 'sat'].includes(key)) {
        const currentFl = key === 'fl' ? parsed : updated[index].fl;
        const currentSat = key === 'sat' ? parsed : updated[index].sat;
        const currentWind = key === 'wind' ? parsed : updated[index].wind;
        
        const newTAS = estimateTAS(currentFl, currentSat);
        updated[index].tas = newTAS;
        updated[index].gs = Math.max(100, newTAS + currentWind);
      }
      
      return updated;
    });
  };

  const maxOperatingFL = getLegalMaxAltitude(takeoffWeight || 0);

  // Enforce boundary guardrails automatically when state changes
  useEffect(() => {
    if (takeoffWeight !== 0 && mission.cruiseFL !== "") {
      const maxFL = getLegalMaxAltitude(takeoffWeight);
      if (mission.cruiseFL > maxFL) {
        setMission(prev => ({ ...prev, cruiseFL: maxFL }));
      }
    }
  }, [takeoffWeight, mission.cruiseFL, maxOperatingFL]);

  return (
    <MissionContext.Provider value={{ 
      mission: missionWithWeight, 
      updateMissionField, 
      updateMissionFields,
      navDb, 
      cruiseMatrix, 
      climbPerf, 
      descentPerf, 
      maxOperatingFL, 
      loading,
      navLog,
      totalDistance,
      updateNavLogField,
      takeoffWeight,
      minimumDiversionFuel,
      weather,
      airportDb,
      enrichAirport,
      unresolvedElements,
      tripFuelCalc,
      contingencyFuelCalc,
      alternateDistance,
      alternateFuelCalc,
      finalReserveFuelCalc,
      requiredBlockFuel,
      isBlockFuelSufficient,
      driftdownDb,
      terrainDb
    }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  const context = useContext(MissionContext);
  if (!context) throw new Error("useMission must be enclosed inside a MissionProvider context.");
  return context;
}
