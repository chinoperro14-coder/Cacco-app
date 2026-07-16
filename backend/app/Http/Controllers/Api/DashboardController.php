<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Actividad;
use App\Models\Espacio;
use App\Models\Reserva;
use App\Models\Solicitud;
use App\Models\Tarea;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    /** Indicadores ejecutivos en tiempo real para la pantalla principal. */
    public function index(Request $request): JsonResponse
    {
        $hoy = now()->toDateString();

        $solicitudesPorEstado = Solicitud::query()
            ->selectRaw('estado, count(*) as total')
            ->groupBy('estado')
            ->pluck('total', 'estado');

        $actividadesPorTipo = Actividad::query()
            ->where('estado', '!=', 'cancelada')
            ->selectRaw('tipo, count(*) as total')
            ->groupBy('tipo')
            ->pluck('total', 'tipo');

        return response()->json([
            'solicitudes' => [
                'activas' => Solicitud::whereIn('estado', ['pendiente', 'en_revision', 'aprobada', 'ejecutada'])->count(),
                'cerradas' => Solicitud::whereIn('estado', ['cerrada', 'rechazada'])->count(),
                'por_estado' => $solicitudesPorEstado,
            ],
            'actividades' => [
                'programadas' => Actividad::where('estado', 'programada')->whereDate('fecha', '>=', $hoy)->count(),
                'hoy' => Actividad::whereDate('fecha', $hoy)->where('estado', '!=', 'cancelada')->count(),
                'por_tipo' => $actividadesPorTipo,
            ],
            'espacios' => [
                'total' => Espacio::count(),
                'ocupados_hoy' => Reserva::activas()->whereDate('fecha', $hoy)->distinct('espacio_id')->count('espacio_id'),
                'en_mantenimiento' => Espacio::where('estado', 'mantenimiento')->count(),
            ],
            'tareas' => [
                'pendientes' => Tarea::whereIn('estado', ['pendiente', 'en_proceso'])->count(),
                'mias_pendientes' => Tarea::where('responsable_id', $request->user()->id)
                    ->whereIn('estado', ['pendiente', 'en_proceso'])->count(),
                'vencidas' => Tarea::whereIn('estado', ['pendiente', 'en_proceso'])
                    ->whereDate('fecha_limite', '<', $hoy)->count(),
            ],
            'usuarios' => [
                'activos' => User::where('estado', 'activo')->count(),
                'conectados_hoy' => User::whereDate('ultimo_acceso', $hoy)->count(),
            ],
            'proximas_actividades' => Actividad::with(['espacio:id,nombre', 'responsable:id,name'])
                ->where('estado', 'programada')
                ->whereDate('fecha', '>=', $hoy)
                ->orderBy('fecha')->orderBy('hora_inicio')
                ->limit(5)
                ->get(),
        ]);
    }
}
