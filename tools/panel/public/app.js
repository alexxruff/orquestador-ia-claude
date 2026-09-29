'use strict';

// Panel del plan de tareas. Sin framework y sin dependencias: el estado vive
// en `estado`, y cada cambio vuelve a pintar la vista activa.

const estado = {
  doc: null,          // documento tal como lo leimos del disco
  hash: null,         // huella de esa lectura; es la base del guardado
  siguienteId: 1,
  documentos: [],
  reposConfig: [],    // los repos de config/repositories.json
  soloLectura: false,
  vista: 'tablero',
  agruparPor: 'estado',
  docAbierto: null,
  edicion: null,      // { modo: 'alta'|'edicion', id }
  conflicto: null,    // datos del ultimo choque, para el modal
};

const $ = (id) => document.getElementById(id);
const crear = (etiqueta, clase, texto) => {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
};

function brindis(mensaje, tipo) {
  const nodo = $('brindis');
  nodo.textContent = mensaje;
  nodo.className = 'brindis' + (tipo ? ' ' + tipo : '');
  nodo.hidden = false;
  clearTimeout(brindis.reloj);
  brindis.reloj = setTimeout(() => { nodo.hidden = true; }, 3400);
}

// --- Carga ---------------------------------------------------------------

async function cargar({ silencioso } = {}) {
  const respuesta = await fetch('/api/estado');
  const datos = await respuesta.json();
  estado.doc = datos.doc;
  estado.hash = datos.hash;
  estado.siguienteId = datos.siguienteId;
  estado.reposConfig = datos.repos || [];
  estado.documentos = datos.documentos || [];
  estado.soloLectura = datos.soloLectura;

  const aviso = $('aviso');
  if (estado.soloLectura) {
    aviso.textContent = 'Solo lectura: el archivo tiene un formato que el panel no puede reescribir sin cambiarlo. No se guarda nada.';
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }
  $('btn-nueva').disabled = estado.soloLectura;

  pintar();
  if (!silencioso) brindis('Archivo leido.', 'bien');
}

// --- Utilidades del plan -------------------------------------------------

const tareas = () => (estado.doc && estado.doc.tareas) || [];
const estados = () => (estado.doc && estado.doc.reglas && estado.doc.reglas.estados) || [];
const porId = (id) => tareas().find((t) => t.id === id) || null;
const dependientesDe = (id) => tareas().filter((t) => t.dependsOn === id);
const repos = () => [...new Set([...(estado.reposConfig || []), ...tareas().map((t) => t.repo)].filter(Boolean))].sort();

// El tablero manda su propio orden de columnas: «proposed» va ANTES que
// «pending» porque una propuesta todavia no es trabajo aceptado —no existe
// hasta que se pasa a pending—. El resto conserva el orden del archivo.
// Esto es solo del panel: reglas.estados no se reordena en plan/tareas.json,
// que es de los agentes.
const ORDEN_PREFERIDO = ['proposed', 'pending'];

function estadosOrdenados() {
  const delArchivo = estados();
  const primeros = ORDEN_PREFERIDO.filter((e) => delArchivo.includes(e));
  return [...primeros, ...delArchivo.filter((e) => !primeros.includes(e))];
}

// --- Migraciones y devoluciones ------------------------------------------

const DESTINOS = ['local', 'produccion'];
const NOMBRE_DESTINO = { local: 'local', produccion: 'produccion' };

// Los dos campos nuevos pueden no estar: el archivo lo escriben tambien los
// agentes, y una tarea que no toca datos ni se devolvio nunca no los lleva.
// Se leen siempre por aqui para no repetir la comprobacion en cada vista.
const migracionDe = (tarea) => (tarea && tarea.migracion) || null;
const revisionesDe = (tarea) => (tarea && Array.isArray(tarea.revisiones) ? tarea.revisiones : []);
const corrioEn = (migracion, destino) =>
  !!migracion && Array.isArray(migracion.aplicadaEn) && migracion.aplicadaEn.includes(destino);
const faltaEnProduccion = (tarea) => {
  const migracion = migracionDe(tarea);
  return !!migracion && !corrioEn(migracion, 'produccion');
};
const conMigracion = () => tareas().filter((t) => migracionDe(t));

// Fecha local al segundo, con el mismo formato que usan las bitacoras del
// proyecto (AAAA-MM-DD HH:MM:SS). En UTC no serviria: la lee una persona.
function ahoraLocal() {
  const dos = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) +
    ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds());
}

// --- Vista: tablero ------------------------------------------------------

// El repo se distingue por color, no por leer la palabra: cada uno tiene un
// punto en su marca y el mismo tono en el borde de la tarjeta. El borde
// izquierdo sigue siendo el estado, asi que una tarjeta dice dos cosas a la vez
// —de que lado es y en que anda— sin agregar texto.
function claseRepo(repo) {
  return 'repo-' + String(repo || 'sin').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function marcaRepo(repo) {
  const marca = crear('span', 'marca repo ' + claseRepo(repo));
  marca.append(crear('span', 'punto punto-repo'));
  marca.append(document.createTextNode(' ' + repo));
  return marca;
}

function tarjeta(tarea) {
  const nodo = crear('article', 'tarjeta estado-' + tarea.estado + ' ' + claseRepo(tarea.repo));
  nodo.tabIndex = 0;

  const cab = crear('div', 'tarjeta-cab');
  cab.append(crear('span', 'tarjeta-num', '#' + tarea.id));
  cab.append(crear('span', 'tarjeta-titulo', tarea.titulo || '(sin titulo)'));
  nodo.append(cab);

  const meta = crear('div', 'tarjeta-meta');

  if (estado.agruparPor === 'estado') {
    meta.append(marcaRepo(tarea.repo));
  } else {
    const marca = crear('span', 'marca');
    marca.append(crear('span', 'punto punto-' + tarea.estado));
    marca.append(document.createTextNode(' ' + tarea.estado));
    meta.append(marca);
  }

  if (tarea.dependsOn !== null && tarea.dependsOn !== undefined) {
    const padre = porId(tarea.dependsOn);
    const texto = 'depende de #' + tarea.dependsOn + (padre && padre.estado !== 'done' ? ' (' + padre.estado + ')' : '');
    meta.append(crear('span', 'marca dep', texto));
  }

  const hijas = dependientesDe(tarea.id);
  if (hijas.length > 0) {
    meta.append(crear('span', 'marca bloquea', 'bloquea ' + hijas.map((h) => '#' + h.id).join(', ')));
  }

  if (tarea.handoff) meta.append(crear('span', 'marca handoff', 'handoff: ' + tarea.handoff));

  const migracion = migracionDe(tarea);
  if (migracion) {
    const falta = !corrioEn(migracion, 'produccion');
    meta.append(crear(
      'span',
      'marca migracion' + (falta ? ' pendiente' : ''),
      falta ? 'migracion · falta en produccion' : 'migracion · corrida'
    ));
  }

  const devoluciones = revisionesDe(tarea);
  if (devoluciones.length > 0) {
    meta.append(crear('span', 'marca devuelta',
      devoluciones.length === 1 ? 'devuelta 1 vez' : 'devuelta ' + devoluciones.length + ' veces'));
  }

  nodo.append(meta);

  // La revision se hace desde el tablero: aprobar o devolver no deberia obligar
  // a abrir la tarea, leerla entera y buscar el selector de estado.
  if (tarea.estado === 'in_review') nodo.append(accionesDeRevision(tarea));

  nodo.addEventListener('click', () => abrirTarea(tarea.id));
  nodo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirTarea(tarea.id); }
  });
  return nodo;
}

