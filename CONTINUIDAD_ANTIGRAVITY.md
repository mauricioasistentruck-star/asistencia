# 🧠 MEMORIA DE CONTINUIDAD ANTIGRAVITY CLOUD HUB

- **Nombre Oficial del Proyecto:** `Asistencia`
- **ID en la Nube:** `agy-asistencia`
- **Módulos / Apps incluidas:** `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`
- **Ruta en este PC (DESKTOP-MRN2CP5):** `C:\Users\User\Desktop\Asistencia`
- **Última Fecha de Modificación:** `2026-10-30 16:05:00`
- **ULTIMO_PEDIDO_USUARIO:** El panel de registro de asistencia y reportes no debe verse las marcaciones con scroll horizontal, muestra en la pantalla completa el registro individual de asistencia de todos los trabajadores.
- **ULTIMO_AVANCE_IA:** Eliminado el scroll horizontal en el panel de asistencia y reportes. Se expandió el contenedor a ancho de pantalla completo (`w-full px-2 sm:px-4 md:px-6`), se configuró la pestaña de 'Registro Individual' (`details`) como vista predeterminada, se removieron anchos mínimos rígidos (`min-w-[920px]` y anchos forzados por columna) y `whitespace-nowrap` en celdas para que las columnas se distribuyan proporcionalmente sin desbordamiento. Frontend compilado y desplegado a Render.

## 🛠️ Resumen de Implementaciones Generales Realizadas en el Proyecto
- ✓ Control de asistencia de personal con lectura de código QR y validación de coordenadas GPS en tiempo real.
- ✓ Aplicación Android compilada (ControlAsistencia.apk) con icono corporativo personalizado, protección nativa anti-captura de pantalla (anti-screenshot) y GPS activo.
- ✓ Botón integrado en el icono de la aplicación para instalar versión de escritorio para PC y empresa 'AsistenTruck' configurada por defecto.
- ✓ Soporte completo para iPhone como Web App Progresiva (iOS PWA) a pantalla completa con botón 'Link iPhone' y código QR directo.
- ✓ Doble tema visual: Tema Negro con Naranjo (Oscuro) y Tema Blanco con Naranjo (Claro) con botón selector Sol ☀️ / Luna 🌙 en la barra superior.
- ✓ Scripts automatizados para computador: iniciar_servidor.bat (backend), iniciar_web_pc.bat (navegador local) e iniciar_servidor_nube_publica.bat (enlace HTTPS público).
- ✓ Sistema de cuentas y roles preconfigurados: Super Administrador protegido (Mauricio Chamorro) y cuentas de personal con monitoreo GPS (Bastián Soto, Nicolás Chamorro, Juan Poblete).
- ✓ Empaquetado y respaldo completo del proyecto para continuidad entre múltiples equipos con Antigravity.
- ✓ Último requerimiento trabajado: "Permitir al SuperAdmin generar ingresos de asistencia cualquier día del mes sin requerir que otro usuario marque inicio de jornada, modificar horas sin registros de cambios en Excel ni avisos/alertas de modificaciones, y subir inmediatamente a Render."

## 📂 Últimos Archivos Trabajados (Punto Exacto donde se dejó el proyecto)
- `server\public\index.html (Modificado: 30-10-2026 16:00)`
- `client\src\components\AdminAttendanceView.jsx (Modificado: 30-10-2026 16:00)`
- `server\uploads\leaves\licencia_test_cloud_restore.jpeg (Modificado: 30-10-2026 15:59)`
- `server\uploads\leaves\licencia_1788500281286_u1.pdf (Modificado: 30-10-2026 15:59)`
- `server\uploads\leaves\licencia_1788500189403_u1.pdf (Modificado: 30-10-2026 15:59)`
- `server\uploads\user_bastian.svg (Modificado: 30-10-2026 15:58)`
- `server\public\silver-metal-card.png (Modificado: 30-10-2026 15:58)`
- `client\android\app\src\main\res\drawable-land-hdpi\splash.png (Modificado: 30-10-2026 15:57)`

## 🤖 Instrucción Automática para Antigravity AI
Cuando el usuario pida trabajar o continuar este proyecto (`Asistencia` o cualquiera de sus módulos: `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`):
1. Reconoce inmediatamente la carpeta `C:\Users\User\Desktop\Asistencia` como el directorio activo de trabajo.
2. Revisa las implementaciones generales ya realizadas, los últimos archivos modificados y el último pedido del usuario para retomar exactamente desde la última parte en que el usuario lo dejó, sin empezar desde cero.
