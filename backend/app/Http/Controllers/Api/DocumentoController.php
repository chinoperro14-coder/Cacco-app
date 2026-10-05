<?php

namespace App\Http\Controllers\Api;

use App\Events\DocumentoActualizado;
use App\Http\Controllers\Controller;
use App\Models\Documento;
use App\Models\DocumentoVersion;
use App\Support\GeneradorCodigo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentoController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $documentos = Documento::query()
            ->with(['autor:id,name', 'oficina:id,nombre,sigla'])
            ->when($request->filled('tipo'), fn ($q) => $q->where('tipo', $request->string('tipo')))
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $texto = '%'.$request->string('buscar').'%';
                $q->where(fn ($w) => $w->where('titulo', 'ilike', $texto)->orWhere('codigo', 'ilike', $texto));
            })
            ->orderByDesc('fecha')
            ->paginate($request->integer('per_page', 15));

        return response()->json($documentos);
    }

    /** Crea el documento con su primera versión (archivo PDF obligatorio). */
    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'titulo' => ['required', 'string', 'max:255'],
            'tipo' => ['required', Rule::in(Documento::TIPOS)],
            'fecha' => ['required', 'date'],
            'descripcion' => ['nullable', 'string'],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
            'archivo' => ['required', 'file', 'mimes:pdf', 'max:20480'], // 20 MB
        ]);

        $documento = DB::transaction(function () use ($datos, $request) {
            $documento = Documento::create([
                ...collect($datos)->except('archivo')->all(),
                'codigo' => GeneradorCodigo::siguiente('DOC'),
                'autor_id' => $request->user()->id,
                'oficina_id' => $datos['oficina_id'] ?? $request->user()->oficina_id,
                'version_actual' => 1,
            ]);

            $this->guardarVersion($documento, $request, 1);

            return $documento;
        });

        return response()->json($documento->load(['autor:id,name', 'versiones']), 201);
    }

    public function show(Documento $documento): JsonResponse
    {
        return response()->json($documento->load([
            'autor:id,name,email', 'oficina:id,nombre,sigla',
            'versiones.autor:id,name',
        ]));
    }

    public function update(Request $request, Documento $documento): JsonResponse
    {
        $datos = $request->validate([
            'titulo' => ['sometimes', 'string', 'max:255'],
            'tipo' => ['sometimes', Rule::in(Documento::TIPOS)],
            'fecha' => ['sometimes', 'date'],
            'descripcion' => ['nullable', 'string'],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
            'estado' => ['sometimes', Rule::in(Documento::ESTADOS)],
        ]);

        $documento->update($datos);

        return response()->json($documento);
    }

    /**
     * Sube una versión nueva del PDF. Nunca sobrescribe: el historial
     * documental completo se conserva en documento_versiones.
     */
    public function nuevaVersion(Request $request, Documento $documento): JsonResponse
    {
        $request->validate([
            'archivo' => ['required', 'file', 'mimes:pdf', 'max:20480'],
            'notas' => ['nullable', 'string', 'max:500'],
        ]);

        $version = DB::transaction(function () use ($documento, $request) {
            $numero = $documento->version_actual + 1;
            $version = $this->guardarVersion($documento, $request, $numero);
            $documento->update(['version_actual' => $numero]);

            return $version;
        });

        DocumentoActualizado::dispatch($documento, $version->version);

        return response()->json($documento->fresh(['versiones.autor:id,name']), 201);
    }

    public function descargar(Documento $documento, int $version): StreamedResponse
    {
        $registro = $documento->versiones()->where('version', $version)->firstOrFail();

        abort_unless(Storage::disk('local')->exists($registro->archivo), 404, 'Archivo no encontrado.');

        return Storage::disk('local')->download($registro->archivo, $registro->nombre_original);
    }

    public function destroy(Documento $documento): JsonResponse
    {
        // Soft delete: los archivos y versiones se conservan (gestión documental gubernamental).
        $documento->update(['estado' => 'archivado']);
        $documento->delete();

        return response()->json(['message' => 'Documento archivado.']);
    }

    private function guardarVersion(Documento $documento, Request $request, int $numero): DocumentoVersion
    {
        $archivo = $request->file('archivo');
        $ruta = $archivo->store("documentos/{$documento->codigo}", 'local');

        return DocumentoVersion::create([
            'documento_id' => $documento->id,
            'version' => $numero,
            'archivo' => $ruta,
            'nombre_original' => $archivo->getClientOriginalName(),
            'tamano' => $archivo->getSize(),
            'mime' => $archivo->getMimeType() ?? 'application/pdf',
            'subido_por' => $request->user()->id,
            'notas' => $request->string('notas')->toString() ?: null,
        ]);
    }
}
