<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('usuario', 60)->unique()->nullable()->after('id');
            $table->string('cargo')->nullable()->after('email');
            $table->foreignId('oficina_id')->nullable()->after('cargo')
                ->constrained('oficinas')->nullOnDelete();
            $table->foreignId('role_id')->nullable()->after('oficina_id')
                ->constrained('roles')->restrictOnDelete();
            $table->string('estado', 20)->default('activo')->index()->after('role_id');
            $table->timestamp('ultimo_acceso')->nullable()->after('estado');
            // Control de fuerza bruta: bloqueo temporal por intentos fallidos.
            $table->unsignedTinyInteger('intentos_fallidos')->default(0)->after('ultimo_acceso');
            $table->timestamp('bloqueado_hasta')->nullable()->after('intentos_fallidos');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('oficina_id');
            $table->dropConstrainedForeignId('role_id');
            $table->dropColumn([
                'usuario', 'cargo', 'estado', 'ultimo_acceso',
                'intentos_fallidos', 'bloqueado_hasta', 'deleted_at',
            ]);
        });
    }
};
