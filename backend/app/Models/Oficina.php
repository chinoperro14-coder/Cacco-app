<?php

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Oficina extends Model
{
    use Auditable, SoftDeletes;

    protected $table = 'oficinas';

    protected $fillable = ['nombre', 'sigla', 'descripcion', 'activa'];

    protected function casts(): array
    {
        return ['activa' => 'boolean'];
    }

    public function usuarios(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
