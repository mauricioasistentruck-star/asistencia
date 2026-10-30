# 🧠 MEMORIA DE CONTINUIDAD ANTIGRAVITY CLOUD HUB

- **Nombre Oficial del Proyecto:** `Asistencia`
- **ID en la Nube:** `agy-asistencia`
- **Módulos / Apps incluidas:** `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`
- **Ruta en este PC (DESKTOP-MRN2CP5):** `C:\Users\User\Desktop\Asistencia`
- **Última Fecha de Modificación:** `2026-10-30 17:23:00`
- **ULTIMO_PEDIDO_USUARIO:** La regla de no marcar colación y registrar salida directa es para marcaciones después de las 17:45 horas de lunes a jueves (bajo ningún otro horario), y el viernes después de las 17:15 horas; y si en algún momento el horario de salida cambia, la regla siempre será exactamente 15 minutos antes de la hora de finalización de la jornada.
- **ULTIMO_AVANCE_IA:** Implementada la función `getDirectExitThresholdMinutes()` en `server/server.js`, vinculada a `cachedWorkSchedule`. Calcula el umbral exactamente 15 minutos antes de la hora oficial de salida: Lunes a Jueves a partir de las 17:45 hrs (salida oficial 18:00), y Viernes a partir de las 17:15 hrs (salida oficial 17:30). Bajo cualquier horario previo o intermedio se mantiene el ciclo regular de colación. Si el horario oficial es modificado por el SuperAdmin, el umbral se recalcula dinámicamente. Desplegado a Render.

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
- `client\android\app\src\main\java\com\asistencia\qrcontrol\MainActivity.java (Modificado: 30-10-2026 17:17)`
- `server\asistencia.db-wal (Modificado: 30-10-2026 17:17)`
- `server\asistencia.db-shm (Modificado: 30-10-2026 17:17)`
- `server\server.js (Modificado: 30-10-2026 17:17)`
- `client\android\app\src\main\AndroidManifest.xml (Modificado: 30-10-2026 17:16)`
- `client\android\app\proguard-rules.pro (Modificado: 30-10-2026 17:16)`
- `client\android\app\build.gradle (Modificado: 30-10-2026 17:16)`
- `server\public\logo.png (Modificado: 30-10-2026 16:49)`

## 🤖 Instrucción Automática para Antigravity AI
Cuando el usuario pida trabajar o continuar este proyecto (`Asistencia` o cualquiera de sus módulos: `iniciar_servidor, iniciar_servidor_nube_publica, iniciar_web_pc, ControlAsistencia, ControlAsistencia1`):
1. Reconoce inmediatamente la carpeta `C:\Users\User\Desktop\Asistencia` como el directorio activo de trabajo.
2. Revisa las implementaciones generales ya realizadas, los últimos archivos modificados y el último pedido del usuario para retomar exactamente desde la última parte en que el usuario lo dejó, sin empezar desde cero.
