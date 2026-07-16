<?php

namespace App\Events;

use App\Models\Solicitud;
use Illuminate\Foundation\Events\Dispatchable;

class SolicitudEstadoCambiado
{
    use Dispatchable;

    public function __construct(
        public Solicitud $solicitud,
        public string $estadoAnterior,
    ) {}
}
