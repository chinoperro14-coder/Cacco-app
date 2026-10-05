<?php

namespace Database\Seeders;

use App\Models\Oficina;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class UsuariosSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::pluck('id', 'nombre');
        $oficinas = Oficina::pluck('id', 'sigla');

        // Contraseña de prueba para TODOS los usuarios demo: Sigep2026*cambiar
        // Debe cambiarse antes de pasar a producción.
        $password = 'Sigep2026*cambiar';

        $usuarios = [
            ['usuario' => 'admin', 'name' => 'Administrador del Sistema', 'email' => 'admin@cacco.gob.pa', 'cargo' => 'Administrador de Sistemas', 'oficina' => 'ADM', 'rol' => 'Administrador General'],
            ['usuario' => 'direccion', 'name' => 'María Fernández', 'email' => 'direccion@cacco.gob.pa', 'cargo' => 'Directora General', 'oficina' => 'DG', 'rol' => 'Director'],
            ['usuario' => 'jcultura', 'name' => 'Carlos Herrera', 'email' => 'gestion.cultural@cacco.gob.pa', 'cargo' => 'Jefe de Gestión Cultural', 'oficina' => 'GC', 'rol' => 'Jefe de Oficina'],
            ['usuario' => 'jcomunica', 'name' => 'Ana Ríos', 'email' => 'comunicaciones@cacco.gob.pa', 'cargo' => 'Jefa de Comunicaciones', 'oficina' => 'COM', 'rol' => 'Jefe de Oficina'],
            ['usuario' => 'jmantenim', 'name' => 'Roberto Díaz', 'email' => 'mantenimiento@cacco.gob.pa', 'cargo' => 'Jefe de Mantenimiento', 'oficina' => 'MS', 'rol' => 'Jefe de Oficina'],
            ['usuario' => 'lgonzalez', 'name' => 'Laura González', 'email' => 'lgonzalez@cacco.gob.pa', 'cargo' => 'Coordinadora de Talleres', 'oficina' => 'GC', 'rol' => 'Colaborador'],
            ['usuario' => 'pmartinez', 'name' => 'Pedro Martínez', 'email' => 'pmartinez@cacco.gob.pa', 'cargo' => 'Asistente Administrativo', 'oficina' => 'ADM', 'rol' => 'Colaborador'],
            ['usuario' => 'consulta', 'name' => 'Usuario de Consulta', 'email' => 'consulta@cacco.gob.pa', 'cargo' => 'Consulta Institucional', 'oficina' => 'DG', 'rol' => 'Consulta'],
        ];

        foreach ($usuarios as $u) {
            User::updateOrCreate(
                ['email' => $u['email']],
                [
                    'usuario' => $u['usuario'],
                    'name' => $u['name'],
                    'password' => $password,
                    'cargo' => $u['cargo'],
                    'oficina_id' => $oficinas[$u['oficina']] ?? null,
                    'role_id' => $roles[$u['rol']] ?? null,
                    'estado' => 'activo',
                ],
            );
        }
    }
}
