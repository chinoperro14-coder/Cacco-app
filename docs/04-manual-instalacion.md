# SIGEP-CACCO · Manual de instalación

## Opción A — Docker (recomendada para el ambiente de pruebas)

**Requisitos**: Docker 24+ con Docker Compose.

1. Clonar el repositorio y ubicarse en su raíz.

2. Crear el archivo `.env` en la raíz (junto a `docker-compose.yml`):

   ```env
   APP_KEY=base64:GENERAR    # ver paso 3
   DB_DATABASE=sigep_cacco
   DB_USERNAME=sigep
   DB_PASSWORD=CAMBIAR-ESTA-CLAVE
   APP_PUERTO=8080
   ```

3. Generar la clave de aplicación:

   ```bash
   docker run --rm -v ./backend:/app -w /app composer:2 sh -c \
     "composer install --no-dev -q && php artisan key:generate --show"
   ```

   Copiar el valor resultante en `APP_KEY`.

4. Construir y levantar los servicios:

   ```bash
   docker compose up -d --build
   ```

5. Ejecutar migraciones y datos iniciales (roles, permisos, oficinas,
   espacios, usuarios y datos de demostración):

   ```bash
   docker compose exec backend php artisan migrate --seed
   ```

6. Abrir **http://localhost:8080** e iniciar sesión.

### Credenciales de prueba

Todos los usuarios demo usan la contraseña `Sigep2026*cambiar`
(**cambiarla antes de cualquier uso real**):

| Correo | Rol |
|---|---|
| admin@cacco.gob.pa | Administrador General |
| direccion@cacco.gob.pa | Director |
| gestion.cultural@cacco.gob.pa | Jefe de Oficina |
| lgonzalez@cacco.gob.pa | Colaborador |
| consulta@cacco.gob.pa | Consulta (solo lectura) |

## Opción B — Instalación manual (desarrollo)

**Requisitos**: PHP 8.4+ (ext. `pdo_pgsql`), Composer 2, Node.js 20+, PostgreSQL 16.

```bash
# Base de datos
createdb sigep_cacco

# Backend
cd backend
composer install
cp .env.example .env            # ya viene configurado para PostgreSQL local
php artisan key:generate
php artisan migrate --seed
php artisan serve               # http://localhost:8000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxy /api → :8000)
```

> Para desarrollar sin PostgreSQL: en `backend/.env` usar `DB_CONNECTION=sqlite`
> y crear `backend/database/database.sqlite`. Las pruebas automatizadas ya usan
> SQLite en memoria.

## Verificación

```bash
cd backend && php artisan test   # 19 pruebas (auth, RBAC, doble reserva, flujo)
curl http://localhost:8080/up    # health check → 200
```

## Puesta en producción (lista de control)

- [ ] Cambiar TODAS las contraseñas seed y `DB_PASSWORD`.
- [ ] `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL` con el dominio real.
- [ ] Servir tras HTTPS (terminación TLS en proxy o balanceador).
- [ ] Ajustar `CORS_ALLOWED_ORIGINS` al dominio institucional.
- [ ] Programar respaldo diario de PostgreSQL (`pg_dump`) y del volumen `sigep-storage` (PDF).
- [ ] Revisar `SANCTUM_TOKEN_EXPIRATION` según la política institucional.
