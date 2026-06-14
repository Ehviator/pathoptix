import React from 'react';

// Haversine formula to compute great-circle distance between two coordinates in Nautical Miles (NM)
const calculateDistanceNM = (lat1, lon1, lat2, lon2) => {
  const R = 3440.065; // Earth's radius in Nautical Miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate initial bearing (heading) between two coordinates
const calculateHeading = (lat1, lon1, lat2, lon2) => {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
};

export default function WaypointLog({ waypoints }) {
  // Process route legs and cumulative statistics
  const legs = [];
  let totalDistance = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (i === 0) {
      legs.push({
        wp,
        legDistance: 0,
        heading: null,
        cumulativeDistance: 0
      });
    } else {
      const prevWp = waypoints[i - 1];
      const dist = calculateDistanceNM(prevWp.lat, prevWp.lon, wp.lat, wp.lon);
      const heading = calculateHeading(prevWp.lat, prevWp.lon, wp.lat, wp.lon);
      totalDistance += dist;
      legs.push({
        wp,
        legDistance: Math.round(dist),
        heading,
        cumulativeDistance: Math.round(totalDistance)
      });
    }
  }

  return (
    <div className="performance-table" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>
          Navigation Log Matrix
        </h4>
        {totalDistance > 0 && (
          <span style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: '700' }}>
            TOTAL DIST: {Math.round(totalDistance)} NM
          </span>
        )}
      </div>

      {legs.length === 0 ? (
        <div className="table-row">
          <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>No valid nav fixes verified.</span>
        </div>
      ) : (
        legs.map((leg, idx) => (
          <div className="table-row" key={`${leg.wp.ident}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ color: '#ffffff', fontSize: '15px' }}>{leg.wp.ident}</strong> 
                <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                  {leg.wp.type}
                </span>
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                {leg.wp.freq ? `FREQ: ${leg.wp.freq}` : `${leg.wp.lat.toFixed(2)}N / ${Math.abs(leg.wp.lon).toFixed(2)}W`}
              </span>
            </div>
            
            {idx > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', color: 'var(--accent-cyan)', borderTop: '1px dashed rgba(255,255,255,0.04)', paddingTop: '4px', marginTop: '2px' }}>
                <span>LEG: {leg.legDistance} NM • HDG: {leg.heading.toString().padStart(3, '0')}°</span>
                <span>CUM: {leg.cumulativeDistance} NM</span>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
