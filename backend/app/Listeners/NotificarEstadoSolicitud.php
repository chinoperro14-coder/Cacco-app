<?php

namespace App\Listeners;

use App\Events\SolicitudEstadoCambiado;
use App\Models\Notificacion;

class NotificarEstadoSolicitud
{
    private const MENSAJES = [
        'aprobada' => 'Su solicitud fue aprobada.',
        'rechazada' => 'Su solicitud fue rechazada.',
        'en_revision' => 'Su solicitud está en revisión.',
        'ejecutada' => 'Su solicitud fue ejecutada.',
        'cerrada' => 'Su solicitud fue cerrada.',
    ];

    public function handle(SolicitudEstadoCambiado $event): void
    {
        $solicitud = $event->solicitud;
        $mensaje = self::MENSAJES[$solicitud->estado] ?? null;

        if ($mensaje === null) {
            return;
        }

        Notificacion::enviar(
            usuarioId: $solicitud->solicitante_id,
            tipo: "solicitud_{$solicitud->estado}",
            titulo: "Solicitud {$solicitud->codigo}",
            mensaje: $mensaje.($solicitud->observaciones ? " Observaciones: {$solicitud->observaciones}" : ''),
            recursoTipo: 'solicitud',
            recursoId: $solicitud->id,
        );
    }
}
