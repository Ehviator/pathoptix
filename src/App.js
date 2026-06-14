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
import 'leaflet/dist/leaflet.css';


export default function App() {
  const [activeTab, setActiveTab] = useState('create-flight');
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
            className={`nav-tab-btn ${activeTab === 'create-flight' ? 'active' : ''}`}
            onClick={() => setActiveTab('create-flight')}
          >
            📋 Create Flight
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'review-route' ? 'active' : ''}`}
            onClick={() => setActiveTab('review-route')}
          >
            🗺️ Review Route
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'review-fuel' ? 'active' : ''}`}
            onClick={() => setActiveTab('review-fuel')}
          >
            ⛽ Review Fuel
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'review-performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('review-performance')}
          >
            ⚡ Review Performance
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'review-optimization' ? 'active' : ''}`}
            onClick={() => setActiveTab('review-optimization')}
          >
            📊 Optimize Fuel
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'review-weather' ? 'active' : ''}`}
            onClick={() => setActiveTab('review-weather')}
          >
            🌦️ Review Weather
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'review-oei' ? 'active' : ''}`}
            onClick={() => setActiveTab('review-oei')}
          >
            ⚠️ Review OEI
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'brief-flight' ? 'active' : ''}`}
            onClick={() => setActiveTab('brief-flight')}
          >
            🏁 Brief Flight
          </button>
        </nav>

        <div className="workspace-view-wrapper">
          {renderActiveComponent()}
        </div>
      </main>

      <footer className="app-footer">
        <p>Tactical EFB Flight Deck Tool • Embraer E195-E2 PW1900G • Version 1.3.0</p>
      </footer>
    </div>
  );
}
