<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Actividad;
use App\Models\Reserva;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarioController extends Controller
{
    /**
     * Calendario institucional unificado: actividades + reservas (incluye
     * mantenimientos) en un rango de fechas, con filtros por oficina,
     * espacio y responsable.
     */
    public function index(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'desde' => ['required', 'date'],
            'hasta' => ['required', 'date', 'after_or_equal:desde'],
            'oficina_id' => ['nullable', 'integer'],
            'espacio_id' => ['nullable', 'integer'],
            'responsable_id' => ['nullable', 'integer'],
        ]);

        $actividades = Actividad::query()
            ->with(['espacio:id,nombre', 'responsable:id,name', 'oficina:id,nombre,sigla'])
            ->where('estado', '!=', 'cancelada')
            ->whereBetween('fecha', [$datos['desde'], $datos['hasta']])
            ->when($datos['oficina_id'] ?? null, fn ($q, $v) => $q->where('oficina_id', $v))
            ->when($datos['espacio_id'] ?? null, fn ($q, $v) => $q->where('espacio_id', $v))
            ->when($datos['responsable_id'] ?? null, fn ($q, $v) => $q->where('responsable_id', $v))
            ->get()
            ->map(fn (Actividad $a) => [
                'id' => "act-{$a->id}",
                'tipo' => 'actividad',
                'subtipo' => $a->tipo,
                'codigo' => $a->codigo,
                'titulo' => $a->nombre,
                'fecha' => $a->fecha->toDateString(),
                'hora_inicio' => substr($a->hora_inicio, 0, 5),
                'hora_fin' => substr($a->hora_fin, 0, 5),
                'espacio' => $a->espacio?->nombre,
                'responsable' => $a->responsable?->name,
                'oficina' => $a->oficina?->sigla ?? $a->oficina?->nombre,
                'estado' => $a->estado,
            ]);

        $reservas = Reserva::query()
            ->with(['espacio:id,nombre', 'usuario:id,name'])
            ->activas()
            // Las reservas de actividades ya aparecen como actividad; evita duplicados.
            ->whereNull('actividad_id')
            ->whereBetween('fecha', [$datos['desde'], $datos['hasta']])
            ->when($datos['espacio_id'] ?? null, fn ($q, $v) => $q->where('espacio_id', $v))
            ->when($datos['responsable_id'] ?? null, fn ($q, $v) => $q->where('usuario_id', $v))
            ->get()
            ->map(fn (Reserva $r) => [
                'id' => "res-{$r->id}",
                'tipo' => $r->estado === 'mantenimiento' ? 'mantenimiento' : 'reserva',
                'subtipo' => $r->estado,
                'codigo' => $r->codigo,
                'titulo' => $r->motivo,
                'fecha' => $r->fecha->toDateString(),
                'hora_inicio' => substr($r->hora_inicio, 0, 5),
                'hora_fin' => substr($r->hora_fin, 0, 5),
                'espacio' => $r->espacio?->nombre,
                'responsable' => $r->usuario?->name,
                'oficina' => null,
                'estado' => $r->estado,
            ]);

        return response()->json([
            'eventos' => $actividades->concat($reservas)->sortBy(['fecha', 'hora_inicio'])->values(),
        ]);
    }
}
