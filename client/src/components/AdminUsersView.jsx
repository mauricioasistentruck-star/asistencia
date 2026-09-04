import React, { useState, useEffect, useRef } from 'react';
import { Users, UserPlus, MapPin, Upload, Trash2, Edit3, CheckCircle, AlertTriangle, Lock, X, Key, ShieldCheck, QrCode, Save, Plus, Camera, Search, Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import WorkerScheduleModal from './WorkerScheduleModal.jsx';
import { 
  apiGetUsers, 
  apiCreateUser, 
  apiUpdateUser, 
  apiDeleteUser, apiLockAsBase, 
  apiUploadPhoto, 
  apiToggleGps, 
  getFullPhotoUrl, 
  getSocket, 
  autoRestoreAndSyncWithServer,
  removeUserFromVault,
  mergeUsersToVault,
  getMasterVault,
  saveMasterVault,
  compressImageToBase64,
  isGpsActive
} from '../api';

export default function AdminUsersView({ currentUser, theme }) {
  const [users, setUsers] = useState(() => [...getMasterVault().users].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const isDark = theme === 'dark';
  const isSuperAdmin = currentUser && (
    currentUser.is_superadmin === 1 || 
    currentUser.is_superadmin === '1' ||
    currentUser.is_superadmin === true ||
    currentUser.role === 'superadmin' ||
    (currentUser.name || '').toLowerCase().includes('mauricio') ||
    (currentUser.username || '').toLowerCase().includes('mauricio')
  );

  // Formulario Crear Usuario
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    rut: '',
    email: '',
    password: '123',
    role: 'worker',
    gps_tracking_enabled: false,
    has_credential: true,
    work_days: ['mon', 'tue', 'wed', 'thu', 'fri']
  });

  // Formulario Modificar Usuario
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    rut: '',
    email: '',
    password: '',
    role: 'worker',
    gps_tracking_enabled: false,
    has_credential: true
  });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await apiGetUsers();
      if (Array.isArray(data) && data.length > 0) {
        const cleanUsers = deduplicateUsers(data);
        mergeUsersToVault(cleanUsers);
        setUsers(cleanUsers);
      } else {
        const vault = getMasterVault();
        if (vault.users.length > 0) {
          setUsers(vault.users);
        }
      }
    } catch (err) {
      const vault = getMasterVault();
      if (vault.users.length > 0) {
        setUsers(vault.users);
      }
    }
  };

  useEffect(() => {
    fetchUsers();

    const socket = getSocket();

    const onUserCreated = (created) => {
      if (created && created.id) {
        setUsers(prev => {
          if (prev.some(u => u.id === created.id || u.username === created.username)) {
            return prev.map(u => (u.id === created.id || u.username === created.username) ? created : u);
          }
          return [...prev, created].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
        });
      }
      fetchUsers();
    };

    const onUserUpdated = (updated) => {
      if (updated && updated.id) {
        setUsers(prev => prev.map(u => (u.id === updated.id || u.username === updated.username) ? { ...u, ...updated } : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)));
        const vault = getMasterVault();
        vault.users = vault.users.map(u => (u.id === updated.id || u.username === updated.username) ? { ...u, ...updated } : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
        saveMasterVault(vault);
      }
    };

    const onUserDeleted = (payload) => {
      const targetId = payload?.id || payload?.userId;
      if (targetId) {
        removeUserFromVault(targetId);
        setUsers(prev => prev.filter(u => u.id !== targetId));
      }
    };

    const onGpsToggled = (payload) => {
      const targetId = payload?.userId || payload?.id;
      const enabled = payload?.gps_tracking_enabled ?? payload?.enabled;
      if (targetId !== undefined) {
        setUsers(prev => prev.map(u => u.id === targetId ? { ...u, gps_tracking_enabled: enabled } : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)));
        const vault = getMasterVault();
        vault.users = vault.users.map(u => u.id === targetId ? { ...u, gps_tracking_enabled: enabled } : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
        saveMasterVault(vault);
      }
    };

    socket.on('connect', fetchUsers);
    socket.on('user_created', onUserCreated);
    socket.on('user_updated', onUserUpdated);
    socket.on('user_deleted', onUserDeleted);
    socket.on('user_gps_toggled', onGpsToggled);
    socket.on('attendance_updated', fetchUsers);

    const syncInterval = setInterval(() => {
      fetchUsers();
    }, 6000);

    return () => {
      clearInterval(syncInterval);
      socket.off('connect', fetchUsers);
      socket.off('user_created', onUserCreated);
      socket.off('user_updated', onUserUpdated);
      socket.off('user_deleted', onUserDeleted);
      socket.off('user_gps_toggled', onGpsToggled);
      socket.off('attendance_updated', fetchUsers);
    };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    try {
      const payload = {
        ...newUser,
        gps_tracking_enabled: newUser.gps_tracking_enabled ? 1 : 0,
        has_credential: newUser.role === 'admin' ? (newUser.has_credential ? 1 : 0) : (newUser.role === 'kiosk' ? 0 : 1)
      };
      const res = await apiCreateUser(payload);
      const created = res?.user || res;
      if (created && created.id) {
        mergeUsersToVault([created]);
      }
      setActionSuccess('Usuario ' + newUser.name + ' creado exitosamente.');
      setShowCreateModal(false);
      setNewUser({ username: '', name: '', rut: '', email: '', password: '123', role: 'worker', gps_tracking_enabled: false, has_credential: true });
      fetchUsers();
    } catch (err) {
      setActionError(err.message || 'Error al crear usuario');
    }
  };

  const openEditModal = (u) => {
    const isTargetMauricio = u.is_superadmin === 1 || (u.name || '').toLowerCase() === 'mauricio' || (u.username || '').toLowerCase() === 'mauricio';
    if (isTargetMauricio && !isSuperAdmin) {
      setActionError('ACCESO DENEGADO: No tiene permisos para modificar la cuenta de este Administrador.');
      setTimeout(() => setActionError(''), 4000);
      return;
    }

    setEditingUser(u);
    setEditForm({
      username: u.username || '',
      name: u.name || '',
      rut: u.rut || '',
      email: u.email || '',
      password: '',
      role: u.role || 'worker',
      gps_tracking_enabled: isGpsActive(u.gps_tracking_enabled),
      has_credential: (u.has_credential !== 0 && u.has_credential !== false && u.has_credential !== '0' && u.has_credential !== 'false' && u.has_credential !== null)
    });
    setEditError('');
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError('');

    try {
      const payload = {
        username: editForm.username,
        name: editForm.name,
        rut: editForm.rut,
        email: editForm.email,
        role: editForm.role,
        gps_tracking_enabled: editForm.gps_tracking_enabled ? 1 : 0,
        has_credential: editForm.role === 'admin' ? (editForm.has_credential ? 1 : 0) : (editForm.role === 'kiosk' ? 0 : 1),
        work_days: JSON.stringify(editForm.work_days || ['mon','tue','wed','thu','fri'])
      };
      if (editForm.password && editForm.password.trim() !== '') {
        payload.password = editForm.password.trim();
      }

      const updatedUser = { ...editingUser, ...payload };
      setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUser : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)));

      const vault = getMasterVault();
      vault.users = vault.users.map(u => u.id === editingUser.id ? updatedUser : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
      saveMasterVault(vault);

      const res = await apiUpdateUser(editingUser.id, payload);
      const serverUser = res?.user || updatedUser;

      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...serverUser } : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)));
      vault.users = vault.users.map(u => u.id === editingUser.id ? { ...u, ...serverUser } : u).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
      saveMasterVault(vault);

      setActionSuccess('Perfil de ' + (serverUser.name || editForm.name) + ' actualizado correctamente.');
      setShowEditModal(false);
      setEditingUser(null);
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setEditError(err.message || 'Error al actualizar perfil');
      fetchUsers();
    } finally {
      setEditLoading(false);
    }
  };

  const handlePhotoUpload = async (userId, file) => {
    if (!file) return;
    try {
      const base64Data = await compressImageToBase64(file, 360, 0.82);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, photo_url: base64Data } : u));
      const vault = getMasterVault();
      vault.users = vault.users.map(u => u.id === userId ? { ...u, photo_url: base64Data } : u);
      saveMasterVault(vault);
      try {
        await apiUploadPhoto(userId, base64Data);
        setActionSuccess('Fotografía actualizada y guardada permanentemente.');
        setTimeout(() => setActionSuccess(''), 3500);
      } catch (err) {
        setActionError(err.message || 'Error al guardar foto en servidor');
        setTimeout(() => setActionError(''), 4000);
      }
    } catch (err) {
      setActionError(err.message || 'Error al procesar fotografía');
    }
  };

  const handleToggleGps = async (userId, currentVal) => {
    const newVal = !isGpsActive(currentVal);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, gps_tracking_enabled: newVal ? 1 : 0 } : u));
    const vault = getMasterVault();
    vault.users = vault.users.map(u => u.id === userId ? { ...u, gps_tracking_enabled: newVal ? 1 : 0 } : u);
    saveMasterVault(vault);

    try {
      await apiToggleGps(userId, newVal);
      setActionSuccess('Rastreo GPS ' + (newVal ? 'ACTIVADO' : 'DESACTIVADO') + ' correctamente');
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      setActionError(err.message || 'Error al cambiar estado GPS');
      fetchUsers();
    }
  };

  const handleDelete = async (u) => {
    const isTargetMauricio = u.is_superadmin === 1 || (u.name || '').toLowerCase() === 'mauricio' || (u.username || '').toLowerCase() === 'mauricio';
    if (isTargetMauricio) {
      alert('ACCESO DENEGADO: El usuario Mauricio es el Administrador Principal y no puede ser eliminado.');
      return;
    }

    if (!window.confirm('¿Está seguro de eliminar permanentemente a ' + u.name + '? Esta acción eliminará su usuario, foto y credencial QR.')) {
      return;
    }

    try {
      removeUserFromVault(u.id);
      setUsers(prev => prev.filter(item => item.id !== u.id));
      await apiDeleteUser(u.id);
      setActionSuccess('Usuario ' + u.name + ' eliminado del sistema');
      fetchUsers();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Error al eliminar usuario');
      fetchUsers();
    }
  };

  const handleAutoGenerateLogin = (fullName) => {
    if (!fullName) return;
    const clean = fullName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const firstWord = fullName.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    setNewUser(prev => ({
      ...prev,
      name: fullName,
      username: clean || firstWord || 'usuario',
      email: (clean || firstWord || 'usuario') + '@asistentruck.cl'
    }));
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12 w-full animate-in fade-in duration-300">
      
      {/* Header Principal de Gestión de Personal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" />
            <span>Gestión de Personal y Cuentas</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Administración de trabajadores, credenciales QR, roles y contraseñas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            title="Configurar pauta de días laborales por trabajador (medio tiempo, días específicos)"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Pauta Días Laborales</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-black font-black text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Toast Flotante de Notificaciones para evitar saltos en la pantalla */}
      {(actionSuccess || actionError) && (
        <div className="fixed bottom-6 right-6 z-[999999] max-w-sm w-[90%] sm:w-auto animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
          {actionSuccess && (
            <div className="bg-black/95 text-emerald-400 border-2 border-emerald-500/80 p-3.5 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 text-xs font-black shadow-emerald-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{actionSuccess}</span>
              </div>
              <button onClick={() => setActionSuccess('')} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          )}
          {actionError && (
            <div className="bg-black/95 text-red-400 border-2 border-red-500/80 p-3.5 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 text-xs font-black shadow-red-500/20 mt-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{actionError}</span>
              </div>
              <button onClick={() => setActionError('')} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* Grid de Tarjetas de Usuarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => {
          const isSuper = u.is_superadmin === 1 || u.role === 'superadmin' || (u.name || '').toLowerCase() === 'mauricio' || (u.username || '').toLowerCase() === 'mauricio';
          const showSuperBadge = isSuper && isSuperAdmin;
          const isKioskRole = u.role === 'kiosk';
          const isAdminRole = (u.role === 'admin' || isSuper) && !showSuperBadge && !isKioskRole;
          const hasCred = u.has_credential !== 0 && u.has_credential !== false && u.has_credential !== '0';

          return (
            <div
              key={u.id || u.username || u.name}
              className={'border rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-xl transition-all relative overflow-hidden group ' + (
                isDark ? 'bg-zinc-950/90 border-zinc-800/80 hover:border-orange-500/40' : 'bg-white border-orange-100 hover:border-orange-300'
              )}
            >
              {/* Etiqueta de Rol */}
              <div className="flex items-center justify-between mb-3">
                <span className={'text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ' + (
                  showSuperBadge ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : isKioskRole
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : isAdminRole
                      ? (hasCred ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-purple-500/20 text-purple-400 border-purple-500/40')
                      : 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                )}>
                  {showSuperBadge ? 'SUPERADMIN' : isKioskRole ? 'PUESTO KIOSCO QR' : isAdminRole ? (hasCred ? 'ADMIN CON QR' : 'ADMIN REPORTES') : 'TRABAJADOR'}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(u)}
                    title="Modificar Perfil"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {!isSuper && (
                    <button
                      onClick={() => handleDelete(u)}
                      title="Eliminar Usuario"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Información y Foto */}
              <div className="flex items-start space-x-3.5 mb-3.5">
                <div className="relative group/photo flex-shrink-0">
                  <div className="w-13 h-13 rounded-2xl overflow-hidden border-2 border-orange-500 bg-black flex items-center justify-center text-base font-black text-white shadow-md">
                    {u.photo_url ? (
                      <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-orange-500 text-lg font-black">{u.name?.charAt(0) || 'U'}</span>
                    )}
                  </div>
                  <label 
                    title="Subir o cambiar fotografía"
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 rounded-2xl flex items-center justify-center cursor-pointer transition-opacity text-white"
                  >
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handlePhotoUpload(u.id, e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-sm tracking-tight truncate">{u.name}</h4>
                  <div className="text-[11px] text-orange-500 font-mono font-bold mt-0.5 truncate">
                    Login: {u.username || 'usuario'}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                    RUT: {u.rut || 'Sin registrar'}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {u.email || 'Sin correo'}
                  </div>
                </div>
              </div>

                            {/* Datos de Clave (Solo SuperAdmin) */}
              {isSuperAdmin && (
                <div className={'p-2.5 rounded-2xl border mb-3 flex items-center justify-between ' + (isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-orange-50/50 border-orange-100')}>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Key className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-[11px]">Clave:</span>
                  </div>
                  <span className="font-mono text-xs font-black text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                    {u.plain_password || '123'}
                  </span>
                </div>
              )}

              {/* Acciones Rápidas: QR */}
              <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                {hasCred ? (
                  <button
                    onClick={() => setShowQrModal(u)}
                    className={'w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all cursor-pointer ' + (
                      isDark ? 'bg-zinc-900 hover:bg-orange-500 hover:text-black border-zinc-700' : 'bg-orange-50 hover:bg-orange-500 hover:text-black border-orange-200'
                    )}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Ver Credencial QR</span>
                  </button>
                ) : (
                  <div className="w-full py-1.5 text-center text-[10px] font-bold text-cyan-400 bg-cyan-950/20 rounded-xl border border-cyan-500/30">
                    {isKioskRole ? 'Puesto Kiosco QR (Escáner Tablet)' : 'Admin sin credencial QR (Acceso a Reportes)'}
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* MODAL CREAR USUARIO */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 ' + (isDark ? 'bg-zinc-950 border-orange-500/40 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-black">Crear Nuevo Usuario</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => handleAutoGenerateLogin(e.target.value)}
                  placeholder="Ej: Bastian Soto, Nicolas Chamorro"
                  className={'w-full rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Usuario Login:</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="bastiansoto"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">RUT (Opcional):</label>
                  <input
                    type="text"
                    value={newUser.rut}
                    onChange={(e) => setNewUser({ ...newUser, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Correo Electrónico:</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="usuario@asistentruck.cl"
                  className={'w-full rounded-xl px-3.5 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {isSuperAdmin ? (
                  <div>
                    <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Contraseña Inicial:</label>
                    <input
                      type="text"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="123"
                      className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Contraseña Inicial:</label>
                    <div className={'w-full rounded-xl px-3 py-2 text-xs border flex items-center justify-between ' + (isDark ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-600')}>
                      <span className="font-mono font-bold">Predeterminada (123)</span>
                      <span className="text-[9px] text-zinc-500 font-bold">Asignada</span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Rol de Usuario:</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  >
                    <option value="worker">Trabajador (Solo Credencial)</option>
                    <option value="kiosk">Puesto Kiosco QR (Solo Escáner)</option>
                    <option value="admin">Administrador (Gestión / Reportes)</option>
                  </select>
                </div>
              </div>

              {/* Pregunta si se desea crear la credencial para Administradores */}
              {newUser.role === 'admin' && (
                <div className={'p-3 rounded-2xl border flex items-center justify-between ' + (isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-orange-50/70 border-orange-200')}>
                  <div className="pr-2">
                    <div className="text-xs font-bold text-orange-400">¿Generar Credencial / Carnet QR?</div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Si se desactiva, el Admin entrará directamente al panel de reportes y marcaciones sin credencial QR.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={newUser.has_credential}
                    onChange={(e) => setNewUser({ ...newUser, has_credential: e.target.checked })}
                    className="w-5 h-5 accent-orange-500 rounded cursor-pointer flex-shrink-0"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="create-gps"
                  checked={newUser.gps_tracking_enabled}
                  onChange={(e) => setNewUser({ ...newUser, gps_tracking_enabled: e.target.checked })}
                  className="w-4 h-4 accent-orange-500 rounded"
                />
                <label htmlFor="create-gps" className="text-xs font-bold text-zinc-400 cursor-pointer">
                  Habilitar Rastreo GPS en vivo (Predeterminado: Desactivado)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-black shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MODIFICAR USUARIO */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 ' + (isDark ? 'bg-zinc-950 border-orange-500/40 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-black">Modificar Perfil: {editingUser.name}</h3>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            {editError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2.5 rounded-xl text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={'w-full rounded-xl px-3.5 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Usuario Login:</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">RUT:</label>
                  <input
                    type="text"
                    value={editForm.rut}
                    onChange={(e) => setEditForm({ ...editForm, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Correo Electrónico:</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={'w-full rounded-xl px-3.5 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {isSuperAdmin ? (
                  <div>
                    <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Nueva Contraseña:</label>
                    <input
                      type="text"
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="Dejar en blanco para no cambiar"
                      className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Contraseña:</label>
                    <div className={'w-full rounded-xl px-3 py-2 text-xs border flex items-center justify-between ' + (isDark ? 'bg-zinc-900/80 border-zinc-800 text-zinc-500' : 'bg-zinc-100 border-zinc-200 text-zinc-500')}>
                      <span>••••••••</span>
                      <span className="text-[9px] text-zinc-500 font-bold">Solo SuperAdmin</span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Rol de Usuario:</label>
                  <select
                    value={editForm.role === 'superadmin' ? 'admin' : editForm.role}
                    disabled={editingUser.is_superadmin === 1}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  >
                    <option value="worker">Trabajador (Carnet QR / Asistencia)</option>
                    <option value="kiosk">Puesto Kiosco QR (Solo Escáner)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              {/* Opción de Credencial para Administrador */}
              {editForm.role === 'admin' && (
                <div className={'p-3 rounded-2xl border flex items-center justify-between ' + (isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-orange-50/70 border-orange-200')}>
                  <div className="pr-2">
                    <div className="text-xs font-bold text-orange-400">¿Generar Credencial / Carnet QR?</div>
                    <div className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                      Si se desactiva, no se generará carnet QR y su menú será la tabla de reportes.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={editForm.has_credential}
                    onChange={(e) => setEditForm({ ...editForm, has_credential: e.target.checked })}
                    className="w-5 h-5 accent-orange-500 rounded cursor-pointer flex-shrink-0"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-gps"
                  checked={editForm.gps_tracking_enabled}
                  onChange={(e) => setEditForm({ ...editForm, gps_tracking_enabled: e.target.checked })}
                  className="w-4 h-4 accent-orange-500 rounded"
                />
                <label htmlFor="edit-gps" className="text-xs font-bold text-zinc-400 cursor-pointer">
                  Activar Rastreo GPS Satelital
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black shadow-lg shadow-orange-500/30 flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{editLoading ? 'Guardando...' : 'Guardar Cambios Permanentemente'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOSTRAR QR */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowQrModal(null)}>
          <div 
            className={'border rounded-3xl max-w-xs w-full p-6 shadow-2xl text-center space-y-4 ' + (isDark ? 'bg-zinc-950 border-orange-500/40 text-white' : 'bg-white border-orange-200 text-zinc-900')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-orange-500/20">
              <h3 className="text-sm font-black truncate">{showQrModal.name}</h3>
              <button onClick={() => setShowQrModal(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-inner inline-block mx-auto border-2 border-orange-500">
              <QRCodeSVG value={showQrModal.qr_token || 'SIN_TOKEN'} size={180} level="H" />
            </div>

            <div className="text-[11px] font-mono font-bold text-orange-400 break-all">
              {showQrModal.qr_token}
            </div>

            <button
              onClick={() => setShowQrModal(null)}
              className="w-full py-2 bg-orange-500 text-black font-black text-xs rounded-xl cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

          {/* Modal para configurar días laborales por trabajador */}
      <WorkerScheduleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        workers={users}
        onWorkerUpdated={() => fetchUsers()}
      />
    </div>
  );
}
