<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Reserva extends Model
{
    use Auditable, SoftDeletes;

    public const ESTADOS = ['confirmada', 'cancelada', 'mantenimiento'];

    protected $table = 'reservas';

    protected $fillable = [
        'codigo', 'espacio_id', 'usuario_id', 'solicitud_id', 'actividad_id',
        'fecha', 'hora_inicio', 'hora_fin', 'motivo', 'estado',
    ];

    protected function casts(): array
    {
        return ['fecha' => 'date'];
    }

    public function espacio(): BelongsTo
    {
        return $this->belongsTo(Espacio::class);
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    public function solicitud(): BelongsTo
    {
        return $this->belongsTo(Solicitud::class);
    }

    public function actividad(): BelongsTo
    {
        return $this->belongsTo(Actividad::class);
    }

    /** Reservas que ocupan el espacio (las canceladas no bloquean). */
    public function scopeActivas(Builder $query): Builder
    {
        return $query->where('estado', '!=', 'cancelada');
    }
}
