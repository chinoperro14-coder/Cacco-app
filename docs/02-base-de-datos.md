# SIGEP-CACCO · Base de datos y modelo entidad-relación

Motor: **PostgreSQL 16** (desarrollo y pruebas pueden usar SQLite).
Tablas normalizadas (3FN), integridad referencial con claves foráneas e
índices en las columnas de filtrado frecuente (`estado`, `fecha`, `tipo`,
combinado `espacio_id+fecha+estado` para el control de doble reserva).

## Diagrama entidad-relación

```mermaid
erDiagram
    OFICINAS ||--o{ USERS : "pertenece a"
    ROLES ||--o{ USERS : "tiene"
    ROLES ||--o{ PERMISSION_ROLE : ""
    PERMISSIONS ||--o{ PERMISSION_ROLE : ""

    USERS ||--o{ SOLICITUDES : "solicita"
    USERS ||--o{ SOLICITUDES : "revisa"
    OFICINAS ||--o{ SOLICITUDES : "departamento"

    USERS ||--o{ ACTIVIDADES : "responsable"
    ESPACIOS ||--o{ ACTIVIDADES : "se realiza en"
    OFICINAS ||--o{ ACTIVIDADES : ""

    ESPACIOS ||--o{ RESERVAS : "reservado"
    USERS ||--o{ RESERVAS : "reserva"
    SOLICITUDES |o--o{ RESERVAS : "origina"
    ACTIVIDADES |o--o{ RESERVAS : "origina"

    USERS ||--o{ TAREAS : "responsable"
    USERS ||--o{ TAREAS : "creador"
    SOLICITUDES |o--o{ TAREAS : "genera (polimórfico)"
    ACTIVIDADES |o--o{ TAREAS : "genera (polimórfico)"

    USERS ||--o{ DOCUMENTOS : "autor"
    OFICINAS ||--o{ DOCUMENTOS : ""
    DOCUMENTOS ||--|{ DOCUMENTO_VERSIONES : "versiona"
    USERS ||--o{ DOCUMENTO_VERSIONES : "sube"

    USERS ||--o{ NOTIFICACIONES : "recibe"
    USERS |o--o{ AUDIT_LOGS : "ejecuta"

    USERS {
        bigint id PK
        string usuario UK
        string name
        string email UK
        string password "bcrypt"
        string cargo
        bigint oficina_id FK
        bigint role_id FK
        string estado "activo|inactivo|suspendido"
        timestamp ultimo_acceso
        tinyint intentos_fallidos
        timestamp bloqueado_hasta
        timestamp deleted_at "soft delete"
    }
    SOLICITUDES {
        bigint id PK
        string codigo UK "SOL-AAAA-NNNN"
        date fecha
        bigint solicitante_id FK
        bigint oficina_id FK
        string tipo
        string titulo
        text descripcion
        string prioridad
        string estado "7 estados"
        bigint revisor_id FK
        text observaciones
        timestamp deleted_at
    }
    ACTIVIDADES {
        bigint id PK
        string codigo UK "ACT-AAAA-NNNN"
        string nombre
        string tipo
        bigint responsable_id FK
        bigint espacio_id FK
        date fecha
        time hora_inicio
        time hora_fin
        string estado
        timestamp deleted_at
    }
    ESPACIOS {
        bigint id PK
        string codigo UK "ESP-AAAA-NNNN"
        string nombre UK
        string tipo
        int capacidad
        string estado "disponible|reservado|mantenimiento|bloqueado"
        timestamp deleted_at
    }
    RESERVAS {
        bigint id PK
        string codigo UK "RES-AAAA-NNNN"
        bigint espacio_id FK
        bigint usuario_id FK
        bigint solicitud_id FK "opcional"
        bigint actividad_id FK "opcional"
        date fecha
        time hora_inicio
        time hora_fin
        string motivo
        string estado "confirmada|cancelada|mantenimiento"
        timestamp deleted_at
    }
    TAREAS {
        bigint id PK
        string codigo UK "TAR-AAAA-NNNN"
        string titulo
        bigint responsable_id FK
        bigint creador_id FK
        string origen_type "solicitud|actividad"
        bigint origen_id
        date fecha_limite
        string prioridad
        string estado
        timestamp completada_en
        timestamp deleted_at
    }
    DOCUMENTOS {
        bigint id PK
        string codigo UK "DOC-AAAA-NNNN"
        string titulo
        string tipo
        bigint autor_id FK
        date fecha
        int version_actual
        string estado
        timestamp deleted_at
    }
    DOCUMENTO_VERSIONES {
        bigint id PK
        bigint documento_id FK
        int version "UK con documento_id"
        string archivo "ruta storage"
        string nombre_original
        bigint tamano
        bigint subido_por FK
        text notas
    }
    AUDIT_LOGS {
        bigint id PK
        bigint user_id FK
        string accion
        string modulo
        string auditable_type "morph"
        bigint auditable_id
        json valores_anteriores
        json valores_nuevos
        string ip
        string user_agent
        timestamp created_at
    }
    NOTIFICACIONES {
        bigint id PK
        bigint usuario_id FK
        string tipo
        string titulo
        text mensaje
        string recurso_tipo
        bigint recurso_id
        timestamp leida_en
    }
    CODIGOS {
        bigint id PK
        string prefijo "UK con anio"
        smallint anio
        int ultimo
    }
```

## Decisiones de diseño

- **Soft delete (`deleted_at`)** en todas las tablas de negocio: exigencia de
  gestión documental gubernamental — nada se borra físicamente.
- **`codigos`**: secuencia por prefijo y año con `lockForUpdate()`; los códigos
  institucionales nunca se repiten aunque haya inserciones concurrentes.
- **Polimorfismo controlado**: `tareas.origen_*` y `audit_logs.auditable_*`
  usan un *morph map* forzado (`solicitud`, `actividad`, …) para no acoplar la
  base de datos a nombres de clases PHP.
- **Control de doble reserva**: la restricción se valida en
  `ReservaService::verificarDisponibilidad()` dentro de una transacción con
  bloqueo de filas; el índice `(espacio_id, fecha, estado)` la hace O(log n).
  Regla de superposición: `hora_inicio < fin_existente AND hora_fin > inicio_existente`
  sobre el mismo espacio y fecha, ignorando reservas canceladas.
- **`documento_versiones`**: única por `(documento_id, version)`; subir una
  versión nueva jamás sobrescribe archivos anteriores.
- **`audit_logs` sin `updated_at`**: la bitácora es de solo inserción
  (append-only) desde la aplicación.
