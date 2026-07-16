<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tarea extends Model
{
    use Auditable, SoftDeletes;

    public const ESTADOS = ['pendiente', 'en_proceso', 'completada', 'cancelada'];

    public const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];

    protected $table = 'tareas';

    protected $fillable = [
        'codigo', 'titulo', 'descripcion', 'responsable_id', 'creador_id',
        'origen_type', 'origen_id', 'fecha_limite', 'prioridad', 'estado', 'completada_en',
    ];

    protected function casts(): array
    {
        return [
            'fecha_limite' => 'date',
            'completada_en' => 'datetime',
        ];
    }

    public function responsable(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsable_id');
    }

    public function creador(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creador_id');
    }

    public function origen(): MorphTo
    {
        return $this->morphTo();
    }
}
