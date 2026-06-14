import React, { createContext, useContext, useState, useEffect } from 'react';
import { getLegalMaxAltitude } from '../engine/interpolation.js';

const MissionContext = createContext(null);

export function MissionProvider({ children }) {
  const [mission, setMission] = useState({
    departure: '',
    arrival: '',
    weight: '', 
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
    wind: ''
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
      if (value === "" || value === null || value === undefined) {
        return { ...prev, [key]: "" };
      }

      if (['weight', 'cruiseFL', 'costIndex', 'isaDev', 'fuelOnBoard', 'targetAltitude', 'descentSpeed', 'fpa', 'manualMach', 'wind'].includes(key)) {
        updatedVal = ['fpa', 'manualMach'].includes(key) ? parseFloat(value) : parseInt(value, 10);
        if (isNaN(updatedVal)) return prev; // Keep old value if invalid/empty input on blur
        
        if (min !== undefined && updatedVal < min) updatedVal = min;
        if (max !== undefined && updatedVal > max) updatedVal = max;
      }
      return { ...prev, [key]: updatedVal };
    });
  };

  const maxOperatingFL = getLegalMaxAltitude(mission.weight || 0);

  // Enforce boundary guardrails automatically when state changes
  useEffect(() => {
    if (mission.weight !== "" && mission.cruiseFL !== "") {
      const maxFL = getLegalMaxAltitude(mission.weight);
      if (mission.cruiseFL > maxFL) {
        setMission(prev => ({ ...prev, cruiseFL: maxFL }));
      }
    }
  }, [mission.weight, mission.cruiseFL, maxOperatingFL]);

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
