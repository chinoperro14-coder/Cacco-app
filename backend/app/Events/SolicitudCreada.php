<?php

namespace App\Events;

use App\Models\Solicitud;
use Illuminate\Foundation\Events\Dispatchable;

/** Se emite cuando una solicitud pasa a estado "pendiente" (enviada a trámite). */
class SolicitudCreada
{
    use Dispatchable;

    public function __construct(public Solicitud $solicitud) {}
}
