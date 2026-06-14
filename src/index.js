import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { DatabaseProvider } from './context/DatabaseContext.js';
import { MissionProvider } from './context/MissionContext.js';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <DatabaseProvider>
      <MissionProvider>
        <App />
      </MissionProvider>
    </DatabaseProvider>
  </React.StrictMode>
);
