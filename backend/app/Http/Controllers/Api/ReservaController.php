<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notificacion;
use App\Models\Reserva;
use App\Services\ReservaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReservaController extends Controller
{
    public function __construct(private readonly ReservaService $servicio) {}

    public function index(Request $request): JsonResponse
    {
        $reservas = Reserva::query()
            ->with(['espacio:id,nombre,codigo', 'usuario:id,name', 'actividad:id,codigo,nombre', 'solicitud:id,codigo,titulo'])
            ->when($request->filled('espacio_id'), fn ($q) => $q->where('espacio_id', $request->integer('espacio_id')))
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('desde'), fn ($q) => $q->whereDate('fecha', '>=', $request->string('desde')))
            ->when($request->filled('hasta'), fn ($q) => $q->whereDate('fecha', '<=', $request->string('hasta')))
            ->orderBy('fecha')
            ->orderBy('hora_inicio')
            ->paginate($request->integer('per_page', 25));

        return response()->json($reservas);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'espacio_id' => ['required', 'exists:espacios,id'],
            'fecha' => ['required', 'date', 'after_or_equal:today'],
            'hora_inicio' => ['required', 'date_format:H:i'],
            'hora_fin' => ['required', 'date_format:H:i', 'after:hora_inicio'],
            'motivo' => ['required', 'string', 'max:255'],
            'estado' => ['sometimes', Rule::in(['confirmada', 'mantenimiento'])],
            'solicitud_id' => ['nullable', 'exists:solicitudes,id'],
        ]);

        // El servicio aplica el control de doble reserva y lanza 422 si hay conflicto.
        $reserva = $this->servicio->crear($datos);

        return response()->json($reserva->load(['espacio:id,nombre', 'usuario:id,name']), 201);
    }

    public function update(Request $request, Reserva $reserva): JsonResponse
    {
        $datos = $request->validate([
            'espacio_id' => ['sometimes', 'exists:espacios,id'],
            'fecha' => ['sometimes', 'date'],
            'hora_inicio' => ['sometimes', 'date_format:H:i'],
            'hora_fin' => ['sometimes', 'date_format:H:i'],
            'motivo' => ['sometimes', 'string', 'max:255'],
            'estado' => ['sometimes', Rule::in(Reserva::ESTADOS)],
        ]);

        $estadoAnterior = $reserva->estado;
        $reserva = $this->servicio->actualizar($reserva, $datos);

        // Notificar al dueño de la reserva cuando otro usuario la cancela.
        if ($estadoAnterior !== 'cancelada'
            && $reserva->estado === 'cancelada'
            && $reserva->usuario_id !== $request->user()->id) {
            Notificacion::enviar(
                usuarioId: $reserva->usuario_id,
                tipo: 'reserva_rechazada',
                titulo: "Reserva {$reserva->codigo} cancelada",
                mensaje: "Su reserva del espacio fue cancelada por {$request->user()->name}.",
                recursoTipo: 'reserva',
                recursoId: $reserva->id,
            );
        }

        return response()->json($reserva->load(['espacio:id,nombre', 'usuario:id,name']));
    }

    public function destroy(Reserva $reserva): JsonResponse
    {
        $reserva->update(['estado' => 'cancelada']);
        $reserva->delete();

        return response()->json(['message' => 'Reserva cancelada.']);
    }

    /** Consulta previa de disponibilidad (para el formulario de reserva). */
    public function disponibilidad(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'espacio_id' => ['required', 'exists:espacios,id'],
            'fecha' => ['required', 'date'],
            'hora_inicio' => ['required', 'date_format:H:i'],
            'hora_fin' => ['required', 'date_format:H:i', 'after:hora_inicio'],
            'ignorar_reserva_id' => ['nullable', 'integer'],
        ]);

        try {
            $this->servicio->verificarDisponibilidad(
                (int) $datos['espacio_id'],
                $datos['fecha'],
                $datos['hora_inicio'],
                $datos['hora_fin'],
                $datos['ignorar_reserva_id'] ?? null,
            );
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['disponible' => false, 'message' => collect($e->errors())->flatten()->first()]);
        }

        return response()->json(['disponible' => true]);
    }
}
