<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificacionController extends Controller
{
    /** Campana del usuario: últimas notificaciones y contador de no leídas. */
    public function index(Request $request): JsonResponse
    {
        $consulta = $request->user()->notificaciones()->orderByDesc('created_at');

        return response()->json([
            'no_leidas' => (clone $consulta)->whereNull('leida_en')->count(),
            'notificaciones' => $consulta->limit($request->integer('limite', 30))->get(),
        ]);
    }

    public function marcarLeida(Request $request, int $id): JsonResponse
    {
        $notificacion = $request->user()->notificaciones()->findOrFail($id);
        $notificacion->update(['leida_en' => $notificacion->leida_en ?? now()]);

        return response()->json($notificacion);
    }

    public function marcarTodasLeidas(Request $request): JsonResponse
    {
        $request->user()->notificaciones()->whereNull('leida_en')->update(['leida_en' => now()]);

        return response()->json(['message' => 'Notificaciones marcadas como leídas.']);
    }
}
