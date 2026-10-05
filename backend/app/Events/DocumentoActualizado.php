<?php

namespace App\Events;

use App\Models\Documento;
use Illuminate\Foundation\Events\Dispatchable;

class DocumentoActualizado
{
    use Dispatchable;

    public function __construct(public Documento $documento, public int $version) {}
}
