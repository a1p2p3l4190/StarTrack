import { Component } from 'react'

// Wraps a section (a chart, a data table) so a rendering exception there
// — malformed API data, a bad Recharts prop — doesn't white-screen the
// whole admin panel. `resetKey` lets the wrapper retry once new data
// arrives instead of staying tripped forever (error boundaries don't
// auto-recover on their own).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'An unknown error occurred' }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Admin panel section failed to render:', error, errorInfo)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' })
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' })
    if (this.props.onRetry) {
      this.props.onRetry()
    }
  }

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development'
      return (
        this.props.fallback || (
          <div style={{
            background: 'linear-gradient(135deg, #3d2c2c 0%, #2c2c2c 100%)',
            border: '1px solid #8B4545',
            borderRadius: '10px',
            padding: '20px',
            marginBottom: '16px',
            color: '#fff'
          }} role="alert">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#D2A14C', fontSize: '14px', fontWeight: '600' }}>
                  Failed to Load Section
                </h3>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#e8e8e8', lineHeight: '1.5' }}>
                  This dashboard section encountered an error and could not be displayed. The rest of the admin panel is unaffected.
                </p>
                {isDevelopment && this.state.errorMessage && (
                  <pre style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: '10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    overflow: 'auto',
                    maxHeight: '100px',
                    margin: '0 0 12px 0',
                    color: '#b8b8b8'
                  }}>
                    {this.state.errorMessage}
                  </pre>
                )}
                <button
                  onClick={this.handleRetry}
                  style={{
                    background: '#D2A14C',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '12px'
                  }}
                >
                  Retry Loading
                </button>
              </div>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
