<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Codigo extends Model
{
    public $timestamps = false;

    protected $table = 'codigos';

    protected $fillable = ['prefijo', 'anio', 'ultimo'];
}