// Los botones viven DENTRO de la tarjeta, que ya abre la tarea al pulsarla:
// cada uno corta la propagacion para que aprobar no abra tambien el detalle.
function accionesDeRevision(tarea) {
  const caja = crear('div', 'tarjeta-acciones');

  const boton = (clase, texto, titulo, alPulsar) => {
    const nodo = crear('button', 'accion ' + clase, texto);
    nodo.type = 'button';
    nodo.title = titulo;
    nodo.disabled = estado.soloLectura;
    nodo.addEventListener('click', (evento) => {
      evento.stopPropagation();
      alPulsar();
    });
    return nodo;
  };

  caja.append(boton('aprobar', 'Aprobar', 'La probe y quedo bien: pasa a done', () => aprobar(tarea.id)));
  caja.append(boton('devolver', 'Devolver', 'Fallo al probarla: vuelve a in_progress con un motivo', () => devolver(tarea.id)));
  return caja;
}

async function aprobar(id) {
  const tarea = porId(id);
  if (!tarea) return;
  // Si la tarea traia migracion y todavia no corrio en produccion, aprobarla no
  // la corre: se avisa, porque es justo lo que se pierde de vista.
  const aviso = faltaEnProduccion(tarea) ? ' Ojo: su migracion sigue sin correr en produccion.' : '';
  await guardarPatch(id, { estado: 'done' }, 'Tarea #' + id + ' aprobada.' + aviso);
}

async function devolver(id) {
  const tarea = porId(id);
  if (!tarea) return;

  const motivo = await pedirMotivo({
    titulo: 'Devolver la tarea #' + id,
    mensaje: '«' + (tarea.titulo || '') + '» vuelve a in_progress.',
    textoOk: 'Devolver a in_progress',
  });
  if (!motivo) return;

  // El motivo se AGREGA a las devoluciones anteriores; la lista se vuelve a leer
  // de la tarea que hay en ese momento, para que un reintento tras un choque de
  // escritura no borre una devolucion que entro por medio.
  await guardarPatch(
    id,
    (actual) => ({
      estado: 'in_progress',
      revisiones: [...revisionesDe(actual), { fecha: ahoraLocal(), motivo }],
    }),
    'Tarea #' + id + ' devuelta a in_progress. El motivo queda en revisiones.'
  );
}

/**
 * Guarda un cambio suelto sobre una tarea, sin pasar por el formulario: es lo
 * que usan los botones de revision del tablero y las casillas de la vista de
 * migraciones. Va por el mismo PUT que el editor, asi que se valida, se detecta
 * el choque de escritura y se escribe de forma atomica igual que siempre.
 *
 * @param {object|function} cambios los campos a pisar, o una funcion que los
 *   calcula a partir de la tarea tal como esta ahora.
 */
async function guardarPatch(id, cambios, mensajeOk) {
  if (estado.soloLectura) { brindis('El panel esta en solo lectura.', 'error'); return false; }

  const original = porId(id);
  if (!original) { brindis('Ya no existe la tarea #' + id + '.', 'error'); return false; }

  const tarea = { ...original, ...(typeof cambios === 'function' ? cambios(original) : cambios) };

  try {
    const respuesta = await fetch('/api/tareas', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modo: 'edicion', base: estado.doc, hashBase: estado.hash, tarea }),
    });
    const datos = await respuesta.json();

    if (respuesta.ok) {
      estado.doc = datos.doc;
      estado.hash = datos.hash;
      estado.siguienteId = datos.siguienteId;
      pintar();
      // Si la tarea estaba abierta en lectura, que se vea el cambio.
      if (!$('telon-editor').hidden && estado.edicion && estado.edicion.id === id && !estado.edicion.editando) {
        abrirTarea(id);
      }
      brindis(mensajeOk, 'bien');
      return true;
    }

    if (respuesta.status === 409 && datos.error === 'conflicto') {
      abrirConflicto(datos, tarea, 'edicion', () => guardarPatch(id, cambios, mensajeOk));
      return false;
    }

    const detalle = datos.errores && datos.errores.length > 0 ? ' ' + datos.errores[0] : '';
    brindis((datos.error || 'No se pudo guardar.') + detalle, 'error');
  } catch (error) {
    brindis('No se pudo hablar con el panel: ' + error.message, 'error');
  }
  return false;
}

/**
 * Casilla de «ya se corrio aqui». Marcarla y desmarcarla es del usuario: el
 * script lo escribe el agente, pero la migracion la corre una persona.
 */
function casillaDestino(tarea, destino) {
  const migracion = migracionDe(tarea);
  const puesta = corrioEn(migracion, destino);

  const nodo = crear('button', 'casilla' + (puesta ? ' puesta' : ''));
  nodo.type = 'button';
  nodo.setAttribute('role', 'checkbox');
  nodo.setAttribute('aria-checked', puesta ? 'true' : 'false');
  nodo.disabled = estado.soloLectura;
  nodo.title = puesta
    ? 'Corrida en ' + NOMBRE_DESTINO[destino] + '. Pulsa para desmarcarla.'
    : 'Sin correr en ' + NOMBRE_DESTINO[destino] + '. Pulsa para marcarla.';
  nodo.append(crear('span', 'marco', puesta ? '\u2713' : ''));
  nodo.append(crear('span', null, NOMBRE_DESTINO[destino]));

  nodo.addEventListener('click', (evento) => {
    evento.stopPropagation();
    alternarDestino(tarea.id, destino);
  });
  return nodo;
}

async function alternarDestino(id, destino) {
  const migracion = migracionDe(porId(id));
  if (!migracion) return;
  const puesta = corrioEn(migracion, destino);

  await guardarPatch(
    id,
    (actual) => {
      const suya = migracionDe(actual);
      const antes = (suya && Array.isArray(suya.aplicadaEn) ? suya.aplicadaEn : []).filter((d) => d !== destino);
      // El orden de la lista es siempre el mismo (local, produccion) para que
      // el archivo no cambie solo por el orden en que se marcaron.
      const despues = puesta ? antes : [...antes, destino];
      return { migracion: { ...suya, aplicadaEn: DESTINOS.filter((d) => despues.includes(d)) } };
    },
    'Migracion de #' + id + (puesta ? ' desmarcada en ' : ' marcada en ') + NOMBRE_DESTINO[destino] + '.'
  );
}

