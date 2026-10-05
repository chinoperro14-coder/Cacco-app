# SIGEP-CACCO · Documentación de la API REST

Base: `/api/v1` · Formato: JSON · Autenticación: `Authorization: Bearer <token>` (Laravel Sanctum).

Convenciones:

- Listados devuelven paginación Laravel (`data`, `current_page`, `last_page`, `total`, …) y aceptan `per_page` y `page`.
- Errores de validación responden **422** con `{ message, errors: { campo: [mensajes] } }`.
- Sin token → **401** · Sin permiso o usuario no activo → **403** · Cuenta bloqueada → **423**.

## Autenticación

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público (throttle 5/min) | Body: `email`, `password`. Devuelve `token`, `expira_en`, `usuario` (con `permisos[]`) |
| POST | `/auth/logout` | autenticado | Revoca el token actual |
| POST | `/auth/renovar` | autenticado | Emite token nuevo y revoca el anterior |
| GET | `/auth/me` | autenticado | Perfil + permisos del usuario actual |

## Dashboard, calendario, búsqueda y notificaciones

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/dashboard` | `dashboard.ver` | Indicadores: solicitudes activas/cerradas, actividades programadas, espacios ocupados, tareas pendientes, usuarios activos, próximas actividades |
| GET | `/calendario?desde&hasta&oficina_id&espacio_id&responsable_id` | `calendario.ver` | Eventos unificados (actividades + reservas + mantenimientos) |
| GET | `/buscar?q=` | autenticado | Búsqueda global por código/título en los módulos autorizados |
| GET | `/notificaciones` | autenticado | `{ no_leidas, notificaciones[] }` |
| POST | `/notificaciones/{id}/leida` | autenticado | Marca una notificación |
| POST | `/notificaciones/leidas` | autenticado | Marca todas |

## Usuarios, oficinas, roles

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/usuarios?buscar&estado&oficina_id` | `usuarios.ver` |
| GET | `/usuarios/{id}` | `usuarios.ver` |
| POST/PUT/DELETE | `/usuarios…` | `usuarios.gestionar` (DELETE = baja lógica) |
| GET/POST/PUT/DELETE | `/oficinas…` | `usuarios.gestionar` |
| GET | `/roles` | `roles.gestionar` — devuelve `{ roles[], permisos[] }` |
| POST/PUT/DELETE | `/roles…` | `roles.gestionar` — body: `nombre`, `descripcion`, `permisos[]` (IDs) |

## Solicitudes

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/solicitudes?estado&tipo&prioridad&buscar` | `solicitudes.ver` | Sin `solicitudes.gestionar` solo ve las propias |
| POST | `/solicitudes` | `solicitudes.crear` | `tipo`, `titulo`, `descripcion`, `prioridad`, `estado` (`borrador`\|`pendiente`). Estado `pendiente` genera tarea automática |
| GET | `/solicitudes/{id}` | `solicitudes.ver` | Incluye tareas asociadas |
| PUT | `/solicitudes/{id}` | `solicitudes.crear` | Solo en `borrador`/`pendiente` |
| POST | `/solicitudes/{id}/estado` | ver nota | Body: `estado`, `observaciones`. Transiciones válidas: borrador→pendiente→en_revision→aprobada/rechazada→ejecutada→cerrada. Enviar borrador propio no exige gestión; el resto sí (`solicitudes.gestionar`) |
| DELETE | `/solicitudes/{id}` | `solicitudes.crear` | Borradores propios (o gestión) |

## Actividades

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/actividades?estado&tipo&espacio_id&desde&hasta&buscar` | `actividades.ver` | |
| POST | `/actividades` | `actividades.gestionar` | Si lleva `espacio_id`, crea reserva validada (**422 si hay conflicto de horario**) |
| PUT | `/actividades/{id}` | `actividades.gestionar` | Cambios de agenda re-validan la reserva |
| DELETE | `/actividades/{id}` | `actividades.gestionar` | Cancela sus reservas |

## Espacios y reservas

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/espacios?estado&tipo&buscar` | `espacios.ver` | |
| POST/PUT/DELETE | `/espacios…` | `espacios.gestionar` | |
| GET | `/reservas?espacio_id&estado&desde&hasta` | `reservas.ver` | |
| POST | `/reservas/disponibilidad` | `reservas.ver` | Body: `espacio_id`, `fecha`, `hora_inicio`, `hora_fin` → `{ disponible, message? }` |
| POST | `/reservas` | `reservas.gestionar` | **Control de doble reserva**: 422 con mensaje claro si el espacio ya está ocupado ese día con horario superpuesto |
| PUT | `/reservas/{id}` | `reservas.gestionar` | Cancelar una reserva ajena notifica a su dueño |
| DELETE | `/reservas/{id}` | `reservas.gestionar` | Cancela (soft delete) |

## Tareas

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/tareas?estado&prioridad&todas` | `tareas.ver` | Bandeja personal; `todas=1` requiere `tareas.gestionar` |
| POST | `/tareas` | `tareas.gestionar` | Asignar; notifica al responsable |
| PUT | `/tareas/{id}` | `tareas.ver` (propia) | Cambiar estado/avance; reasignación audita y notifica |
| DELETE | `/tareas/{id}` | `tareas.gestionar` | Cancela |

## Documentos

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/documentos?tipo&estado&buscar` | `documentos.ver` | |
| POST | `/documentos` | `documentos.gestionar` | `multipart/form-data` con `archivo` (PDF ≤ 20 MB) → crea versión 1 |
| GET | `/documentos/{id}` | `documentos.ver` | Incluye historial de versiones |
| POST | `/documentos/{id}/versiones` | `documentos.gestionar` | Sube versión nueva; **nunca sobrescribe** |
| GET | `/documentos/{id}/versiones/{n}/descargar` | `documentos.ver` | Descarga el PDF de la versión n |
| PUT | `/documentos/{id}` | `documentos.gestionar` | Metadatos/estado |
| DELETE | `/documentos/{id}` | `documentos.gestionar` | Archiva (baja lógica) |

## Auditoría

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/auditoria?modulo&accion&user_id&desde&hasta` | `auditoria.ver` | Bitácora paginada |
| GET | `/auditoria/historial?tipo&id` | `auditoria.ver` | Historial completo de un registro (`tipo` = alias morph: `solicitud`, `usuario`, …) |

## Ejemplo

```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@cacco.gob.pa","password":"Sigep2026*cambiar"}'

# Crear reserva (con token)
curl -X POST http://localhost:8080/api/v1/reservas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"espacio_id":1,"fecha":"2026-08-01","hora_inicio":"10:00","hora_fin":"12:00","motivo":"Ensayo"}'
```
