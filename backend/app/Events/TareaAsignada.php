<?php

namespace App\Events;

use App\Models\Tarea;
use Illuminate\Foundation\Events\Dispatchable;

class TareaAsignada
{
    use Dispatchable;

    public function __construct(public Tarea $tarea) {}
}
