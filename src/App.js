import React, { useState, useEffect } from 'react';
import CreateFlight from './components/CreateFlight';
import ReviewRoute from './components/ReviewRoute';
import ReviewFuel from './components/ReviewFuel';
import ReviewPerformance from './components/ReviewPerformance';
import ReviewOptimization from './components/ReviewOptimization';
import ReviewWeather from './components/ReviewWeather';
import ReviewOei from './components/ReviewOei';
import BriefFlight from './components/BriefFlight';
import ErrorBoundary from './components/ErrorBoundary';
import { useMission } from './context/MissionContext.js';
import 'leaflet/dist/leaflet.css';


export default function App() {
  const [activeTab, setActiveTab] = useState('create-flight');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { mission, weather } = useMission();

  const flightActive = !!(mission.departure && mission.arrival && mission.weight >= 50000);
  const worstCat = [weather.departure, weather.arrival, weather.alternate]
    .filter(w => w?.status === 'OK')
    .reduce((worst, w) => {
      const rank = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 };
      return rank[w.flightCategory] > rank[worst] ? w.flightCategory : worst;
    }, 'VFR');
  const weatherBadgeColor = worstCat === 'LIFR' ? '#ff00ff'
    : worstCat === 'IFR'  ? 'var(--accent-crit)'
    : worstCat === 'MVFR' ? 'var(--accent-cyan)'
    : null;

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
      case 'create-flight':
        return (
          <ErrorBoundary name="Create Flight">
            <CreateFlight />
          </ErrorBoundary>
        );
      case 'review-route':
        return (
          <ErrorBoundary name="Review Route">
            <ReviewRoute />
          </ErrorBoundary>
        );
      case 'review-fuel':
        return (
          <ErrorBoundary name="Review Fuel">
            <ReviewFuel />
          </ErrorBoundary>
        );
      case 'review-performance':
        return (
          <ErrorBoundary name="Review Performance">
            <ReviewPerformance />
          </ErrorBoundary>
        );
      case 'review-optimization':
        return (
          <ErrorBoundary name="Fuel Optimization">
            <ReviewOptimization />
          </ErrorBoundary>
        );
      case 'review-weather':
        return (
          <ErrorBoundary name="Review Weather">
            <ReviewWeather />
          </ErrorBoundary>
        );
      case 'review-oei':
        return (
          <ErrorBoundary name="Review OEI">
            <ReviewOei />
          </ErrorBoundary>
        );
      case 'brief-flight':
        return (
          <ErrorBoundary name="Brief Flight">
            <BriefFlight />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary name="Create Flight">
            <CreateFlight />
          </ErrorBoundary>
        );
    }
  };

  return (
    <div className="efb-layout">
      {/* Collapsible Left-Hand Sidebar */}
      <aside className={`efb-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div>
          <div className="sidebar-header">
            <div className="sidebar-logo"></div>
            {!sidebarCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="sidebar-brand-text">PathOptix</span>
                {flightActive && (
                  <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--accent-cyan)', letterSpacing: '0.5px', fontFamily: 'var(--font-mono)' }}>
                    {mission.departure} → {mission.arrival}
                  </span>
                )}
              </div>
            )}
          </div>

          <nav className="sidebar-nav">
            {!sidebarCollapsed && <div className="sidebar-section-title">Optimization Engine</div>}
            <button 
              className={`sidebar-btn ${activeTab === 'create-flight' ? 'active' : ''}`}
              onClick={() => setActiveTab('create-flight')}
              title="Create Flight"
            >
              <span>📋</span> {!sidebarCollapsed && "Create Flight"}
            </button>
            <button 
              className={`sidebar-btn ${activeTab === 'review-fuel' ? 'active' : ''}`}
              onClick={() => setActiveTab('review-fuel')}
              title="Review Fuel"
            >
              <span>⛽</span> {!sidebarCollapsed && "Review Fuel"}
            </button>
            <button 
              className={`sidebar-btn ${activeTab === 'review-performance' ? 'active' : ''}`}
              onClick={() => setActiveTab('review-performance')}
              title="Review Performance"
            >
              <span>⚡</span> {!sidebarCollapsed && "Review Performance"}
            </button>
            <button 
              className={`sidebar-btn ${activeTab === 'review-optimization' ? 'active' : ''}`}
              onClick={() => setActiveTab('review-optimization')}
              title="Optimize Fuel"
            >
              <span>📊</span> {!sidebarCollapsed && "Optimize Fuel"}
            </button>

            <div className="sidebar-divider"></div>
            {!sidebarCollapsed && <div className="sidebar-section-title">Flight Utilities</div>}

            <button 
              className={`sidebar-btn ${activeTab === 'review-route' ? 'active' : ''}`}
              onClick={() => setActiveTab('review-route')}
              title="Review Route"
            >
              <span>🗺️</span> {!sidebarCollapsed && "Review Route"}
            </button>
            <button
              className={`sidebar-btn ${activeTab === 'review-weather' ? 'active' : ''}`}
              onClick={() => setActiveTab('review-weather')}
              title="Review Weather"
              style={{ position: 'relative' }}
            >
              <span>🌦️</span>
              {!sidebarCollapsed && "Review Weather"}
              {weatherBadgeColor && (
                <span style={{
                  position: 'absolute', top: '8px', right: '10px',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: weatherBadgeColor,
                  boxShadow: `0 0 6px ${weatherBadgeColor}`,
                }} />
              )}
            </button>
            <button 
              className={`sidebar-btn ${activeTab === 'review-oei' ? 'active' : ''}`}
              onClick={() => setActiveTab('review-oei')}
              title="Review OEI"
            >
              <span>⚠️</span> {!sidebarCollapsed && "Review OEI"}
            </button>
            <button 
              className={`sidebar-btn ${activeTab === 'brief-flight' ? 'active' : ''}`}
              onClick={() => setActiveTab('brief-flight')}
              title="Brief Flight"
            >
              <span>🏁</span> {!sidebarCollapsed && "Brief Flight"}
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button 
            className="sidebar-toggle-btn" 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? "▶" : "◀"}
          </button>
        </div>
      </aside>

      {/* Main EFB content canvas */}
      <div className="efb-content-canvas">
        <div className="app-container">
          <header className="app-header">
            <div className="header-left-spacer"></div>

            <div className="brand centered-load">
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
            <div className="workspace-view-wrapper">
              {renderActiveComponent()}
            </div>
          </main>

          <footer className="app-footer">
            <p>Tactical EFB Flight Deck Tool • Embraer E195-E2 PW1900G • Version 1.3.0</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
