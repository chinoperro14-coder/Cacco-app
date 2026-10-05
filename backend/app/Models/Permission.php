<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Permission extends Model
{
    protected $fillable = ['clave', 'modulo', 'descripcion'];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }
}
