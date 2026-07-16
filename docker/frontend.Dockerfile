# Frontend Vue: compilación con Node y servido estático con nginx,
# que además enruta /api hacia el backend php-fpm.
# Contexto de compilación: raíz del repositorio.
FROM node:22-alpine AS compilacion
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=compilacion /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
