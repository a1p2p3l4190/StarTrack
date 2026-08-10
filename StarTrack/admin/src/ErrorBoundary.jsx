import { Component } from 'react'

// Wraps a section (a chart, a data table) so a rendering exception there
// — malformed API data, a bad Recharts prop — doesn't white-screen the
// whole admin panel. `resetKey` lets the wrapper retry once new data
// arrives instead of staying tripped forever (error boundaries don't
// auto-recover on their own).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Admin panel section failed to render:', error, errorInfo)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <p className="field-error" role="alert">
            ⚠️ This section failed to load, but the rest of the admin panel is unaffected.
          </p>
        )
      )
    }
    return this.props.children
  }
}
