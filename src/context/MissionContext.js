import React, { createContext, useContext, useState, useEffect } from 'react';
import { getLegalMaxAltitude } from '../engine/interpolation.js';

const MissionContext = createContext(null);

export function MissionProvider({ children }) {
  const [mission, setMission] = useState({
    departure: 'CYYZ',
    arrival: 'CYOW',
    weight: 115000, 
    costIndex: 15,
    isaDev: 0,
    cruiseFL: 350,
    fuelOnBoard: 12000,
    routeString: 'YTZ SEDAR YOW',
    antiIce: false,
    aircraftConfig: 'E195E2_STD',
    targetAltitude: 35000, // Climb target altitude and descent target altitude (in ft)
    descentSpeed: 270,    // Descent speed KIAS
    fpa: 3.0,             // Descent flight path angle
    manualMach: 0.78,     // Cruise manual mach speed
    speedMode: 'ECON',    // Cruise speed mode: ECON or MANUAL
    wind: 0               // Enroute wind velocity (kt)
  });

  const [airportDb, setAirportDb] = useState(null);
  const [navDb, setNavDb] = useState(null);
  const [cruiseMatrix, setCruiseMatrix] = useState(null);
  const [loading, setLoading] = useState(true);

  // Parallel asynchronous database initialization
  useEffect(() => {
    Promise.all([
      fetch('/data/airport_db.json').then(res => res.json()),
      fetch('/data/nav_db.json').then(res => res.json()),
      fetch('/data/cruise_econ.json').then(res => res.json())
    ])
    .then(([airports, navs, cruise]) => {
      setAirportDb(airports);
      setNavDb(navs);
      setCruiseMatrix(cruise);
      setLoading(false);
    })
    .catch(err => {
      console.error("Critical fault syncing core databases:", err);
      setLoading(false);
    });
  }, []);

  const updateMissionField = (key, value, min, max) => {
    setMission(prev => {
      let updatedVal = value;
      if (['weight', 'cruiseFL', 'costIndex', 'isaDev', 'fuelOnBoard', 'targetAltitude', 'descentSpeed', 'fpa', 'manualMach', 'wind'].includes(key)) {
        updatedVal = ['fpa', 'manualMach'].includes(key) ? parseFloat(value) : parseInt(value, 10);
        if (isNaN(updatedVal)) return prev; // Keep old value if invalid/empty input on blur
        
        if (min !== undefined && updatedVal < min) updatedVal = min;
        if (max !== undefined && updatedVal > max) updatedVal = max;
      }
      return { ...prev, [key]: updatedVal };
    });
  };

  const maxOperatingFL = getLegalMaxAltitude(mission.weight);

  // Enforce boundary guardrails automatically when state changes
  useEffect(() => {
    if (mission.cruiseFL > maxOperatingFL) {
      setMission(prev => ({ ...prev, cruiseFL: maxOperatingFL }));
    }
  }, [mission.weight, maxOperatingFL]);

  return (
    <MissionContext.Provider value={{ mission, updateMissionField, airportDb, navDb, cruiseMatrix, maxOperatingFL, loading }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  const context = useContext(MissionContext);
  if (!context) throw new Error("useMission must be enclosed inside a MissionProvider context.");
  return context;
}
