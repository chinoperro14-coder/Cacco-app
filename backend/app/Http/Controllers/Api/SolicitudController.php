<?php

namespace App\Http\Controllers\Api;

use App\Events\SolicitudCreada;
use App\Events\SolicitudEstadoCambiado;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Solicitud;
use App\Support\GeneradorCodigo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SolicitudController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $solicitudes = Solicitud::query()
            ->with(['solicitante:id,name', 'oficina:id,nombre,sigla', 'revisor:id,name'])
            // Sin permiso de gestión solo se ven las solicitudes propias.
            ->when(! $user->tienePermiso('solicitudes.gestionar'),
                fn ($q) => $q->where('solicitante_id', $user->id))
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('tipo'), fn ($q) => $q->where('tipo', $request->string('tipo')))
            ->when($request->filled('prioridad'), fn ($q) => $q->where('prioridad', $request->string('prioridad')))
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $texto = '%'.$request->string('buscar').'%';
                $q->where(fn ($w) => $w->where('titulo', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto));
            })
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($solicitudes);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'tipo' => ['required', Rule::in(Solicitud::TIPOS)],
            'titulo' => ['required', 'string', 'max:255'],
            'descripcion' => ['required', 'string'],
            'prioridad' => ['sometimes', Rule::in(Solicitud::PRIORIDADES)],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
            // borrador se guarda sin tramitar; pendiente entra al flujo.
            'estado' => ['sometimes', Rule::in(['borrador', 'pendiente'])],
        ]);

        $user = $request->user();

        $solicitud = Solicitud::create([
            ...$datos,
            'codigo' => GeneradorCodigo::siguiente('SOL'),
            'fecha' => now()->toDateString(),
            'solicitante_id' => $user->id,
            'oficina_id' => $datos['oficina_id'] ?? $user->oficina_id,
            'prioridad' => $datos['prioridad'] ?? 'media',
            'estado' => $datos['estado'] ?? 'pendiente',
        ]);

        if ($solicitud->estado === 'pendiente') {
            SolicitudCreada::dispatch($solicitud);
        }

        return response()->json($solicitud->load(['solicitante:id,name', 'oficina:id,nombre']), 201);
    }

    public function show(Request $request, Solicitud $solicitud): JsonResponse
    {
        $this->autorizarLectura($request, $solicitud);

        return response()->json($solicitud->load([
            'solicitante:id,name,email', 'oficina:id,nombre,sigla', 'revisor:id,name',
            'tareas' => fn ($q) => $q->with('responsable:id,name'),
        ]));
    }

    public function update(Request $request, Solicitud $solicitud): JsonResponse
    {
        $this->autorizarLectura($request, $solicitud);

        if (! in_array($solicitud->estado, ['borrador', 'pendiente'], true)) {
            return response()->json(['message' => 'Solo pueden editarse solicitudes en borrador o pendientes.'], 422);
        }

        $datos = $request->validate([
            'tipo' => ['sometimes', Rule::in(Solicitud::TIPOS)],
            'titulo' => ['sometimes', 'string', 'max:255'],
            'descripcion' => ['sometimes', 'string'],
            'prioridad' => ['sometimes', Rule::in(Solicitud::PRIORIDADES)],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
        ]);

        $solicitud->update($datos);

        return response()->json($solicitud);
    }

    /** Cambio de estado con flujo de trabajo controlado y auditoría de aprobación/rechazo. */
    public function cambiarEstado(Request $request, Solicitud $solicitud): JsonResponse
    {
        $datos = $request->validate([
            'estado' => ['required', Rule::in(Solicitud::ESTADOS)],
            'observaciones' => ['nullable', 'string', 'max:1000'],
        ]);

        $nuevoEstado = $datos['estado'];

        // Enviar un borrador propio a trámite no requiere permiso de gestión.
        $esEnvio = $solicitud->estado === 'borrador' && $nuevoEstado === 'pendiente';

        if ($esEnvio) {
            if ($solicitud->solicitante_id !== $request->user()->id) {
                return response()->json(['message' => 'Solo el solicitante puede enviar su borrador.'], 403);
            }
        } elseif (! $request->user()->tienePermiso('solicitudes.gestionar')) {
            return response()->json(['message' => 'No tiene permisos para cambiar el estado de solicitudes.'], 403);
        }

        if (! $solicitud->puedeTransicionarA($nuevoEstado)) {
            return response()->json([
                'message' => "Transición no permitida: de \"{$solicitud->estado}\" a \"{$nuevoEstado}\".",
            ], 422);
        }

        $estadoAnterior = $solicitud->estado;

        $solicitud->update([
            'estado' => $nuevoEstado,
            'observaciones' => $datos['observaciones'] ?? $solicitud->observaciones,
            'revisor_id' => $esEnvio ? $solicitud->revisor_id : $request->user()->id,
        ]);

        // Auditoría explícita de aprobación/rechazo/cierre además del historial de edición.
        $accion = match ($nuevoEstado) {
            'aprobada' => 'aprobacion',
            'rechazada' => 'rechazo',
            'cerrada' => 'cierre',
            default => 'cambio_estado',
        };
        AuditLog::registrar($accion, 'solicitudes', $solicitud,
            ['estado' => $estadoAnterior], ['estado' => $nuevoEstado], $datos['observaciones'] ?? null);

        if ($esEnvio) {
            SolicitudCreada::dispatch($solicitud);
        }

        SolicitudEstadoCambiado::dispatch($solicitud, $estadoAnterior);

        return response()->json($solicitud->fresh(['solicitante:id,name', 'revisor:id,name']));
    }

    public function destroy(Request $request, Solicitud $solicitud): JsonResponse
    {
        $this->autorizarLectura($request, $solicitud);

        if ($solicitud->estado !== 'borrador' && ! $request->user()->tienePermiso('solicitudes.gestionar')) {
            return response()->json(['message' => 'Solo pueden eliminarse borradores propios.'], 403);
        }

        $solicitud->delete(); // soft delete: el registro se conserva para trazabilidad

        return response()->json(['message' => 'Solicitud eliminada.']);
    }

    private function autorizarLectura(Request $request, Solicitud $solicitud): void
    {
        $user = $request->user();

        abort_if(
            ! $user->tienePermiso('solicitudes.gestionar') && $solicitud->solicitante_id !== $user->id,
            403,
            'No tiene acceso a esta solicitud.',
        );
    }
}
