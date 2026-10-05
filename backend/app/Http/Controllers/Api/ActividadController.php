<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Actividad;
use App\Services\ReservaService;
use App\Support\GeneradorCodigo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ActividadController extends Controller
{
    public function __construct(private readonly ReservaService $reservas) {}

    public function index(Request $request): JsonResponse
    {
        $actividades = Actividad::query()
            ->with(['responsable:id,name', 'espacio:id,nombre', 'oficina:id,nombre,sigla'])
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('tipo'), fn ($q) => $q->where('tipo', $request->string('tipo')))
            ->when($request->filled('espacio_id'), fn ($q) => $q->where('espacio_id', $request->integer('espacio_id')))
            ->when($request->filled('desde'), fn ($q) => $q->whereDate('fecha', '>=', $request->string('desde')))
            ->when($request->filled('hasta'), fn ($q) => $q->whereDate('fecha', '<=', $request->string('hasta')))
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $texto = '%'.$request->string('buscar').'%';
                $q->where(fn ($w) => $w->where('nombre', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto));
            })
            ->orderBy('fecha')
            ->orderBy('hora_inicio')
            ->paginate($request->integer('per_page', 15));

        return response()->json($actividades);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $this->validar($request);

        return DB::transaction(function () use ($datos, $request) {
            $actividad = Actividad::create([
                ...$datos,
                'codigo' => GeneradorCodigo::siguiente('ACT'),
                'responsable_id' => $datos['responsable_id'] ?? $request->user()->id,
                'oficina_id' => $datos['oficina_id'] ?? $request->user()->oficina_id,
            ]);

            // Si la actividad ocupa un espacio, reserva con control de doble reserva.
            if ($actividad->espacio_id !== null) {
                $this->reservas->crear([
                    'espacio_id' => $actividad->espacio_id,
                    'fecha' => $actividad->fecha->toDateString(),
                    'hora_inicio' => $actividad->hora_inicio,
                    'hora_fin' => $actividad->hora_fin,
                    'motivo' => "Actividad {$actividad->codigo}: {$actividad->nombre}",
                    'actividad_id' => $actividad->id,
                ]);
            }

            return response()->json($actividad->load(['responsable:id,name', 'espacio:id,nombre']), 201);
        });
    }

    public function show(Actividad $actividad): JsonResponse
    {
        return response()->json($actividad->load([
            'responsable:id,name,email', 'espacio:id,nombre,codigo', 'oficina:id,nombre,sigla',
            'tareas' => fn ($q) => $q->with('responsable:id,name'),
        ]));
    }

    public function update(Request $request, Actividad $actividad): JsonResponse
    {
        $datos = $this->validar($request, parcial: true);

        return DB::transaction(function () use ($actividad, $datos) {
            $cambiaAgenda = array_intersect_key($datos, array_flip(['espacio_id', 'fecha', 'hora_inicio', 'hora_fin'])) !== [];

            $actividad->update($datos);

            if ($cambiaAgenda) {
                // Se cancela la reserva anterior y se genera una nueva validada.
                $actividad->load('espacio');
                $reservaPrevia = $actividad->reservasActivas()->first();
                $reservaPrevia?->update(['estado' => 'cancelada']);

                if ($actividad->espacio_id !== null && $actividad->estado !== 'cancelada') {
                    $this->reservas->crear([
                        'espacio_id' => $actividad->espacio_id,
                        'fecha' => $actividad->fecha->toDateString(),
                        'hora_inicio' => $actividad->hora_inicio,
                        'hora_fin' => $actividad->hora_fin,
                        'motivo' => "Actividad {$actividad->codigo}: {$actividad->nombre}",
                        'actividad_id' => $actividad->id,
                    ]);
                }
            }

            if (($datos['estado'] ?? null) === 'cancelada') {
                $actividad->reservasActivas()->update(['estado' => 'cancelada']);
            }

            return response()->json($actividad->fresh(['responsable:id,name', 'espacio:id,nombre']));
        });
    }

    public function destroy(Actividad $actividad): JsonResponse
    {
        DB::transaction(function () use ($actividad) {
            $actividad->reservasActivas()->update(['estado' => 'cancelada']);
            $actividad->delete();
        });

        return response()->json(['message' => 'Actividad eliminada.']);
    }

    private function validar(Request $request, bool $parcial = false): array
    {
        $req = $parcial ? 'sometimes' : 'required';

        return $request->validate([
            'nombre' => [$req, 'string', 'max:255'],
            'tipo' => [$req, Rule::in(Actividad::TIPOS)],
            'responsable_id' => ['nullable', 'exists:users,id'],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
            'espacio_id' => ['nullable', 'exists:espacios,id'],
            'fecha' => [$req, 'date'],
            'hora_inicio' => [$req, 'date_format:H:i'],
            'hora_fin' => [$req, 'date_format:H:i', 'after:hora_inicio'],
            'descripcion' => ['nullable', 'string'],
            'estado' => ['sometimes', Rule::in(Actividad::ESTADOS)],
        ]);
    }
}
