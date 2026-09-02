import React, { useState } from 'react';
import { Lock, User, AlertCircle, ArrowRight, Smartphone, Sun, Moon, Monitor, Server, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiLogin, getApiBaseUrl, setApiBaseUrl, apiGetUsers, mergeUsersToVault, setVaultUsers, unlockIOSAudio } from '../api';
import IphoneModal from './IphoneModal.jsx';

export default function LoginView({ onLoginSuccess, onEnterKiosk, theme, toggleTheme }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSecretConfig, setShowSecretConfig] = useState(false);
  const [logoClicks, setLogoClicks] = useState(0);
  const [showIphoneModal, setShowIphoneModal] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const isDark = theme === 'dark';

  const handleLogoClick = () => {
    const nextClicks = logoClicks + 1;
    setLogoClicks(nextClicks);
    if (nextClicks >= 5) {
      setShowSecretConfig(!showSecretConfig);
      setLogoClicks(0);
    }
  };

  const testServerConnection = async (urlToTest) => {
    setTestingConnection(true);
    setTestResult(null);
    let target = (urlToTest || serverUrl).trim();
    if (target.endsWith('/')) target = target.slice(0, -1);

    try {
      const res = await fetch(`${target}/api/audio/status`, { method: 'GET' });
      if (res.ok) {
        setTestResult({ success: true, message: '¡Conectado con éxito a la Nube!' });
        setApiBaseUrl(target);
      } else {
        setTestResult({ success: false, message: `Respuesta de servidor (${res.status})` });
      }
    } catch (err) {
      setTestResult({ success: false, message: 'No se pudo conectar con este servidor' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Por favor ingrese su usuario y contraseña');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const data = await apiLogin(identifier, password);
      localStorage.setItem('asistencia_token', data.token);
      localStorage.setItem('asistencia_user', JSON.stringify(data.user));

      // Sincronizar inmediatamente todos los usuarios creados en Render
      try {
        const cloudUsers = await apiGetUsers();
        if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
          mergeUsersToVault(cloudUsers);
        }
      } catch (uErr) {}

      // Solicitar silenciosamente audio y localizacion al iniciar sesion sin avisos visibles
      unlockIOSAudio();
      try {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 });
        }
      } catch (silentGeoErr) {}

      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión. Verifique sus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUrl = (e) => {
    e.preventDefault();
    setApiBaseUrl(serverUrl);
    testServerConnection(serverUrl);
  };

  return (
    <div className={'min-h-screen flex flex-col justify-center items-center safe-notch-container relative overflow-hidden transition-colors duration-300 ' + (isDark ? 'bg-black text-white' : 'bg-zinc-50 text-zinc-900')}>
      
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-500/15 rounded-full blur-3xl pointer-events-none"></div>

      {/* Botones de acción superior ajustados para notch */}
      <div className="w-full max-w-md flex items-center justify-end space-x-2 mb-3 px-1 z-20">
        <button
          onClick={onEnterKiosk}
          className="px-3 py-1.5 bg-orange-500 text-black hover:bg-orange-600 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-orange-500/20 active:scale-95"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Kiosco</span>
        </button>

        <button
          onClick={() => setShowIphoneModal(true)}
          className={'px-3 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ' + (
            isDark ? 'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25' : 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200'
          )}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>iPhone</span>
        </button>

        <button
          onClick={toggleTheme}
          title={isDark ? "Cambiar a Tema Blanco" : "Cambiar a Tema Oscuro"}
          className={'p-2 rounded-xl border transition-colors active:scale-95 ' + (isDark ? 'bg-zinc-900 border-zinc-800 text-orange-400 hover:bg-zinc-800' : 'bg-white border-orange-200 text-orange-600 hover:bg-orange-50')}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Tarjeta de Inicio de Sesión */}
      <div className={'max-w-md w-full border rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 backdrop-blur-xl transition-all ' + (isDark ? 'bg-zinc-950/95 border-zinc-800 text-white' : 'bg-white border-orange-300 text-zinc-900')}>
        
        <div className="text-center mb-5">
          <div 
            onClick={handleLogoClick}
            className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-2.5 rounded-full overflow-hidden border-2 border-orange-500 shadow-xl shadow-orange-500/30 p-1 bg-black cursor-pointer active:scale-95 transition-transform"
            title="Registro Asistentruck"
          >
            <img src="/logo.png" alt="AsistenTruck Logo" className="w-full h-full object-contain pointer-events-none" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            REGISTRO <span className="text-orange-500">ASISTENTRUCK</span>
          </h1>
          <p className="text-[10px] sm:text-[11px] text-orange-500 font-extrabold uppercase tracking-wider mt-0.5">
            INVERSIONES BOTAM SpA
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/15 border border-red-500/40 rounded-2xl p-3.5 flex items-start space-x-2.5 text-red-500 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-orange-500">
              Usuario:
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5 flex-shrink-0 pointer-events-none" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Usuario"
                className={'w-full border rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors font-semibold ' + (isDark ? 'bg-black border-zinc-800 text-white placeholder-zinc-500' : 'bg-white border-zinc-300 text-black placeholder-zinc-400 shadow-sm')}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-orange-500">
              Contraseña:
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5 flex-shrink-0 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className={'w-full border rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors font-semibold ' + (isDark ? 'bg-black border-zinc-800 text-white placeholder-zinc-500' : 'bg-white border-zinc-300 text-black placeholder-zinc-400 shadow-sm')}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-black py-3 px-4 rounded-2xl shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center space-x-2 text-sm disabled:opacity-50 mt-1 active:scale-98 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin flex-shrink-0"></div>
            ) : (
              <>
                <span>Ingresar al Sistema</span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
              </>
            )}
          </button>
        </form>

        {/* PANEL SECRETO DE CONFIGURACIÓN (ACCESO OCULTO: 5 TOQUES EN EL LOGO) */}
        {showSecretConfig && (
          <div className="mt-4 pt-3 border-t border-orange-500/30">
            <form onSubmit={handleSaveUrl} className={'p-3.5 border rounded-2xl text-left space-y-2.5 ' + (isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-orange-50/70 border-orange-200')}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-orange-500 uppercase flex items-center gap-1">
                  <Server className="w-3 h-3" />
                  URL Servidor Nube:
                </span>
                <button
                  type="button"
                  onClick={() => setShowSecretConfig(false)}
                  className="text-[10px] text-zinc-400 hover:text-orange-500 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>

              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://asistenciasistentruck.onrender.com"
                className={'w-full border rounded-xl px-3 py-2 text-xs font-mono font-bold ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black')}
              />

              {testResult && (
                <div className={'p-2 rounded-xl text-xs flex items-center gap-1.5 font-bold ' + (
                  testResult.success ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-red-500/15 text-red-500 border border-red-500/30'
                )}>
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => testServerConnection(serverUrl)}
                  disabled={testingConnection}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={'w-3 h-3 ' + (testingConnection ? 'animate-spin' : '')} />
                  <span>Probar</span>
                </button>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-black text-xs px-4 py-1.5 rounded-xl font-black cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <IphoneModal
        isOpen={showIphoneModal}
        onClose={() => setShowIphoneModal(false)}
        theme={theme}
      />
    </div>
  );
}
