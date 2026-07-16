# SIGEP-CACCO

**Sistema Integral de Gestión Pública del Centro de Arte y Cultura de Colón** — MVP v1.0

Plataforma web institucional que centraliza las operaciones internas de CACCO:
usuarios con roles y permisos (RBAC), solicitudes con flujo de aprobación,
actividades culturales, espacios físicos con **control de doble reserva**,
bandeja de tareas, gestión documental con versiones PDF, calendario
institucional, dashboard ejecutivo, notificaciones internas y **auditoría
completa** de cada acción.

## Stack

Laravel 13 + Sanctum · Vue 3 + Vite · PostgreSQL 16 · Docker Compose

## Inicio rápido (ambiente de pruebas)

```bash
# 1. Crear .env en la raíz con APP_KEY y credenciales de BD
#    (pasos detallados en docs/04-manual-instalacion.md)
docker compose up -d --build
docker compose exec backend php artisan migrate --seed
# → http://localhost:8080  (admin@cacco.gob.pa / Sigep2026*cambiar)
```

Desarrollo local sin Docker: ver [docs/04-manual-instalacion.md](docs/04-manual-instalacion.md).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/01-arquitectura.md](docs/01-arquitectura.md) | Arquitectura modular, seguridad, eventos internos, preparación futura |
| [docs/02-base-de-datos.md](docs/02-base-de-datos.md) | Modelo entidad-relación completo y decisiones de diseño |
| [docs/03-api.md](docs/03-api.md) | Referencia de la API REST `/api/v1` |
| [docs/04-manual-instalacion.md](docs/04-manual-instalacion.md) | Instalación con Docker y manual |
| [docs/05-manual-usuario.md](docs/05-manual-usuario.md) | Manual de usuario por módulo |
| [docs/06-manual-tecnico.md](docs/06-manual-tecnico.md) | Manual técnico para desarrolladores |

## Pruebas

```bash
cd backend && php artisan test   # 19 pruebas: auth, RBAC, doble reserva, flujo de solicitudes
```

## Estructura

```
backend/    API Laravel (módulos, RBAC, auditoría, eventos)
frontend/   SPA Vue 3 (menú dinámico por permisos, calendario, campana)
docker/     Dockerfiles + nginx
docs/       Documentación técnica y manuales
```

> Los archivos sueltos en la raíz (`index.html`, `app.js`, `mockup-*.html`, …)
> pertenecen al prototipo anterior y se conservan como referencia histórica.
