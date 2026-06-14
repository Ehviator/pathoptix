import React, { useState, useEffect, useMemo, useRef } from 'react';

export default function AirportAutocomplete({ label, value, onSelect, airportDb }) {
  const [query, setQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    if (!query || query.length < 2 || !airportDb || !airportDb.airports) return [];
    const q = query.toUpperCase().trim();
    const list = Object.entries(airportDb.airports);
    const matches = [];
    
    for (let i = 0; i < list.length; i++) {
      const [icao, apt] = list[i];
      if (icao.startsWith(q) || (apt.name && apt.name.toUpperCase().includes(q)) || (apt.iata && apt.iata.toUpperCase() === q)) {
        matches.push({ icao, ...apt });
        if (matches.length >= 5) break;
      }
    }
    return matches;
  }, [query, airportDb]);

  return (
    <div ref={wrapperRef} className="input-cell-spatial" style={{ position: 'relative' }}>
      <label>{label}</label>
      <input 
        type="text" 
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="touch-input-field"
        style={{ textTransform: 'uppercase' }}
      />
      {isOpen && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'rgba(10, 16, 26, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          padding: 0,
          margin: '4px 0 0 0',
          listStyle: 'none',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {suggestions.map((apt) => (
            <li 
              key={apt.icao}
              onClick={() => {
                onSelect(apt.icao);
                setQuery(apt.icao);
                setIsOpen(false);
              }}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '13px',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(0, 240, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'none'}
            >
              <strong style={{ color: 'var(--accent-cyan)' }}>{apt.icao}</strong>{' '}
              {apt.iata && apt.iata !== apt.icao && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>({apt.iata})</span>}{' '}
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>- {apt.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
