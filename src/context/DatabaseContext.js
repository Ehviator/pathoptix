/**
 * PathOptix - DatabaseContext
 * Load-once provider for all static JSON performance and navigation datasets.
 *
 * Isolated from MissionContext so that write-heavy mission state changes
 * (route edits, weight entries) do not cause database consumers to re-render.
 * A useRef guard prevents double-fetching in React StrictMode or on remount.
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const DatabaseContext = createContext(null);

const DB_URLS = [
  '/data/nav_db.json',
  '/data/cruise_econ.json',
  '/data/climb_perf.json',
  '/data/descent_fpa.json',
  '/data/airways_db.json',
  '/data/driftdown_oei.json',
  '/data/terrain_db.json',
  '/data/airport_db.json',
];

export function DatabaseProvider({ children }) {
  const [state, setState] = useState({
    navDb:       null,
    cruiseMatrix: null,
    climbPerf:   null,
    descentPerf: null,
    airwaysDb:   null,
    driftdownDb: null,
    terrainDb:   null,
    airportDb:   null,
    loading:     true,
  });

  // Guard against double-fetch in React StrictMode (dev) and on provider remount.
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    // Use allSettled so a single missing file doesn't abort all other loads.
    // Offline installs will have all files cached by the service worker.
    Promise.allSettled(DB_URLS.map(url => fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json();
    }))).then(([navs, cruise, climb, descent, airways, driftdown, terrain, airports]) => {
      setState({
        navDb:        navs.status       === 'fulfilled' ? navs.value       : null,
        cruiseMatrix: cruise.status     === 'fulfilled' ? cruise.value     : null,
        climbPerf:    climb.status      === 'fulfilled' ? climb.value      : null,
        descentPerf:  descent.status    === 'fulfilled' ? descent.value    : null,
        airwaysDb:    airways.status    === 'fulfilled' ? airways.value    : null,
        driftdownDb:  driftdown.status  === 'fulfilled' ? driftdown.value  : null,
        terrainDb:    terrain.status    === 'fulfilled' ? terrain.value    : null,
        airportDb:    airports.status   === 'fulfilled' ? airports.value   : null,
        loading: false,
      });

      // Surface any partial failures so they appear in the console during QA
      [navs, cruise, climb, descent, airways, driftdown, terrain, airports]
        .forEach((r, i) => {
          if (r.status === 'rejected') {
            console.error(`[DB] Failed to load ${DB_URLS[i]}:`, r.reason);
          }
        });
    });
  }, []);

  return (
    <DatabaseContext.Provider value={state}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabase must be called inside a DatabaseProvider');
  return ctx;
}
