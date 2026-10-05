<?php

namespace Database\Seeders;

use App\Events\SolicitudCreada;
use App\Models\Actividad;
use App\Models\Espacio;
use App\Models\Solicitud;
use App\Models\User;
use App\Services\ReservaService;
use App\Support\GeneradorCodigo;
use Illuminate\Database\Seeder;

/** Datos de prueba para el ambiente de demostración/pruebas. */
class DatosDemoSeeder extends Seeder
{
    public function run(ReservaService $reservas): void
    {
        if (Solicitud::exists()) {
            return; // ya sembrado
        }

        $admin = User::where('usuario', 'admin')->first();
        $jefe = User::where('usuario', 'jcultura')->first();
        $colaboradora = User::where('usuario', 'lgonzalez')->first();
        $teatro = Espacio::where('tipo', 'teatro')->first();
        $auditorio = Espacio::where('tipo', 'auditorio')->first();
        $aula = Espacio::where('tipo', 'aula')->first();

        auth()->setUser($admin); // atribuye la auditoría del seed al administrador

        // Actividades con reserva de espacio validada (control de doble reserva).
        $actividades = [
            ['nombre' => 'Festival de Danza Folclórica', 'tipo' => 'festival', 'espacio' => $teatro, 'dias' => 7, 'inicio' => '18:00', 'fin' => '21:00', 'responsable' => $jefe],
            ['nombre' => 'Taller de Pintura Infantil', 'tipo' => 'taller', 'espacio' => $aula, 'dias' => 3, 'inicio' => '09:00', 'fin' => '11:30', 'responsable' => $colaboradora],
            ['nombre' => 'Exposición Fotográfica: Colón Histórico', 'tipo' => 'exposicion', 'espacio' => $auditorio, 'dias' => 14, 'inicio' => '10:00', 'fin' => '17:00', 'responsable' => $jefe],
            ['nombre' => 'Reunión de Coordinación Mensual', 'tipo' => 'reunion', 'espacio' => $auditorio, 'dias' => 2, 'inicio' => '08:30', 'fin' => '10:00', 'responsable' => $admin],
        ];

        foreach ($actividades as $def) {
            $fecha = now()->addDays($def['dias'])->toDateString();

            $actividad = Actividad::create([
                'codigo' => GeneradorCodigo::siguiente('ACT'),
                'nombre' => $def['nombre'],
                'tipo' => $def['tipo'],
                'responsable_id' => $def['responsable']->id,
                'oficina_id' => $def['responsable']->oficina_id,
                'espacio_id' => $def['espacio']->id,
                'fecha' => $fecha,
                'hora_inicio' => $def['inicio'],
                'hora_fin' => $def['fin'],
                'descripcion' => 'Actividad de demostración generada por el seeder.',
                'estado' => 'programada',
            ]);

            $reservas->crear([
                'espacio_id' => $actividad->espacio_id,
                'fecha' => $fecha,
                'hora_inicio' => $def['inicio'],
                'hora_fin' => $def['fin'],
                'motivo' => "Actividad {$actividad->codigo}: {$actividad->nombre}",
                'actividad_id' => $actividad->id,
                'usuario_id' => $def['responsable']->id,
            ]);
        }

        // Solicitudes en distintos estados del flujo (cada una genera su tarea).
        $solicitudes = [
            ['tipo' => 'uso_espacio', 'titulo' => 'Uso del Teatro para ensayo general', 'prioridad' => 'alta', 'solicitante' => $colaboradora, 'estado' => 'pendiente'],
            ['tipo' => 'mantenimiento', 'titulo' => 'Reparación de aire acondicionado del Auditorio', 'prioridad' => 'urgente', 'solicitante' => $jefe, 'estado' => 'pendiente'],
            ['tipo' => 'equipamiento', 'titulo' => 'Micrófonos inalámbricos para festival', 'prioridad' => 'media', 'solicitante' => $jefe, 'estado' => 'pendiente'],
            ['tipo' => 'transporte', 'titulo' => 'Transporte para grupo de danza invitado', 'prioridad' => 'media', 'solicitante' => $colaboradora, 'estado' => 'borrador'],
        ];

        foreach ($solicitudes as $def) {
            $solicitud = Solicitud::create([
                'codigo' => GeneradorCodigo::siguiente('SOL'),
                'fecha' => now()->toDateString(),
                'solicitante_id' => $def['solicitante']->id,
                'oficina_id' => $def['solicitante']->oficina_id,
                'tipo' => $def['tipo'],
                'titulo' => $def['titulo'],
                'descripcion' => 'Solicitud de demostración generada por el seeder.',
                'prioridad' => $def['prioridad'],
                'estado' => $def['estado'],
            ]);

            if ($solicitud->estado === 'pendiente') {
                SolicitudCreada::dispatch($solicitud);
            }
        }

        auth()->forgetUser();
    }
}
