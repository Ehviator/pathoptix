import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getLegalMaxAltitude } from '../engine/interpolation.js';
import { calculateDistanceNM, estimateTAS } from '../engine/kinematics.js';

const MissionContext = createContext(null);

export function MissionProvider({ children }) {
  const [mission, setMission] = useState({
    departure: '',
    arrival: '',
    zeroFuelWeight: 95000, 
    blockFuel: 15000,
    taxiFuel: 300,
    alternateFuel: 2500,
    finalReserveFuel: 2200,
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
    departureElev: ''
  });

  const [navDb, setNavDb] = useState(null);
  const [cruiseMatrix, setCruiseMatrix] = useState(null);
  const [climbPerf, setClimbPerf] = useState(null);
  const [descentPerf, setDescentPerf] = useState(null);
  const [loading, setLoading] = useState(true);

  // Global Flight Log and Distance States
  const [navLog, setNavLog] = useState([]);
  const [totalDistance, setTotalDistance] = useState(0);

  // Parallel asynchronous database initialization
  useEffect(() => {
    Promise.all([
      fetch('/data/nav_db.json').then(res => res.json()),
      fetch('/data/cruise_econ.json').then(res => res.json()),
      fetch('/data/climb_perf.json').then(res => res.json()),
      fetch('/data/descent_fpa.json').then(res => res.json())
    ])
    .then(([navs, cruise, climb, descent]) => {
      setNavDb(navs);
      setCruiseMatrix(cruise);
      setClimbPerf(climb);
      setDescentPerf(descent);
      setLoading(false);
    })
    .catch(err => {
      console.error("Critical fault syncing core databases:", err);
      setLoading(false);
    });
  }, []);

  // Non-destructive flight route parser & reconciliation algorithm
  const parseFlightRoute = (routeString, currentNavLog, database, cruiseFL) => {
    if (!database || !database.waypoints) return { newLog: [], newDistance: 0 };

    const elements = routeString.toUpperCase().trim().split(/\s+/).filter(Boolean);
    const newLog = [];
    let accumulatedDistance = 0;
    const consumedIndices = new Set();

    for (let i = 0; i < elements.length; i++) {
      const ident = elements[i];
      if (database.waypoints[ident]) {
        const fix = database.waypoints[ident];
        
        let legDist = 0;
        if (i > 0 && database.waypoints[elements[i-1]]) {
          const prevFix = database.waypoints[elements[i-1]];
          legDist = calculateDistanceNM(prevFix.lat, prevFix.lon, fix.lat, fix.lon);
          accumulatedDistance += legDist;
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

        if (existing) {
          // Re-evaluate TAS/GS kinematics in case cruiseFL/SAT/wind changed, while keeping custom inputs
          const currentTAS = estimateTAS(existing.fl, existing.sat);
          newLog.push({
            ...existing,
            legDistance: legDist,
            tas: currentTAS,
            gs: Math.max(100, currentTAS + existing.wind)
          });
        } else {
          // Initialize new waypoint with defaults
          const initialTAS = estimateTAS(cruiseFL || 350, -45);
          newLog.push({
            ident,
            type: fix.type,
            lat: fix.lat,
            lon: fix.lon,
            legDistance: legDist,
            wind: 0,
            fl: cruiseFL || 350,
            sat: -45,
            tas: initialTAS,
            gs: initialTAS,
            plannedFuel: 5000,
            actualFuel: 5000
          });
        }
      }
    }

    return { newLog, newDistance: accumulatedDistance };
  };

  // Safe ref tracking to read the latest navLog state without causing infinite rendering loops in useEffect
  const navLogRef = useRef([]);
  useEffect(() => {
    navLogRef.current = navLog;
  }, [navLog]);

  // Synchronize NavLog when routeString, cruiseFL, or navDb changes
  useEffect(() => {
    if (navDb) {
      const { newLog, newDistance } = parseFlightRoute(mission.routeString, navLogRef.current, navDb, mission.cruiseFL);
      setNavLog(newLog);
      setTotalDistance(newDistance);
    }
  }, [navDb, mission.routeString, mission.cruiseFL]);

  // Operations Math and Legal Fuel Calculations
  const takeoffWeight = (mission.zeroFuelWeight || 0) + (mission.blockFuel || 0) - (mission.taxiFuel || 0);
  const minimumDiversionFuel = (mission.alternateFuel || 0) + (mission.finalReserveFuel || 0);

  // Wrap mission with calculated takeoffWeight to prevent breaking downstream performance equations
  const missionWithWeight = {
    ...mission,
    weight: takeoffWeight
  };

  const updateMissionField = (key, value, min, max) => {
    setMission(prev => {
      let updatedVal = value;
      if (value === "" || value === null || value === undefined) {
        return { ...prev, [key]: "" };
      }

      const numericKeys = [
        'zeroFuelWeight', 'blockFuel', 'taxiFuel', 'alternateFuel', 'finalReserveFuel',
        'cruiseFL', 'costIndex', 'isaDev', 'fuelOnBoard', 'targetAltitude', 
        'descentSpeed', 'fpa', 'manualMach', 'wind', 'tripDistance', 'plannedFuelBurn', 
        'climbFL', 'departureElev'
      ];

      if (numericKeys.includes(key)) {
        updatedVal = ['fpa', 'manualMach', 'tripDistance', 'plannedFuelBurn'].includes(key) ? parseFloat(value) : parseInt(value, 10);
        if (isNaN(updatedVal)) return prev;
        
        if (min !== undefined && updatedVal < min) updatedVal = min;
        if (max !== undefined && updatedVal > max) updatedVal = max;
      }
      return { ...prev, [key]: updatedVal };
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
      updated[index] = { ...updated[index], [key]: parsed };
      
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
      minimumDiversionFuel
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
