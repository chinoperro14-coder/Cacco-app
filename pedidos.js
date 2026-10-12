// Formulario de pedidos de otras áreas (página pública /pedido).
// Convierte un pedido en un borrador de tarea. Lo usa el servidor (app.js) y también la página de prueba,
// por eso no depende de Node ni del navegador.
(function (raiz) {
  const AREAS = ["Administración", "Comunicaciones", "Dirección", "Desarrollo Social", "Coordinación de Arte y Cultura", "Educación Artística y Cultural", "Otra"];
  const SERVICIOS = {
    cobertura: { lbl: "Cobertura de fotos y video", secs: ["Audiovisual"] },
    diseno:    { lbl: "Diseño de una pieza (afiche, arte, invitación)", secs: ["Diseño"] },
    difusion:  { lbl: "Difusión en redes sociales", secs: ["Redes Sociales"] },
    prensa:    { lbl: "Prensa, radio o TV", secs: ["Medios"] },
    protocolo: { lbl: "Protocolo (maestro de ceremonia, logística)", secs: ["Protocolo"] },
  };

  // Lo que llega del formulario público se muestra luego dentro del dashboard: se quitan los caracteres
  // que permitirían inyectar HTML o cortar atributos, y se limita el largo de cada campo.
  function limpiar(v, max, multilinea) {
    let s = String(v == null ? "" : v)
      .replace(/\r\n?/g, "\n")
      .replace(multilinea ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ")
      .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "’")
      .replace(/\s*&\s*/g, " y ").replace(/\\/g, "/");
    s = multilinea ? s.split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
                   : s.replace(/\s+/g, " ").trim();
    return s.slice(0, max);
  }
  // Enlace al material (Drive, Dropbox…): se guarda tal cual solo si es un http(s) sin caracteres peligrosos
  const limpiarUrl = v => { const u = String(v == null ? "" : v).trim(); return /^https?:\/\/[^\s<>"'`\\]{3,300}$/i.test(u) ? u : null; };
  const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + "T12:00:00Z"));
  const esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const fechaLarga = f => {
    const M = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [a, m, d] = f.split("-").map(Number); return `${d} de ${M[m - 1]} de ${a}`;
  };

  // body: lo que envió el formulario. ctx: {hoy:'AAAA-MM-DD', id:()=>string, folio:'P-0001'}
  // Devuelve {error} o {tarea, registro}
  function pedidoATarea(body, ctx) {
    const b = body && typeof body === "object" ? body : {};
    if (b.web) return { error: "No se pudo enviar el pedido." };              // campo trampa para robots
    const area = AREAS.includes(b.area) ? b.area : null;
    const areaOtra = limpiar(b.areaOtra, 60);
    const nombre = limpiar(b.nombre, 80), contacto = limpiar(b.contacto, 120);
    const titulo = limpiar(b.actividad, 140), lugar = limpiar(b.lugar, 120);
    const descripcion = limpiar(b.descripcion, 1500, true);
    const servicios = (Array.isArray(b.servicios) ? b.servicios : []).filter(k => SERVICIOS[k]);
    const fecha = String(b.fecha || ""), hora = String(b.hora || ""), horaFin = String(b.horaFin || "");
    const entrega = String(b.entrega || "");
    const materialTxt = String(b.material || "").trim(), material = materialTxt ? limpiarUrl(materialTxt) : "";
    if (!area) return { error: "Elige la oficina que hace el pedido." };
    if (area === "Otra" && !areaOtra) return { error: "Escribe el nombre de tu oficina." };
    if (!nombre) return { error: "Escribe tu nombre." };
    if (!contacto) return { error: "Escribe un teléfono o correo para contactarte." };
    if (!titulo) return { error: "Escribe el nombre de la actividad." };
    if (!servicios.length) return { error: "Marca al menos una cosa que necesitas." };
    if (!esFecha(fecha)) return { error: "Elige la fecha de la actividad." };
    if (fecha < ctx.hoy) return { error: "La fecha de la actividad ya pasó." };
    if (hora && !esHora(hora)) return { error: "La hora de inicio no es válida." };
    if (horaFin && !esHora(horaFin)) return { error: "La hora de fin no es válida." };
    if (entrega && (!esFecha(entrega) || entrega < ctx.hoy)) return { error: "La fecha de entrega del diseño no es válida." };
    if (material === null) return { error: "El enlace al material no es válido: cópialo completo, empezando por https://" };

    const nomArea = area === "Otra" ? areaOtra : area;
    const secciones = {};
    servicios.forEach(k => SERVICIOS[k].secs.forEach(s => {
      secciones[s] = { responsables: [], estado: "Pendiente", completadoPor: null, completadoEn: null, fecha: null, hora: null };
    }));
    if (secciones["Diseño"] && entrega) secciones["Diseño"].fecha = entrega;
    const notas = [
      `📨 Pedido ${ctx.folio} de ${nomArea}, recibido el ${fechaLarga(ctx.hoy)} por el formulario de pedidos.`,
      `👤 Lo pide: ${nombre} · ${contacto}`,
      `🧰 Necesita: ${servicios.map(k => SERVICIOS[k].lbl).join("; ")}.`,
      entrega ? `🎨 Diseño para el ${fechaLarga(entrega)}.` : "",
      material ? `🔗 Material: ${material}` : "",
      descripcion ? `\n${descripcion}` : "",
    ].filter(Boolean).join("\n");
    const pedido = { folio: ctx.folio, area: nomArea, solicitante: nombre, contacto, servicios, recibido: ctx.hoy, ...(material ? { material } : {}), ...(entrega ? { entrega } : {}) };
    const tarea = {
      id: ctx.id(), titulo, borrador: true, etiquetas: [], prioridad: "Media", fecha, hora, horaFin, lugar, notas,
      recurrencia: "ninguna", secciones, entregables: [], creadaEn: ctx.hoy, creadaPor: "Formulario de pedidos", creadoPorId: "pedidos", pedido,
    };
    // El registro de pedidos no se borra al descartar el borrador: sirve para medir cuánto pide cada área
    const registro = { id: tarea.id, tareaId: tarea.id, folio: ctx.folio, area: nomArea, titulo, fecha, servicios, recibido: ctx.hoy, solicitante: nombre };
    return { tarea, registro, notaPedido: notas };
  }

  // ── Duplicados: la misma actividad puede venir ya del Calendario CACCO Logístico o de otro pedido ──
  const VACIAS = new Set("para por con del las los una uno unos unas que como entre sobre desde hasta este esta estos estas cacco evento actividad".split(" "));
  const palabras = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(w => w.length >= 4 && !VACIAS.has(w));
  function parecidos(a, b) {
    const A = new Set(palabras(a)), B = new Set(palabras(b));
    if (!A.size || !B.size) return false;
    let comunes = 0; A.forEach(w => { if (B.has(w)) comunes++; });
    // Conservador: la mitad o más de todas las palabras en común (con «Imposición de cinta …» no basta)
    return comunes >= Math.min(2, A.size, B.size) && comunes / (A.size + B.size - comunes) >= 0.5;
  }
  // Devuelve la tarea existente del mismo día con nombre parecido (o null)
  function buscarDuplicado(tareas, nueva) {
    return (tareas || []).find(t => t && t.id !== nueva.id && t.fecha === nueva.fecha && parecidos(t.titulo, nueva.titulo)) || null;
  }
  // Une el pedido a la tarea existente sin pisar nada que alguien ya trabajó:
  // siempre agrega la nota; en un borrador además agrega las secciones pedidas y completa datos vacíos.
  function unirPedido(t, r) {
    t.notas = [t.notas || "", r.notaPedido].filter(Boolean).join("\n\n");
    if (t.borrador) {
      t.secciones = t.secciones || {};
      Object.entries(r.tarea.secciones).forEach(([s, sv]) => { if (!t.secciones[s]) t.secciones[s] = sv; });
      ["hora", "horaFin", "lugar"].forEach(k => { if (!t[k] && r.tarea[k]) t[k] = r.tarea[k]; });
    }
    if (!t.pedido) t.pedido = r.tarea.pedido;
    r.registro.tareaId = t.id; r.registro.unido = true;
    return t;
  }

  // ── Estado que ve la oficina al consultar su folio ──
  const ESTADO_SEC = { Completada: "Lista", "En Progreso": "En curso", "No cumplida": "No se pudo", Cerrada: "Cerrada", Pendiente: "Por hacer" };
  function estadoPedido(reg, tareas, equipo) {
    const base = { folio: reg.folio, actividad: reg.titulo, fecha: reg.fecha, oficina: reg.area, recibido: reg.recibido };
    if (reg.rechazo) return { ...base, estado: "No se puede cubrir", motivo: reg.rechazo.motivo || "" };
    const t = (tareas || []).find(x => x && x.id === (reg.tareaId || reg.id));
    if (!t) return { ...base, estado: "No se puede cubrir", motivo: "" };
    if (t.borrador) return { ...base, estado: "En revisión" };
    const nom = id => ((equipo || []).find(p => p && p.id === id) || {}).nombre;
    const secs = [...new Set((reg.servicios || []).flatMap(k => (SERVICIOS[k] || { secs: [] }).secs))];
    const detalle = secs.filter(s => t.secciones && t.secciones[s]).map(s => {
      const sv = t.secciones[s];
      return { seccion: s, estado: ESTADO_SEC[sv.estado] || sv.estado || "Por hacer", responsables: (sv.responsables || []).map(nom).filter(Boolean) };
    });
    const listo = detalle.length && detalle.every(d => ["Lista", "Cerrada", "No se pudo"].includes(d.estado));
    return { ...base, estado: listo ? "Atendido" : "Aceptado", detalle };
  }
  // Acepta «P-0003», «p3» o «3»
  const normFolio = f => { const n = String(f || "").match(/\d+/); return n ? "P-" + String(parseInt(n[0], 10)).padStart(4, "0") : ""; };
  const siguienteFolio = registros => "P-" + String((registros || []).length + 1).padStart(4, "0");

  const api = { AREAS, SERVICIOS, limpiar, pedidoATarea, siguienteFolio, buscarDuplicado, unirPedido, estadoPedido, normFolio };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.CaccoPedidos = api;
})(this);
