import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AppProvider } from './contexts/AppContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import { ConfirmProvider } from './components/ConfirmProvider.jsx'

// Root-level error boundary — catches crashes in providers themselves
class RootErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui', padding: '2rem' }}>
          <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
            <p style={{ color: '#666', marginBottom: '1rem' }}>The application encountered an unexpected error.</p>
            <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1.5rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <ToastProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </ToastProvider>
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>
)
