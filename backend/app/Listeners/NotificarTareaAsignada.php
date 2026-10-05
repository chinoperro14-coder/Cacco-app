<?php

namespace App\Listeners;

use App\Events\TareaAsignada;
use App\Models\Notificacion;

class NotificarTareaAsignada
{
    public function handle(TareaAsignada $event): void
    {
        $tarea = $event->tarea;

        if ($tarea->responsable_id === null) {
            return;
        }

        Notificacion::enviar(
            usuarioId: $tarea->responsable_id,
            tipo: 'tarea_asignada',
            titulo: "Nueva tarea {$tarea->codigo}",
            mensaje: $tarea->titulo,
            recursoTipo: 'tarea',
            recursoId: $tarea->id,
        );
    }
}
