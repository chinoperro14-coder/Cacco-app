<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Oficina;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OficinaController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Oficina::withCount('usuarios')->orderBy('nombre')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:255', 'unique:oficinas,nombre'],
            'sigla' => ['nullable', 'string', 'max:20'],
            'descripcion' => ['nullable', 'string'],
            'activa' => ['sometimes', 'boolean'],
        ]);

        return response()->json(Oficina::create($datos), 201);
    }

    public function update(Request $request, Oficina $oficina): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => ['sometimes', 'string', 'max:255', Rule::unique('oficinas', 'nombre')->ignore($oficina->id)],
            'sigla' => ['nullable', 'string', 'max:20'],
            'descripcion' => ['nullable', 'string'],
            'activa' => ['sometimes', 'boolean'],
        ]);

        $oficina->update($datos);

        return response()->json($oficina);
    }

    public function destroy(Oficina $oficina): JsonResponse
    {
        if ($oficina->usuarios()->exists()) {
            return response()->json(['message' => 'La oficina tiene usuarios asignados.'], 422);
        }

        $oficina->delete();

        return response()->json(['message' => 'Oficina eliminada.']);
    }
}
