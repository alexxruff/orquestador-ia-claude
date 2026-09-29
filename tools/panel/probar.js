'use strict';

// Pruebas del panel. Corren SIEMPRE contra una copia de plan/tareas.json en un
// directorio temporal: este archivo nunca toca el plan de verdad.
//
//   npm run panel:probar

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const REAL = path.join(RAIZ, 'plan', 'tareas.json');
const { AlmacenTareas: Almacen } = require('./lib/store');
const HASH_REAL = new Almacen(REAL).leer().hash;

// Casi todas las pruebas necesitan al menos una tarea. Un plan recien iniciado
// no tiene ninguna, asi que en ese caso corren sobre una copia sembrada con las
// tareas de ejemplo de plantillas/tareas-ejemplo.json. Con tareas, corren sobre el plan.
function planParaProbar() {
  const doc = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  if (doc.tareas.length > 0) return REAL;
  const ejemplo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'plantillas', 'tareas-ejemplo.json'), 'utf8'));
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-semilla-'));
  const destino = path.join(carpeta, 'tareas.json');
  fs.writeFileSync(destino, JSON.stringify({ ...doc, tareas: ejemplo }, null, 2) + '\n');
  console.log('El plan no tiene tareas: las pruebas corren sobre una copia con las de plantillas/tareas-ejemplo.json.');
  return destino;
}
const ORIGINAL = planParaProbar();

let pasadas = 0;
let falladas = 0;
let omitidas = 0;

function comprobar(descripcion, condicion, detalle) {
  if (condicion) {
    pasadas += 1;
    console.log('  ok   ' + descripcion);
  } else {
    falladas += 1;
    console.log('  FALLA ' + descripcion + (detalle ? '\n         ' + detalle : ''));
  }
}

// Dos pruebas necesitan un plan ya en marcha: una propuesta tecnica escrita, y
// al menos un documento en plan/propuestas/. En un plan recien creado eso no
// existe todavia, y dejarlas fallar entrenaria a ignorar los fallos. Se omiten
// mientras no haya con que correrlas, y vuelven solas en cuanto se trabaje la
// primera tarea.
function omitir(descripcion, motivo) {
  omitidas += 1;
  console.log('  --   ' + descripcion + '  (' + motivo + ')');
}

function bloque(titulo) { console.log('\n' + titulo); }

function copiaTemporal() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-plan-'));
  const destino = path.join(carpeta, 'tareas.json');
  fs.copyFileSync(ORIGINAL, destino);
  return destino;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarServidor(direccion, intentos = 50) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const respuesta = await fetch(direccion + '/api/estado');
      if (respuesta.ok) return await respuesta.json();
    } catch { /* todavia no levanta */ }
    await dormir(100);
  }
  throw new Error('El servidor no levanto.');
}

