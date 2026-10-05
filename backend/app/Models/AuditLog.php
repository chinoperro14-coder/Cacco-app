<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'accion', 'modulo', 'auditable_type', 'auditable_id',
        'valores_anteriores', 'valores_nuevos', 'ip', 'user_agent', 'detalle',
    ];

    protected function casts(): array
    {
        return [
            'valores_anteriores' => 'array',
            'valores_nuevos' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function auditable(): MorphTo
    {
        return $this->morphTo();
    }

    /** Punto único de escritura de la bitácora institucional. */
    public static function registrar(
        string $accion,
        string $modulo,
        ?Model $auditable = null,
        ?array $anteriores = null,
        ?array $nuevos = null,
        ?string $detalle = null,
        ?int $userId = null,
    ): self {
        $request = request();

        return static::create([
            'user_id' => $userId ?? auth()->id(),
            'accion' => $accion,
            'modulo' => $modulo,
            'auditable_type' => $auditable?->getMorphClass(),
            'auditable_id' => $auditable?->getKey(),
            'valores_anteriores' => $anteriores,
            'valores_nuevos' => $nuevos,
            'ip' => $request?->ip(),
            'user_agent' => $request ? substr((string) $request->userAgent(), 0, 255) : null,
            'detalle' => $detalle,
        ]);
    }
}
