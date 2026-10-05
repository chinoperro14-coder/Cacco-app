<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documentos', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->unique(); // DOC-2026-0001
            $table->string('titulo');
            $table->string('tipo', 30)->index();    // carta|memo|circular|acta|contrato|invitacion
            $table->foreignId('autor_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('oficina_id')->nullable()->constrained('oficinas')->nullOnDelete();
            $table->date('fecha');
            $table->text('descripcion')->nullable();
            $table->unsignedInteger('version_actual')->default(1);
            $table->string('estado', 20)->default('vigente')->index(); // borrador|vigente|obsoleto|archivado
            $table->timestamps();
            $table->softDeletes();
        });

        // Control de versiones: cada subida crea una versión nueva, nunca se sobrescribe.
        Schema::create('documento_versiones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('documento_id')->constrained('documentos')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->string('archivo');            // ruta en storage
            $table->string('nombre_original');
            $table->unsignedBigInteger('tamano'); // bytes
            $table->string('mime', 100)->default('application/pdf');
            $table->foreignId('subido_por')->constrained('users')->restrictOnDelete();
            $table->text('notas')->nullable();
            $table->timestamps();

            $table->unique(['documento_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documento_versiones');
        Schema::dropIfExists('documentos');
    }
};
