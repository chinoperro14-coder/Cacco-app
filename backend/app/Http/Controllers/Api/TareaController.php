<?php

namespace App\Http\Controllers\Api;

use App\Events\TareaAsignada;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Tarea;
use App\Support\GeneradorCodigo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TareaController extends Controller
{
    /** Bandeja: por defecto muestra las tareas del usuario; "todas" requiere permiso de gestión. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $verTodas = $request->boolean('todas') && $user->tienePermiso('tareas.gestionar');

        $tareas = Tarea::query()
            ->with(['responsable:id,name', 'creador:id,name', 'origen'])
            ->when(! $verTodas, fn ($q) => $q->where('responsable_id', $user->id))
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('prioridad'), fn ($q) => $q->where('prioridad', $request->string('prioridad')))
            ->orderByRaw("case estado when 'pendiente' then 0 when 'en_proceso' then 1 else 2 end")
            ->orderBy('fecha_limite')
            ->paginate($request->integer('per_page', 15));

        return response()->json($tareas);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'titulo' => ['required', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'responsable_id' => ['required', 'exists:users,id'],
            'fecha_limite' => ['nullable', 'date'],
            'prioridad' => ['sometimes', Rule::in(Tarea::PRIORIDADES)],
        ]);

        $tarea = Tarea::create([
            ...$datos,
            'codigo' => GeneradorCodigo::siguiente('TAR'),
            'creador_id' => $request->user()->id,
        ]);

        TareaAsignada::dispatch($tarea);
        AuditLog::registrar('asignacion', 'tareas', $tarea, null, ['responsable_id' => $tarea->responsable_id]);

        return response()->json($tarea->load(['responsable:id,name', 'creador:id,name']), 201);
    }

    public function show(Request $request, Tarea $tarea): JsonResponse
    {
        $this->autorizar($request, $tarea);

        return response()->json($tarea->load(['responsable:id,name', 'creador:id,name', 'origen']));
    }

    public function update(Request $request, Tarea $tarea): JsonResponse
    {
        $this->autorizar($request, $tarea);

        $datos = $request->validate([
            'titulo' => ['sometimes', 'string', 'max:255'],
            'descripcion' => ['nullable', 'string'],
            'responsable_id' => ['sometimes', 'exists:users,id'],
            'fecha_limite' => ['nullable', 'date'],
            'prioridad' => ['sometimes', Rule::in(Tarea::PRIORIDADES)],
            'estado' => ['sometimes', Rule::in(Tarea::ESTADOS)],
        ]);

        $responsableAnterior = $tarea->responsable_id;

        if (($datos['estado'] ?? null) === 'completada' && $tarea->estado !== 'completada') {
            $datos['completada_en'] = now();
        }

        $tarea->update($datos);

        if (isset($datos['responsable_id']) && (int) $datos['responsable_id'] !== $responsableAnterior) {
            TareaAsignada::dispatch($tarea);
            AuditLog::registrar('asignacion', 'tareas', $tarea,
                ['responsable_id' => $responsableAnterior], ['responsable_id' => $tarea->responsable_id]);
        }

        return response()->json($tarea->fresh(['responsable:id,name', 'creador:id,name']));
    }

    public function destroy(Request $request, Tarea $tarea): JsonResponse
    {
        $this->autorizar($request, $tarea);

        $tarea->update(['estado' => 'cancelada']);
        $tarea->delete();

        return response()->json(['message' => 'Tarea cancelada.']);
    }

    private function autorizar(Request $request, Tarea $tarea): void
    {
        $user = $request->user();

        abort_if(
            ! $user->tienePermiso('tareas.gestionar')
                && $tarea->responsable_id !== $user->id
                && $tarea->creador_id !== $user->id,
            403,
            'No tiene acceso a esta tarea.',
        );
    }
}