// El tablero ocupa lo que queda de pantalla por debajo de la barra —y del
// aviso, cuando esta puesto—. `offsetTop` ya cuenta lo que haya arriba, sea lo
// que sea, asi que no hay ningun alto de barra escrito a mano en el CSS.
function ajustarAltoTablero() {
  const vista = $('vista-tablero');
  if (vista.hidden) return;
  const alto = window.innerHeight - vista.offsetTop;
  document.documentElement.style.setProperty('--alto-tablero', alto + 'px');
}

function pintarTablero() {
  const vista = $('vista-tablero');
  vista.textContent = '';
  ajustarAltoTablero();

  const claves = estado.agruparPor === 'estado' ? estadosOrdenados() : repos();
  const contenedor = crear('div', 'grupos');

  for (const clave of claves) {
    const delGrupo = tareas().filter((t) => (estado.agruparPor === 'estado' ? t.estado : t.repo) === clave);
    const grupo = crear('section', 'grupo');

    const cab = crear('div', 'grupo-cab');
    if (estado.agruparPor === 'estado') cab.append(crear('span', 'punto punto-' + clave));
    cab.append(crear('span', null, clave));
    cab.append(crear('span', 'cuenta', String(delGrupo.length)));
    grupo.append(cab);

    const lista = crear('div', 'grupo-lista');
    if (delGrupo.length === 0) lista.append(crear('p', 'vacio', 'Nada aqui.'));
    for (const tarea of delGrupo) lista.append(tarjeta(tarea));
    grupo.append(lista);
    contenedor.append(grupo);
  }

  // Un estado o repo que no este en el catalogo no se pierde de vista.
  const sueltas = tareas().filter((t) => !claves.includes(estado.agruparPor === 'estado' ? t.estado : t.repo));
  if (sueltas.length > 0) {
    const grupo = crear('section', 'grupo');
    const cab = crear('div', 'grupo-cab');
    cab.append(crear('span', null, 'fuera del catalogo'));
    cab.append(crear('span', 'cuenta', String(sueltas.length)));
    grupo.append(cab);
    const lista = crear('div', 'grupo-lista');
    for (const tarea of sueltas) lista.append(tarjeta(tarea));
    grupo.append(lista);
    contenedor.append(grupo);
  }

  vista.append(contenedor);
}

// --- Vista: dependencias -------------------------------------------------

function nodoCadena(tarea, profundidad, esUltimo, guiaPadre) {
  const fila = crear('div', 'eslabon');
  const guia = profundidad === 0 ? '' : guiaPadre + (esUltimo ? '└── ' : '├── ');
  fila.append(crear('span', 'guia', guia));

  const nodo = crear('div', 'nodo');
  nodo.append(crear('span', 'punto punto-' + tarea.estado));
  nodo.append(crear('span', 'num', '#' + tarea.id));
  nodo.append(crear('span', 'txt', tarea.titulo || '(sin titulo)'));
  nodo.append(crear('span', 'est', tarea.repo + ' · ' + tarea.estado));
  nodo.addEventListener('click', () => abrirTarea(tarea.id));
  fila.append(nodo);
  return fila;
}

function pintarDependencias() {
  const vista = $('vista-dependencias');
  vista.textContent = '';

  const raices = tareas().filter((t) => t.dependsOn === null || t.dependsOn === undefined || !porId(t.dependsOn));
  const contenedor = crear('div', 'cadenas');

  const conCadena = crear('section', 'cadena');
  conCadena.append(crear('div', 'cadena-titulo', 'Cadenas de dependencia'));

  let hayCadenas = false;
  const pintarRama = (tarea, profundidad, esUltimo, guiaPadre) => {
    conCadena.append(nodoCadena(tarea, profundidad, esUltimo, guiaPadre));
    const hijas = dependientesDe(tarea.id);
    const guia = profundidad === 0 ? '' : guiaPadre + (esUltimo ? '    ' : '│   ');
    hijas.forEach((hija, indice) => {
      hayCadenas = true;
      pintarRama(hija, profundidad + 1, indice === hijas.length - 1, guia);
    });
  };

  for (const raiz of raices) {
    if (dependientesDe(raiz.id).length > 0) pintarRama(raiz, 0, true, '');
  }
  if (!hayCadenas) conCadena.append(crear('p', 'vacio', 'Ninguna tarea depende de otra ahora mismo.'));
  contenedor.append(conCadena);

  const sueltas = tareas().filter(
    (t) => (t.dependsOn === null || t.dependsOn === undefined) && dependientesDe(t.id).length === 0
  );
  if (sueltas.length > 0) {
    const bloque = crear('section', 'cadena');
    bloque.append(crear('div', 'cadena-titulo', 'Sin dependencias (' + sueltas.length + ')'));
    for (const tarea of sueltas) bloque.append(nodoCadena(tarea, 0, true, ''));
    contenedor.append(bloque);
  }

  const rotas = tareas().filter((t) => t.dependsOn !== null && t.dependsOn !== undefined && !porId(t.dependsOn));
  if (rotas.length > 0) {
    const bloque = crear('section', 'cadena');
    bloque.append(crear('div', 'cadena-titulo', 'Dependencias rotas'));
    for (const tarea of rotas) {
      const fila = nodoCadena(tarea, 0, true, '');
      fila.append(crear('span', 'marca bloquea', 'apunta a #' + tarea.dependsOn + ', que no existe'));
      bloque.append(fila);
    }
    contenedor.append(bloque);
  }

  vista.append(contenedor);
}

// --- Vista: migraciones --------------------------------------------------

// La pregunta que contesta esta vista es una sola: que migraciones existen y
// cuales faltan por correr en produccion. Por eso las que faltan van arriba y
// no hay que buscarlas tarea por tarea.
function pintarMigraciones() {
  const vista = $('vista-migraciones');
  vista.textContent = '';

  const todas = conMigracion();
  const contenedor = crear('div', 'migraciones');

  if (todas.length === 0) {
    contenedor.append(crear('p', 'vacio', 'Ninguna tarea del plan lleva migracion.'));
    vista.append(contenedor);
    return;
  }

  const faltan = todas.filter(faltaEnProduccion);
  const resumen = crear('div', 'resumen-migraciones');
  resumen.append(crear('span', 'cifra' + (faltan.length > 0 ? ' alerta' : ''), String(faltan.length)));
  resumen.append(crear('span', null,
    (faltan.length === 1 ? 'migracion sin correr en produccion' : 'migraciones sin correr en produccion') +
    ', de ' + todas.length + ' en total.'));
  contenedor.append(resumen);

  const bloque = (titulo, lista, clase) => {
    if (lista.length === 0) return;
    const seccion = crear('section', 'grupo-migraciones' + (clase ? ' ' + clase : ''));
    seccion.append(crear('div', 'cadena-titulo', titulo + ' (' + lista.length + ')'));
    seccion.append(tablaMigraciones(lista));
    contenedor.append(seccion);
  };

  bloque('Falta correrlas en produccion', faltan, 'urgente');
  bloque('Ya corrieron en produccion', todas.filter((t) => !faltaEnProduccion(t)));

  vista.append(contenedor);
}

