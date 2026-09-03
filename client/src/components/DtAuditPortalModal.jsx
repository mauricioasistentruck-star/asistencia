import React, { useState } from 'react';
import { X, Shield, KeyRound, Copy, Check, ArrowLeft, AlertCircle, Building2, User, Mail, Clock } from 'lucide-react';
import DtLogo from './DtLogo';
import { apiDtRequestToken, apiDtLogin } from '../api';

export default function DtAuditPortalModal({ isOpen, onClose, onLoginSuccess }) {
  const [currentView, setCurrentView] = useState('main'); // 'main' | 'request_key' | 'login'
  const [inspectorName, setInspectorName] = useState('');
  const [inspectorEmail, setInspectorEmail] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [generatedToken, setGeneratedToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleRequestKey = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!inspectorName.trim()) {
      setErrorMsg('Debe ingresar su nombre completo de fiscalizador.');
      return;
    }

    const cleanEmail = inspectorEmail.trim().toLowerCase();
    if (!cleanEmail.endsWith('@dt.gob.cl')) {
      setErrorMsg('ACCESO DENEGADO: El correo debe terminar obligatoriamente en @dt.gob.cl');
      return;
    }

    setLoading(true);
    try {
      const res = await apiDtRequestToken(inspectorName.trim(), cleanEmail);
      if (res && res.success) {
        setGeneratedToken(res);
      } else {
        setErrorMsg(res.error || 'No se pudo generar la clave de fiscalización');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (!generatedToken?.token) return;
    navigator.clipboard.writeText(generatedToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = inspectorEmail.trim().toLowerCase();
    if (!cleanEmail.endsWith('@dt.gob.cl')) {
      setErrorMsg('El correo debe terminar obligatoriamente en @dt.gob.cl');
      return;
    }
    if (!loginToken.trim()) {
      setErrorMsg('Ingrese la clave de fiscalización de 5 días.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiDtLogin(cleanEmail, loginToken.trim().toUpperCase());
      if (res && res.success) {
        localStorage.setItem('dt_auth_token', res.jwt_token);
        localStorage.setItem('asistencia_token', res.jwt_token);
        localStorage.setItem('dt_session_data', JSON.stringify(res));
        if (onLoginSuccess) {
          onLoginSuccess(res);
        }
        onClose();
      } else {
        setErrorMsg(res.error || 'Credenciales de fiscalización incorrectas');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al validar credenciales');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden transition-all text-slate-900 dark:text-white">
        
        {/* Barra superior de cierre */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          {currentView !== 'main' ? (
            <button
              onClick={() => {
                setCurrentView('main');
                setErrorMsg('');
                setGeneratedToken(null);
              }}
              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-black tracking-wider text-slate-400 dark:text-zinc-500 uppercase">
                Portal Legal DT
              </span>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Encabezado con Logo Oficial DT */}
        <div className="text-center px-6 pb-4">
          <div className="w-20 h-20 mx-auto mb-2">
            <DtLogo className="w-20 h-20" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-zinc-100 tracking-tight">
            Portal Fiscalización DT
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-semibold mt-0.5">
            Dirección del Trabajo • Inversiones Botam SpA
          </p>
        </div>

        {/* Mensaje de Error Global */}
        {errorMsg && (
          <div className="mx-6 mb-4 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-red-700 dark:text-red-300 text-xs font-bold">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* VISTA 1: PRINCIPAL (2 TARJETAS COMO EN LA IMAGEN 1) */}
        {currentView === 'main' && (
          <div className="p-6 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Tarjeta 1: Ingresar a fiscalizar */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40 flex flex-col items-center justify-between text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
                <Shield className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mb-4">
                Ingresar a fiscalizar
              </h3>
              <button
                onClick={() => {
                  setCurrentView('login');
                  setErrorMsg('');
                }}
                className="w-full py-2 px-6 rounded-xl border border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-xs font-black transition-all shadow-sm cursor-pointer"
              >
                Entrar
              </button>
            </div>

            {/* Tarjeta 2: Solicitar clave */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40 flex flex-col items-center justify-between text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
                <KeyRound className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mb-4">
                Solicitar clave
              </h3>
              <button
                onClick={() => {
                  setCurrentView('request_key');
                  setErrorMsg('');
                  setGeneratedToken(null);
                }}
                className="w-full py-2 px-6 rounded-xl border border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-xs font-black transition-all shadow-sm cursor-pointer"
              >
                Entrar
              </button>
            </div>

          </div>
        )}

        {/* VISTA 2: SOLICITAR CLAVE */}
        {currentView === 'request_key' && (
          <div className="p-6 pt-1">
            {!generatedToken ? (
              <form onSubmit={handleRequestKey} className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-semibold leading-relaxed">
                  <strong>Requisito Legal:</strong> La clave de acceso temporal se otorga exclusivamente a funcionarios de la Dirección del Trabajo mediante su correo institucional <strong>@dt.gob.cl</strong>. Su validez es de <strong>5 días de corrido</strong>.
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Nombre Completo del Fiscalizador:
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ej: Claudio Valenzuela Muñoz"
                      value={inspectorName}
                      onChange={(e) => setInspectorName(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Correo Institucional (@dt.gob.cl):
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="nombre.apellido@dt.gob.cl"
                      value={inspectorEmail}
                      onChange={(e) => setInspectorEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">
                    * No se admiten correos particulares (Gmail, Hotmail, etc.).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Generando clave oficial...' : 'Generar Clave de Fiscalización (5 Días)'}
                </button>
              </form>
            ) : (
              <div className="text-center space-y-4 py-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-black">
                  <Check className="w-3.5 h-3.5" />
                  <span>Clave Generada Exitosamente</span>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Su Clave de Acceso Fiscalizador
                  </div>
                  <div className="text-3xl font-black font-mono tracking-widest text-indigo-600 dark:text-indigo-400 my-2 select-all">
                    {generatedToken.token}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Vigencia: <strong>5 días corridos</strong> (hasta {new Date(generatedToken.expires_at).toLocaleDateString('es-CL')})</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={handleCopyKey}
                    className="flex-1 py-2.5 px-4 rounded-xl border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? '¡Clave Copiada!' : 'Copiar Clave'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setLoginToken(generatedToken.token);
                      setCurrentView('login');
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-md cursor-pointer"
                  >
                    Ir a Ingresar a Fiscalizar →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VISTA 3: INGRESAR A FISCALIZAR */}
        {currentView === 'login' && (
          <div className="p-6 pt-1">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold leading-relaxed">
                <strong>Aviso Legal:</strong> Al autenticarse, se registrará el inicio de la fiscalización laboral y se emitirá una notificación automática formal a los administradores de la empresa conforme al D.F.L. N°2 de 1967.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Correo Institucional (@dt.gob.cl):
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="nombre.apellido@dt.gob.cl"
                    value={inspectorEmail}
                    onChange={(e) => setInspectorEmail(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Clave de Fiscalización (Vigente por 5 Días):
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: DT-A371-FFEA"
                    value={loginToken}
                    onChange={(e) => setLoginToken(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono font-bold tracking-wider text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Verificando con Dirección del Trabajo...' : 'Iniciar Fiscalización Oficial'}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}