import React, { useState, useEffect } from 'react';

export default function WaypointLog({ waypoints }) {
  const [entries, setEntries] = useState({});

  // Synchronize or initialize state when active waypoints list changes
  useEffect(() => {
    setEntries(prev => {
      const nextEntries = { ...prev };
      waypoints.forEach((wp, idx) => {
        const key = `${wp.ident}-${idx}`;
        if (!nextEntries[key]) {
          nextEntries[key] = {
            wind: '',
            fl: '',
            sat: '',
            plannedFuel: '',
            actualFuel: ''
          };
        }
      });
      return nextEntries;
    });
  }, [waypoints]);

  const handleInputChange = (key, field, value) => {
    setEntries(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  return (
    <div className="navlog-panel">
      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '8px' }}>
        Tactical Navlog Pipeline
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="navlog-table">
          <thead>
            <tr className="navlog-header-row">
              <th style={{ textAlign: 'left', paddingLeft: '8px' }}>Fix</th>
              <th>Wind (kt)</th>
              <th>FL</th>
              <th>SAT (°C)</th>
              <th>Planned (lbs)</th>
              <th>Actual (lbs)</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {waypoints.length === 0 ? (
              <tr className="navlog-body-row">
                <td colSpan="7" style={{ fontStyle: 'italic', color: 'var(--text-secondary)', padding: '24px', textAlign: 'center' }}>
                  No valid navigational fixes parsed.
                </td>
              </tr>
            ) : (
              waypoints.map((wp, idx) => {
                const key = `${wp.ident}-${idx}`;
                const entry = entries[key] || { wind: '', fl: '', sat: '', plannedFuel: '', actualFuel: '' };

                const plannedVal = parseInt(entry.plannedFuel, 10);
                const actualVal = parseInt(entry.actualFuel, 10);

                let deltaText = '--';
                let deltaClass = 'delta-on-profile';

                if (!isNaN(plannedVal) && !isNaN(actualVal)) {
                  const diff = actualVal - plannedVal;
                  if (diff > 0) {
                    deltaText = `+${diff.toLocaleString()}`;
                    deltaClass = 'delta-minus'; // Cyan/green for fuel surplus
                  } else if (diff < 0) {
                    deltaText = `${diff.toLocaleString()}`;
                    deltaClass = 'delta-plus';  // Red/critical for fuel deficit
                  } else {
                    deltaText = '0';
                    deltaClass = 'delta-on-profile';
                  }
                }

                return (
                  <tr className="navlog-body-row" key={key}>
                    <td className="navlog-fix-ident" style={{ paddingLeft: '8px' }}>
                      {wp.ident}
                      <span className="navlog-fix-type">{wp.type} {wp.freq ? `(${wp.freq})` : ''}</span>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="navlog-grid-input"
                        value={entry.wind}
                        onChange={(e) => handleInputChange(key, 'wind', e.target.value)}
                        placeholder="---"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="navlog-grid-input"
                        value={entry.fl}
                        onChange={(e) => handleInputChange(key, 'fl', e.target.value)}
                        placeholder="---"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="navlog-grid-input"
                        value={entry.sat}
                        onChange={(e) => handleInputChange(key, 'sat', e.target.value)}
                        placeholder="---"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="navlog-grid-input"
                        value={entry.plannedFuel}
                        onChange={(e) => handleInputChange(key, 'plannedFuel', e.target.value)}
                        placeholder="----"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="navlog-grid-input"
                        value={entry.actualFuel}
                        onChange={(e) => handleInputChange(key, 'actualFuel', e.target.value)}
                        placeholder="----"
                      />
                    </td>
                    <td className={`navlog-delta-display ${deltaClass}`}>
                      {deltaText}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