function tablaMigraciones(lista) {
  const caja = crear('div', 'tabla-scroll');
  const tabla = crear('table', 'tabla-migraciones');

  const cabecera = crear('tr');
  for (const nombre of ['Tarea', 'Script', 'Que le hace a los datos', 'Corrida en']) {
    cabecera.append(crear('th', null, nombre));
  }
  const encabezado = crear('thead');
  encabezado.append(cabecera);
  tabla.append(encabezado);

  const cuerpo = crear('tbody');
  for (const tarea of lista) {
    const migracion = migracionDe(tarea);
    const fila = crear('tr');

    const celdaTarea = crear('td', 'celda-tarea');
    const enlace = crear('button', 'enlace-tarea', '#' + tarea.id + ' ' + (tarea.titulo || '(sin titulo)'));
    enlace.type = 'button';
    enlace.addEventListener('click', () => abrirTarea(tarea.id));
    celdaTarea.append(enlace);
    const pie = crear('div', 'sub');
    pie.append(crear('span', 'punto punto-' + tarea.estado));
    pie.append(document.createTextNode(' ' + tarea.repo + ' · ' + tarea.estado));
    celdaTarea.append(pie);
    fila.append(celdaTarea);

    const celdaScript = crear('td', 'celda-script');
    celdaScript.append(crear('code', null, migracion.script));
    celdaScript.append(botonCopiar(migracion.script));
    fila.append(celdaScript);

    fila.append(crear('td', 'celda-quehace', migracion.queHace));

    const celdaDonde = crear('td', 'celda-donde');
    for (const destino of DESTINOS) celdaDonde.append(casillaDestino(tarea, destino));
    fila.append(celdaDonde);

    cuerpo.append(fila);
  }
  tabla.append(cuerpo);
  caja.append(tabla);
  return caja;
}

// --- Vista: documentos ---------------------------------------------------

function pintarListaDocumentos() {
  const lista = $('lista-docs');
  lista.textContent = '';

  for (const carpeta of ['propuestas', 'handoff', 'referencia']) {
    const delGrupo = estado.documentos.filter((d) => d.carpeta === carpeta);
    if (delGrupo.length === 0) continue;
    lista.append(crear('div', 'cabecera', 'plan/' + carpeta));
    for (const documento of delGrupo) {
      const clave = documento.carpeta + '/' + documento.nombre;
      const boton = crear('button', estado.docAbierto === clave ? 'activa' : null, documento.nombre.replace(/\.md$/, ''));
      boton.addEventListener('click', () => abrirDocumento(documento.carpeta, documento.nombre));
      lista.append(boton);
    }
  }
  if (estado.documentos.length === 0) lista.append(crear('p', 'vacio', 'No hay documentos.'));
}

async function abrirDocumento(carpeta, nombre) {
  estado.docAbierto = carpeta + '/' + nombre;
  pintarListaDocumentos();
  const contenedor = $('doc');
  contenedor.textContent = 'Cargando...';
  const respuesta = await fetch('/api/documento?carpeta=' + encodeURIComponent(carpeta) + '&nombre=' + encodeURIComponent(nombre));
  if (!respuesta.ok) { contenedor.textContent = 'No se pudo leer el documento.'; return; }
  const datos = await respuesta.json();
  // El HTML lo genera el renderizador del servidor, que escapa la fuente.
  contenedor.innerHTML = datos.html;
}

// --- Editor --------------------------------------------------------------

// Abrir una tarea la ENSENA, no la pone a editar: los campos son texto hasta
// que se pulsa «Editar». Asi no se cambia nada por descuido al ir a leerla.
function abrirTarea(id) {
  const tarea = porId(id);
  if (!tarea) return;

  estado.edicion = { modo: 'edicion', id, editando: false, movimientoConfirmado: false };
  $('titulo-editor').textContent = 'Tarea #' + id;
  pintarCabecera(tarea);
  pintarLectura(tarea);

  $('lectura').hidden = false;
  $('pie-lectura').hidden = false;
  $('formulario').hidden = true;
  $('btn-editar').disabled = estado.soloLectura;
  $('telon-editor').hidden = false;
  $('btn-editar').focus();
}

// El encabezado del modal: numero, en que anda la tarea y como se llama. Vive
// fuera del cuerpo desplazable a proposito —es lo que da contexto a todo lo que
// se lee debajo, y en una tarea larga se perdia al primer scroll.
function pintarCabecera(tarea) {
  const marcas = $('cab-marcas');
  marcas.textContent = '';

  const marcaEstado = crear('span', 'marca');
  marcaEstado.append(crear('span', 'punto punto-' + tarea.estado));
  marcaEstado.append(document.createTextNode(' ' + tarea.estado));
  marcas.append(marcaEstado);
  marcas.append(marcaRepo(tarea.repo));
  if (tarea.handoff) marcas.append(crear('span', 'marca handoff', 'handoff: ' + tarea.handoff));
  marcas.hidden = false;

  const titulo = $('cab-titulo-tarea');
  titulo.textContent = tarea.titulo;
  titulo.hidden = false;
}

function ocultarCabecera() {
  $('cab-marcas').hidden = true;
  $('cab-titulo-tarea').hidden = true;
}

// Las secciones que casi nadie necesita abiertas para ubicarse: son las dos
// largas, y dejarlas desplegadas empujaba el resto de la tarea fuera de la
// pantalla. El boton de copiar sigue en su rotulo, asi que el commit se copia
// sin llegar a abrirlo.
const PLEGADAS_DE_ENTRADA = ['Propuesta tecnica', 'Commit'];

