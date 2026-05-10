import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './providers/AppProviders.tsx'
import { App } from './App.tsx'
import './styles/globals.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return <div style={{ padding: 40, color: 'red', fontFamily: 'monospace' }}>
        <h1>Runtime Error</h1>
        <pre>{this.state.error.message}</pre>
        <pre>{this.state.error.stack}</pre>
      </div>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
)
