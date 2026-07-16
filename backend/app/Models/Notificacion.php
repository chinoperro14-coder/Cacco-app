<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notificacion extends Model
{
    protected $table = 'notificaciones';

    protected $fillable = [
        'usuario_id', 'tipo', 'titulo', 'mensaje',
        'recurso_tipo', 'recurso_id', 'leida_en',
    ];

    protected function casts(): array
    {
        return ['leida_en' => 'datetime'];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    /** Crea una notificación interna para la campana del usuario. */
    public static function enviar(
        int $usuarioId,
        string $tipo,
        string $titulo,
        ?string $mensaje = null,
        ?string $recursoTipo = null,
        ?int $recursoId = null,
    ): self {
        return static::create([
            'usuario_id' => $usuarioId,
            'tipo' => $tipo,
            'titulo' => $titulo,
            'mensaje' => $mensaje,
            'recurso_tipo' => $recursoTipo,
            'recurso_id' => $recursoId,
        ]);
    }
}