function pintarLectura(tarea) {
  const caja = $('lectura');
  caja.textContent = '';

  // `paraCopiar`, si viene, pone un boton de copiar en la cabecera del campo.
  // La cabecera pliega y despliega la seccion; el boton de copiar va aparte,
  // como hermano, para no quedar dentro de otro boton.
  const campo = (nombre, pintarCuerpo, paraCopiar) => {
    const plegada = PLEGADAS_DE_ENTRADA.includes(nombre);
    const bloque = crear('div', 'campo' + (plegada ? ' plegado' : ''));

    const cabecera = crear('div', 'nombre');
    const tirador = crear('button', 'plegar');
    tirador.type = 'button';
    tirador.setAttribute('aria-expanded', String(!plegada));
    tirador.append(crear('span', 'flecha'));
    tirador.append(crear('span', null, nombre));
    cabecera.append(tirador);
    if (paraCopiar) cabecera.append(botonCopiar(paraCopiar));
    bloque.append(cabecera);

    const contenido = crear('div', 'contenido');
    contenido.append(pintarCuerpo());
    bloque.append(contenido);

    tirador.addEventListener('click', () => {
      const cerrada = bloque.classList.toggle('plegado');
      tirador.setAttribute('aria-expanded', String(!cerrada));
    });

    caja.append(bloque);
  };

  const texto = (valor, mono) => {
    const vacio = valor === null || valor === undefined || String(valor).trim() === '';
    const nodo = crear('div', 'cuerpo' + (mono ? ' mono' : '') + (vacio ? ' vacio' : ''));
    nodo.textContent = vacio ? '(vacio)' : String(valor);
    return nodo;
  };

  campo('Descripcion', () => texto(tarea.descripcion));

  campo('Criterios de aceptacion', () => {
    if (!Array.isArray(tarea.acceptance) || tarea.acceptance.length === 0) return texto(null);
    const lista = crear('ul', 'criterios');
    for (const criterio of tarea.acceptance) lista.append(crear('li', null, criterio));
    return lista;
  });

  campo('Depende de', () => {
    if (tarea.dependsOn === null || tarea.dependsOn === undefined) return texto(null);
    const padre = porId(tarea.dependsOn);
    const cuerpo = crear('div', 'cuerpo');
    if (!padre) {
      cuerpo.textContent = '#' + tarea.dependsOn + ' — esa tarea no existe';
      return cuerpo;
    }
    const enlace = crear('button', 'enlace-tarea', '#' + padre.id + ' ' + padre.titulo);
    enlace.type = 'button';
    enlace.addEventListener('click', () => abrirTarea(padre.id));
    cuerpo.append(enlace);
    cuerpo.append(document.createTextNode('  (' + padre.estado + ')'));
    return cuerpo;
  });

  const hijas = dependientesDe(tarea.id);
  if (hijas.length > 0) {
    campo('Bloquea a', () => {
      const cuerpo = crear('div', 'cuerpo');
      hijas.forEach((hija, indice) => {
        if (indice > 0) cuerpo.append(document.createTextNode('   '));
        const enlace = crear('button', 'enlace-tarea', '#' + hija.id + ' ' + hija.titulo);
        enlace.type = 'button';
        enlace.addEventListener('click', () => abrirTarea(hija.id));
        cuerpo.append(enlace);
      });
      return cuerpo;
    });
  }

  const migracion = migracionDe(tarea);
  if (migracion) {
    campo('Migracion', () => {
      const cuerpo = crear('div', 'migracion-lectura');
      const linea = crear('div', 'script');
      linea.append(crear('code', null, migracion.script));
      linea.append(botonCopiar(migracion.script));
      cuerpo.append(linea);
      cuerpo.append(crear('p', 'quehace', migracion.queHace));
      const donde = crear('div', 'donde');
      donde.append(crear('span', 'rotulo', 'corrida en'));
      for (const destino of DESTINOS) donde.append(casillaDestino(tarea, destino));
      cuerpo.append(donde);
      return cuerpo;
    });
  }

  const devoluciones = revisionesDe(tarea);
  if (devoluciones.length > 0) {
    campo('Devoluciones', () => {
      const cuerpo = crear('div', 'devoluciones');
      for (const entrada of devoluciones) {
        const bloque = crear('div', 'devolucion');
        bloque.append(crear('div', 'cuando', entrada.fecha));
        bloque.append(crear('div', 'motivo', entrada.motivo));
        cuerpo.append(bloque);
      }
      return cuerpo;
    });
  }

  campo('Propuesta tecnica', () => marcado(tarea.propuestaTecnica));
  campo(
    'Commit',
    () => texto(tarea.commit, true),
    tarea.commit && String(tarea.commit).trim() !== '' ? tarea.commit : null
  );
}

// La propuesta tecnica se escribe en Markdown y en un solo renglon: se
// desdobla su enumeracion y se pinta con el mismo renderizador que los
// documentos de plan/, que ya escapa el HTML.
function marcado(valor) {
  const texto = () => {
    const nodo = crear('div', 'cuerpo');
    nodo.textContent = String(valor);
    return nodo;
  };

  const vacio = valor === null || valor === undefined || String(valor).trim() === '';
  if (vacio) {
    const nodo = crear('div', 'cuerpo vacio');
    nodo.textContent = '(vacio)';
    return nodo;
  }
  // Si el renderizador no cargo —lo tipico: quedo arriba un servidor viejo que
  // todavia no sirve /lib/markdown.js— la tarea se abre igual, en texto plano.
  // Nunca al reves: un campo no puede tumbar la vista entera.
  if (!window.Markdown) {
    if (!marcado.avisado) {
      marcado.avisado = true;
      brindis('Reinicia el panel (npm run panel) para ver la propuesta con formato.', 'error');
    }
    return texto();
  }

  const nodo = crear('div', 'cuerpo md');
  nodo.innerHTML = window.Markdown.render(window.Markdown.desdoblarEnumeracion(valor));
  return nodo;
}

async function alPortapapeles(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso o sin contexto seguro: la seleccion de toda la vida.
    const caja = document.createElement('textarea');
    caja.value = texto;
    caja.setAttribute('readonly', '');
    caja.style.position = 'fixed';
    caja.style.opacity = '0';
    document.body.append(caja);
    caja.select();
    let bien = false;
    try { bien = document.execCommand('copy'); } catch { bien = false; }
    caja.remove();
    return bien;
  }
}

function botonCopiar(contenido) {
  const boton = crear('button', 'copiar', 'Copiar');
  boton.type = 'button';
  boton.title = 'Copiar al portapapeles';
  boton.addEventListener('click', async () => {
    const bien = await alPortapapeles(String(contenido));
    if (!bien) { brindis('No se pudo copiar. Selecciona el texto a mano.', 'error'); return; }
    boton.textContent = 'Copiado';
    boton.classList.add('hecho');
    clearTimeout(boton.reloj);
    boton.reloj = setTimeout(() => {
      boton.textContent = 'Copiar';
      boton.classList.remove('hecho');
    }, 1800);
  });
  return boton;
}

/**
 * Llena un select con los repos del plan.
 * @param {string|null} valorActual se agrega aunque no este en la lista, para
 *   no cambiarle en silencio el repo a una tarea que ya lo tenia.
 * @param {string|null} etiquetaVacia si viene, se antepone una opcion vacia.
 */
