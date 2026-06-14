import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary [${this.props.name || 'Component'}] caught error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel-container">
          <div className="glass-panel" style={{ padding: '24px', border: '1px solid var(--accent-crit)', background: 'rgba(255, 74, 74, 0.05)', borderRadius: '12px' }}>
            <h2 style={{ color: 'var(--accent-crit)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', margin: 0 }}>
              <span>⚠️</span> {this.props.name || 'Component'} Error
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '10px', fontSize: '14px' }}>
              An unexpected error occurred while rendering this module.
            </p>
            <pre style={{ 
              background: 'rgba(0, 0, 0, 0.3)', 
              padding: '12px', 
              borderRadius: '6px', 
              color: '#fff', 
              fontFamily: 'monospace', 
              fontSize: '12px',
              overflowX: 'auto',
              marginTop: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {this.state.error ? this.state.error.toString() : 'Unknown Error'}
            </pre>
            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: '16px',
                background: 'rgba(0, 168, 150, 0.2)',
                border: '1px solid var(--accent-cyan)',
                color: '#fff',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'var(--transition-smooth)'
              }}
            >
              Attempt Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
