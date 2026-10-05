<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Actividad extends Model
{
    use Auditable, SoftDeletes;

    public const TIPOS = ['curso', 'festival', 'exposicion', 'reunion', 'taller', 'programa'];

    public const ESTADOS = ['programada', 'en_curso', 'realizada', 'cancelada'];

    protected $table = 'actividades';

    protected $fillable = [
        'codigo', 'nombre', 'tipo', 'responsable_id', 'oficina_id', 'espacio_id',
        'fecha', 'hora_inicio', 'hora_fin', 'descripcion', 'estado',
    ];

    protected function casts(): array
    {
        return ['fecha' => 'date'];
    }

    public function responsable(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsable_id');
    }

    public function oficina(): BelongsTo
    {
        return $this->belongsTo(Oficina::class);
    }

    public function espacio(): BelongsTo
    {
        return $this->belongsTo(Espacio::class);
    }

    public function tareas(): MorphMany
    {
        return $this->morphMany(Tarea::class, 'origen');
    }

    public function reservas(): HasMany
    {
        return $this->hasMany(Reserva::class);
    }

    public function reservasActivas(): HasMany
    {
        return $this->hasMany(Reserva::class)->where('estado', '!=', 'cancelada');
    }
}