function llenarSelectRepos(select, valorActual, etiquetaVacia) {
  select.textContent = '';

  if (etiquetaVacia) {
    const vacia = crear('option', null, etiquetaVacia);
    vacia.value = '';
    select.append(vacia);
  }

  const opciones = repos();
  if (opciones.length === 0) opciones.push('backend', 'frontend');
  if (valorActual && !opciones.includes(valorActual)) opciones.push(valorActual);

  for (const repo of opciones) {
    const opcion = crear('option', null, repo);
    opcion.value = repo;
    select.append(opcion);
  }
}

function abrirEditor(modo, id) {
  if (estado.soloLectura) { brindis('El panel esta en solo lectura.', 'error'); return; }

  const tarea = modo === 'edicion' ? porId(id) : null;
  estado.edicion = {
    modo,
    id: modo === 'edicion' ? id : estado.siguienteId,
    editando: true,
    movimientoConfirmado: false,
  };

  $('titulo-editor').textContent = modo === 'alta' ? 'Nueva tarea' : 'Editando la tarea #' + id;
  ocultarCabecera();
  $('campo-id').value = '#' + estado.edicion.id;
  $('nota-id').textContent = modo === 'alta' ? 'Se asigna solo, es el siguiente libre.' : '';

  // Repo y handoff se eligen de una lista cerrada: los dos son valores que los
  // agentes leen del archivo, y escribirlos a mano invita a la errata. Las
  // opciones salen de config/repositories.json y de los repos que ya existen
  // en el plan.
  llenarSelectRepos($('campo-repo'), tarea ? tarea.repo : null, null);
  llenarSelectRepos($('campo-handoff'), tarea ? tarea.handoff : null, 'ninguno');

  const selEstado = $('campo-estado');
  selEstado.textContent = '';
  for (const nombre of estadosOrdenados()) {
    const opcion = crear('option', null, nombre);
    opcion.value = nombre;
    selEstado.append(opcion);
  }

  const selDepende = $('campo-depends');
  selDepende.textContent = '';
  const ninguna = crear('option', null, 'no depende de ninguna');
  ninguna.value = '';
  selDepende.append(ninguna);
  for (const otra of tareas()) {
    if (modo === 'edicion' && otra.id === id) continue;
    const opcion = crear('option', null, '#' + otra.id + ' · ' + (otra.titulo || '') + '  [' + otra.repo + ' · ' + otra.estado + ']');
    opcion.value = String(otra.id);
    selDepende.append(opcion);
  }

  $('campo-repo').value = tarea ? tarea.repo : (repos()[0] || '');
  $('campo-titulo').value = tarea ? tarea.titulo : '';
  $('campo-descripcion').value = tarea ? tarea.descripcion : '';
  $('campo-acceptance').value = tarea && Array.isArray(tarea.acceptance) ? tarea.acceptance.join('\n') : '';
  $('campo-estado').value = tarea ? tarea.estado : (estados()[0] || '');  // pending, del archivo
  $('campo-depends').value = tarea && tarea.dependsOn !== null && tarea.dependsOn !== undefined ? String(tarea.dependsOn) : '';
  $('campo-handoff').value = tarea && tarea.handoff ? tarea.handoff : '';
  $('campo-propuesta').value = tarea && tarea.propuestaTecnica ? tarea.propuestaTecnica : '';
  $('campo-commit').value = tarea && tarea.commit ? tarea.commit : '';

  const migracion = migracionDe(tarea);
  $('campo-migracion-script').value = migracion ? migracion.script : '';
  $('campo-migracion-quehace').value = migracion ? migracion.queHace : '';
  // Donde se corrio NO se edita aqui: se marca en el tablero y en la vista de
  // migraciones. El formulario lo respeta tal cual estaba.
  $('nota-aplicada').textContent = migracion
    ? 'Corrida en: ' + (migracion.aplicadaEn.length > 0 ? migracion.aplicadaEn.join(', ') : 'ningun lado todavia') +
      '. Eso se marca en la vista de Migraciones, no aqui.'
    : '';

  actualizarNotaDepende();
  $('errores').hidden = true;
  $('lectura').hidden = true;
  $('pie-lectura').hidden = true;
  $('formulario').hidden = false;
  $('telon-editor').hidden = false;
  $('campo-titulo').focus();
}

function actualizarNotaDepende() {
  const valor = $('campo-depends').value;
  const nota = $('nota-depends');
  if (!valor) { nota.textContent = ''; return; }
  const padre = porId(Number(valor));
  nota.textContent = padre ? 'Estado de #' + padre.id + ': ' + padre.estado : '';
}

function cerrarEditor() {
  $('telon-editor').hidden = true;
  $('formulario').hidden = true;
  $('lectura').hidden = true;
  $('pie-lectura').hidden = true;
  estado.edicion = null;
}

// Volver de editar a leer, sin cerrar el panel: cancelar una edicion no deberia
// echarte de la tarea que estabas mirando.
function volverALectura() {
  if (estado.edicion && estado.edicion.modo === 'edicion' && porId(estado.edicion.id)) {
    abrirTarea(estado.edicion.id);
  } else {
    cerrarEditor();
  }
}

// --- Confirmar ----------------------------------------------------------

// Devuelve una promesa que se resuelve a true si el usuario confirma.
function confirmar({ titulo, mensaje, textoOk, movimiento }) {
  return new Promise((resolver) => {
    $('confirmar-titulo').textContent = titulo;
    $('confirmar-mensaje').textContent = mensaje;
    $('btn-confirmar-si').textContent = textoOk || 'Confirmar';

    const caja = $('confirmar-movimiento');
    caja.textContent = '';
    if (movimiento) {
      const columna = (nombre) => {
        const nodo = crear('span', 'columna');
        nodo.append(crear('span', 'punto punto-' + nombre));
        nodo.append(crear('strong', null, nombre));
        return nodo;
      };
      caja.append(columna(movimiento.desde));
      caja.append(crear('span', 'flecha', '\u2192'));
      caja.append(columna(movimiento.hasta));
      caja.hidden = false;
    } else {
      caja.hidden = true;
    }

    const terminar = (respuesta) => {
      $('telon-confirmar').hidden = true;
      $('btn-confirmar-si').removeEventListener('click', alSi);
      $('btn-confirmar-no').removeEventListener('click', alNo);
      resolver(respuesta);
    };
    const alSi = () => terminar(true);
    const alNo = () => terminar(false);

    $('btn-confirmar-si').addEventListener('click', alSi);
    $('btn-confirmar-no').addEventListener('click', alNo);
    estado.cancelarConfirmacion = alNo;

    $('telon-confirmar').hidden = false;
    $('btn-confirmar-si').focus();
  });
}

/**
 * Pide el motivo de una devolucion. Devuelve el texto, o null si se cancela.
 * Sin motivo no se devuelve nada: el motivo ES la devolucion —lo que el agente
 * va a leer cuando retome la tarea—, y una devolucion muda no le dice nada.
 */
