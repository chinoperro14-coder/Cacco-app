<?php

namespace App\Listeners;

use App\Events\SolicitudCreada;
use App\Events\TareaAsignada;
use App\Models\Tarea;
use App\Support\GeneradorCodigo;

/**
 * Flujo de trabajo: toda solicitud enviada a trámite genera automáticamente
 * una tarea asociada en la bandeja del revisor (o del solicitante si aún no hay revisor).
 */
class GenerarTareaDeSolicitud
{
    public function handle(SolicitudCreada $event): void
    {
        $solicitud = $event->solicitud;

        $tarea = Tarea::create([
            'codigo' => GeneradorCodigo::siguiente('TAR'),
            'titulo' => "Atender solicitud {$solicitud->codigo}: {$solicitud->titulo}",
            'descripcion' => $solicitud->descripcion,
            'responsable_id' => $solicitud->revisor_id ?? $solicitud->solicitante_id,
            'creador_id' => $solicitud->solicitante_id,
            'origen_type' => $solicitud->getMorphClass(),
            'origen_id' => $solicitud->id,
            'fecha_limite' => $solicitud->fecha,
            'prioridad' => $solicitud->prioridad,
        ]);

        TareaAsignada::dispatch($tarea);
    }
}
