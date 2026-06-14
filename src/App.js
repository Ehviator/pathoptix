import React, { useState, useEffect } from 'react';
import CalculatorGround from './components/CalculatorGround';
import CalculatorClimb from './components/CalculatorClimb';
import CalculatorCruise from './components/CalculatorCruise';
import CalculatorDescent from './components/CalculatorDescent';
import CalculatorHolding from './components/CalculatorHolding';
import EmergencySuite from './components/EmergencySuite';
import FlightMap from './components/FlightMap';

export default function App() {
  const [activeTab, setActiveTab] = useState('cruise');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Track live network state modifications automatically
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      case 'map':
        return <FlightMap />;
      case 'emergency':
        return <EmergencySuite />;
      default:
        return <CalculatorCruise />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        {/* Left slot placeholder to anchor the centered branding */}
        <div className="header-left-spacer"></div>

        {/* Centered Brand Assets */}
        <div className="brand centered-load">
          <div className="brand-logo"></div>
          <div className="brand-text">
            <h1>PathOptix</h1>
            <span className="subtitle">E195-E2 Performance & Vertical Profile Optimizer</span>
          </div>
        </div>

        {/* Dynamic Network Status Container */}
        <div className={`system-status status-container-box ${isOnline ? 'net-online' : 'net-offline'}`}>
          <span className={`status-indicator ${isOnline ? 'online-glow' : 'offline-glow'}`}></span>
          <span className="status-text">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </header>

      <main className="app-content">
        {/* Navigation Tabs relocated to main body context bar */}
        <nav className="nav-tabs body-nav-tier">
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
            className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            <span className="icon">🗺️</span> Flight Map
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'emergency' ? 'active' : ''}`}
            onClick={() => setActiveTab('emergency')}
          >
            <span className="icon">⚠️</span> Emergency Suite
          </button>
        </nav>

        {/* Active Performance Workspace Panel */}
        <div className="workspace-view-wrapper">
          {renderActiveComponent()}
        </div>
      </main>

      <footer className="app-footer">
        <p>Tactical EFB Flight Deck Tool • Embraer E195-E2 PW1900G • Version 1.0.0</p>
      </footer>
    </div>
  );
}
