import React, { useState } from 'react';
import CalculatorClimb from './CalculatorClimb.js';
import CalculatorCruise from './CalculatorCruise.js';
import CalculatorDescent from './CalculatorDescent.js';
import ErrorBoundary from './ErrorBoundary.js';

export default function ReviewPerformance() {
  const [perfTab, setPerfTab] = useState('climb');

  const renderPerfComponent = () => {
    switch (perfTab) {
      case 'climb':
        return (
          <ErrorBoundary name="Climb Profile Calculator">
            <CalculatorClimb />
          </ErrorBoundary>
        );
      case 'cruise':
        return (
          <ErrorBoundary name="Cruise Speed Calculator">
            <CalculatorCruise />
          </ErrorBoundary>
        );
      case 'descent':
        return (
          <ErrorBoundary name="Descent Profile Calculator">
            <CalculatorDescent />
          </ErrorBoundary>
        );
      default:
        return <CalculatorClimb />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <nav className="nav-tabs body-nav-tier" style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <button 
          className={`nav-tab-btn ${perfTab === 'climb' ? 'active' : ''}`}
          onClick={() => setPerfTab('climb')}
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          🛫 Climb Profile
        </button>
        <button 
          className={`nav-tab-btn ${perfTab === 'cruise' ? 'active' : ''}`}
          onClick={() => setPerfTab('cruise')}
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          🚀 Cruise Econ
        </button>
        <button 
          className={`nav-tab-btn ${perfTab === 'descent' ? 'active' : ''}`}
          onClick={() => setPerfTab('descent')}
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          📉 Descent FPA
        </button>
      </nav>

      <div className="workspace-view-wrapper">
        {renderPerfComponent()}
      </div>
    </div>
  );
}
