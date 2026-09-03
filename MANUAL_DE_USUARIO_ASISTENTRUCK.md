# Manual de OperaciÃ³n y Manejo Integral
## Sistema de Control de Asistencia, Rutas y ComunicaciÃ³n â€” AsistenTruck
### Inversiones Botam SpA

Bienvenido al manual oficial de usuario de **AsistenTruck**. Este documento ha sido diseÃ±ado paso a paso para que cualquier persona, sin importar si nunca antes ha utilizado el programa o si no tiene conocimientos tÃ©cnicos previos, pueda comprender, dominar y operar todas las funciones del sistema con total fluidez y seguridad.

---

## Ãndice General

1. [VisiÃ³n General y Roles del Sistema](#1-visiÃ³n-general-y-roles-del-sistema)
2. [Acceso al Sistema e Inicio de SesiÃ³n](#2-acceso-al-sistema-e-inicio-de-sesiÃ³n)
3. [Modo Kiosco: Reloj Control y EscÃ¡ner de Entrada/Salida](#3-modo-kiosco-reloj-control-y-escÃ¡ner-de-entradasalida)
4. [Credencial Digital del Trabajador](#4-credencial-digital-del-trabajador)
5. [Panel de Control de Asistencia y Reportes (Administrador)](#5-panel-de-control-de-asistencia-y-reportes-administrador)
6. [GestiÃ³n de Personal y Credenciales QR (Administrador)](#6-gestiÃ³n-de-personal-y-credenciales-qr-administrador)
7. [SupervisiÃ³n GPS y Rutas en Terreno (Administrador)](#7-supervisiÃ³n-gps-y-rutas-en-terreno-administrador)
8. [Historial de Rutas Guardadas y AuditorÃ­a de Recorridos](#8-historial-de-rutas-guardadas-y-auditorÃ­a-de-recorridos)
9. [Radio Radial Walkie-Talkie Push-to-Talk (PTT)](#9-radio-radial-walkie-talkie-push-to-talk-ptt)
10. [Preguntas Frecuentes y GuÃ­a RÃ¡pida de SoluciÃ³n de Problemas](#10-preguntas-frecuentes-y-guÃ­a-rÃ¡pida-de-soluciÃ³n-de-problemas)

---

## 1. VisiÃ³n General y Roles del Sistema

**AsistenTruck** es una plataforma tecnolÃ³gica integral diseÃ±ada para optimizar la gestiÃ³n de jornadas laborales, control biomÃ©trico de asistencia mediante cÃ³digos QR seguros, supervisiÃ³n logÃ­stica de flota en terreno y comunicaciÃ³n radial instantÃ¡nea.

### Perfiles de OperaciÃ³n
El sistema cuenta con tres tipos de perfiles segÃºn la tarea que desempeÃ±a cada persona:

1. **Trabajador / Conductor en Terreno:**
   - Cuenta con su **Credencial Digital** en su telÃ©fono mÃ³vil.
   - Presenta su cÃ³digo QR ante el Kiosco de la empresa al llegar y salir.
   - Visualiza en tiempo real el registro de sus marcaciones del dÃ­a.
   - Puede comunicarse con la central y sus compaÃ±eros mediante el canal de audio radial (Walkie-Talkie).
2. **Puesto de Control Kiosco (Tablet / EstaciÃ³n Fija):**
   - Dispositivo instalado en el acceso de la empresa o taller.
   - Funciona como reloj control continuo con reloj sincronizado oficial de Chile.
   - Escanea automÃ¡ticamente las credenciales QR de los colaboradores a travÃ©s de su cÃ¡mara de video.
3. **Administrador Operacional:**
   - Supervisa el cumplimiento de jornadas, atrasos, inasistencias y horas extras.
   - Consulta y exporta informes consolidados en planillas Excel (.xlsx) o formato de impresiÃ³n.
   - Administra la nÃ³mina de trabajadores y genera sus credenciales QR.
   - Supervisa en un mapa satelital la posiciÃ³n de la flota en terreno y archiva los recorridos realizados.

---

## 2. Acceso al Sistema e Inicio de SesiÃ³n

Para ingresar a AsistenTruck, abra el navegador web (Google Chrome, Microsoft Edge o Safari en iPhone/iPad) o abra la aplicaciÃ³n instalada en su dispositivo mÃ³vil.

![Pantalla Principal de Inicio de SesiÃ³n](manual_imagenes/01_login_view.png)

### Elementos de la Pantalla de Acceso:
1. **IdentificaciÃ³n Institucional:** Encabezado con el logotipo oficial de AsistenTruck y la razÃ³n social *Inversiones Botam SpA*.
2. **Campo USUARIO:** Ingrese su nombre de usuario asignado (ejemplo: `juanpoblete`, `borisaguirre` o `kiosco`).
3. **Campo CONTRASEÃ‘A:** Ingrese su clave de seguridad confidencial.
4. **BotÃ³n "Ingresar al Sistema":** Valida sus credenciales y lo redirige automÃ¡ticamente a la vista correspondiente a su perfil.
5. **Acceso Directo "Kiosco":** Ubicado en la esquina superior derecha, permite ingresar de inmediato al mÃ³dulo de reloj control para la tablet de porterÃ­a sin necesidad de tipear contraseÃ±as en cada turno.
6. **GuÃ­a "iPhone":** Muestra instrucciones grÃ¡ficas para anclar la aplicaciÃ³n directamente a la pantalla de inicio de telÃ©fonos Apple (Safari).
7. **Selector de Tema (Sol/Luna):** Permite alternar entre Modo Oscuro (alto contraste para noche) y Modo Claro.

---

## 3. Modo Kiosco: Reloj Control y EscÃ¡ner de Entrada/Salida

El **Modo Kiosco** es la estaciÃ³n central de marcaciÃ³n ubicada en las dependencias de la empresa.

![Puesto Kiosco de MarcaciÃ³n con Reloj Control y CÃ¡mara Activa](manual_imagenes/03_kiosk_view.png)

### Â¿CÃ³mo marcar asistencia paso a paso?

#### Paso 1: Seleccione el Tipo de MarcaciÃ³n
En la parte inferior de la pantalla, toque el botÃ³n correspondiente a la acciÃ³n que va a realizar:
- **Entrada:** Al comenzar su turno o jornada laboral matutina.
- **Sal. Col. (Salida a ColaciÃ³n):** Al salir a su horario de almuerzo o colaciÃ³n.
- **Ent. Col. (Entrada de ColaciÃ³n):** Al regresar de su colaciÃ³n para reanudar labores.
- **Salida:** Al terminar definitivamente su turno o jornada de trabajo.

> [!TIP]
> El botÃ³n seleccionado se iluminarÃ¡ con un contorno de color esmeralda/naranja brillante, confirmando quÃ© marcaciÃ³n se encuentra activa.

#### Paso 2: Presente su Credencial QR
- Encienda la pantalla de su telÃ©fono con su Credencial Digital abierta, o bien muestre su credencial plÃ¡stica fÃ­sica.
- Coloque el cÃ³digo QR a una distancia de entre 15 a 30 centÃ­metros frente al recuadro de la cÃ¡mara.
- El sistema emitirÃ¡ un sonido de confirmaciÃ³n, mostrarÃ¡ en pantalla la fotografÃ­a y el nombre del trabajador con un mensaje de Ã©xito en verde (ej: *"Entrada registrada exitosamente: 08:02 hrs"*), y actualizarÃ¡ inmediatamente la base de datos central.

### CaracterÃ­sticas Especiales del Modo Kiosco:
- **Reloj Digital Oficial:** Muestra la hora exacta, minutos, segundos y fecha completa en la zona horaria legal de Chile continental (`America/Santiago`).
- **Alternar CÃ¡mara:** Botones para seleccionar entre *"CÃ¡mara Delantera"* (frontal) y *"CÃ¡mara Trasera"*, adaptÃ¡ndose a cualquier base o soporte de tablet.
- **Modo de Ahorro y SuspensiÃ³n Inteligente:** Tras 5 minutos sin actividad de personas frente al kiosco, la pantalla entra en reposo para preservar la baterÃ­a de la tablet, reactivÃ¡ndose de forma ultra-rÃ¡pida en cuanto una persona aproxima su telÃ©fono.
- **Modo Kiosco Protegido:** Bloquea la navegaciÃ³n externa para evitar que personas no autorizadas cierren el reloj control.

---

## 4. Credencial Digital del Trabajador

Cada colaborador tiene acceso a su propia credencial digital personalizada en su telÃ©fono mÃ³vil.

![Credencial Digital Individual del Trabajador](manual_imagenes/02_worker_credential.png)

### Contenido de la Credencial:
1. **Cabecera Oficial:** Logotipo de AsistenTruck e insignia identificatoria de rol (**PERSONAL**).
2. **FotografÃ­a de Perfil / Avatar:** Muestra la foto oficial o las iniciales del trabajador.
3. **Nombre y RUT:** IdentificaciÃ³n completa del trabajador (ejemplo: *Juan Poblete*).
4. **CÃ³digo QR Oficial e Intransferible:** Generado de forma dinÃ¡mica y segura para ser leÃ­do por el Kiosco.
5. **Panel "MARCACIONES DE HOY":**
   Permite al trabajador verificar al instante sus 4 hitos del dÃ­a:
   - **ENTRADA:** Hora exacta de inicio (ej: `08:00`).
   - **SAL. COL.:** Salida a colaciÃ³n (ej: `13:00`).
   - **ENT. COL.:** Regreso de colaciÃ³n (ej: `14:00`).
   - **SALIDA:** TÃ©rmino de jornada (ej: `18:00`).
6. **BotÃ³n Radial "Audio":** Permite al trabajador acceder directamente al canal de Walkie-Talkie para comunicarse por voz con la central de operaciones.

---

## 5. Panel de Control de Asistencia y Reportes (Administrador)

El mÃ³dulo de **Asistencia y Reportes** es el centro neurÃ¡lgico donde la jefatura de operaciones y administraciÃ³n supervisa la puntualidad y cumplimiento de todos los colaboradores.

![Panel de Asistencia y Reportes Consolidados](manual_imagenes/04_admin_attendance_panel.png)

### 1. Indicadores Clave en Tiempo Real (Tarjetas Superiores)
- **HORAS TRABAJADAS:** Horas y minutos totales acumulados efectivamente por el equipo en el perÃ­odo seleccionado.
- **TOTAL ATRASOS:** Minutos totales acumulados por ingresos posteriores al horario de tolerancia oficial.
- **HORAS EXTRAS:** Tiempo laborado que sobrepasa la jornada ordinaria legal pactada.
- **DÃAS LABORALES:** Total de dÃ­as hÃ¡biles transcurridos dentro del rango de fechas bajo anÃ¡lisis.

### 2. Barra de Accesos RÃ¡pidos y Selector de Fechas
En lugar de tener que ingresar manualmente fechas en un calendario, el administrador dispone de botones de un solo toque:
- **[Hoy]:** Filtra inmediatamente la jornada en curso.
- **[Ayer]:** Muestra el dÃ­a anterior completo para auditorÃ­a de cierre.
- **[Ãšltimos 7 DÃ­as]:** Despliega el consolidado semanal.
- **[Este Mes]:** Calcula la totalidad del mes en curso listo para liquidaciones.
- **Selectores "Desde Fecha" y "Hasta Fecha":** Permiten definir cualquier intervalo histÃ³rico personalizado.

### 3. Tabla de Resumen Consolidado por Trabajador
Cada trabajador figura con sus indicadores consolidados:
- **Trabajador:** Nombre y correo electrÃ³nico registrado.
- **RUT:** CÃ©dula de identidad oficial.
- **DÃ­as Asistidos:** Conteo de jornadas en las que el colaborador marcÃ³ asistencia.
- **DÃ­as No Marcados (Inasistencias):** Marcado en rojo con alerta visible (ej: `1 dÃ­as faltantes`), identificando de inmediato si un colaborador faltÃ³ o no registrÃ³ marcaciÃ³n en un dÃ­a laboral.
- **Atrasos:** Minutos exactos de demora acumulada.
- **Horas Extras:** Horas adicionales generadas.
- **Total Horas:** Sumatoria exacta en formato `Xh YYm`.
- **BotÃ³n "Ver / Editar":** Permite al administrador revisar el detalle o regularizar incidencias justificadas (como licencias mÃ©dicas o permisos con goce de sueldo).

### 4. Herramientas de ExportaciÃ³n
- **[Descargar Excel]:** Genera un archivo `.xlsx` estructurado y compatible con Microsoft Excel, Google Sheets y LibreOffice, listo para RRHH y contabilidad.
- **[Imprimir Reporte]:** Abre la vista optimizada de impresiÃ³n para generar un PDF formal o imprimir fÃ­sicamente en papel con membrete institucional.

---

## 6. GestiÃ³n de Personal y Credenciales QR (Administrador)

Este mÃ³dulo permite dar de alta, modificar y organizar las fichas del equipo humano de la empresa.

![MÃ³dulo de GestiÃ³n de Personal y Tarjetas QR](manual_imagenes/05_admin_workers_panel.png)

### Funcionalidades Disponibles:
1. **Crear Nuevo Usuario:** Mediante el botÃ³n naranja superior `+ Crear Nuevo Usuario`, se abre el formulario para ingresar:
   - Nombre completo.
   - CÃ©dula de Identidad (RUT).
   - Nombre de usuario para inicio de sesiÃ³n.
   - Cargo u ocupaciÃ³n dentro de la empresa.
   - Rol del sistema (**TRABAJADOR** o **ADMIN**).
   - ContraseÃ±a de acceso.
2. **Tarjetas de Personal:** Cada colaborador dispone de una tarjeta con su nombre, usuario, RUT y correo.
3. **BotÃ³n "Ver Credencial QR":** Abre en pantalla completa la credencial del trabajador para que pueda ser fotografiada, descargada o impresa en PVC/papel para entrega fÃ­sica.
4. **Iconos de EdiciÃ³n (LÃ¡piz):** Permite actualizar datos personales, restablecer contraseÃ±as o modificar cargos en cualquier momento.

---

## 7. SupervisiÃ³n GPS y Rutas en Terreno (Administrador)

Permite visualizar la ubicaciÃ³n geogrÃ¡fica de los conductores y cuadrillas en terreno sobre un mapa de alta precisiÃ³n satelital y de calles.

![SupervisiÃ³n GPS y Control de Flota en Terreno](manual_imagenes/06_admin_gps_tracking.png)

### Â¿CÃ³mo supervisar y registrar un recorrido?

1. **Panel Superior de Colaboradores ("Personal en Terreno"):**
   - Muestra las fichas de todos los trabajadores disponibles.
   - Al hacer **un clic sobre un trabajador**, el mapa se auto-centra inmediatamente en su posiciÃ³n satelital y se activa el monitoreo de su ubicaciÃ³n.
   - Al presionar **nuevamente sobre el mismo trabajador**, se desactiva el rastreo de ese colaborador de manera inmediata.
2. **Capas del Mapa:**
   - BotÃ³n **[Calles / SatÃ©lite]**: Alterna entre la vista cartogrÃ¡fica de calles y la vista satelital fotogrÃ¡fica en alta resoluciÃ³n.
   - BotÃ³n **[Mi UbicaciÃ³n]**: Centra la vista en el punto actual del administrador.
   - BotÃ³n **[Actualizar]**: Refresca instantÃ¡neamente las coordenadas transmitidas.
3. **Control y Registro de Rutas en Terreno:**
   - En el panel inferior del mapa, el administrador puede iniciar el trazado de un viaje mediante **[Comenzar Ruta]**.
   - El sistema calcularÃ¡ la distancia recorrida en kilÃ³metros, velocidad media y trazarÃ¡ la polilÃ­nea exacta ajustada a las vÃ­as de trÃ¡nsito.
   - Al finalizar el recorrido, presione **[Guardar Ruta]** para archivar la auditorÃ­a en la base de datos histÃ³rica.

---

## 8. Historial de Rutas Guardadas y AuditorÃ­a de Recorridos

El sistema cuenta con un archivo histÃ³rico donde se guardan todos los viajes y trayectos finalizados para respaldar servicios a clientes y auditorÃ­as operacionales.

![Historial de Rutas Archivadas en Terreno](manual_imagenes/07_admin_routes_history.png)

### CaracterÃ­sticas del Historial:
- **Selector de Fecha:** Permite buscar y consultar recorridos archivados de cualquier dÃ­a del aÃ±o.
- **Detalle de la Ruta:** Muestra el nombre del conductor o vehÃ­culo, hora de inicio, hora de tÃ©rmino, distancia total recorrida en kilÃ³metros (km) y cantidad de puntos GPS registrados.
- **VisualizaciÃ³n en Mapa:** Al seleccionar una ruta archivada, el sistema dibuja sobre el mapa satelital el camino exacto que transitÃ³ el camiÃ³n o vehÃ­culo, permitiendo verificar paradas, desvÃ­os y tiempos de traslado.

---

## 9. Radio Radial Walkie-Talkie Push-to-Talk (PTT)

AsistenTruck integra un sistema de radiocomunicaciÃ³n por voz en tiempo real que funciona a travÃ©s de Internet (4G, 5G y Wi-Fi), permitiendo a conductores y supervisores comunicarse sin depender de nÃºmeros telefÃ³nicos tradicionales.

![Sistema de Radio Walkie-Talkie Push-to-Talk](manual_imagenes/08_walkie_talkie_chat.png)

### Â¿CÃ³mo transmitir un mensaje de voz?

#### OpciÃ³n A: TransmisiÃ³n con 1 Clic (Modo Manos Libres)
1. Abra el canal de voz presionando el botÃ³n superior **[Audio]**.
2. Seleccione a los destinatarios (puede marcar **[Todos]** para hablar por el Canal General o seleccionar personas especÃ­ficas).
3. Presione una vez el botÃ³n circular central **[HABLAR (1 CLIC)]**: el botÃ³n se iluminarÃ¡ y comenzarÃ¡ a capturar su voz.
4. Al terminar de hablar, presione nuevamente el botÃ³n para enviar la transmisiÃ³n de inmediato.

#### OpciÃ³n B: Mantener Presionado (Modo Radio Tradicional)
- Mantenga su dedo presionado sobre el botÃ³n naranja central mientras habla.
- Al soltar el dedo, la transmisiÃ³n se envÃ­a al instante al receptor.

### PestaÃ±a "Chat de Audios":
- Guarda el historial de notas de voz recibidas y enviadas durante el turno, permitiendo reproducirlas cuantas veces sea necesario en caso de haber estado conduciendo o realizando maniobras en el momento de la transmisiÃ³n.

---

## 10. Preguntas Frecuentes y GuÃ­a RÃ¡pida de SoluciÃ³n de Problemas

### 1. Â¿QuÃ© debo hacer si el escÃ¡ner del Kiosco no lee mi cÃ³digo QR?
- **Brillo de la pantalla:** AsegÃºrese de que el brillo de su telÃ©fono celular estÃ© al 80% o mÃ¡s.
- **Distancia:** Mantenga el telÃ©fono firme a unos 20 cm de la cÃ¡mara, sin moverlo rÃ¡pidamente.
- **Reflejos:** Evite que luces directas o el sol den de frente a la pantalla de su telÃ©fono.

### 2. Â¿CÃ³mo instalar AsistenTruck como una aplicaciÃ³n en iPhone?
1. Abra el enlace web en el navegador **Safari**.
2. Toque el botÃ³n de **Compartir** de Safari (el Ã­cono del cuadrado con una flecha hacia arriba).
3. Desplace hacia abajo y elija **"Agregar a pantalla de inicio"**.
4. Toque **"Agregar"**. La aplicaciÃ³n quedarÃ¡ guardada como un Ã­cono en su pantalla con acceso a pantalla completa y soporte de audio.

### 3. Â¿QuÃ© ocurre si un trabajador olvida marcar su salida?
El administrador puede ingresar al mÃ³dulo de **Asistencia**, ubicar la fila del colaborador en el dÃ­a correspondiente, presionar el botÃ³n **Ver / Editar** y registrar administrativamente la hora de salida correspondiente, aÃ±adiendo una nota explicativa para respaldo de la empresa.

### 4. Â¿El sistema funciona sin conexiÃ³n a Internet?
El Kiosco y la app mÃ³vil estÃ¡n optimizados para operar con redes mÃ³viles estÃ¡ndar. En caso de microcortes temporales de seÃ±al, el sistema retiene los estados en memoria y sincroniza automÃ¡ticamente las marcaciones en cuanto se restablece la conectividad.

---
*Manual de Usuario Oficial â€” AsistenTruck | Inversiones Botam SpA â€” Todos los derechos reservados.*
