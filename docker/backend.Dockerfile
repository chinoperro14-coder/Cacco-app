# Backend Laravel: php-fpm 8.4 + extensiones PostgreSQL.
# Contexto de compilación: raíz del repositorio.
FROM composer:2 AS dependencias
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --ignore-platform-reqs

FROM php:8.4-fpm-alpine

RUN apk add --no-cache postgresql-dev \
    && docker-php-ext-install pdo_pgsql opcache

WORKDIR /var/www/html

COPY --from=dependencias /app/vendor ./vendor
COPY backend/ .
COPY --from=dependencias /usr/bin/composer /usr/bin/composer

RUN composer dump-autoload --optimize \
    && mkdir -p storage/app storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

# php-fpm escucha en 9000; nginx del frontend le enruta /api.
EXPOSE 9000
CMD ["php-fpm"]
