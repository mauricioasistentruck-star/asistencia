# 🧠 MEMORIA DE CONTINUIDAD ANTIGRAVITY CLOUD HUB

- **Nombre Oficial del Proyecto:** `Asistencia`
- **ID en la Nube:** `agy-asistencia`
- **Módulos / Apps incluidas:** `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`
- **Ruta en este PC (DESKTOP-MRN2CP5):** `C:\Users\User\Desktop\Asistencia`
- **Última Fecha de Modificación:** `2026-10-30 16:50:00`
- **ULTIMO_PEDIDO_USUARIO:** Activar un botón en el menú de perfil del usuario SuperAdmin exclusivo donde se pueda activar o desactivar la acción de modificar y generar asistencias a voluntad; si está desactivada, ocultar todos los botones de editar, eliminar y generar asistencias (solo visibles cuando esté activa desde su perfil, no en ningún otro perfil).
- **ULTIMO_AVANCE_IA:** Implementado interruptor táctil exclusivo para SuperAdmin en el menú de perfil (`Navbar.jsx`). Controla reactivamente el permiso `canEditAttendance` guardado en localStorage y emitido por CustomEvent. Cuando está desactivado, oculta de forma estricta los botones '+ Generar Asistencia' (barra superior), 'Crear' (inasistencias), 'Editar' (marcaciones y justificadas) y 'Eliminar' (basurero), además de proteger los handlers frente a invocaciones no autorizadas. Ningún otro rol ni perfil tiene acceso a este control. Frontend compilado y desplegado.

## 🛠️ Resumen de Implementaciones Generales Realizadas en el Proyecto
- ✓ Control de asistencia de personal con lectura de código QR y validación de coordenadas GPS en tiempo real.
- ✓ Aplicación Android compilada (ControlAsistencia.apk) con icono corporativo personalizado, protección nativa anti-captura de pantalla (anti-screenshot) y GPS activo.
- ✓ Botón integrado en el icono de la aplicación para instalar versión de escritorio para PC y empresa 'AsistenTruck' configurada por defecto.
- ✓ Soporte completo para iPhone como Web App Progresiva (iOS PWA) a pantalla completa con botón 'Link iPhone' y código QR directo.
- ✓ Doble tema visual: Tema Negro con Naranjo (Oscuro) y Tema Blanco con Naranjo (Claro) con botón selector Sol ☀️ / Luna 🌙 en la barra superior.
- ✓ Scripts automatizados para computador: iniciar_servidor.bat (backend), iniciar_web_pc.bat (navegador local) e iniciar_servidor_nube_publica.bat (enlace HTTPS público).
- ✓ Sistema de cuentas y roles preconfigurados: Super Administrador protegido (Mauricio Chamorro) y cuentas de personal con monitoreo GPS (Bastián Soto, Nicolás Chamorro, Juan Poblete).
- ✓ Empaquetado y respaldo completo del proyecto para continuidad entre múltiples equipos con Antigravity.
- ✓ Último requerimiento trabajado: "El panel de registro de asistencia y reportes no debe verse las marcaciones con scroll horizontal, muestra en la pantalla completa el registro individual de asistencia de todos los trabajadores."

## 📂 Últimos Archivos Trabajados (Punto Exacto donde se dejó el proyecto)
- `server\public\index.html (Modificado: 30-10-2026 16:47)`
- `client\src\components\AdminAttendanceView.jsx (Modificado: 30-10-2026 16:46)`
- `client\android\app\capacitor.build.gradle (Modificado: 30-10-2026 16:45)`
- `server\uploads\leaves\licencia_1788579584656_u8.pdf (Modificado: 30-10-2026 16:45)`
- `client\src\components\Navbar.jsx (Modificado: 30-10-2026 16:43)`
- `server\uploads\leaves\licencia_test_cloud_restore.jpeg (Modificado: 30-10-2026 15:59)`
- `server\uploads\leaves\licencia_1788500281286_u1.pdf (Modificado: 30-10-2026 15:59)`
- `server\uploads\leaves\licencia_1788500189403_u1.pdf (Modificado: 30-10-2026 15:59)`

## 🤖 Instrucción Automática para Antigravity AI
Cuando el usuario pida trabajar o continuar este proyecto (`Asistencia` o cualquiera de sus módulos: `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`):
1. Reconoce inmediatamente la carpeta `C:\Users\User\Desktop\Asistencia` como el directorio activo de trabajo.
2. Revisa las implementaciones generales ya realizadas, los últimos archivos modificados y el último pedido del usuario para retomar exactamente desde la última parte en que el usuario lo dejó, sin empezar desde cero.
