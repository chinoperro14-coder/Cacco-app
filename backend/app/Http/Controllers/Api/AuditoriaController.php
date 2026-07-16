<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditoriaController extends Controller
{
    /** Bitácora institucional (solo lectura, requiere permiso auditoria.ver). */
    public function index(Request $request): JsonResponse
    {
        $registros = AuditLog::query()
            ->with('user:id,name,usuario')
            ->when($request->filled('modulo'), fn ($q) => $q->where('modulo', $request->string('modulo')))
            ->when($request->filled('accion'), fn ($q) => $q->where('accion', $request->string('accion')))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('desde'), fn ($q) => $q->whereDate('created_at', '>=', $request->string('desde')))
            ->when($request->filled('hasta'), fn ($q) => $q->whereDate('created_at', '<=', $request->string('hasta')))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($registros);
    }

    /** Historial de un registro específico (trazabilidad por entidad). */
    public function historial(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'tipo' => ['required', 'string', 'max:100'],
            'id' => ['required', 'integer'],
        ]);

        $registros = AuditLog::query()
            ->with('user:id,name')
            ->where('auditable_type', $datos['tipo'])
            ->where('auditable_id', $datos['id'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json($registros);
    }
}
