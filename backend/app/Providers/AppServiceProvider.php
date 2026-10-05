<?php

namespace App\Providers;

use App\Models\Actividad;
use App\Models\Documento;
use App\Models\Espacio;
use App\Models\Oficina;
use App\Models\Reserva;
use App\Models\Role;
use App\Models\Solicitud;
use App\Models\Tarea;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Alias estables para tipos polimórficos (auditoría, origen de tareas).
        // Evita acoplar la base de datos a nombres de clases PHP.
        Relation::enforceMorphMap([
            'usuario' => User::class,
            'oficina' => Oficina::class,
            'rol' => Role::class,
            'solicitud' => Solicitud::class,
            'actividad' => Actividad::class,
            'espacio' => Espacio::class,
            'reserva' => Reserva::class,
            'tarea' => Tarea::class,
            'documento' => Documento::class,
        ]);
    }
}
