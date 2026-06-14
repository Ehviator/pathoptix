import React, { useState, useEffect } from 'react';
import CalculatorClimb from './components/CalculatorClimb';
import CalculatorCruise from './components/CalculatorCruise';
import CalculatorDescent from './components/CalculatorDescent';
import FlightMap from './components/FlightMap';

export default function App() {
  const [activeTab, setActiveTab] = useState('cruise');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
      case 'climb':
        return <CalculatorClimb />;
      case 'cruise':
        return <CalculatorCruise />;
      case 'descent':
        return <CalculatorDescent />;
      case 'map':
        return <FlightMap />;
      default:
        return <CalculatorCruise />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left-spacer"></div>

        <div className="brand centered-load">
          <div className="brand-logo"></div>
          <div className="brand-text">
            <h1>PathOptix</h1>
            <span className="subtitle">E195-E2 Performance & Vertical Profile Optimizer</span>
          </div>
        </div>

        <div className={`system-status status-container-box ${isOnline ? 'net-online' : 'net-offline'}`}>
          <span className={`status-indicator ${isOnline ? 'online-glow' : 'offline-glow'}`}></span>
          <span className="status-text">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </header>

      <main className="app-content">
        <nav className="nav-tabs body-nav-tier">
          <button 
            className={`nav-tab-btn ${activeTab === 'climb' ? 'active' : ''}`}
            onClick={() => setActiveTab('climb')}
          >
            🛫 Climb
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'cruise' ? 'active' : ''}`}
            onClick={() => setActiveTab('cruise')}
          >
            🚀 Cruise Econ
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'descent' ? 'active' : ''}`}
            onClick={() => setActiveTab('descent')}
          >
            📉 Descent FPA
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            🗺️ Flight Map & Navlog
          </button>
        </nav>

        <div className="workspace-view-wrapper">
          {renderActiveComponent()}
        </div>
      </main>

      <footer className="app-footer">
        <p>Tactical EFB Flight Deck Tool • Embraer E195-E2 PW1900G • Version 1.1.0</p>
      </footer>
    </div>
  );
}
