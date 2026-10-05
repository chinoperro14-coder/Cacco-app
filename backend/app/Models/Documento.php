<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Documento extends Model
{
    use Auditable, SoftDeletes;

    public const TIPOS = ['carta', 'memo', 'circular', 'acta', 'contrato', 'invitacion'];

    public const ESTADOS = ['borrador', 'vigente', 'obsoleto', 'archivado'];

    protected $table = 'documentos';

    protected $fillable = [
        'codigo', 'titulo', 'tipo', 'autor_id', 'oficina_id',
        'fecha', 'descripcion', 'version_actual', 'estado',
    ];

    protected function casts(): array
    {
        return ['fecha' => 'date'];
    }

    public function autor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_id');
    }

    public function oficina(): BelongsTo
    {
        return $this->belongsTo(Oficina::class);
    }

    public function versiones(): HasMany
    {
        return $this->hasMany(DocumentoVersion::class)->orderByDesc('version');
    }
}
