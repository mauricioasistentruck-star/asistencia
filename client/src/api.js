import { io } from 'socket.io-client';

export const DEFAULT_CLOUD_API = 'https://asistenciasistentruck.onrender.com';

export const isGpsActive = (val) => val === 1 || val === true || val === '1' || val === 'true';

export const getChileTodayString = (d = new Date()) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch (e) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

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

export const apiChangeMyPassword = (newPassword) => apiRequest('/api/auth/change-my-password', {
  method: 'POST',
  body: JSON.stringify({ newPassword })
});

export const apiExportBackup = async () => {
  const token = getToken();
  const res = await fetch(`${getApiBaseUrl()}/api/admin/backup/export`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error al exportar la base de datos');
  }
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_asistentruck_${getChileTodayString()}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return data;
};

export const apiImportBackup = (backupJson) => apiRequest('/api/admin/backup/import', {
  method: 'POST',
  body: JSON.stringify(backupJson)
});

export const apiSyncVault = (vaultData) => apiRequest('/api/sync/vault', {
  method: 'POST',
  body: JSON.stringify(vaultData)
});

// =========================================================================
// SISTEMA DE BÓVEDA MAESTRA PERSISTENTE (MASTER VAULT)
// Protege todos los trabajadores, fotos, contraseñas y marcaciones contra reinicios de Render
// =========================================================================

export const isUserValid = (u) => {
  if (!u || typeof u !== 'object') return false;
  const name = typeof u.name === 'string' ? u.name.trim() : '';
  const username = typeof u.username === 'string' ? u.username.trim() : '';
  return name.length > 0 || username.length > 0;
};

export const getMasterVault = () => {
  try {
    const raw = localStorage.getItem('asistencia_master_vault');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const rawUsers = Array.isArray(parsed.users) ? parsed.users : [];
        return {
          users: rawUsers.filter(isUserValid),
          attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
          voice_messages: Array.isArray(parsed.voice_messages) ? parsed.voice_messages : []
        };
      }
    }
  } catch (e) {}

  // Fallback migración desde cachés anteriores
  let users = [];
  try {
    const uCache = localStorage.getItem('asistencia_users_cache');
    if (uCache) {
      const parsed = JSON.parse(uCache);
      if (Array.isArray(parsed)) users = parsed.filter(isUserValid);
    }
  } catch (e) {}

  let voice_messages = [];
  try {
    const vCache = localStorage.getItem('asistencia_voice_messages_cache');
    if (vCache) voice_messages = JSON.parse(vCache) || [];
  } catch (e) {}

  return { users, attendance: [], voice_messages };
};

export const saveMasterVault = (vault) => {
  try {
    const rawUsers = Array.isArray(vault?.users) ? vault.users : [];
    const safeVault = {
      users: rawUsers.filter(isUserValid),
      attendance: Array.isArray(vault?.attendance) ? vault.attendance.slice(0, 500) : [],
      voice_messages: Array.isArray(vault?.voice_messages) ? vault.voice_messages.slice(0, 300) : []
    };
    localStorage.setItem('asistencia_master_vault', JSON.stringify(safeVault));
    if (safeVault.users.length > 0) {
      localStorage.setItem('asistencia_users_cache', JSON.stringify(safeVault.users));
    }
  } catch (e) {
    console.warn('Error guardando master vault:', e);
  }
};

export const mergeUsersToVault = (incomingUsers) => {
  if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) return getMasterVault().users;
  const vault = getMasterVault();
  const currentMap = new Map();
  vault.users.filter(isUserValid).forEach(u => currentMap.set(String(u.id || u.rut || u.username), u));

  incomingUsers.filter(isUserValid).forEach(u => {
    const key = String(u.id || u.rut || u.username);
    if (currentMap.has(key)) {
      currentMap.set(key, { ...currentMap.get(key), ...u });
    } else {
      currentMap.set(key, u);
    }
  });

  vault.users = Array.from(currentMap.values()).filter(isUserValid);
  saveMasterVault(vault);
  return vault.users;
};

export const removeUserFromVault = (userId) => {
  const vault = getMasterVault();
  const idStr = String(userId);
  vault.users = vault.users.filter(u => {
    if (!isUserValid(u)) return false;
    if (String(u.id) === idStr) return false;
    if (String(u.username) === idStr) return false;
    return true;
  });
  saveMasterVault(vault);
  return vault.users;
};

export const mergeAttendanceToVault = (incomingRecords) => {
  if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) return getMasterVault().attendance;
  const vault = getMasterVault();
  const map = new Map();
  vault.attendance.forEach(a => map.set(`${a.user_id}_${a.date}`, a));

  incomingRecords.forEach(a => {
    const key = `${a.user_id}_${a.date}`;
    if (map.has(key)) {
      map.set(key, { ...map.get(key), ...a });
    } else {
      map.set(key, a);
    }
  });

  vault.attendance = Array.from(map.values()).slice(0, 500);
  saveMasterVault(vault);
  return vault.attendance;
};

// Sincronización Automática con el Servidor (Auto-Restauración de Render)
let isSyncingVault = false;
export const autoRestoreAndSyncWithServer = async () => {
  if (isSyncingVault) return getMasterVault().users;
  isSyncingVault = true;

  try {
    const vault = getMasterVault();
    const serverUsers = await apiGetUsers().catch(() => null);

    // Caso 1: El servidor en Render reinició de cero y solo tiene a Mauricio (o 0 usuarios),
    // pero la Bóveda Maestra local tiene a los trabajadores registrados.
    if (Array.isArray(serverUsers) && serverUsers.length <= 1 && vault.users.length > 1) {
      console.log('Detectado reinicio en Render. Auto-restaurando Bóveda Maestra al servidor...');
      try {
        await apiSyncVault(vault);
        const refreshedUsers = await apiGetUsers().catch(() => null);
        if (Array.isArray(refreshedUsers) && refreshedUsers.length > 0) {
          isSyncingVault = false;
          return mergeUsersToVault(refreshedUsers);
        }
      } catch (syncErr) {
        console.warn('Fallo auto-sync vault:', syncErr);
      }
    }

    // Caso 2: El servidor respondió normalmente con la lista de usuarios
    if (Array.isArray(serverUsers) && serverUsers.length > 0) {
      const merged = mergeUsersToVault(serverUsers);
      isSyncingVault = false;
      return merged;
    }

    // Caso 3: Sin conexión o error, retornar bóveda local
    isSyncingVault = false;
    return vault.users;
  } catch (err) {
    console.warn('Error en autoRestoreAndSyncWithServer:', err);
    isSyncingVault = false;
    return getMasterVault().users;
  }
};
