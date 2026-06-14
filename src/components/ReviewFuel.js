import React from 'react';
import { useMission } from '../context/MissionContext.js';
import { RAMP_FUEL_TOLERANCE_LBS } from '../engine/fuelLegality.js';

export default function ReviewFuel() {
  const {
    mission,
    updateMissionField,
    takeoffWeight,
    landingWeight,
    minimumDiversionFuel,
    totalDistance,
    tripFuelCalc,
    contingencyFuelCalc,
    alternateDistance,
    alternateFuelCalc,
    finalReserveFuelCalc,
    requiredBlockFuel,
    isBlockFuelSufficient,
    weightViolations,
  } = useMission();

  const handleAutoLoadLegalFuel = () => {
    updateMissionField('alternateFuel', alternateFuelCalc);
    updateMissionField('finalReserveFuel', finalReserveFuelCalc);
    updateMissionField('blockFuel', requiredBlockFuel);
  };

  const routeBurn           = mission.plannedFuelBurn || 0;
  const projectedLandingFuel = (mission.blockFuel || 0) - (mission.taxiFuel || 0) - routeBurn;
  const legalLandingMargin  = projectedLandingFuel - minimumDiversionFuel;

  // Ramp fuel reconciliation
  const rampFuelLoaded      = mission.rampFuel || 0;
  const rampFuelEntered     = rampFuelLoaded > 0;
  const rampVariance        = rampFuelLoaded - (mission.blockFuel || 0);
  const rampSufficient      = rampFuelLoaded >= requiredBlockFuel;
  const rampVarianceExcessive = Math.abs(rampVariance) > RAMP_FUEL_TOLERANCE_LBS;

  const showPlaceholder = !mission.weight || mission.weight < 50000;

  if (showPlaceholder) {
    return (
      <div className="panel-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', margin: '24px 0' }}>
          <span style={{ fontSize: '32px', marginBottom: '16px' }}>📋</span>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--accent-cyan)' }}>No Active Dispatch Plan</h3>
          <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: '1.5' }}>
            Please configure dispatch weights and flight parameters on the **Create Flight** page first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>⛽ Review Fuel Planning & Reserve Legality</h2>
        <p>Configure block fuel loads and verify regulatory reserve margins (CARs 705).</p>
      </div>

      {/* ── Weight Violation Banners ──────────────────────────────────────────── */}
      {weightViolations.map((v) => (
        <div key={v.field} style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          margin: '0 0 12px 0', padding: '12px', borderRadius: '8px',
          background: v.severity === 'RED' ? 'rgba(255,74,74,0.12)' : 'rgba(255,183,0,0.10)',
          border: `1px solid ${v.severity === 'RED' ? 'rgba(255,74,74,0.35)' : 'rgba(255,183,0,0.35)'}`,
          color: '#fff', fontSize: '13px',
        }}>
          <span style={{ fontSize: '18px' }}>{v.severity === 'RED' ? '🚫' : '⚠️'}</span>
          <span>
            <strong>{v.severity === 'RED' ? `EXCEEDS ${v.label}:` : `CAUTION — APPROACHING ${v.label}:`}</strong>{' '}
            {v.actual.toLocaleString()} lbs loaded vs structural limit of {v.limit.toLocaleString()} lbs
            {v.severity === 'AMBER' && ` (${(((v.actual / v.limit) - 1) * 100 + 3).toFixed(1)}% of limit)`}.
            {v.severity === 'RED' && ' Reduce payload or fuel before dispatch.'}
          </span>
        </div>
      ))}

      {/* ── Insufficient Block Fuel Banner ───────────────────────────────────── */}
      {!isBlockFuelSufficient && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 12px 0', background: 'rgba(255,74,74,0.12)', border: '1px solid rgba(255,74,74,0.25)', padding: '12px', borderRadius: '8px', color: '#fff', fontSize: '13px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>
            <strong>INSUFFICIENT BLOCK FUEL LOADED:</strong> Total block fuel load ({(mission.blockFuel || 0).toLocaleString()} lbs) is less than the legally required sum ({requiredBlockFuel.toLocaleString()} lbs). Load legal fuel or reduce payload.
          </span>
        </div>
      )}

      {/* ── Ramp Fuel Mismatch Banner ─────────────────────────────────────────── */}
      {rampFuelEntered && !rampSufficient && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 12px 0', background: 'rgba(255,74,74,0.12)', border: '1px solid rgba(255,74,74,0.25)', padding: '12px', borderRadius: '8px', color: '#fff', fontSize: '13px' }}>
          <span style={{ fontSize: '18px' }}>🚫</span>
          <span>
            <strong>RAMP FUEL BELOW LEGAL MINIMUM:</strong> Actual ramp fuel ({rampFuelLoaded.toLocaleString()} lbs) is below the required block fuel ({requiredBlockFuel.toLocaleString()} lbs). Aircraft is not legal for departure.
          </span>
        </div>
      )}
      {rampFuelEntered && rampSufficient && rampVarianceExcessive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 12px 0', background: 'rgba(255,183,0,0.10)', border: '1px solid rgba(255,183,0,0.35)', padding: '12px', borderRadius: '8px', color: '#fff', fontSize: '13px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>
            <strong>RAMP FUEL VARIANCE EXCEEDS ±{RAMP_FUEL_TOLERANCE_LBS} LBS:</strong> Actual ramp fuel ({rampFuelLoaded.toLocaleString()} lbs) differs from planned block fuel ({(mission.blockFuel || 0).toLocaleString()} lbs) by {rampVariance > 0 ? '+' : ''}{rampVariance.toLocaleString()} lbs. Verify weight and balance before departure.
          </span>
        </div>
      )}

      <div className="panel-body grid-2col">
        {/* ── Left: Inputs ──────────────────────────────────────────────────── */}
        <div className="input-section glass-panel">
          <h3>Fuel Dispatch Setup</h3>
          <div className="input-grid-spatial">
            <div className="input-cell-spatial">
              <label>Block Fuel — Planned (lbs)</label>
              <input
                type="number"
                key={mission.blockFuel}
                defaultValue={mission.blockFuel}
                onBlur={(e) => updateMissionField('blockFuel', e.target.value, 2000, 30000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Ramp Fuel — Actual Loaded (lbs)</label>
              <input
                type="number"
                key={mission.rampFuel}
                defaultValue={mission.rampFuel || ''}
                placeholder="Enter from fuel gauge"
                onBlur={(e) => updateMissionField('rampFuel', e.target.value, 1000, 30000)}
                className="touch-input-field"
                style={rampFuelEntered && !rampSufficient ? { borderColor: 'var(--accent-crit)' } : rampFuelEntered && rampVarianceExcessive ? { borderColor: 'var(--accent-warn)' } : {}}
              />
            </div>

            <div className="input-cell-spatial">
              <label>Taxi Fuel (lbs)</label>
              <input
                type="number"
                key={mission.taxiFuel}
                defaultValue={mission.taxiFuel}
                onBlur={(e) => updateMissionField('taxiFuel', e.target.value, 100, 2000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Alternate Fuel (lbs)</label>
              <input
                type="number"
                key={mission.alternateFuel}
                defaultValue={mission.alternateFuel}
                onBlur={(e) => updateMissionField('alternateFuel', e.target.value, 0, 10000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Final Reserve Fuel (lbs)</label>
              <input
                type="number"
                key={mission.finalReserveFuel}
                defaultValue={mission.finalReserveFuel}
                onBlur={(e) => updateMissionField('finalReserveFuel', e.target.value, 1000, 10000)}
                className="touch-input-field"
              />
            </div>

            <div className="input-cell-spatial">
              <label>Planned Fuel Burn (lbs)</label>
              <input
                type="number"
                key={mission.plannedFuelBurn}
                defaultValue={mission.plannedFuelBurn}
                onBlur={(e) => updateMissionField('plannedFuelBurn', e.target.value, 0, 25000)}
                className="touch-input-field"
              />
            </div>
          </div>

          <button
            onClick={handleAutoLoadLegalFuel}
            style={{ marginTop: '20px', padding: '10px 20px', background: 'rgba(0, 212, 255, 0.15)', border: '1px solid var(--accent-cyan)', borderRadius: '8px', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', width: '100%' }}
          >
            Auto-Load Legal Minimum Fuel
          </button>
        </div>

        {/* ── Right: Legality Breakdown ──────────────────────────────────────── */}
        <div className="results-section glass-panel highlight-accent">
          <h3>Fuel Legality Breakdown</h3>

          <div className="metrics-summary">
            <div className="metric-box">
              <span className="label">Takeoff Weight</span>
              <span className="value" style={{ color: weightViolations.some(v => v.field === 'tow' && v.severity === 'RED') ? 'var(--accent-crit)' : weightViolations.some(v => v.field === 'tow') ? 'var(--accent-warn)' : '#fff' }}>
                {takeoffWeight.toLocaleString()} lbs
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Landing Weight (est.)</span>
              <span className="value" style={{ color: weightViolations.some(v => v.field === 'landingWeight' && v.severity === 'RED') ? 'var(--accent-crit)' : weightViolations.some(v => v.field === 'landingWeight') ? 'var(--accent-warn)' : '#fff' }}>
                {landingWeight.toLocaleString()} lbs
              </span>
            </div>
            <div className="metric-box">
              <span className="label">Projected Landing Fuel</span>
              <span className={`value ${projectedLandingFuel < 0 ? 'text-danger' : ''}`}>
                {projectedLandingFuel.toLocaleString()} lbs
              </span>
            </div>
          </div>

          <div className="performance-table">
            <div className="table-row">
              <span>Planned Trip Fuel Burn</span>
              <span>{tripFuelCalc.toLocaleString()} lbs</span>
            </div>
            <div className="table-row">
              <span>Contingency Fuel (5%)</span>
              <span>{contingencyFuelCalc.toLocaleString()} lbs</span>
            </div>
            <div className="table-row">
              <span>Alternate Fuel ({alternateDistance > 0 ? `${alternateDistance} NM` : 'manual'})</span>
              <span>{(mission.alternateFuel || 0).toLocaleString()} lbs</span>
            </div>
            <div className="table-row">
              <span>Final Reserve Fuel (30 min)</span>
              <span>{(mission.finalReserveFuel || 0).toLocaleString()} lbs</span>
            </div>
            <div className="table-row" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '10px', marginTop: '10px' }}>
              <strong>Planned Block Fuel</strong>
              <strong style={{ color: 'var(--accent-cyan)' }}>{(mission.blockFuel || 0).toLocaleString()} lbs</strong>
            </div>
            {rampFuelEntered && (
              <div className="table-row">
                <strong>Actual Ramp Fuel Loaded</strong>
                <strong style={{ color: !rampSufficient ? 'var(--accent-crit)' : rampVarianceExcessive ? 'var(--accent-warn)' : 'var(--accent-green)' }}>
                  {rampFuelLoaded.toLocaleString()} lbs
                  <span style={{ fontSize: '11px', fontWeight: '400', marginLeft: '6px', color: 'rgba(255,255,255,0.5)' }}>
                    ({rampVariance >= 0 ? '+' : ''}{rampVariance.toLocaleString()})
                  </span>
                </strong>
              </div>
            )}
            <div className="table-row">
              <strong>Minimum Diversion Fuel (MDF)</strong>
              <strong style={{ color: 'var(--accent-warn)' }}>{minimumDiversionFuel.toLocaleString()} lbs</strong>
            </div>
            <div className="table-row" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '10px', marginTop: '10px' }}>
              <strong>Destination Margin above MDF</strong>
              <strong style={{ color: legalLandingMargin < 0 ? 'var(--accent-crit)' : 'var(--accent-green)' }}>
                {legalLandingMargin >= 0 ? `+${legalLandingMargin.toLocaleString()}` : legalLandingMargin.toLocaleString()} lbs
              </strong>
            </div>
          </div>

          {/* Calculated reserves reference */}
          <div className="alert-banner info" style={{ marginTop: '24px' }}>
            <span>
              <strong>Calculated Minimums (CARs 705):</strong> Alt {alternateFuelCalc.toLocaleString()} lbs
              {alternateDistance > 0 ? ` (${alternateDistance} NM × weight-adj.)` : ' (manual)'},{' '}
              Reserve {finalReserveFuelCalc.toLocaleString()} lbs, Required Block {requiredBlockFuel.toLocaleString()} lbs.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
