import { io } from 'socket.io-client';

export const DEFAULT_CLOUD_API = 'https://asistenciasistentruck.onrender.com';


export const isGpsScheduleAllowed = (user) => {
  if (user && (user.is_superadmin === 1 || user.is_superadmin === true || (user.name && user.name.toLowerCase().includes('mauricio')) || (user.username && user.username.toLowerCase().includes('mauricio')))) {
    return { allowed: true, isSuperAdmin: true, reason: 'SuperAdmin tiene libre disposicin 24/7' };
  }

  try {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: 'America/Santiago', weekday: 'short' });
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Santiago', hour12: false, hour: '2-digit', minute: '2-digit' });
    const [hour, minute] = timeStr.split(':').map(Number);
    const currentMinutes = hour * 60 + minute;

    if (['Mon', 'Tue', 'Wed', 'Thu'].includes(dayOfWeek)) {
      if (currentMinutes >= 8 * 60 && currentMinutes <= 19 * 60) {
        return { allowed: true, isSuperAdmin: false, schedule: 'Lunes a Jueves: 08:00 - 19:00 hrs' };
      }
      return { allowed: false, isSuperAdmin: false, reason: 'El rastreo GPS solo puede activarse de Lunes a Jueves de 08:00 a 19:00 hrs (Fuera de horario, solo SuperAdmin).' };
    }

    if (dayOfWeek === 'Fri') {
      if (currentMinutes >= 8 * 60 && currentMinutes <= 18 * 60) {
        return { allowed: true, isSuperAdmin: false, schedule: 'Viernes: 08:00 - 18:00 hrs' };
      }
      return { allowed: false, isSuperAdmin: false, reason: 'El rastreo GPS solo puede activarse los Viernes de 08:00 a 18:00 hrs (Fuera de horario, solo SuperAdmin).' };
    }

    return { allowed: false, isSuperAdmin: false, reason: 'El rastreo GPS no est activo los fines de semana (Horario permitido: Lun-Jue 08:00-19:00, Vie 08:00-18:00).' };
  } catch (e) {
    return { allowed: true, isSuperAdmin: false };
  }
};

export const isGpsActive = (val) => val === 1 || val === true || val === '1' || val === 'true';

export const CHILE_TIMEZONE = 'America/Santiago';

export const getChileTodayString = (d = new Date()) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: CHILE_TIMEZONE,
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

export const formatChileTime = (val) => {
  if (!val) return '--:--';
  try {
    if (typeof val === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(val.trim())) {
      return val.trim();
    }
    const cleanStr = typeof val === 'string' && !val.endsWith('Z') && !val.includes('+') && val.includes(' ') 
      ? val.replace(' ', 'T') + 'Z' 
      : (typeof val === 'string' && !val.endsWith('Z') && !val.includes('+') && val.includes('T') ? val + 'Z' : val);
    const d = new Date(cleanStr);
    const target = isNaN(d.getTime()) ? new Date(val) : d;
    if (isNaN(target.getTime())) return String(val);
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: CHILE_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(target);
  } catch (e) {
    return String(val);
  }
};

export const formatChileDateTime = (val) => {
  if (!val) return '';
  try {
    const cleanStr = typeof val === 'string' && !val.endsWith('Z') && !val.includes('+') && val.includes(' ') 
      ? val.replace(' ', 'T') + 'Z' 
      : (typeof val === 'string' && !val.endsWith('Z') && !val.includes('+') && val.includes('T') ? val + 'Z' : val);
    const d = new Date(cleanStr);
    const target = isNaN(d.getTime()) ? new Date(val) : d;
    if (isNaN(target.getTime())) return String(val);
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: CHILE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(target);
  } catch (e) {
    return String(val);
  }
};

export const isNativeApp = () => {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true;
  if (window.Capacitor && window.Capacitor.platform === 'android') return true;
  if (window.location && (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:')) return true;
  if (window.location && window.location.hostname === 'localhost' && (!window.location.port || window.location.port === '')) return true;
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent) && (!window.location.port || window.location.port === '')) return true;
  return false;
};

