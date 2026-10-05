<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Secuencias para identificadores institucionales únicos por año:
     * SOL-2026-0001, ACT-2026-0001, ESP-2026-0001, DOC-2026-0001, TAR-2026-0001, RES-2026-0001.
     */
    public function up(): void
    {
        Schema::create('codigos', function (Blueprint $table) {
            $table->id();
            $table->string('prefijo', 10);
            $table->unsignedSmallInteger('anio');
            $table->unsignedInteger('ultimo')->default(0);
            $table->unique(['prefijo', 'anio']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('codigos');
    }
};
