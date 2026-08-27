import React, { useState, useEffect, useRef } from 'react';
import { Users, UserPlus, MapPin, Upload, Trash2, Edit3, CheckCircle, AlertTriangle, Lock, X, Key, Download, UploadCloud, Database, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  apiGetUsers, 
  apiCreateUser, 
  apiUpdateUser, 
  apiDeleteUser, 
  apiUploadPhoto, 
  apiToggleGps, 
  getFullPhotoUrl, 
  getSocket, 
  apiExportBackup, 
  apiImportBackup,
  autoRestoreAndSyncWithServer,
  removeUserFromVault,
  mergeUsersToVault,
  getMasterVault,
  saveMasterVault,
  isGpsActive
} from '../api';

export default function AdminUsersView({ currentUser, theme }) {
  const [users, setUsers] = useState(() => getMasterVault().users);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const isDark = theme === 'dark';
  const isSuperAdmin = currentUser && (
    currentUser.is_superadmin === 1 || 
    (currentUser.name || '').toLowerCase() === 'mauricio' ||
    (currentUser.username || '').toLowerCase() === 'mauricio'
  );

  // Formulario Crear
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    rut: '',
    email: '',
    password: '123',
    role: 'worker',
    gps_tracking_enabled: false
  });

  // Formulario Editar Perfil
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    name: '',
    rut: '',
    email: '',
    password: '',
    role: 'worker',
    gps_tracking_enabled: false
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Estados de Backup Masivo (SuperAdmin)
  const [backupLoading, setBackupLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleExportBackup = async () => {
    setActionError('');
    setActionSuccess('');
    setBackupLoading(true);
    try {
      await apiExportBackup();
      setActionSuccess('¡Exportación masiva descargada con éxito! Incluye usuarios, contraseñas, fotos, marcaciones y rutas GPS.');
    } catch (err) {
      setActionError(err.message || 'Error al generar la exportación');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!window.confirm('¿Desea restaurar esta copia de seguridad? Se importarán todos los trabajadores, contraseñas, fotos, marcaciones y rutas registradas.')) {
      e.target.value = '';
      return;
    }

    setActionError('');
    setActionSuccess('');
    setBackupLoading(true);

    try {
      const text = await file.text();
      const backupJson = JSON.parse(text);
      const res = await apiImportBackup(backupJson);
      
      const stats = res.stats || {};
      setActionSuccess(`¡Restauración exitosa! (${stats.users || 0} trabajadores, ${stats.attendance || 0} marcaciones, ${stats.routes || 0} rutas GPS).`);
      fetchUsers();
    } catch (err) {
      setActionError(err.message || 'Error al procesar archivo de copia de seguridad');
    } finally {
      setBackupLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiGetUsers();
      if (Array.isArray(data) && data.length > 0) {
        // El servidor en la nube es la fuente autoritativa: sincronizar exactamente
        const cleanUsers = setVaultUsers(data);
        setUsers(cleanUsers);
      } else {
        const vault = getMasterVault();
        if (vault.users.length > 0) {
          setUsers(vault.users.filter(u => u && (u.name || u.username) && ((u.name && u.name.trim() !== '') || (u.username && u.username !== 'usuario'))));
        }
      }
    } catch (err) {
      const vault = getMasterVault();
      if (vault.users.length > 0) {
        setUsers(vault.users.filter(u => u && (u.name || u.username) && ((u.name && u.name.trim() !== '') || (u.username && u.username !== 'usuario'))));
      }
    }
  };

  useEffect(() => {
    fetchUsers();

    // Sincronización en tiempo real vía WebSockets entre PC y APK
    const socket = getSocket();
    const handleUserUpdate = () => {
      fetchUsers();
    };

    socket.on('connect', fetchUsers);
    socket.on('user_created', handleUserUpdate);
    socket.on('user_updated', handleUserUpdate);
    socket.on('user_deleted', (payload) => {
      if (payload && payload.id) {
        removeUserFromVault(payload.id);
        setUsers(prev => prev.filter(u => u.id !== payload.id));
      }
      fetchUsers();
    });
    socket.on('user_gps_toggled', handleUserUpdate);
    socket.on('attendance_updated', handleUserUpdate);

    return () => {
      socket.off('connect', fetchUsers);
      socket.off('user_created', handleUserUpdate);
      socket.off('user_updated', handleUserUpdate);
      socket.off('user_deleted', handleUserUpdate);
      socket.off('user_gps_toggled', handleUserUpdate);
      socket.off('attendance_updated', handleUserUpdate);
    };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    try {
      const payload = {
        ...newUser,
        gps_tracking_enabled: newUser.gps_tracking_enabled ? 1 : 0
      };
      const res = await apiCreateUser(payload);
      const created = res?.user || res;
      if (created && created.id) {
        mergeUsersToVault([created]);
      }
      setActionSuccess('Usuario ' + newUser.name + ' creado exitosamente.');
      setShowCreateModal(false);
      setNewUser({ username: '', name: '', rut: '', email: '', password: '123', role: 'worker', gps_tracking_enabled: false });
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
      gps_tracking_enabled: isGpsActive(u.gps_tracking_enabled)
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
        gps_tracking_enabled: editForm.gps_tracking_enabled ? 1 : 0
      };
      if (editForm.password && editForm.password.trim() !== '') {
        payload.password = editForm.password.trim();
      }

      await apiUpdateUser(editingUser.id, payload);
      setActionSuccess('Perfil de ' + editForm.name + ' actualizado correctamente.');
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setEditError(err.message || 'Error al actualizar perfil');
    } finally {
      setEditLoading(false);
    }
  };

  const handlePhotoUpload = async (userId, file) => {
    if (!file) return;
    try {
      await apiUploadPhoto(userId, file);
      setActionSuccess('Fotografía actualizada correctamente');
      fetchUsers();
    } catch (err) {
      setActionError(err.message || 'Error al subir fotografía');
    }
  };

  const handleToggleGps = async (userId, currentVal) => {
    const isCurrentlyActive = isGpsActive(currentVal);
    const targetState = !isCurrentlyActive;
    const targetNumeric = targetState ? 1 : 0;
    
    // 1. Actualizar estado local inmediatamente
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, gps_tracking_enabled: targetNumeric } : u));
    
    // 2. Actualizar en Bóveda Maestra inmediatamente
    const vault = getMasterVault();
    vault.users = vault.users.map(u => u.id === userId ? { ...u, gps_tracking_enabled: targetNumeric } : u);
    saveMasterVault(vault);

    try {
      await apiToggleGps(userId, targetNumeric);
    } catch (err) {
      setActionError(err.message || 'Error al modificar estado de GPS');
      fetchUsers();
    }
  };

  const handleDelete = async (userToDelete) => {
    if (!userToDelete) return;
    
    const isTargetMauricio = userToDelete.is_superadmin === 1 || 
      (userToDelete.name && userToDelete.name.toLowerCase() === 'mauricio') || 
      (userToDelete.username && userToDelete.username.toLowerCase() === 'mauricio');

    if (isTargetMauricio) {
      setActionError('ACCESO DENEGADO: Esta cuenta de Administrador está protegida contra eliminación.');
      setTimeout(() => setActionError(''), 4000);
      return;
    }

    const displayName = userToDelete.name || userToDelete.username || 'este registro incompleto';
    if (!window.confirm('¿Está seguro de eliminar a ' + displayName + '?')) return;

    try {
      // 1. Remover siempre de la Bóveda Maestra (LocalStorage)
      if (userToDelete.id) {
        removeUserFromVault(userToDelete.id);
      } else {
        const vault = getMasterVault();
        vault.users = vault.users.filter(u => u !== userToDelete && (u.id || u.name || u.username));
        saveMasterVault(vault);
      }

      // 2. Si tiene ID, eliminar en el servidor
      if (userToDelete.id) {
        try {
          await apiDeleteUser(userToDelete.id);
        } catch (serverErr) {
          console.warn('Aviso al eliminar en servidor:', serverErr.message);
        }
      }

      setActionSuccess('Usuario ' + displayName + ' eliminado correctamente.');
      fetchUsers();
    } catch (err) {
      setActionError(err.message || 'Error al eliminar usuario');
      fetchUsers();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-orange-500" />
            Gestión de Personal & Credenciales
          </h2>
          <p className="text-xs text-orange-500 font-semibold">
            Modifica nombres de usuario para login, RUT, correos, contraseñas, fotos y GPS
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-orange-500 hover:bg-orange-600 text-black text-xs font-black px-5 py-3 rounded-2xl shadow-xl shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Registrar Nuevo Personal
        </button>
      </div>

      {/* SECCIÓN SUPERADMIN: EXPORTACIÓN E IMPORTACIÓN MASIVA TOTAL */}
      {isSuperAdmin && (
        <div className={'border-2 rounded-3xl p-5 shadow-2xl transition-all relative overflow-hidden ' + (isDark ? 'bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-orange-500/40 text-white' : 'bg-gradient-to-r from-orange-50 via-white to-orange-50 border-orange-400 text-zinc-900')}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-orange-500 text-black">
                  <Database className="w-5 h-5" />
                </span>
                <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                  Copia de Seguridad Masiva (SuperAdmin)
                  <span className="text-[10px] bg-orange-500/20 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                    Seguridad Total
                  </span>
                </h3>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl">
                Exporta o restaura en 1 clic toda la información: <strong className="text-orange-400">usuarios, contraseñas, fotos de perfil, historial de marcaciones pasadas y rutas GPS</strong>. Ideal para respaldar o migrar sin perder ningún dato.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Botón Exportar */}
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={backupLoading}
                className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-black text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{backupLoading ? 'Procesando...' : 'Exportar Masivo (.json)'}</span>
              </button>

              {/* Botón Importar */}
              <button
                type="button"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={backupLoading}
                className={'active:scale-95 text-xs font-black px-4 py-2.5 rounded-xl border transition-all flex items-center gap-2 cursor-pointer ' + (isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700 hover:border-orange-500/40' : 'bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300 hover:border-orange-400')}
              >
                <UploadCloud className="w-4 h-4 text-orange-500" />
                <span>Importar Masivo (.json)</span>
              </button>

              {/* Input de Archivo Oculto */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                className="hidden"
                onChange={handleImportFileChange}
                disabled={backupLoading}
              />
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-400 text-xs">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3 text-emerald-400 text-xs">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Grid de Tarjetas de Usuarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((u) => {
          const isMauricio = u.is_superadmin === 1 || (u.name || '').toLowerCase() === 'mauricio' || (u.username || '').toLowerCase() === 'mauricio';
          const canEditThis = isSuperAdmin || !isMauricio;

          return (
            <div
              key={u.id}
              className={'border rounded-3xl p-6 shadow-xl relative overflow-hidden transition-all flex flex-col justify-between ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="relative group">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-500 bg-black flex items-center justify-center text-xl font-bold shadow-lg shadow-orange-500/20">
                      {u.photo_url ? (
                        <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-orange-500">{(u.name || 'U').charAt(0)}</span>
                      )}
                    </div>
                    <label
                      title="Cambiar Foto"
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer flex items-center justify-center text-white transition-opacity"
                    >
                      <Upload className="w-5 h-5" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(u.id, e.target.files[0])}
                      />
                    </label>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500 text-black shadow-sm">
                      {u.role === 'superadmin' || u.role === 'admin' ? 'Admin' : 'Trabajador'}
                    </span>

                    {isGpsActive(u.gps_tracking_enabled) && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <MapPin className="w-3 h-3 animate-pulse" /> GPS Activo
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-black tracking-tight">{u.name}</h3>
                
                <div className="space-y-1.5 my-2.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-zinc-400 bg-orange-500/10 px-2.5 py-1 rounded-xl border border-orange-500/20">
                    <span className="font-sans text-[11px] font-bold text-orange-500">Usuario Login:</span>
                    <strong className="text-orange-400 font-bold">{u.username || (u.name ? u.name.toLowerCase().replace(/\s+/g, '') : 'usuario')}</strong>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="font-sans text-[11px]">RUT:</span>
                    <strong className="text-zinc-300 font-bold">{u.rut || 'Sin registrar'}</strong>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="font-sans text-[11px]">Correo:</span>
                    <span className="text-zinc-400 truncate max-w-[170px]">{u.email}</span>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex items-center justify-between text-zinc-400 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/25 mt-1">
                      <span className="font-sans text-[11px] font-bold text-amber-500 flex items-center gap-1">
                        <Key className="w-3 h-3 flex-shrink-0" /> Clave:
                      </span>
                      <strong className="text-amber-400 font-mono font-black">{u.plain_password || '123'}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800/80 mt-2 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(u)}
                    disabled={!canEditThis}
                    className={'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ' + (canEditThis ? (isDark ? 'bg-zinc-900 hover:bg-zinc-800 text-orange-400 border border-zinc-700' : 'bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200') : 'bg-zinc-900/40 text-zinc-600 border border-zinc-800 cursor-not-allowed')}
                  >
                    {canEditThis ? <Edit3 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{canEditThis ? 'Modificar Perfil' : 'Protegido'}</span>
                  </button>

                  <button
                    onClick={() => setShowQrModal(u)}
                    className="py-2 px-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                    title="Ver Código QR"
                  >
                    QR
                  </button>

                  {!isMauricio && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="py-2 px-3 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl text-xs transition-all flex items-center justify-center"
                      title="Eliminar Trabajador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Switch rápido de GPS */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[11px] text-zinc-400 font-bold">Rastreo GPS en vivo:</span>
                  <button
                    onClick={() => handleToggleGps(u.id, u.gps_tracking_enabled)}
                    className={'px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ' + (isGpsActive(u.gps_tracking_enabled) ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-400 hover:text-white')}
                  >
                    {isGpsActive(u.gps_tracking_enabled) ? 'ACTIVADO' : 'DESACTIVADO'}
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* MODAL EDITAR PERFIL COMPLETO */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-lg w-full p-6 shadow-2xl transition-all ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500 text-black flex items-center justify-center font-bold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Modificar Perfil de Usuario</h3>
                  <p className="text-xs text-orange-500 font-semibold">{editingUser.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    Nombre de Usuario (Para Login):
                  </label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    placeholder="Ej: bastian, juan"
                    className={'w-full rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    required
                  />
                  <span className="text-[9px] text-zinc-400 mt-0.5 block">Nombre corto para iniciar sesión</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    Nombre Completo:
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Ej: Bastián Soto"
                    className={'w-full rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    required
                  />
                  <span className="text-[9px] text-zinc-400 mt-0.5 block">Nombre visible en la credencial</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    RUT del Trabajador (Opcional):
                  </label>
                  <input
                    type="text"
                    value={editForm.rut}
                    onChange={(e) => setEditForm({ ...editForm, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className={'w-full rounded-xl px-3.5 py-2 text-xs font-mono border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    Correo Electrónico:
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="correo@empresa.cl"
                    className={'w-full rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    Nueva Contraseña (Opcional):
                  </label>
                  <input
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Dejar en blanco para mantener"
                    className={'w-full rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                    Rol en el Sistema:
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    disabled={editingUser && (editingUser.is_superadmin === 1 || (editingUser.name || '').toLowerCase() === 'mauricio' || (editingUser.username || '').toLowerCase() === 'mauricio')}
                    className={'w-full rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  >
                    <option value="worker">Trabajador (Solo Credencial y Horarios)</option>
                    <option value="admin">Admin (Acceso a Gestión y GPS)</option>
                  </select>
                </div>
              </div>

              <div className={'p-3 rounded-xl border flex items-center justify-between ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50/50 border-orange-100')}>
                <div>
                  <div className="text-xs font-bold">Activar Rastreo GPS Satelital</div>
                  <div className="text-[10px] text-zinc-400">Transmite coordenadas del celular en terreno</div>
                </div>
                <input
                  type="checkbox"
                  checked={editForm.gps_tracking_enabled}
                  onChange={(e) => setEditForm({ ...editForm, gps_tracking_enabled: e.target.checked })}
                  className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-black font-black text-xs rounded-xl shadow-lg shadow-orange-500/25"
                >
                  {editLoading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL CREAR NUEVO PERSONAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-md w-full p-6 shadow-2xl ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-orange-500" />
              Registrar Nuevo Personal
            </h3>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">
                  Nombre de Usuario (Para Iniciar Sesión):
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Ej: bastian, juan, nperez"
                  className={'w-full rounded-xl px-3 py-2 text-xs border font-bold ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
                <span className="text-[9px] text-zinc-400 mt-0.5 block">
                  El trabajador usará este usuario corto y su contraseña para entrar.
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">
                  Nombre Completo del Trabajador:
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Ej: Juan Carlos Pérez González"
                  className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
                <span className="text-[9px] text-zinc-400 mt-0.5 block">
                  Aparecerá en su credencial y reportes de asistencia.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">RUT (Opcional):</label>
                  <input
                    type="text"
                    value={newUser.rut}
                    onChange={(e) => setNewUser({ ...newUser, rut: e.target.value })}
                    placeholder="12.345.678-9"
                    className={'w-full rounded-xl px-3 py-2 text-xs font-mono border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">Correo (Opcional):</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="correo@empresa.cl"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">Contraseña Inicial:</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">Rol en el Sistema:</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  >
                    <option value="worker">Trabajador (Solo Credencial y Horarios)</option>
                    <option value="admin">Admin (Acceso a Gestión y GPS)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="create-gps"
                  checked={newUser.gps_tracking_enabled}
                  onChange={(e) => setNewUser({ ...newUser, gps_tracking_enabled: e.target.checked })}
                  className="w-4 h-4 accent-orange-500 rounded"
                />
                <label htmlFor="create-gps" className="text-xs font-bold text-zinc-300">
                  Habilitar Rastreo GPS para este usuario
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-zinc-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-black shadow-lg shadow-orange-500/25 cursor-pointer"
                >
                  Crear y Generar QR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VER CÓDIGO QR */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <h3 className="text-base font-black mb-1">{showQrModal.name}</h3>
            <p className="text-xs text-orange-500 font-mono font-bold mb-1">Usuario: {showQrModal.username || showQrModal.name}</p>
            <p className="text-xs text-zinc-400 font-mono mb-4">RUT: {showQrModal.rut || 'S/N'}</p>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-xl border-2 border-orange-500/30">
              <QRCodeSVG value={showQrModal.qr_token} size={180} />
            </div>

            <div className="mt-5">
              <button
                onClick={() => setShowQrModal(null)}
                className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black py-2.5 rounded-xl text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