export const getApiBaseUrl = () => {
  const isNative = isNativeApp();
  const saved = localStorage.getItem('asistencia_api_url');

  if (saved && saved.trim() !== '') {
    const cleanSaved = saved.trim();
    // Si corre dentro del APK y la URL guardada es localhost, purgarla
    if (isNative && (cleanSaved.includes('localhost') || cleanSaved.includes('127.0.0.1'))) {
      localStorage.removeItem('asistencia_api_url');
    } else {
      return cleanSaved;
    }
  }

  // Si corre dentro del APK nativo de Android, SIEMPRE conectar a Render en la nube
  if (isNative) {
    return DEFAULT_CLOUD_API;
  }

  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    // Si corre en navegador web de PC en desarrollo local con puerto 5173 / 5174
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (window.location.port === '5173' || window.location.port === '5174') {
        return `${window.location.protocol || 'http:'}//${hostname}:3001`;
      }
    }
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
      return window.location.origin;
    }
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
  if (photoPath.startsWith('data:') || photoPath.startsWith('http://') || photoPath.startsWith('https://') || photoPath.startsWith('blob:')) {
    return photoPath;
  }
  return getApiBaseUrl() + photoPath;
};

export async function apiRequest(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();
  const token = localStorage.getItem('asistencia_token');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...(options.headers || {})
  };

  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const sep = endpoint.includes('?') ? '&' : '?';
  const finalEndpoint = isGet ? `${endpoint}${sep}_t=${Date.now()}` : endpoint;

  try {
    const res = await fetch(baseUrl + finalEndpoint, {
      ...options,
      headers,
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || (res.status === 403 && data.error && (data.error.includes('Token') || data.error.includes('expirado') || data.error.includes('autorizado')))) {
        if (typeof window !== 'undefined') {
          console.warn('Sesion expirada o invalida, renovando credenciales...');
          localStorage.removeItem('asistencia_token');
          window.dispatchEvent(new CustomEvent('auth_expired'));
        }
      }
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
    const url = getApiBaseUrl();
    socketInstance = io(url, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true
    });

    socketInstance.on('connect', () => {
      console.log(' Conectado en tiempo real al servidor ASISTENTRUCK:', url);
    });

    socketInstance.on('disconnect', (reason) => {
      console.warn(' Desconectado de WebSockets (' + reason + '), reconectando...');
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

export const apiUploadPhoto = async (id, fileOrBase64) => {
  const baseUrl = getApiBaseUrl();
  const token = localStorage.getItem('asistencia_token');
  if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:')) {
    const res = await fetch(baseUrl + '/api/users/' + id + '/photo-base64', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify({ photo_base64: fileOrBase64 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir foto');
    return data;
  }
  const formData = new FormData();
  formData.append('photo', fileOrBase64);
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
export const apiDeleteAttendanceRecord = (recordId, superAdminPassword) => apiRequest('/api/attendance/' + recordId, { method: 'DELETE', body: JSON.stringify({ superadmin_password: superAdminPassword }) });

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
// =========================================================================
// SISTEMA DE BÓVEDA MAESTRA PERSISTENTE (MASTER VAULT)
// Protege todos los trabajadores, fotos, contraseñas y marcaciones contra reinicios de Render
// =========================================================================

export const compressImageToBase64 = (fileOrDataUrl, maxDim = 360, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = (err) => reject(err);
    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
};

export const isUserValid = (u) => {
  if (!u || typeof u !== 'object') return false;
  const name = typeof u.name === 'string' ? u.name.trim() : '';
  const username = typeof u.username === 'string' ? u.username.trim() : '';
  return name.length > 0 || username.length > 0;
};

export const isSafariOrIOS = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  return isIOS || isSafari;
};

let audioUnlocked = false;
export const unlockIOSAudio = () => {
  if (audioUnlocked || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      audioUnlocked = true;
    }
  } catch (e) {}
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
          voice_messages: Array.isArray(parsed.voice_messages) ? parsed.voice_messages : [],
          gps_routes: Array.isArray(parsed.gps_routes) ? parsed.gps_routes : []
        };
      }
    }
  } catch (e) {}

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

  return { users, attendance: [], voice_messages, gps_routes: [] };
};

export const saveMasterVault = (vault) => {
  try {
    const rawUsers = Array.isArray(vault?.users) ? vault.users : [];
    const safeVault = {
      users: rawUsers.filter(isUserValid).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)),
      attendance: Array.isArray(vault?.attendance) ? vault.attendance.slice(0, 500) : [],
      voice_messages: Array.isArray(vault?.voice_messages) ? vault.voice_messages.slice(0, 300) : [],
      gps_routes: Array.isArray(vault?.gps_routes) ? vault.gps_routes.slice(0, 200) : []
    };
    localStorage.setItem('asistencia_master_vault', JSON.stringify(safeVault));
    if (safeVault.users.length > 0) {
      localStorage.setItem('asistencia_users_cache', JSON.stringify(safeVault.users));
    }
  } catch (e) {
    console.warn('Error guardando master vault:', e);
  }
};

