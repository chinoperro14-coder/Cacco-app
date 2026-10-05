# SIGEP-CACCO · Manual técnico

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Laravel 13 (PHP 8.4+), API REST `/api/v1` |
| Autenticación | Laravel Sanctum (tokens Bearer con expiración) |
| Frontend | Vue 3 + Vite + Pinia + Vue Router (SPA, modo claro) |
| Base de datos | PostgreSQL 16 (SQLite para desarrollo/pruebas) |
| Contenedores | Docker Compose (db + backend php-fpm + frontend nginx) |

## Estructura del repositorio

```
├── backend/                 # API Laravel
│   ├── app/
│   │   ├── Http/Controllers/Api/   # 14 controladores REST
│   │   ├── Http/Middleware/CheckPermission.php   # alias "permiso"
│   │   ├── Models/                 # 12 modelos (soft delete + Auditable)
│   │   ├── Services/ReservaService.php           # control doble reserva
│   │   ├── Events/ y Listeners/    # comunicación entre módulos
│   │   └── Support/                # Auditable, GeneradorCodigo
│   ├── database/migrations/        # 12 migraciones de dominio
│   ├── database/seeders/           # roles+permisos, catálogos, usuarios, demo
│   ├── routes/api.php              # todas las rutas y sus permisos
│   └── tests/Feature/              # 19 pruebas
├── frontend/
│   └── src/
│       ├── api.js                  # axios + interceptores de token
│       ├── stores/auth.js          # sesión + verificación de permisos (UI)
│       ├── router/index.js         # guardias por permiso
│       ├── components/             # AppLayout (menú dinámico, campana, búsqueda)
│       └── views/                  # 10 vistas (una por módulo)
├── docker/                         # Dockerfiles + nginx.conf
├── docker-compose.yml
└── docs/                           # esta documentación
```

## Flujo de una petición protegida

```
SPA → Authorization: Bearer <token>
  → auth:sanctum        (token válido y no expirado)
  → permiso:<clave>     (CheckPermission: rol activo + permiso RBAC)
  → Controller          (validación de entrada con reglas Laravel)
  → Service / Model     (lógica de negocio, transacciones)
  → Auditable           (registro automático en audit_logs)
  → JSON
```

## Puntos clave de implementación

### Control de doble reserva (`app/Services/ReservaService.php`)

```php
Reserva::activas()                       // ignora canceladas
    ->where('espacio_id', $espacioId)
    ->whereDate('fecha', $fecha)
    ->where('hora_inicio', '<', $horaFin)
    ->where('hora_fin', '>', $horaInicio)
    ->lockForUpdate()                    // dentro de DB::transaction
```

Se ejecuta al crear/actualizar reservas y al programar actividades con
espacio. Lanza `ValidationException` (HTTP 422) con mensaje claro que incluye
el código de la reserva en conflicto.

### Códigos institucionales (`app/Support/GeneradorCodigo.php`)

Secuencia `codigos(prefijo, anio, ultimo)` incrementada bajo `lockForUpdate()`
dentro de transacción → `SOL-2026-0001`, sin huecos por concurrencia.

### Auditoría (`app/Support/Auditable.php`)

Trait aplicado a todos los modelos de negocio. Registra `creacion | edicion |
eliminacion` con diffs (`valores_anteriores` / `valores_nuevos`), usuario, IP,
user-agent y módulo. Filtra campos sensibles (`password`, `remember_token`).
Acciones de flujo (aprobación, rechazo, asignación, cierre, login…) se
registran explícitamente vía `AuditLog::registrar()`.

### RBAC

- Catálogo de permisos con clave `modulo.accion` en `permissions`.
- `CheckPermission` exige usuario `activo` + permiso del rol. Nada depende del frontend.
- El frontend recibe `permisos[]` en el login y construye menú/botones; es
  solo presentación.

### Bloqueo por fuerza bruta (`AuthController`)

`throttle:5,1` por IP en la ruta + contador `intentos_fallidos` por cuenta;
al 5.º fallo se fija `bloqueado_hasta = now()+15min` (HTTP 423 mientras dure).

## Pruebas

```bash
cd backend && php artisan test
```

Cobertura funcional: login correcto/incorrecto, bloqueo de cuenta, usuario
inactivo, RBAC por rol (incluida pérdida de acceso al suspender), doble
reserva (4 tipos de solapamiento, reservas contiguas, liberación al cancelar,
consulta de disponibilidad) y flujo de solicitudes (tarea automática,
notificación de aprobación, transiciones inválidas, aislamiento por usuario).
Las pruebas corren sobre SQLite en memoria (`phpunit.xml`).

## Tareas de mantenimiento

| Tarea | Comando |
|---|---|
| Limpiar tokens expirados | `php artisan sanctum:prune-expired --hours=24` (programable en `routes/console.php`) |
| Respaldo BD | `pg_dump -Fc sigep_cacco > respaldo.dump` |
| Respaldo documentos | volumen Docker `sigep-storage` (`storage/app/documentos/`) |
| Logs de aplicación | `backend/storage/logs/laravel.log` |

## Cómo agregar un módulo nuevo (patrón)

1. Migración + modelo con `Auditable` + `SoftDeletes` (+ prefijo en `GeneradorCodigo` si lleva código).
2. Permisos `nuevo.ver` / `nuevo.gestionar` en `RolesPermisosSeeder`.
3. Controlador en `app/Http/Controllers/Api` + rutas con middleware `permiso:`.
4. Eventos/listeners si interactúa con tareas o notificaciones.
5. Vista Vue + entrada en `MENU` (AppLayout) y ruta con `meta.permiso`.
6. Pruebas de la regla de negocio principal.
