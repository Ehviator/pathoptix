import React, { useState } from 'react';
import CalculatorGround from './components/CalculatorGround';
import CalculatorClimb from './components/CalculatorClimb';
import CalculatorCruise from './components/CalculatorCruise';
import CalculatorDescent from './components/CalculatorDescent';
import CalculatorHolding from './components/CalculatorHolding';
import EmergencySuite from './components/EmergencySuite';

export default function App() {
  const [activeTab, setActiveTab] = useState('cruise'); // default tab

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'ground':
        return <CalculatorGround />;
      case 'climb':
        return <CalculatorClimb />;
      case 'cruise':
        return <CalculatorCruise />;
      case 'descent':
        return <CalculatorDescent />;
      case 'holding':
        return <CalculatorHolding />;
      case 'emergency':
        return <EmergencySuite />;
      default:
        return <CalculatorCruise />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo"></div>
          <div className="brand-text">
            <h1>PathOptix</h1>
            <span className="subtitle">E195-E2 Performance & Vertical Profile Optimizer</span>
          </div>
        </div>
        <nav className="nav-tabs">
          <button 
            className={`nav-tab-btn ${activeTab === 'ground' ? 'active' : ''}`}
            onClick={() => setActiveTab('ground')}
          >
            <span className="icon">🚖</span> Ground Taxi
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'climb' ? 'active' : ''}`}
            onClick={() => setActiveTab('climb')}
          >
            <span className="icon">🛫</span> Climb
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'cruise' ? 'active' : ''}`}
            onClick={() => setActiveTab('cruise')}
          >
            <span className="icon">🚀</span> Cruise Econ
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'descent' ? 'active' : ''}`}
            onClick={() => setActiveTab('descent')}
          >
            <span className="icon">📉</span> Descent FPA
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'holding' ? 'active' : ''}`}
            onClick={() => setActiveTab('holding')}
          >
            <span className="icon">🔄</span> Terminal Holding
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'emergency' ? 'active' : ''}`}
            onClick={() => setActiveTab('emergency')}
          >
            <span className="icon">⚠️</span> Emergency Suite
          </button>
        </nav>
        <div className="system-status">
          <span className="status-indicator online"></span>
          <span className="status-text">OFFLINE ENGINE READY</span>
        </div>
      </header>

      <main className="app-content">
        {renderActiveComponent()}
      </main>

      <footer className="app-footer">
        <p>Tactical EFB Flight Deck Tool • Embraer E195-E2 PW1900G • Version 1.0.0</p>
      </footer>
    </div>
  );
}
