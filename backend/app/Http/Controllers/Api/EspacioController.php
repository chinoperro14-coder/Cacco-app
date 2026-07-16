<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Espacio;
use App\Support\GeneradorCodigo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EspacioController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $espacios = Espacio::query()
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('tipo'), fn ($q) => $q->where('tipo', $request->string('tipo')))
            ->when($request->filled('buscar'), fn ($q) => $q->where('nombre', 'ilike', '%'.$request->string('buscar').'%'))
            ->orderBy('nombre')
            ->paginate($request->integer('per_page', 50));

        return response()->json($espacios);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:255', 'unique:espacios,nombre'],
            'tipo' => ['required', Rule::in(Espacio::TIPOS)],
            'capacidad' => ['required', 'integer', 'min:0'],
            'descripcion' => ['nullable', 'string'],
            'estado' => ['sometimes', Rule::in(Espacio::ESTADOS)],
        ]);

        $datos['codigo'] = GeneradorCodigo::siguiente('ESP');

        return response()->json(Espacio::create($datos), 201);
    }

    public function show(Espacio $espacio): JsonResponse
    {
        return response()->json($espacio->load([
            'reservas' => fn ($q) => $q->activas()->whereDate('fecha', '>=', now())->orderBy('fecha')->limit(20),
        ]));
    }

    public function update(Request $request, Espacio $espacio): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => ['sometimes', 'string', 'max:255', Rule::unique('espacios', 'nombre')->ignore($espacio->id)],
            'tipo' => ['sometimes', Rule::in(Espacio::TIPOS)],
            'capacidad' => ['sometimes', 'integer', 'min:0'],
            'descripcion' => ['nullable', 'string'],
            'estado' => ['sometimes', Rule::in(Espacio::ESTADOS)],
        ]);

        $espacio->update($datos);

        return response()->json($espacio);
    }

    public function destroy(Espacio $espacio): JsonResponse
    {
        if ($espacio->reservas()->activas()->whereDate('fecha', '>=', now())->exists()) {
            return response()->json(['message' => 'El espacio tiene reservas futuras activas.'], 422);
        }

        $espacio->delete();

        return response()->json(['message' => 'Espacio eliminado.']);
    }
}
