<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Trazabilidad automática: todo modelo que use este trait registra en la
 * bitácora institucional (audit_logs) su creación, edición y eliminación,
 * conservando valores anteriores/nuevos, usuario responsable e IP.
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(function (Model $model) {
            static::registrarAuditoria($model, 'creacion', null, $model->getAttributes());
        });

        static::updated(function (Model $model) {
            $cambios = $model->getChanges();
            unset($cambios['updated_at']);

            if ($cambios === []) {
                return;
            }

            $anteriores = array_intersect_key($model->getOriginal(), $cambios);
            $accion = array_key_exists('deleted_at', $cambios) && $model->deleted_at !== null
                ? 'eliminacion'
                : 'edicion';

            static::registrarAuditoria($model, $accion, $anteriores, $cambios);
        });

        static::deleted(function (Model $model) {
            // Con SoftDeletes el evento updated no siempre se dispara; se registra aquí.
            static::registrarAuditoria($model, 'eliminacion', $model->getOriginal(), null);
        });
    }

    public static function registrarAuditoria(
        Model $model,
        string $accion,
        ?array $anteriores = null,
        ?array $nuevos = null,
        ?string $detalle = null,
    ): void {
        AuditLog::registrar(
            accion: $accion,
            modulo: $model->moduloAuditoria(),
            auditable: $model,
            anteriores: static::filtrarSensibles($anteriores),
            nuevos: static::filtrarSensibles($nuevos),
            detalle: $detalle,
        );
    }

    /** Nunca persistir credenciales ni tokens en la bitácora. */
    protected static function filtrarSensibles(?array $valores): ?array
    {
        if ($valores === null) {
            return null;
        }

        return array_diff_key($valores, array_flip(['password', 'remember_token']));
    }

    /** Módulo bajo el cual se audita el modelo; por defecto, el nombre de su tabla. */
    public function moduloAuditoria(): string
    {
        return $this->getTable();
    }
}
