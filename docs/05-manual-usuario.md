# SIGEP-CACCO · Manual de usuario

## 1. Ingreso al sistema

1. Abra la dirección del sistema en su navegador.
2. Escriba su **correo institucional** y **contraseña**.
3. Tras 5 intentos fallidos la cuenta se bloquea por 15 minutos (medida de seguridad).
4. La sesión expira automáticamente a las 8 horas; el sistema le pedirá ingresar de nuevo.

El menú lateral muestra **solo los módulos autorizados** para su rol. Si no ve
un módulo que necesita, solicítelo al Administrador General.

## 2. Pantalla principal (Dashboard)

Indicadores en tiempo real: solicitudes activas y cerradas, actividades
programadas, espacios ocupados hoy, tareas pendientes (incluidas las suyas y
las vencidas) y usuarios activos, además de las próximas actividades.

## 3. Barra superior

- **Búsqueda global**: escriba un código (`SOL-2026-0001`) o parte de un título;
  busca en todos los módulos que usted puede ver.
- **Campana 🔔**: notificaciones internas (nueva tarea, solicitud aprobada,
  reserva cancelada, documento actualizado) con contador de pendientes.
- **Salir**: cierra la sesión de forma segura.

## 4. Solicitudes

1. **+ Nueva solicitud** → elija tipo (uso de espacio, reunión, mantenimiento,
   comunicación, transporte, equipamiento), título, descripción y prioridad.
2. Puede **enviarla a trámite** (genera automáticamente una tarea para su
   atención) o **guardarla como borrador**.
3. Siga el estado con los colores: pendiente → en revisión → aprobada /
   rechazada → ejecutada → cerrada.
4. Quien aprueba/rechaza (Director o Jefe de Oficina) usa el botón
   **Tramitar** y puede dejar observaciones; usted recibirá una notificación.

## 5. Actividades

Registre cursos, festivales, exposiciones, reuniones, talleres o programas con
fecha, horario, responsable y espacio. Al elegir espacio, el sistema **reserva
automáticamente** y **rechaza el guardado si el espacio ya está ocupado** en
ese horario, indicándole el conflicto exacto.

## 6. Espacios y reservas

- Tarjetas con capacidad, tipo y estado (disponible, reservado, mantenimiento, bloqueado).
- **Reservar**: al elegir fecha y horas el sistema verifica la disponibilidad
  al instante y le avisa si hay choque antes de guardar.
- Las reservas de tipo *mantenimiento* también bloquean el espacio.

## 7. Calendario institucional

Vista mensual con todas las actividades (azul), reservas (verde) y
mantenimientos (ámbar). Filtre por espacio, oficina o responsable y haga clic
en cualquier evento para ver su detalle.

## 8. Bandeja de tareas

Sus tareas pendientes, con origen (la solicitud o actividad que las generó),
fecha límite y prioridad. Flujo: **Iniciar** → **Completar** (o **Cancelar**).
Las tareas vencidas se marcan en rojo. Los jefes pueden asignar tareas y ver
todas las bandejas.

## 9. Documentos

- Registre cartas, memos, circulares, actas, contratos e invitaciones con su
  PDF (máximo 20 MB). El sistema asigna código automático (`DOC-2026-0001`).
- **Versiones**: para actualizar un documento suba una **nueva versión**; las
  anteriores nunca se pierden y todas pueden descargarse.

## 10. Usuarios, roles y auditoría (administradores)

- **Usuarios**: crear, editar y desactivar (la desactivación es lógica: el
  historial se conserva). Campos: usuario, nombre, correo, cargo, oficina,
  rol, estado y último acceso.
- **Roles y permisos**: cada rol define qué módulos y acciones permite; los
  permisos son configurables por módulo (ver/gestionar).
- **Auditoría**: bitácora completa — quién hizo qué, cuándo, desde qué IP y
  con qué valores anteriores/nuevos. Filtrable por módulo, acción y fechas.

## Roles estándar

| Rol | Alcance |
|---|---|
| Administrador General | Todo el sistema, incluida la configuración de roles |
| Director | Aprueba solicitudes y supervisa todos los módulos operativos |
| Jefe de Oficina | Gestiona solicitudes, actividades, reservas, tareas y documentos |
| Colaborador | Crea solicitudes, atiende su bandeja, consulta calendario y documentos |
| Consulta | Solo lectura de la información autorizada |