function pedirMotivo({ titulo, mensaje, textoOk }) {
  return new Promise((resolver) => {
    $('motivo-titulo').textContent = titulo;
    $('motivo-mensaje').textContent = mensaje;
    $('btn-motivo-si').textContent = textoOk || 'Devolver';
    $('campo-motivo').value = '';
    $('motivo-error').hidden = true;

    const terminar = (respuesta) => {
      $('telon-motivo').hidden = true;
      $('btn-motivo-si').removeEventListener('click', alSi);
      $('btn-motivo-no').removeEventListener('click', alNo);
      estado.cancelarMotivo = null;
      resolver(respuesta);
    };
    const alSi = () => {
      const motivo = $('campo-motivo').value.trim();
      if (motivo === '') {
        $('motivo-error').textContent = 'Escribe por que la devuelves: es lo que va a leer el agente al retomarla.';
        $('motivo-error').hidden = false;
        $('campo-motivo').focus();
        return;
      }
      terminar(motivo);
    };
    const alNo = () => terminar(null);

    $('btn-motivo-si').addEventListener('click', alSi);
    $('btn-motivo-no').addEventListener('click', alNo);
    estado.cancelarMotivo = alNo;

    $('telon-motivo').hidden = false;
    $('campo-motivo').focus();
  });
}

// Lee el formulario y devuelve una tarea con la forma exacta del esquema.
function tareaDelFormulario() {
  const texto = (id) => $(id).value.trim();
  const textoONulo = (id) => (texto(id) === '' ? null : $(id).value.trim());
  const depende = $('campo-depends').value;

  return {
    id: estado.edicion.id,
    repo: texto('campo-repo'),
    titulo: texto('campo-titulo'),
    descripcion: texto('campo-descripcion'),
    acceptance: $('campo-acceptance').value.split('\n').map((l) => l.trim()).filter((l) => l !== ''),
    handoff: textoONulo('campo-handoff'),
    dependsOn: depende === '' ? null : Number(depende),
    estado: $('campo-estado').value,
    propuestaTecnica: textoONulo('campo-propuesta'),
    commit: textoONulo('campo-commit'),
    migracion: migracionDelFormulario(),
    // `revisiones` no viaja: no se edita a mano. Al no venir en la peticion, el
    // servidor conserva la que ya tenia la tarea.
  };
}

// Sin script ni descripcion no hay migracion, y el campo se queda en null, que
// es lo que lleva una tarea que no toca los datos que ya existen.
function migracionDelFormulario() {
  const script = $('campo-migracion-script').value.trim();
  const queHace = $('campo-migracion-quehace').value.trim();
  if (script === '' && queHace === '') return null;

  const previa = migracionDe(porId(estado.edicion.id));
  return {
    script,
    queHace,
    aplicadaEn: previa && Array.isArray(previa.aplicadaEn) ? previa.aplicadaEn.slice() : [],
  };
}

function mostrarErrores(mensaje, errores) {
  const caja = $('errores');
  caja.textContent = '';
  caja.append(crear('strong', null, mensaje));
  if (errores && errores.length > 0) {
    const lista = crear('ul');
    for (const error of errores) lista.append(crear('li', null, error));
    caja.append(lista);
  }
  caja.hidden = false;
}

async function guardar(evento) {
  if (evento) evento.preventDefault();
  const tarea = tareaDelFormulario();
  const modo = estado.edicion.modo;

  // Cambiar de estado es mover la tarjeta de columna. Se pregunta antes, una
  // sola vez por edicion: es el cambio mas facil de hacer sin querer y el mas
  // visible para los agentes que leen el archivo.
  if (modo === 'edicion' && !estado.edicion.movimientoConfirmado) {
    const original = porId(tarea.id);
    if (original && original.estado !== tarea.estado) {
      const acepta = await confirmar({
        titulo: 'Mover la tarea de columna',
        mensaje: 'La tarea #' + tarea.id + ' «' + (tarea.titulo || '') + '» va a cambiar de estado.',
        textoOk: 'Mover a ' + tarea.estado,
        movimiento: { desde: original.estado, hasta: tarea.estado },
      });
      if (!acepta) return;
      estado.edicion.movimientoConfirmado = true;
    }
  }

  $('btn-guardar').disabled = true;
  try {
    const respuesta = await fetch('/api/tareas', {
      method: modo === 'alta' ? 'POST' : 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modo, base: estado.doc, hashBase: estado.hash, tarea }),
    });
    const datos = await respuesta.json();

    if (respuesta.ok) {
      estado.doc = datos.doc;
      estado.hash = datos.hash;
      estado.siguienteId = datos.siguienteId;
      pintar();
      if (modo === 'alta') cerrarEditor(); else abrirTarea(tarea.id);
      brindis(modo === 'alta' ? 'Tarea #' + tarea.id + ' creada.' : 'Tarea #' + tarea.id + ' guardada.', 'bien');
      return;
    }

    if (respuesta.status === 409 && datos.error === 'conflicto') {
      abrirConflicto(datos, tarea, modo, () => guardar());
      return;
    }

    mostrarErrores(datos.error || 'No se pudo guardar.', datos.errores);
  } catch (error) {
    mostrarErrores('No se pudo hablar con el panel: ' + error.message);
  } finally {
    $('btn-guardar').disabled = false;
  }
}

// --- Conflicto -----------------------------------------------------------

const ETIQUETAS = {
  id: 'numero', repo: 'repo', titulo: 'titulo', descripcion: 'descripcion',
  acceptance: 'criterios de aceptacion', handoff: 'handoff', dependsOn: 'depende de',
  estado: 'estado', propuestaTecnica: 'propuesta tecnica', commit: 'commit',
  migracion: 'migracion', revisiones: 'devoluciones',
};

function comoTexto(valor) {
  if (valor === null || valor === undefined) return '(vacio)';
  if (Array.isArray(valor)) return valor.length === 0 ? '(lista vacia)' : valor.map((v) => '· ' + v).join('\n');
  if (typeof valor === 'object') return JSON.stringify(valor, null, 2);
  return String(valor);
}

function recortar(texto, limite) {
  const plano = String(texto);
  return plano.length > limite ? plano.slice(0, limite) + '…' : plano;
}

