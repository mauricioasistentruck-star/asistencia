import { io } from 'socket.io-client';

export const DEFAULT_CLOUD_API = 'https://asistenciasistentruck.onrender.com';

export const isNativeApp = () => {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
  if (window.location && window.location.protocol === 'capacitor:') return true;
  if (typeof navigator !== 'undefined' && navigator.userAgent && /android/i.test(navigator.userAgent) && window.location.port === '' && (window.location.hostname === 'localhost' || window.location.hostname === '')) return true;
  return false;
};

export const getApiBaseUrl = () => {
  const saved = localStorage.getItem('asistencia_api_url');
  if (saved && saved.trim() !== '') return saved.trim();

  // Si corre dentro del APK nativo de Android, apuntar a Render central en la nube
  if (isNativeApp()) {
    return DEFAULT_CLOUD_API;
  }

  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    // Si corre en navegador web de PC en desarrollo local
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      if (window.location.port === '5173' || window.location.port === '5174') {
        return `${window.location.protocol || 'http:'}//${hostname}:3001`;
      }
      return window.location.origin;
    }
    // Si está desplegado en Render / Nube
    return window.location.origin;
  }

  return DEFAULT_CLOUD_API;
};

export const setApiBaseUrl = (url) => {
  if (!url) {
    localStorage.removeItem('asistencia_api_url');
    return;
  }
  let cleanUrl = url.trim();
  if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
  localStorage.setItem('asistencia_api_url', cleanUrl);
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

export const getFullPhotoUrl = (photoPath) => {
  if (!photoPath) return null;
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) return photoPath;
  return getApiBaseUrl() + photoPath;
};

export async function apiRequest(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();
  const token = localStorage.getItem('asistencia_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(baseUrl + endpoint, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || ('Error ' + res.status + ': ' + res.statusText));
    }
    return data;
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(`No se pudo conectar con el servidor (${baseUrl}). Verifique su conexión a Internet o configure la URL del servidor.`);
    }
    throw err;
  }
}

let socketInstance = null;
export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(getApiBaseUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });
  }
  return socketInstance;
};

export const apiLogin = (identifier, password) => apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
export const apiGetMe = () => apiRequest('/api/auth/me');
export const apiGetUsers = () => apiRequest('/api/users');
export const apiCreateUser = (userData) => apiRequest('/api/users', { method: 'POST', body: JSON.stringify(userData) });
export const apiUpdateUser = (id, userData) => apiRequest('/api/users/' + id, { method: 'PUT', body: JSON.stringify(userData) });
export const apiDeleteUser = (id) => apiRequest('/api/users/' + id, { method: 'DELETE' });
export const apiToggleGps = (id, enabled) => apiRequest('/api/users/' + id + '/toggle-gps', { method: 'PATCH', body: JSON.stringify({ enabled }) });

export const apiUploadPhoto = async (id, file) => {
  const baseUrl = getApiBaseUrl();
  const token = localStorage.getItem('asistencia_token');
  const formData = new FormData();
  formData.append('photo', file);

  const res = await fetch(baseUrl + '/api/users/' + id + '/photo', {
    method: 'POST',
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al subir foto');
  return data;
};

export const apiScanQr = (qr_token) => apiRequest('/api/attendance/scan', { method: 'POST', body: JSON.stringify({ qr_token }) });
export const apiGetUserHistory = (userId, range = 'all') => apiRequest('/api/attendance/user/' + userId + '/history?range=' + range);
export const apiGetTodayAttendance = () => apiRequest('/api/attendance/today');
export const apiGetAttendanceRecords = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiRequest('/api/attendance/records?' + query);
};
export const apiAdminEditAttendance = (recordId, payload) => apiRequest('/api/attendance/' + recordId + '/admin-edit', { method: 'PUT', body: JSON.stringify(payload) });

export const getExportExcelUrl = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return getApiBaseUrl() + '/api/attendance/export-excel?' + query;
};

export const apiSendGpsPoint = (coords) => apiRequest('/api/gps/track', { method: 'POST', body: JSON.stringify(coords) });
export const apiGetLiveGps = () => apiRequest('/api/gps/live');
export const apiGetGpsRoute = (userId, date) => apiRequest('/api/gps/route/' + userId + '?date=' + (date || ''));

export const apiStartGpsRoute = (payload) => apiRequest('/api/gps/routes/start', { method: 'POST', body: JSON.stringify(payload) });
export const apiFinishGpsRoute = (payload) => apiRequest('/api/gps/routes/finish', { method: 'POST', body: JSON.stringify(payload) });
export const apiGetActiveGpsRoute = () => apiRequest('/api/gps/routes/active');
export const apiGetGpsRoutes = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiRequest('/api/gps/routes?' + query);
};
export const apiGetGpsRouteById = (id) => apiRequest('/api/gps/routes/' + id);
export const apiDeleteGpsRoute = (id) => apiRequest('/api/gps/routes/' + id, { method: 'DELETE' });

export const apiGetAudioStatus = () => apiRequest('/api/audio/status');
export const apiGetVoiceMessages = () => apiRequest('/api/audio/messages');
export const apiDeleteVoiceMessage = (id) => apiRequest('/api/audio/messages/' + id, { method: 'DELETE' });

export async function apiVerifyAdminPassword(password) {
  const res = await fetch(`${getApiBaseUrl()}/api/auth/verify-admin-pass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Contraseña incorrecta');
  return data;
}
