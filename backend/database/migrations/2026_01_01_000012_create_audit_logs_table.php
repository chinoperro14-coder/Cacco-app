<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Bitácora institucional: toda acción del sistema queda registrada con
     * fecha/hora, usuario, acción, IP, módulo y valores anterior/nuevo.
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('accion', 40)->index();  // creacion|edicion|aprobacion|rechazo|asignacion|cierre|login|logout|login_fallido|...
            $table->string('modulo', 40)->index();  // usuarios|solicitudes|actividades|espacios|reservas|tareas|documentos|seguridad|...
            $table->nullableMorphs('auditable');    // registro afectado
            $table->json('valores_anteriores')->nullable();
            $table->json('valores_nuevos')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->text('detalle')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
