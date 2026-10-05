<?php

namespace App\Support;

use App\Models\Codigo;
use Illuminate\Support\Facades\DB;

/**
 * Genera identificadores institucionales únicos y consecutivos por año,
 * con bloqueo pesimista para evitar duplicados en accesos concurrentes.
 *
 * Ejemplos: SOL-2026-0001, ACT-2026-0001, ESP-2026-0001, DOC-2026-0001.
 */
class GeneradorCodigo
{
    public static function siguiente(string $prefijo): string
    {
        $anio = (int) now()->format('Y');

        return DB::transaction(function () use ($prefijo, $anio) {
            $secuencia = Codigo::query()
                ->where('prefijo', $prefijo)
                ->where('anio', $anio)
                ->lockForUpdate()
                ->first();

            if ($secuencia === null) {
                $secuencia = Codigo::create(['prefijo' => $prefijo, 'anio' => $anio, 'ultimo' => 0]);
            }

            $secuencia->increment('ultimo');

            return sprintf('%s-%d-%04d', $prefijo, $anio, $secuencia->ultimo);
        });
    }
}
