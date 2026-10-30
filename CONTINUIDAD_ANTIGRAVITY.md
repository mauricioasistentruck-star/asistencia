# 🧠 MEMORIA DE CONTINUIDAD ANTIGRAVITY CLOUD HUB

- **Nombre Oficial del Proyecto:** `Asistencia`
- **ID en la Nube:** `agy-asistencia`
- **Módulos / Apps incluidas:** `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`
- **Ruta en este PC (DESKTOP-MRN2CP5):** `C:\Users\User\Desktop\Asistencia`
- **Última Fecha de Modificación:** `2026-10-30 17:10:17`
- **ULTIMO_PEDIDO_USUARIO:** Si la hora de marcación de cualquier persona es cerca de las 17:45 horas, marca hora de salida; si la persona no marcó la hora de ir y volver a colación, marca solo la salida.
- **ULTIMO_AVANCE_IA:** Modificado el procesador de escaneo `/api/attendance/scan` en `server/server.js`. Si un trabajador tiene entrada previa y realiza una marcación en el horario de final de jornada cerca de las 17:45 (desde las 16:30 en adelante), el sistema registra inmediatamente la HORA DE SALIDA de la jornada (`exit_time`), sin exigir ni forzar colación. Si el trabajador no marcó ir y volver a colación, dichos campos se conservan vacíos y se calcula la jornada laboral directa entre entrada y salida. Desplegado a Render.

## 🛠️ Resumen de Implementaciones Generales Realizadas en el Proyecto
- ✓ Control de asistencia de personal con lectura de código QR y validación de coordenadas GPS en tiempo real.
- ✓ Aplicación Android compilada (ControlAsistencia.apk) con icono corporativo personalizado, protección nativa anti-captura de pantalla (anti-screenshot) y GPS activo.
- ✓ Botón integrado en el icono de la aplicación para instalar versión de escritorio para PC y empresa 'AsistenTruck' configurada por defecto.
- ✓ Soporte completo para iPhone como Web App Progresiva (iOS PWA) a pantalla completa con botón 'Link iPhone' y código QR directo.
- ✓ Doble tema visual: Tema Negro con Naranjo (Oscuro) y Tema Blanco con Naranjo (Claro) con botón selector Sol ☀️ / Luna 🌙 en la barra superior.
- ✓ Scripts automatizados para computador: iniciar_servidor.bat (backend), iniciar_web_pc.bat (navegador local) e iniciar_servidor_nube_publica.bat (enlace HTTPS público).
- ✓ Sistema de cuentas y roles preconfigurados: Super Administrador protegido (Mauricio Chamorro) y cuentas de personal con monitoreo GPS (Bastián Soto, Nicolás Chamorro, Juan Poblete).
- ✓ Empaquetado y respaldo completo del proyecto para continuidad entre múltiples equipos con Antigravity.
- ✓ Último requerimiento trabajado: "Si la hora de marcación de cualquier persona es cerca de las 17:45 horas, marca hora de salida; si la persona no marcó la hora de ir y volver a colación, marca solo la salida."

## 📂 Últimos Archivos Trabajados (Punto Exacto donde se dejó el proyecto)
- `server\server.js (Modificado: 30-10-2026 17:10)`
- `server\public\logo.png (Modificado: 30-10-2026 16:49)`
- `server\public\index.html (Modificado: 30-10-2026 16:47)`
- `client\src\components\AdminAttendanceView.jsx (Modificado: 30-10-2026 16:46)`
- `client\android\app\capacitor.build.gradle (Modificado: 30-10-2026 16:45)`
- `server\uploads\leaves\licencia_1788579584656_u8.pdf (Modificado: 30-10-2026 16:45)`
- `client\src\components\Navbar.jsx (Modificado: 30-10-2026 16:43)`
- `server\uploads\leaves\licencia_test_cloud_restore.jpeg (Modificado: 30-10-2026 15:59)`

## 🤖 Instrucción Automática para Antigravity AI
Cuando el usuario pida trabajar o continuar este proyecto (`Asistencia` o cualquiera de sus módulos: `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`):
1. Reconoce inmediatamente la carpeta `C:\Users\User\Desktop\Asistencia` como el directorio activo de trabajo.
2. Revisa las implementaciones generales ya realizadas, los últimos archivos modificados y el último pedido del usuario para retomar exactamente desde la última parte en que el usuario lo dejó, sin empezar desde cero.
