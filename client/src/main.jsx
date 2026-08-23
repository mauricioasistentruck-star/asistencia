import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center text-3xl font-black mb-4">
            ⚠️
          </div>
          <h1 className="text-xl font-black text-white mb-2">Ocurrió un problema al cargar</h1>
          <p className="text-xs text-zinc-400 max-w-sm mb-6">
            {this.state.error?.message || 'Error inesperado de ejecución.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                localStorage.removeItem('asistencia_token');
                window.location.reload();
              }}
              className="bg-orange-500 hover:bg-orange-600 text-black font-black text-xs px-5 py-2.5 rounded-2xl cursor-pointer"
            >
              Reiniciar Sesión
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs px-5 py-2.5 rounded-2xl cursor-pointer"
            >
              Recargar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