async function principal() {
  // --- 1. Modulos sueltos, sin servidor --------------------------------

  bloque('El formato del archivo no cambia');
  const { AlmacenTareas, serializar, finDeLinea } = require('./lib/store');
  const { CAMPOS } = require('./lib/validate');
  const enOrden = (tarea) => {
    const claves = Object.keys(tarea);
    return claves.join(',') === CAMPOS.filter((c) => claves.includes(c)).join(',');
  };
  const almacenReal = new AlmacenTareas(ORIGINAL);
  const lectura = almacenReal.leer();
  comprobar('plan/tareas.json se reescribe byte a byte igual', new AlmacenTareas(REAL).leer().fiel);
  comprobar('el orden de las claves es el del esquema',
    lectura.doc.tareas.every(enOrden), Object.keys(lectura.doc.tareas[0]).join(','));
  comprobar('el plan de verdad pasa la validacion entera',
    require('./lib/validate').validarDocumento(lectura.doc).length === 0,
    require('./lib/validate').validarDocumento(lectura.doc).join(' | '));

  // En Windows, Git con core.autocrlf=true saca el archivo en CRLF aunque en el
  // repo viva en LF. Serializando siempre con LF, el panel arrancaba en solo
  // lectura sin que nada estuviera mal; escribiendo igual, le habria convertido
  // el archivo entero a los agentes que lo comparten. Se respeta el que trae.
  const enLF = (t) => t.replace(/\r\n/g, '\n');
  const enCRLF = (t) => enLF(t).replace(/\n/g, '\r\n');
  comprobar('reconoce un archivo en LF', finDeLinea('{\n  "a": 1\n}\n') === '\n');
  comprobar('reconoce un archivo en CRLF', finDeLinea('{\r\n  "a": 1\r\n}\r\n') === '\r\n');
  comprobar('serializar en CRLF no cambia el documento',
    JSON.stringify(JSON.parse(serializar(lectura.doc, '\r\n'))) === JSON.stringify(lectura.doc));
  comprobar('serializar en CRLF es lo mismo con los renglones convertidos',
    serializar(lectura.doc, '\r\n') === enCRLF(serializar(lectura.doc)));
  comprobar('un salto DENTRO de una cadena no se toca',
    serializar({ a: 'uno\ndos' }, '\r\n') === '{\r\n  "a": "uno\\ndos"\r\n}\r\n');

  bloque('El fin de linea del archivo se conserva al escribir');
  for (const [nombre, convertir, esperado] of [['CRLF', enCRLF, '\r\n'], ['LF', enLF, '\n']]) {
    const ruta = copiaTemporal();
    fs.writeFileSync(ruta, convertir(fs.readFileSync(ruta, 'utf8')), 'utf8');
    const almacenCopia = new AlmacenTareas(ruta);
    const antesDeEscribir = almacenCopia.leer();
    comprobar(`una copia en ${nombre} se puede escribir`,
      antesDeEscribir.fiel && antesDeEscribir.fin === esperado);

    const doc = antesDeEscribir.doc;
    doc.tareas[0].commit = 'lo puso la prueba';
    almacenCopia.escribirAtomico(doc);

    const despues = fs.readFileSync(ruta, 'utf8');
    const saltos = despues.split('\n').length - 1;
    const conRetorno = (despues.match(/\r\n/g) || []).length;
    comprobar(`despues de escribir sigue en ${nombre}`,
      conRetorno === (esperado === '\r\n' ? saltos : 0), `${conRetorno} de ${saltos} renglones`);
    comprobar(`el cambio quedo guardado en ${nombre}`,
      JSON.parse(despues).tareas[0].commit === 'lo puso la prueba');
    comprobar(`y la copia en ${nombre} sigue siendo escribible`, almacenCopia.leer().fiel);
    fs.rmSync(path.dirname(ruta), { recursive: true, force: true });
  }

  bloque('Una tarea mal formada no se guarda');
  const { validarTarea } = require('./lib/validate');
  const buena = {
    id: 99, repo: 'backend', titulo: 'Prueba', descripcion: '', acceptance: ['algo'],
    handoff: null, dependsOn: 1, estado: 'pending', propuestaTecnica: null, commit: null,
  };
  comprobar('una tarea bien formada pasa', validarTarea(buena, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('un estado inventado se rechaza',
    validarTarea({ ...buena, estado: 'casi' }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un campo de mas se rechaza',
    validarTarea({ ...buena, prioridad: 'alta' }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un campo de menos se rechaza',
    validarTarea((({ commit, ...resto }) => resto)(buena), lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un titulo vacio se rechaza',
    validarTarea({ ...buena, titulo: '   ' }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('dependsOn a una tarea que no existe se rechaza',
    validarTarea({ ...buena, dependsOn: 4242 }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('depender de si misma se rechaza',
    validarTarea({ ...buena, dependsOn: 99 }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un id repetido se rechaza',
    validarTarea({ ...buena, id: 1 }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('acceptance que no es lista se rechaza',
    validarTarea({ ...buena, acceptance: 'uno' }, lectura.doc, { modo: 'alta' }).length > 0);

  bloque('La migracion se valida, o no se guarda');
  const conMigracion = {
    ...buena,
    migracion: { script: 'scripts/migrateAlgo.js', queHace: 'pone fase en null', aplicadaEn: ['local'] },
  };
  comprobar('una migracion bien formada pasa',
    validarTarea(conMigracion, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('migracion en null pasa',
    validarTarea({ ...buena, migracion: null }, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('una tarea SIN el campo migracion se acepta igual',
    validarTarea(buena, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('un campo de mas dentro de migracion se rechaza',
    validarTarea({ ...conMigracion, migracion: { ...conMigracion.migracion, cuando: 'ayer' } }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('una migracion sin script se rechaza',
    validarTarea({ ...conMigracion, migracion: { ...conMigracion.migracion, script: '  ' } }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('una migracion sin queHace se rechaza',
    validarTarea({ ...conMigracion, migracion: { ...conMigracion.migracion, queHace: '' } }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un destino inventado se rechaza',
    validarTarea({ ...conMigracion, migracion: { ...conMigracion.migracion, aplicadaEn: ['prod'] } }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un destino repetido se rechaza',
    validarTarea({ ...conMigracion, migracion: { ...conMigracion.migracion, aplicadaEn: ['local', 'local'] } }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('aplicadaEn vacia es correcta: existe y no se ha corrido en ningun lado',
    validarTarea({ ...conMigracion, migracion: { ...conMigracion.migracion, aplicadaEn: [] } }, lectura.doc, { modo: 'alta' }).length === 0);

  bloque('El motivo de una devolucion no se pierde');
  const devuelta = {
    ...buena,
    revisiones: [
      { fecha: '2026-08-31 10:00:00', motivo: 'el filtro no filtra' },
      { fecha: '2026-09-01 12:30:00', motivo: 'ahora filtra pero rompe el orden' },
    ],
  };
  comprobar('una lista de devoluciones bien formada pasa',
    validarTarea(devuelta, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('una tarea SIN el campo revisiones se acepta igual',
    validarTarea(buena, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('revisiones en null se acepta como lista vacia',
    validarTarea({ ...buena, revisiones: null }, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('una devolucion sin motivo se rechaza',
    validarTarea({ ...buena, revisiones: [{ fecha: '2026-08-31 10:00:00', motivo: '  ' }] }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('una devolucion sin fecha se rechaza',
    validarTarea({ ...buena, revisiones: [{ motivo: 'algo' }] }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('un campo de mas dentro de una devolucion se rechaza',
    validarTarea({ ...buena, revisiones: [{ fecha: 'hoy', motivo: 'algo', quien: 'yo' }] }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('revisiones que no es lista se rechaza',
    validarTarea({ ...buena, revisiones: 'la devolvi porque si' }, lectura.doc, { modo: 'alta' }).length > 0);

  bloque('La rama de una tarea que no vive en release');
  const enRama = { ...buena, rama: 'prueba-de-diseno' };
  comprobar('una tarea con rama pasa',
    validarTarea(enRama, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('una tarea SIN el campo rama se acepta igual',
    validarTarea(buena, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('rama en null se acepta: es la de release',
    validarTarea({ ...buena, rama: null }, lectura.doc, { modo: 'alta' }).length === 0);
  comprobar('una rama vacia se rechaza: o es una rama, o no esta',
    validarTarea({ ...buena, rama: '   ' }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('una rama que no es texto se rechaza',
    validarTarea({ ...buena, rama: 7 }, lectura.doc, { modo: 'alta' }).length > 0);
  comprobar('el documento entero con una tarea en rama se puede escribir',
    require('./lib/validate').validarDocumento({
      ...lectura.doc,
      tareas: [...lectura.doc.tareas, { ...enRama, id: 4242 }],
    }).length === 0);

  bloque('Un campo vacio no se escribe en el archivo');
  const { nuevaTarea, fusionarTarea } = require('./lib/store');
  comprobar('la rama que ya tenia se conserva al editar otro campo',
    fusionarTarea(enRama, { titulo: 'Otro' }).rama === 'prueba-de-diseno');
  comprobar('una rama vacia se quita en vez de escribirse',
    !('rama' in fusionarTarea(enRama, { rama: '' })));
  comprobar('una tarea nueva no nace con rama',
    !('rama' in nuevaTarea(lectura.doc, { ...buena })));
  comprobar('una tarea nueva no nace con revisiones',
    !('revisiones' in nuevaTarea(lectura.doc, { ...buena })));
  comprobar('pero si nace con migracion en null',
    nuevaTarea(lectura.doc, { ...buena }).migracion === null);
  comprobar('las devoluciones que ya tenia se conservan al editar otro campo',
    fusionarTarea({ ...buena, revisiones: devuelta.revisiones }, { titulo: 'Otro' }).revisiones.length === 2);
  comprobar('una lista de devoluciones vacia se quita en vez de escribirse',
    !('revisiones' in fusionarTarea({ ...buena, revisiones: devuelta.revisiones }, { revisiones: [] })));

  bloque('Un ciclo de dependencias se rechaza');
  const conCiclo = JSON.parse(JSON.stringify(lectura.doc));
  conCiclo.tareas.push({ ...buena, id: 100, dependsOn: 101 });
  conCiclo.tareas.push({ ...buena, id: 101, dependsOn: 100 });
  comprobar('#100 -> #101 -> #100 se detecta',
    validarTarea({ ...buena, id: 100, dependsOn: 101 }, conCiclo, { modo: 'edicion' }).some((e) => e.includes('ciclo')));

  bloque('Si la escritura falla, el archivo anterior queda intacto');
  const copia = copiaTemporal();
  const antes = fs.readFileSync(copia, 'utf8');
  const almacen = new AlmacenTareas(copia);
  const docRoto = almacen.leer().doc;
  docRoto.tareas[0].estado = 'inventado';   // no esta en reglas.estados
  let lanzo = false;
  try { almacen.escribirAtomico(docRoto); } catch { lanzo = true; }
  comprobar('escribir un documento invalido lanza', lanzo);
  comprobar('el archivo no se toco', fs.readFileSync(copia, 'utf8') === antes);
  comprobar('no quedaron archivos temporales sueltos',
    fs.readdirSync(path.dirname(copia)).filter((n) => n.startsWith('.tareas.json.tmp-')).length === 0);

  bloque('El diff dice que cambio, campo por campo');
  const { comparar, chocaCon } = require('./lib/diff');
  const base = JSON.parse(antes);
  const otro = JSON.parse(antes);
  // El estado nuevo se elige contra el que la tarea YA tiene: si el plan de
  // verdad la trae en «blocked», ponerle «blocked» no cambiaria nada y la
  // prueba fallaria sin que nada estuviera mal.
  const estadoNuevo = base.tareas[0].estado === 'blocked' ? 'done' : 'blocked';
  otro.tareas[0].estado = estadoNuevo;
  otro.tareas[1].commit = 'nuevo commit';
  const cambios = comparar(base, otro);
  comprobar('encuentra los dos cambios', cambios.length === 2, JSON.stringify(cambios.map((c) => c.campo)));
  comprobar('nombra la tarea y el campo',
    cambios[0].id === base.tareas[0].id && cambios[0].campo === 'estado');
  comprobar('trae el antes y el ahora',
    cambios[0].antes === base.tareas[0].estado && cambios[0].despues === estadoNuevo);
  comprobar('sabe si el choque toca mi tarea', chocaCon(cambios, base.tareas[0].id) === true);
  comprobar('sabe si NO toca mi tarea', chocaCon(cambios, 4242) === false);

  bloque('Lo que arranca oculto, arranca oculto');
  // .telon declara display:flex y .vista-docs display:grid; cualquier regla de
  // autor con display gana sobre el [hidden] del navegador. Sin la regla
  // global, los dos dialogos y la vista de propuestas salen al cargar.
  const hoja = fs.readFileSync(path.join(__dirname, 'public', 'estilos.css'), 'utf8');
  comprobar('estilos.css fuerza el [hidden]', /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(hoja));

  bloque('Abrir una tarea no la pone a editar');
  const marcado = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  comprobar('el formulario arranca oculto', /<form class="formulario" id="formulario" hidden>/.test(marcado));
  comprobar('la vista de lectura y su boton Editar existen',
    marcado.includes('id="lectura"') && marcado.includes('id="btn-editar"'));
  comprobar('hay un dialogo de confirmacion para el movimiento',
    marcado.includes('id="telon-confirmar"') && marcado.includes('id="confirmar-movimiento"'));

  bloque('Las columnas van en el orden del tablero, no en el del archivo');
  const cliente = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  comprobar('proposed va antes que pending',
    /ORDEN_PREFERIDO\s*=\s*\['proposed',\s*'pending'\]/.test(cliente));
  comprobar('el tablero agrupa con ese orden', cliente.includes("? estadosOrdenados() : repos()"));
  comprobar('reglas.estados del archivo NO se reordena',
    lectura.doc.reglas.estados[0] === 'pending' && lectura.doc.reglas.estados[1] === 'proposed');
  comprobar('los seis estados del plan tienen color',
    lectura.doc.reglas.estados.every((e) => hoja.includes('.punto-' + e + ' ')),
    lectura.doc.reglas.estados.filter((e) => !hoja.includes('.punto-' + e + ' ')).join(', '));

  bloque('La revision se hace desde el tablero');
  comprobar('las tarjetas en in_review llevan sus botones',
    cliente.includes("if (tarea.estado === 'in_review') nodo.append(accionesDeRevision(tarea));"));
  comprobar('aprobar pasa a done', /async function aprobar[\s\S]{0,400}estado: 'done'/.test(cliente));
  comprobar('devolver vuelve a in_progress', /async function devolver[\s\S]{0,900}estado: 'in_progress'/.test(cliente));
  comprobar('devolver pide el motivo antes', /async function devolver[\s\S]{0,400}pedirMotivo/.test(cliente));
  comprobar('el motivo se agrega a los anteriores, no los pisa',
    cliente.includes('revisiones: [...revisionesDe(actual), { fecha: ahoraLocal(), motivo }]'));
  comprobar('sin motivo no se devuelve', /motivo === ''[\s\S]{0,200}motivo-error/.test(cliente));
  comprobar('hay dialogo para el motivo',
    marcado.includes('id="telon-motivo"') && marcado.includes('id="campo-motivo"'));

  bloque('Las migraciones se ven de un tirón');
  comprobar('hay una pestana propia', marcado.includes('data-vista="migraciones"') && marcado.includes('id="vista-migraciones"'));
  comprobar('las que faltan en produccion van primero',
    /bloque\('Falta correrlas en produccion', faltan[\s\S]{0,200}bloque\('Ya corrieron en produccion'/.test(cliente));
  comprobar('la tarjeta avisa de que la tarea lleva migracion',
    cliente.includes("'migracion · falta en produccion'"));
  comprobar('el formulario tiene script y queHace',
    marcado.includes('id="campo-migracion-script"') && marcado.includes('id="campo-migracion-quehace"'));
  comprobar('el formulario NO toca donde se aplico',
    /migracionDelFormulario[\s\S]{0,600}aplicadaEn: previa && Array\.isArray\(previa\.aplicadaEn\) \? previa\.aplicadaEn\.slice\(\) : \[\]/.test(cliente));

  bloque('El renderizador de Markdown no deja pasar HTML');
  const { render, desdoblarEnumeracion } = require('./lib/markdown');
  const peligroso = render('Hola <img src=x onerror=alert(1)> y **negrita**');
  comprobar('escapa las etiquetas', !peligroso.includes('<img'));
  comprobar('deja la negrita', peligroso.includes('<strong>negrita</strong>'));
  comprobar('respeta el codigo en linea', render('el campo `a<b>c`').includes('<code>a&lt;b&gt;c</code>'));

  bloque('La propuesta tecnica de un solo renglon se desdobla');
  const suelto = desdoblarEnumeracion('La premisa. 1) Primero. 2) Segundo. 3) Tercero.');
  comprobar('separa la entrada de los puntos', suelto.split('\n\n').length === 4);
  comprobar('los puntos salen como lista', render(suelto).includes('<ol>'));
  comprobar('la entrada se queda como parrafo', render(suelto).startsWith('<p>La premisa.</p>'));
  comprobar('sin serie completa no toca nada',
    desdoblarEnumeracion('Van 2) y 4) sueltos.') === 'Van 2) y 4) sueltos.');
  comprobar('un solo punto no es lista',
    desdoblarEnumeracion('Texto con 1) una sola marca.') === 'Texto con 1) una sola marca.');
  comprobar('no parte dentro del codigo en linea',
    desdoblarEnumeracion('`a 1) b 2) c` de una pieza.') === '`a 1) b 2) c` de una pieza.');
  comprobar('el texto que ya trae renglones se respeta',
    desdoblarEnumeracion('Uno\n\n1) a\n2) b') === 'Uno\n\n1) a\n2) b');
  // Tiene que ser una enumeracion de las que el desdoblado sabe convertir:
  // «1)» y «2)» sueltos. Una escrita «(1) … (2) …» es otra cosa y no se toca,
  // asi que agarrarla aqui haria fallar la prueba por elegir mal el ejemplo.
  const esEnumeracionSuelta = (texto) =>
    /(^|[^(\w])1\)\s/.test(texto) && /(^|[^(\w])2\)\s/.test(texto);
  const real = (lectura.doc.tareas.find(
    (t) => t.propuestaTecnica && esEnumeracionSuelta(t.propuestaTecnica)
  ) || {}).propuestaTecnica;
  if (real) {
    comprobar('una propuesta real del plan se convierte en lista',
      render(desdoblarEnumeracion(real)).includes('<ol>'));
  } else {
    omitir('una propuesta real del plan se convierte en lista',
      'ninguna tarea tiene propuestaTecnica todavia');
  }

  // --- 2. Con el servidor arriba ---------------------------------------

  bloque('Un archivo que no se reescribe igual no se escribe');
  // Fin de linea mezclado: no hay forma de reescribirlo sin cambiarlo, asi que
  // el panel se declara de solo lectura. Y la API tiene que negarse tambien:
  // antes preguntaba por un campo que leer() no devuelve y no saltaba nunca.
  const mezclado = copiaTemporal();
  const renglones = enLF(fs.readFileSync(mezclado, 'utf8')).split('\n');
  fs.writeFileSync(mezclado,
    renglones.slice(0, 5).join('\r\n') + '\r\n' + renglones.slice(5).join('\n'), 'utf8');
  comprobar('el almacen lo marca como no fiel', new AlmacenTareas(mezclado).leer().fiel === false);

  const puertoMezcla = 4700 + Math.floor(Math.random() * 200);
  const direccionMezcla = 'http://127.0.0.1:' + puertoMezcla;
  const hijoMezcla = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, ARCHIVO_TAREAS: mezclado, PUERTO: String(puertoMezcla), SIN_NAVEGADOR: '1' },
    stdio: 'ignore',
  });
  try {
    const vistaMezcla = await esperarServidor(direccionMezcla);
    comprobar('el panel arranca en solo lectura', vistaMezcla.soloLectura === true);
    const antesMezcla = fs.readFileSync(mezclado, 'utf8');
    const respuestaMezcla = await fetch(direccionMezcla + '/api/tareas', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modo: 'edicion',
        base: vistaMezcla.doc,
        hashBase: vistaMezcla.hash,
        tarea: { ...vistaMezcla.doc.tareas[0], commit: 'no tendria que entrar' },
      }),
    });
    comprobar('la API rechaza el guardado', respuestaMezcla.status === 409);
    comprobar('y el archivo no se toco', fs.readFileSync(mezclado, 'utf8') === antesMezcla);
  } finally {
    hijoMezcla.kill();
    fs.rmSync(path.dirname(mezclado), { recursive: true, force: true });
  }

  bloque('El panel, de punta a punta');
  const puerto = 4400 + Math.floor(Math.random() * 200);
  const direccion = 'http://127.0.0.1:' + puerto;
  const hijo = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, ARCHIVO_TAREAS: copia, PUERTO: String(puerto), SIN_NAVEGADOR: '1' },
    stdio: 'ignore',
  });

  try {
    let vista = await esperarServidor(direccion);
    comprobar('el panel lee el archivo', Array.isArray(vista.doc.tareas) && vista.doc.tareas.length > 0);
    comprobar('propone el siguiente numero libre',
      vista.siguienteId === Math.max(...vista.doc.tareas.map((t) => t.id)) + 1);
    if (fs.readdirSync(path.join(RAIZ, 'plan', 'propuestas')).some((n) => n.toLowerCase().endsWith('.md'))) {
      comprobar('lista las propuestas de plan/', vista.documentos.some((d) => d.carpeta === 'propuestas'));
    } else {
      omitir('lista las propuestas de plan/', 'plan/propuestas/ esta vacio');
    }

    const libMd = await fetch(direccion + '/lib/markdown.js');
    const fuenteMd = libMd.ok ? await libMd.text() : '';
    comprobar('el navegador puede cargar el renderizador de Markdown',
      libMd.ok && (libMd.headers.get('content-type') || '').includes('javascript'));
    comprobar('y ese archivo se expone como window.Markdown', fuenteMd.includes('window.Markdown = api'));
    comprobar('si ese archivo no cargara, la tarea se abre igual en texto plano',
      cliente.includes('if (!window.Markdown)'));

    const guardar = (cuerpo, metodo) =>
      fetch(direccion + '/api/tareas', {
        method: metodo || 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });

    // Alta
    const nueva = {
      id: vista.siguienteId, repo: 'backend', titulo: 'Tarea de prueba', descripcion: 'x',
      acceptance: ['algo comprobable'], handoff: null, dependsOn: 1, estado: 'pending',
      propuestaTecnica: null, commit: null,
    };
    let respuesta = await guardar({ modo: 'alta', base: vista.doc, hashBase: vista.hash, tarea: nueva }, 'POST');
    let datos = await respuesta.json();
    comprobar('crea una tarea nueva', respuesta.ok && datos.doc.tareas.some((t) => t.id === nueva.id));
    comprobar('la tarea nueva lleva las claves del esquema, en orden',
      enOrden(datos.doc.tareas.at(-1)), Object.keys(datos.doc.tareas.at(-1)).join(','));
    comprobar('sin migracion, el campo se escribe en null',
      datos.doc.tareas.at(-1).migracion === null);
    comprobar('y sin devoluciones, el campo ni se escribe',
      !('revisiones' in datos.doc.tareas.at(-1)));
    comprobar('el archivo en disco sigue siendo reescribible igual', new AlmacenTareas(copia).leer().fiel);

    // Edicion
    vista = { doc: datos.doc, hash: datos.hash, siguienteId: datos.siguienteId };
    respuesta = await guardar({ modo: 'edicion', base: vista.doc, hashBase: vista.hash, tarea: { ...nueva, estado: 'in_progress' } });
    datos = await respuesta.json();
    comprobar('cambia el estado de una tarea',
      respuesta.ok && datos.doc.tareas.find((t) => t.id === nueva.id).estado === 'in_progress');
    vista = { doc: datos.doc, hash: datos.hash };

    // Rechazo de una tarea mal formada, a traves de la API
    respuesta = await guardar({ modo: 'edicion', base: vista.doc, hashBase: vista.hash, tarea: { ...nueva, estado: 'inventado' } });
    comprobar('la API rechaza un estado inventado', respuesta.status === 422);
    comprobar('y no escribio nada',
      new AlmacenTareas(copia).leer().doc.tareas.find((t) => t.id === nueva.id).estado === 'in_progress');

    // --- Revisar desde el tablero: aprobar y devolver ---
    bloque('Aprobar y devolver, como lo hace el tablero');
    const enDisco = () => new AlmacenTareas(copia).leer().doc.tareas.find((t) => t.id === nueva.id);

    // El tablero manda la tarea entera con los campos pisados, igual que
    // guardarPatch(): esto es exactamente el cuerpo que sale del navegador.
    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...nueva, estado: 'in_review' },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };

    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: {
        ...nueva, estado: 'in_progress',
        revisiones: [{ fecha: '2026-08-31 18:00:00', motivo: 'el filtro no filtra' }],
      },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };
    comprobar('devolver la deja en in_progress con su motivo',
      respuesta.ok && enDisco().estado === 'in_progress' && enDisco().revisiones.length === 1);

    // Segunda vuelta: la razon de la primera devolucion NO se pierde.
    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: {
        ...nueva, estado: 'in_progress',
        revisiones: [
          ...enDisco().revisiones,
          { fecha: '2026-09-01 09:15:00', motivo: 'ahora filtra pero rompe el orden' },
        ],
      },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };
    comprobar('devolverla otra vez guarda las DOS razones',
      enDisco().revisiones.length === 2 && enDisco().revisiones[0].motivo === 'el filtro no filtra');

    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...enDisco(), estado: 'done' },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };
    comprobar('aprobarla la pasa a done sin borrar las devoluciones',
      enDisco().estado === 'done' && enDisco().revisiones.length === 2);

    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...enDisco(), revisiones: [{ fecha: '2026-09-01 09:15:00', motivo: '   ' }] },
    });
    comprobar('una devolucion sin motivo la rechaza la API', respuesta.status === 422);

    // --- Marcar donde corrio una migracion ---
    bloque('Donde se corrio la migracion lo marca el usuario');
    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: {
        ...enDisco(),
        migracion: { script: 'scripts/migrateAlgo.js', queHace: 'pone fase en null', aplicadaEn: [] },
      },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };
    comprobar('una tarea puede ganar migracion sin haberla corrido',
      respuesta.ok && enDisco().migracion.aplicadaEn.length === 0);

    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...enDisco(), migracion: { ...enDisco().migracion, aplicadaEn: ['local', 'produccion'] } },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };
    comprobar('se marca en local y en produccion',
      respuesta.ok && enDisco().migracion.aplicadaEn.join(',') === 'local,produccion');

    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...enDisco(), migracion: { ...enDisco().migracion, aplicadaEn: ['local'] } },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };
    comprobar('y se desmarca', respuesta.ok && enDisco().migracion.aplicadaEn.join(',') === 'local');

    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...enDisco(), migracion: { ...enDisco().migracion, aplicadaEn: ['prod'] } },
    });
    comprobar('un destino que no existe lo rechaza la API', respuesta.status === 422);
    comprobar('y el archivo no se toco', enDisco().migracion.aplicadaEn.join(',') === 'local');

    // Volver a dejarla como estaba para las pruebas del choque.
    respuesta = await guardar({
      modo: 'edicion', base: vista.doc, hashBase: vista.hash,
      tarea: { ...enDisco(), estado: 'in_progress' },
    });
    datos = await respuesta.json();
    vista = { doc: datos.doc, hash: datos.hash };

    // --- El choque de escritura ---
    bloque('Cuando otro escribe el archivo por debajo');

    // Un agente cambia OTRA tarea mientras yo edito la mia.
    const almacenCopia = new AlmacenTareas(copia);
    const deOtro = almacenCopia.leer().doc;
    deOtro.tareas[0].estado = deOtro.tareas[0].estado === 'done' ? 'blocked' : 'done';
    deOtro.tareas[0].commit = null;
    almacenCopia.escribirAtomico(deOtro);

    const mia = { ...enDisco(), estado: 'done' };
    respuesta = await guardar({ modo: 'edicion', base: vista.doc, hashBase: vista.hash, tarea: mia });
    datos = await respuesta.json();
    comprobar('el guardado se rechaza', respuesta.status === 409 && datos.error === 'conflicto');
    comprobar('dice QUE tarea cambio', datos.cambios.some((c) => c.id === deOtro.tareas[0].id));
    comprobar('dice QUE campo cambio', datos.cambios.some((c) => c.campo === 'estado'));
    comprobar('trae el antes y el ahora de ese campo',
      datos.cambios.find((c) => c.campo === 'estado').despues === deOtro.tareas[0].estado);
    comprobar('trae un resumen en una linea', typeof datos.resumen === 'string' && datos.resumen.length > 0);
    comprobar('avisa de que NO toca la tarea que edito', datos.choca === false);
    comprobar('trae la version del archivo para poder ver los dos lados', Array.isArray(datos.actual.tareas));
    comprobar('trae mi version sin guardar', datos.tuTarea.estado === 'done');
    comprobar('y no escribio nada',
      new AlmacenTareas(copia).leer().doc.tareas.find((t) => t.id === nueva.id).estado === 'in_progress');

    // Reaplicar sobre la version nueva: no se pierde ninguno de los dos lados.
    respuesta = await guardar({ modo: 'edicion', base: datos.actual, hashBase: datos.hashActual, tarea: mia });
    const reaplicado = await respuesta.json();
    comprobar('se puede reaplicar encima de la version nueva', respuesta.ok);
    comprobar('mi cambio quedo', reaplicado.doc.tareas.find((t) => t.id === nueva.id).estado === 'done');
    comprobar('y el del otro tambien',
      reaplicado.doc.tareas.find((t) => t.id === deOtro.tareas[0].id).estado === deOtro.tareas[0].estado);

    // Ahora un choque sobre LA MISMA tarea.
    const mismaTarea = new AlmacenTareas(copia);
    const doc2 = mismaTarea.leer().doc;
    doc2.tareas.find((t) => t.id === nueva.id).titulo = 'Titulo que puso el otro';
    mismaTarea.escribirAtomico(doc2);

    respuesta = await guardar({
      modo: 'edicion',
      base: reaplicado.doc,
      hashBase: reaplicado.hash,
      tarea: { ...mia, titulo: 'Titulo que puse yo' },
    });
    const choque = await respuesta.json();
    comprobar('choque sobre la misma tarea: se rechaza', respuesta.status === 409);
    comprobar('avisa de que SI toca la tarea que edito', choque.choca === true);
    comprobar('trae los dos titulos para compararlos',
      choque.tuTarea.titulo === 'Titulo que puse yo' && choque.suTarea.titulo === 'Titulo que puso el otro');

    bloque('El plan de verdad no se toco');
    comprobar('plan/tareas.json sigue igual que al empezar',
      new AlmacenTareas(REAL).leer().hash === HASH_REAL);
  } finally {
    hijo.kill();
    fs.rmSync(path.dirname(copia), { recursive: true, force: true });
    if (ORIGINAL !== REAL) fs.rmSync(path.dirname(ORIGINAL), { recursive: true, force: true });
  }

  console.log('\n' + pasadas + ' pasadas, ' + falladas + ' falladas'
    + (omitidas ? ', ' + omitidas + ' omitidas (el plan todavia no da para correrlas)' : '') + '\n');
  process.exit(falladas === 0 ? 0 : 1);
}

principal().catch((error) => {
  console.error('\nLa prueba se rompio:', error);
  process.exit(1);
});
