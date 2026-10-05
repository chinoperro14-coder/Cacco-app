<?php

namespace App\Listeners;

use App\Events\DocumentoActualizado;
use App\Models\Notificacion;

class NotificarDocumentoActualizado
{
    public function handle(DocumentoActualizado $event): void
    {
        $documento = $event->documento;

        // Notifica al autor cuando otro usuario sube una versión nueva.
        if ($documento->autor_id === auth()->id()) {
            return;
        }

        Notificacion::enviar(
            usuarioId: $documento->autor_id,
            tipo: 'documento_actualizado',
            titulo: "Documento {$documento->codigo} actualizado",
            mensaje: "Se registró la versión {$event->version} de \"{$documento->titulo}\".",
            recursoTipo: 'documento',
            recursoId: $documento->id,
        );
    }
}
