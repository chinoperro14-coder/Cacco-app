<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use Auditable, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public const ESTADOS = ['activo', 'inactivo', 'suspendido'];

    protected $fillable = [
        'usuario', 'name', 'email', 'password', 'cargo',
        'oficina_id', 'role_id', 'estado',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'ultimo_acceso' => 'datetime',
            'bloqueado_hasta' => 'datetime',
            'password' => 'hashed', // bcrypt (BCRYPT_ROUNDS=12)
        ];
    }

    public function oficina(): BelongsTo
    {
        return $this->belongsTo(Oficina::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function tareas(): HasMany
    {
        return $this->hasMany(Tarea::class, 'responsable_id');
    }

    public function notificaciones(): HasMany
    {
        return $this->hasMany(Notificacion::class, 'usuario_id');
    }

    /**
     * Validación de permisos SIEMPRE en backend (principio de mínimo privilegio).
     * El frontend solo usa esta información para construir el menú.
     */
    public function tienePermiso(string $clave): bool
    {
        return in_array($clave, $this->clavesPermisos(), true);
    }

    /** @return string[] */
    public function clavesPermisos(): array
    {
        if ($this->role === null) {
            return [];
        }

        return $this->role->permissions->pluck('clave')->all();
    }

    public function estaBloqueado(): bool
    {
        return $this->bloqueado_hasta !== null && $this->bloqueado_hasta->isFuture();
    }

    public function moduloAuditoria(): string
    {
        return 'usuarios';
    }
}
