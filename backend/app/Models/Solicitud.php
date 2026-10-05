<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Solicitud extends Model
{
    use Auditable, SoftDeletes;

    public const TIPOS = ['uso_espacio', 'reunion', 'mantenimiento', 'comunicacion', 'transporte', 'equipamiento'];

    public const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];

    public const ESTADOS = ['borrador', 'pendiente', 'en_revision', 'aprobada', 'rechazada', 'ejecutada', 'cerrada'];

    /** Transiciones de estado permitidas (flujo de trabajo institucional). */
    public const TRANSICIONES = [
        'borrador' => ['pendiente'],
        'pendiente' => ['en_revision', 'aprobada', 'rechazada'],
        'en_revision' => ['aprobada', 'rechazada'],
        'aprobada' => ['ejecutada', 'cerrada'],
        'rechazada' => ['cerrada'],
        'ejecutada' => ['cerrada'],
        'cerrada' => [],
    ];

    protected $table = 'solicitudes';

    protected $fillable = [
        'codigo', 'fecha', 'solicitante_id', 'oficina_id', 'tipo', 'titulo',
        'descripcion', 'prioridad', 'estado', 'revisor_id', 'observaciones',
    ];

    protected function casts(): array
    {
        return ['fecha' => 'date'];
    }

    public function solicitante(): BelongsTo
    {
        return $this->belongsTo(User::class, 'solicitante_id');
    }

    public function revisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revisor_id');
    }

    public function oficina(): BelongsTo
    {
        return $this->belongsTo(Oficina::class);
    }

    public function tareas(): MorphMany
    {
        return $this->morphMany(Tarea::class, 'origen');
    }

    public function puedeTransicionarA(string $estado): bool
    {
        return in_array($estado, self::TRANSICIONES[$this->estado] ?? [], true);
    }
}
