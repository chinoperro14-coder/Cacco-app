<?php

namespace App\Services;

use App\Models\Reserva;
use App\Support\GeneradorCodigo;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Control obligatorio de doble reserva.
 *
 * Regla: no pueden existir dos reservas activas para el MISMO espacio,
 * el MISMO día, con horarios superpuestos. La verificación se ejecuta
 * dentro de una transacción con bloqueo para evitar condiciones de carrera.
 */
class ReservaService
{
    /**
     * @param  array{espacio_id:int, fecha:string, hora_inicio:string, hora_fin:string, motivo:string, estado?:string, usuario_id?:int, solicitud_id?:int|null, actividad_id?:int|null}  $datos
     *
     * @throws ValidationException si existe conflicto de horario
     */
    public function crear(array $datos): Reserva
    {
        return DB::transaction(function () use ($datos) {
            $this->verificarDisponibilidad(
                espacioId: (int) $datos['espacio_id'],
                fecha: $datos['fecha'],
                horaInicio: $datos['hora_inicio'],
                horaFin: $datos['hora_fin'],
            );

            $datos['codigo'] = GeneradorCodigo::siguiente('RES');
            $datos['usuario_id'] ??= auth()->id();

            return Reserva::create($datos);
        });
    }

    /**
     * @throws ValidationException si existe conflicto de horario
     */
    public function actualizar(Reserva $reserva, array $datos): Reserva
    {
        return DB::transaction(function () use ($reserva, $datos) {
            $this->verificarDisponibilidad(
                espacioId: (int) ($datos['espacio_id'] ?? $reserva->espacio_id),
                fecha: $datos['fecha'] ?? $reserva->fecha->toDateString(),
                horaInicio: $datos['hora_inicio'] ?? $reserva->hora_inicio,
                horaFin: $datos['hora_fin'] ?? $reserva->hora_fin,
                ignorarReservaId: $reserva->id,
            );

            $reserva->update($datos);

            return $reserva;
        });
    }

    /**
     * Dos rangos [inicio, fin) se superponen cuando:
     * inicio_nuevo < fin_existente Y fin_nuevo > inicio_existente.
     *
     * @throws ValidationException
     */
    public function verificarDisponibilidad(
        int $espacioId,
        string $fecha,
        string $horaInicio,
        string $horaFin,
        ?int $ignorarReservaId = null,
    ): void {
        $conflicto = Reserva::query()
            ->activas()
            ->where('espacio_id', $espacioId)
            ->whereDate('fecha', $fecha)
            ->where('hora_inicio', '<', $horaFin)
            ->where('hora_fin', '>', $horaInicio)
            ->when($ignorarReservaId, fn ($q) => $q->where('id', '!=', $ignorarReservaId))
            ->lockForUpdate()
            ->with('espacio:id,nombre')
            ->first();

        if ($conflicto !== null) {
            throw ValidationException::withMessages([
                'hora_inicio' => sprintf(
                    'El espacio "%s" ya está reservado el %s de %s a %s (reserva %s). Seleccione otro horario o espacio.',
                    $conflicto->espacio->nombre,
                    $conflicto->fecha->format('d/m/Y'),
                    substr($conflicto->hora_inicio, 0, 5),
                    substr($conflicto->hora_fin, 0, 5),
                    $conflicto->codigo,
                ),
            ]);
        }
    }
}