function abrirConflicto(datos, tarea, modo, reintentar) {
  estado.conflicto = { datos, tarea, modo, reintentar };

  $('conflicto-resumen').textContent = datos.resumen;
  $('conflicto-nota').textContent = datos.choca
    ? 'Los cambios de fuera tocan la misma tarea #' + tarea.id + ' que estas editando, asi que no se puede juntar solo.'
    : 'Nada de lo que cambio toca la tarea #' + tarea.id + ', asi que tus cambios se pueden guardar encima de la version nueva sin perder ninguno de los dos lados.';

  const lista = $('conflicto-cambios');
  lista.textContent = '';
  for (const cambio of datos.cambios) {
    const item = crear('li', cambio.id === tarea.id ? 'mio' : null);

    if (cambio.tipo === 'tarea-nueva' || cambio.tipo === 'tarea-borrada') {
      item.append(crear('div', 'quien', cambio.tipo === 'tarea-nueva' ? 'tarea nueva' : 'tarea borrada'));
      const que = crear('div', 'que');
      que.append(crear('b', null, '#' + cambio.id));
      que.append(document.createTextNode(' ' + cambio.titulo));
      item.append(que);
      lista.append(item);
      continue;
    }

    item.append(crear('div', 'quien', cambio.tipo === 'sobre' ? 'cabecera del archivo' : 'tarea #' + cambio.id + (cambio.id === tarea.id ? ' — la que estas editando' : '')));
    const que = crear('div', 'que');
    if (cambio.tipo !== 'sobre') que.append(document.createTextNode(cambio.titulo + ' — cambio '));
    que.append(crear('b', null, cambio.etiqueta));
    item.append(que);

    const valores = crear('div', 'valores');
    valores.append(crear('span', 'rotulo', 'antes'));
    valores.append(crear('span', 'valor antes', recortar(comoTexto(cambio.antes), 300)));
    valores.append(crear('span', 'rotulo', 'ahora'));
    valores.append(crear('span', 'valor despues', recortar(comoTexto(cambio.despues), 300)));
    item.append(valores);
    lista.append(item);
  }

  $('conflicto-lados').hidden = true;
  $('btn-conflicto-lados').hidden = false;
  $('btn-conflicto-reaplicar').hidden = datos.choca;
  $('telon-conflicto').hidden = false;
}

function pintarLados() {
  const { datos, tarea } = estado.conflicto;
  const suya = datos.suTarea;
  const contenedor = $('lados');
  contenedor.textContent = '';

  const columna = (clase, titulo, valores) => {
    const lado = crear('div', 'lado' + (clase ? ' ' + clase : ''));
    lado.append(crear('div', 'lado-cab', titulo));
    const cuerpo = crear('div', 'lado-cuerpo');
    for (const clave of Object.keys(ETIQUETAS)) {
      const mio = tarea[clave];
      const suyo = suya ? suya[clave] : undefined;
      const difiere = JSON.stringify(mio ?? null) !== JSON.stringify(suyo ?? null);
      const campo = crear('div', 'campo-lado' + (difiere ? ' difiere' : ''));
      campo.append(crear('div', 'nombre', ETIQUETAS[clave]));
      const valor = valores[clave];
      const contenido = crear('div', 'contenido' + (valor === null || valor === undefined ? ' nulo' : ''), recortar(comoTexto(valor), 600));
      campo.append(contenido);
      cuerpo.append(campo);
    }
    lado.append(cuerpo);
    return lado;
  };

  contenedor.append(columna('tuyo', 'Lo que escribiste tu (sin guardar)', tarea));
  contenedor.append(columna(null, suya ? 'Lo que hay ahora en el archivo' : 'La tarea ya no esta en el archivo', suya || {}));
  $('conflicto-lados').hidden = false;
  $('btn-conflicto-lados').hidden = true;
}

function cerrarConflicto() {
  $('telon-conflicto').hidden = true;
  estado.conflicto = null;
}

// Vuelve a intentar el guardado tomando como base la version que hay ahora en
// disco. Solo se ofrece cuando los cambios de fuera no tocan esta tarea.
async function reaplicar() {
  const { datos, reintentar } = estado.conflicto;
  estado.doc = datos.actual;
  estado.hash = datos.hashActual;
  cerrarConflicto();
  await reintentar();
}

// Tira lo escrito y vuelve a leer el archivo.
async function recargarPerdiendo() {
  cerrarConflicto();
  cerrarEditor();
  await cargar({ silencioso: true });
  brindis('Recargado desde el archivo. Lo que estabas escribiendo se perdio.', 'error');
}

// --- Pintado y arranque --------------------------------------------------

function pintar() {
  $('vista-tablero').hidden = estado.vista !== 'tablero';
  $('vista-dependencias').hidden = estado.vista !== 'dependencias';
  $('vista-migraciones').hidden = estado.vista !== 'migraciones';
  $('vista-documentos').hidden = estado.vista !== 'documentos';
  $('agrupar').hidden = estado.vista !== 'tablero';

  if (estado.vista === 'tablero') pintarTablero();
  if (estado.vista === 'dependencias') pintarDependencias();
  if (estado.vista === 'migraciones') pintarMigraciones();
  if (estado.vista === 'documentos') pintarListaDocumentos();
}

function conectar() {
  $('pestanas').addEventListener('click', (evento) => {
    const boton = evento.target.closest('.pestana');
    if (!boton) return;
    estado.vista = boton.dataset.vista;
    for (const otro of $('pestanas').children) otro.classList.toggle('activa', otro === boton);
    pintar();
    if (estado.vista === 'documentos' && !estado.docAbierto && estado.documentos.length > 0) {
      abrirDocumento(estado.documentos[0].carpeta, estado.documentos[0].nombre);
    }
  });

  $('agrupar').addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    estado.agruparPor = chip.dataset.agrupar;
    for (const otro of $('agrupar').querySelectorAll('.chip')) otro.classList.toggle('activa', otro === chip);
    pintar();
  });

  window.addEventListener('resize', ajustarAltoTablero);

  $('btn-recargar').addEventListener('click', () => cargar());
  $('btn-nueva').addEventListener('click', () => abrirEditor('alta'));
  $('btn-cerrar-editor').addEventListener('click', cerrarEditor);
  $('btn-cerrar-lectura').addEventListener('click', cerrarEditor);
  $('btn-cancelar').addEventListener('click', volverALectura);
  $('btn-editar').addEventListener('click', () => {
    if (estado.edicion) abrirEditor('edicion', estado.edicion.id);
  });
  $('formulario').addEventListener('submit', guardar);
  $('campo-depends').addEventListener('change', actualizarNotaDepende);

  $('btn-conflicto-volver').addEventListener('click', cerrarConflicto);
  $('btn-conflicto-lados').addEventListener('click', pintarLados);
  $('btn-conflicto-reaplicar').addEventListener('click', reaplicar);
  $('btn-conflicto-recargar').addEventListener('click', recargarPerdiendo);

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    if (!$('telon-motivo').hidden) estado.cancelarMotivo();
    else if (!$('telon-confirmar').hidden) estado.cancelarConfirmacion();
    else if (!$('telon-conflicto').hidden) cerrarConflicto();
    else if (!$('telon-editor').hidden) {
      if (estado.edicion && estado.edicion.editando && estado.edicion.modo === 'edicion') volverALectura();
      else cerrarEditor();
    }
  });
}

conectar();
cargar({ silencioso: true });
