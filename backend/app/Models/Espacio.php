<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Espacio extends Model
{
    use Auditable, SoftDeletes;

    public const TIPOS = ['teatro', 'auditorio', 'galeria', 'salon', 'aula', 'patio'];

    public const ESTADOS = ['disponible', 'reservado', 'mantenimiento', 'bloqueado'];

    protected $table = 'espacios';

    protected $fillable = ['codigo', 'nombre', 'tipo', 'capacidad', 'descripcion', 'estado'];

    public function reservas(): HasMany
    {
        return $this->hasMany(Reserva::class);
    }

    public function actividades(): HasMany
    {
        return $this->hasMany(Actividad::class);
    }
}
