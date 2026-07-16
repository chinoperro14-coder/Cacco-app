<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolesPermisosSeeder extends Seeder
{
    /**
     * Catálogo de permisos por módulo. Los permisos son configurables:
     * el Administrador General puede crear roles nuevos y reasignar permisos.
     */
    private const PERMISOS = [
        'dashboard' => ['dashboard.ver' => 'Ver dashboard institucional'],
        'usuarios' => [
            'usuarios.ver' => 'Ver usuarios',
            'usuarios.gestionar' => 'Crear, editar y desactivar usuarios y oficinas',
        ],
        'roles' => ['roles.gestionar' => 'Configurar roles y permisos'],
        'solicitudes' => [
            'solicitudes.ver' => 'Ver solicitudes propias',
            'solicitudes.crear' => 'Crear y tramitar solicitudes',
            'solicitudes.gestionar' => 'Revisar, aprobar y rechazar solicitudes de toda la institución',
        ],
        'actividades' => [
            'actividades.ver' => 'Ver actividades',
            'actividades.gestionar' => 'Programar y editar actividades',
        ],
        'espacios' => [
            'espacios.ver' => 'Ver espacios',
            'espacios.gestionar' => 'Administrar espacios físicos',
        ],
        'reservas' => [
            'reservas.ver' => 'Ver reservas y disponibilidad',
            'reservas.gestionar' => 'Crear y cancelar reservas',
        ],
        'tareas' => [
            'tareas.ver' => 'Ver y actualizar su bandeja de tareas',
            'tareas.gestionar' => 'Asignar tareas y ver todas las bandejas',
        ],
        'documentos' => [
            'documentos.ver' => 'Consultar y descargar documentos',
            'documentos.gestionar' => 'Registrar documentos y subir versiones',
        ],
        'calendario' => ['calendario.ver' => 'Ver calendario institucional'],
        'auditoria' => ['auditoria.ver' => 'Consultar bitácora de auditoría'],
    ];

    public function run(): void
    {
        $ids = [];
        foreach (self::PERMISOS as $modulo => $permisos) {
            foreach ($permisos as $clave => $descripcion) {
                $permiso = Permission::updateOrCreate(
                    ['clave' => $clave],
                    ['modulo' => $modulo, 'descripcion' => $descripcion],
                );
                $ids[$clave] = $permiso->id;
            }
        }

        $todos = array_values($ids);
        $lectura = array_values(array_intersect_key($ids, array_flip([
            'dashboard.ver', 'solicitudes.ver', 'actividades.ver', 'espacios.ver',
            'reservas.ver', 'tareas.ver', 'documentos.ver', 'calendario.ver',
        ])));

        $roles = [
            'Administrador General' => [
                'descripcion' => 'Acceso total al sistema y configuración de seguridad',
                'permisos' => $todos,
            ],
            'Director' => [
                'descripcion' => 'Dirección institucional: aprueba solicitudes y supervisa módulos',
                'permisos' => array_values(array_diff_key($ids, array_flip(['roles.gestionar', 'usuarios.gestionar']))),
            ],
            'Jefe de Oficina' => [
                'descripcion' => 'Gestiona solicitudes, actividades, reservas y tareas de su oficina',
                'permisos' => array_values(array_intersect_key($ids, array_flip([
                    'dashboard.ver', 'usuarios.ver',
                    'solicitudes.ver', 'solicitudes.crear', 'solicitudes.gestionar',
                    'actividades.ver', 'actividades.gestionar',
                    'espacios.ver', 'reservas.ver', 'reservas.gestionar',
                    'tareas.ver', 'tareas.gestionar',
                    'documentos.ver', 'documentos.gestionar', 'calendario.ver',
                ]))),
            ],
            'Colaborador' => [
                'descripcion' => 'Crea solicitudes, atiende su bandeja y consulta calendario',
                'permisos' => array_values(array_intersect_key($ids, array_flip([
                    'dashboard.ver', 'solicitudes.ver', 'solicitudes.crear',
                    'actividades.ver', 'espacios.ver', 'reservas.ver',
                    'tareas.ver', 'documentos.ver', 'calendario.ver',
                ]))),
            ],
            'Consulta' => [
                'descripcion' => 'Acceso de solo lectura a la información autorizada',
                'permisos' => $lectura,
            ],
        ];

        foreach ($roles as $nombre => $definicion) {
            $role = Role::updateOrCreate(
                ['nombre' => $nombre],
                ['descripcion' => $definicion['descripcion'], 'es_sistema' => true],
            );
            $role->permissions()->sync($definicion['permisos']);
        }
    }
}