export const setVaultUsers = (serverUsers) => {
  if (!Array.isArray(serverUsers)) return getMasterVault().users;
  return mergeUsersToVault(serverUsers);
};

export const mergeUsersToVault = (incomingUsers) => {
  if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) return getMasterVault().users;
  const vault = getMasterVault();
  const currentUsers = [...vault.users.filter(isUserValid)];

  incomingUsers.filter(isUserValid).forEach(inc => {
    const normIncName = (inc.name || '').toLowerCase().trim();
    const normIncUser = (inc.username || '').toLowerCase().trim();
    const normIncRut = (inc.rut || '').trim();

    const existingIdx = currentUsers.findIndex(u => {
      if (inc.id && u.id && String(inc.id) === String(u.id)) return true;
      if (normIncUser && u.username && normIncUser === u.username.toLowerCase().trim()) return true;
      if (normIncRut && u.rut && normIncRut === u.rut.trim()) return true;
      if (normIncName && u.name && normIncName === u.name.toLowerCase().trim()) return true;
      return false;
    });

    if (existingIdx !== -1) {
      const existing = currentUsers[existingIdx];
      currentUsers[existingIdx] = {
        ...existing,
        ...inc,
        id: inc.id || existing.id,
        photo_url: inc.photo_url || existing.photo_url || null,
        plain_password: (inc.plain_password && inc.plain_password !== '123') ? inc.plain_password : (existing.plain_password || inc.plain_password || '123'),
        password_hash: (inc.plain_password && inc.plain_password !== '123') ? (inc.password_hash || existing.password_hash) : (existing.password_hash || inc.password_hash),
        gps_tracking_enabled: inc.gps_tracking_enabled !== undefined ? inc.gps_tracking_enabled : (existing.gps_tracking_enabled || 0),
        has_credential: inc.has_credential !== undefined ? inc.has_credential : (existing.has_credential !== undefined ? existing.has_credential : 1)
      };
    } else {
      currentUsers.push({
        ...inc,
        plain_password: inc.plain_password || '123',
        gps_tracking_enabled: inc.gps_tracking_enabled || 0,
        has_credential: inc.has_credential !== undefined ? inc.has_credential : 1
      });
    }
  });

  vault.users = currentUsers.filter(isUserValid).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
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


export const mergeRoutesToVault = (incomingRoutes) => {
  if (!Array.isArray(incomingRoutes) || incomingRoutes.length === 0) return getMasterVault().gps_routes;
  const vault = getMasterVault();
  const currentMap = new Map();
  vault.gps_routes.forEach(r => currentMap.set(String(r.id || r.name || r.start_time), r));

  incomingRoutes.forEach(r => {
    const key = String(r.id || r.name || r.start_time);
    if (currentMap.has(key)) {
      currentMap.set(key, { ...currentMap.get(key), ...r });
    } else {
      currentMap.set(key, r);
    }
  });

  vault.gps_routes = Array.from(currentMap.values());
  saveMasterVault(vault);
  return vault.gps_routes;
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

// Sincronizacin Automtica Bidireccional con el Servidor (Auto-Restauracin de Render)
let isSyncingVault = false;
export const autoRestoreAndSyncWithServer = async () => {
  if (isSyncingVault) return getMasterVault().users;
  isSyncingVault = true;

  try {
    const vault = getMasterVault();
    const serverUsers = await apiGetUsers().catch(() => null);

    // Si el servidor en Render reinici de cero o tiene menos usuarios/datos que la bveda local
    const needsRestore = (!Array.isArray(serverUsers) || serverUsers.length <= 1) && (vault.users.length > 1 || vault.attendance.length > 0 || vault.gps_routes.length > 0);
    if (needsRestore) {
      console.log('Detectado reinicio en Render. Auto-restaurando Bveda Maestra al servidor...');
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

    if (Array.isArray(serverUsers) && serverUsers.length > 0) {
      const merged = mergeUsersToVault(serverUsers);
      
      // Sincronizar rutas tambin
      try {
        const serverRoutes = await apiGetGpsRoutes().catch(() => null);
        if (Array.isArray(serverRoutes) && serverRoutes.length > 0) {
          mergeRoutesToVault(serverRoutes);
        }
      } catch (e) {}

      isSyncingVault = false;
      return merged;
    }

    isSyncingVault = false;
    return vault.users;
  } catch (err) {
    console.warn('Error en autoRestoreAndSyncWithServer:', err);
    isSyncingVault = false;
    return getMasterVault().users;
  }
};
