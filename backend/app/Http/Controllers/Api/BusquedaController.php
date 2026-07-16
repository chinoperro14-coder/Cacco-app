<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Actividad;
use App\Models\Documento;
use App\Models\Espacio;
use App\Models\Solicitud;
use App\Models\Tarea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BusquedaController extends Controller
{
    /**
     * Búsqueda global por código o título en los módulos autorizados
     * para el usuario (respeta RBAC).
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']]);

        $texto = '%'.$request->string('q').'%';
        $user = $request->user();
        $resultados = [];

        if ($user->tienePermiso('solicitudes.ver')) {
            $resultados['solicitudes'] = Solicitud::query()
                ->when(! $user->tienePermiso('solicitudes.gestionar'),
                    fn ($q) => $q->where('solicitante_id', $user->id))
                ->where(fn ($q) => $q->where('titulo', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto))
                ->limit(5)->get(['id', 'codigo', 'titulo', 'estado']);
        }

        if ($user->tienePermiso('actividades.ver')) {
            $resultados['actividades'] = Actividad::query()
                ->where(fn ($q) => $q->where('nombre', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto))
                ->limit(5)->get(['id', 'codigo', 'nombre', 'fecha', 'estado']);
        }

        if ($user->tienePermiso('espacios.ver')) {
            $resultados['espacios'] = Espacio::query()
                ->where(fn ($q) => $q->where('nombre', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto))
                ->limit(5)->get(['id', 'codigo', 'nombre', 'estado']);
        }

        if ($user->tienePermiso('documentos.ver')) {
            $resultados['documentos'] = Documento::query()
                ->where(fn ($q) => $q->where('titulo', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto))
                ->limit(5)->get(['id', 'codigo', 'titulo', 'tipo', 'estado']);
        }

        if ($user->tienePermiso('tareas.ver')) {
            $resultados['tareas'] = Tarea::query()
                ->when(! $user->tienePermiso('tareas.gestionar'),
                    fn ($q) => $q->where('responsable_id', $user->id))
                ->where(fn ($q) => $q->where('titulo', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto))
                ->limit(5)->get(['id', 'codigo', 'titulo', 'estado']);
        }

        return response()->json($resultados);
    }
}
