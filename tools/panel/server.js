'use strict';

// Panel local del plan de tareas.
//
// Sirve un tablero sobre plan/tareas.json. Es una herramienta de una sola
// persona en su propia maquina: no hay usuarios ni sesiones, y por eso escucha
// SOLO en 127.0.0.1. Lo unico que se toma en serio de verdad es no estropear
// plan/tareas.json, que lo comparten los agentes de todos los repos de trabajo.

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { AlmacenTareas, fusionarTarea, nuevaTarea, siguienteId } = require('./lib/store');
const { validarTarea } = require('./lib/validate');
const { comparar, chocaCon, resumir } = require('./lib/diff');
const { render } = require('./lib/markdown');

const RAIZ = path.resolve(__dirname, '..', '..');
// ARCHIVO_TAREAS sirve para apuntar las pruebas a una copia. En el uso normal
// es siempre plan/tareas.json de este repo.
const ARCHIVO_TAREAS = process.env.ARCHIVO_TAREAS
  ? path.resolve(process.env.ARCHIVO_TAREAS)
  : path.join(RAIZ, 'plan', 'tareas.json');
const PUBLICO = path.join(__dirname, 'public');
const CARPETAS_DOC = {
  propuestas: path.join(RAIZ, 'plan', 'propuestas'),
  handoff: path.join(RAIZ, 'plan', 'handoff'),
  // Material de apoyo: lo que una tarea necesita leer, o lo que se le pasa a
  // otro proyecto. No es trabajo pendiente, pero se consulta igual.
  referencia: path.join(RAIZ, 'plan', 'referencia'),
};

const PUERTO_BASE = Number(process.env.PUERTO || 4321);
const almacen = new AlmacenTareas(ARCHIVO_TAREAS);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function responderJson(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let tamano = 0;
    req.on('data', (trozo) => {
      tamano += trozo.length;
      if (tamano > 2 * 1024 * 1024) {
        reject(new Error('El cuerpo de la peticion es demasiado grande.'));
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      const texto = Buffer.concat(trozos).toString('utf8');
      if (texto.trim() === '') { resolve({}); return; }
      try { resolve(JSON.parse(texto)); } catch (error) { reject(new Error('El cuerpo no es JSON valido.')); }
    });
    req.on('error', reject);
  });
}

// Devuelve false si el archivo no existe, para que la peticion caiga al 404.
async function servirArchivo(res, completa) {
  let contenido;
  try {
    contenido = await fsp.readFile(completa);
  } catch {
    return false;
  }
  res.writeHead(200, {
    'content-type': TIPOS[path.extname(completa)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(contenido);
  return true;
}

// --- Documentos de plan/ ------------------------------------------------

async function listarDocumentos() {
  const salida = [];
  for (const [carpeta, ruta] of Object.entries(CARPETAS_DOC)) {
    let entradas = [];
    try { entradas = await fsp.readdir(ruta); } catch { continue; }
    for (const nombre of entradas.sort()) {
      if (!nombre.toLowerCase().endsWith('.md')) continue;
      const completa = path.join(ruta, nombre);
      const info = await fsp.stat(completa);
      salida.push({ carpeta, nombre, modificado: info.mtimeMs });
    }
  }
  return salida;
}

async function leerDocumento(carpeta, nombre) {
  const base = CARPETAS_DOC[carpeta];
  if (!base) return null;

  // Nada de subir por el arbol: se resuelve y se comprueba que sigue dentro.
  const completa = path.resolve(base, nombre);
  const dentro = completa === base || completa.startsWith(base + path.sep);
  if (!dentro || !completa.toLowerCase().endsWith('.md')) return null;

  const fuente = await fsp.readFile(completa, 'utf8');
  return { carpeta, nombre, html: render(fuente), fuente };
}

// --- Estado del plan ----------------------------------------------------

function estadoActual() {
  const { doc, hash, fiel } = almacen.leer();
  return { doc, hash, soloLectura: !fiel, siguienteId: siguienteId(doc), repos: reposConfigurados() };
}

// Los nombres de repo de config/repositories.json, para que el selector del
// editor los ofrezca aunque el plan todavia no tenga tareas. Si el archivo no
// esta o no se entiende, lista vacia: el panel no depende de el.
function reposConfigurados() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config', 'repositories.json'), 'utf8'));
    return Object.keys(config.repos || {});
  } catch {
    return [];
  }
}

/**
 * Guarda una tarea (alta o edicion) resolviendo el choque con lo que haya en
 * disco. Si el archivo cambio desde que el panel lo leyo, NO se escribe: se
 * devuelve el detalle de que cambio, campo por campo, para que quien esta
 * delante decida. Nunca «el archivo cambio, recarga» a secas.
 */
function guardarTarea({ modo, base, hashBase, tarea }) {
  const enDisco = almacen.leer();

  // leer() devuelve `fiel`, no `soloLectura`: si aqui se preguntara por
  // soloLectura la guarda no saltaria nunca y un POST a la API escribiria el
  // archivo aunque el panel se hubiera declarado de solo lectura.
  if (enDisco.fiel === false) {
    return { codigo: 409, cuerpo: { error: 'El archivo tiene un formato que el panel no puede reescribir sin cambiarlo.' } };
  }

  // 1. Validar contra el documento que EL USUARIO estaba viendo. Si su tarea
  //    esta mal formada, se rechaza antes de mirar nada mas.
  const erroresBase = validarTarea(tarea, base, { modo: modo === 'alta' ? 'alta' : 'edicion' });
  if (erroresBase.length > 0) {
    return { codigo: 422, cuerpo: { error: 'La tarea no es valida.', errores: erroresBase } };
  }

  // 2. ¿Cambio el archivo por debajo?
  if (hashBase !== enDisco.hash) {
    const cambios = comparar(base, enDisco.doc);
    const choca = chocaCon(cambios, tarea.id);
    return {
      codigo: 409,
      cuerpo: {
        error: 'conflicto',
        resumen: resumir(cambios),
        cambios,
        choca,
        hashActual: enDisco.hash,
        actual: enDisco.doc,
        // La tarea tal como esta ahora en disco, para poder ver los dos lados.
        tuTarea: tarea,
        suTarea: (enDisco.doc.tareas || []).find((t) => t.id === tarea.id) || null,
      },
    };
  }

  // 3. Aplicar sobre lo que hay en disco, respetando el orden de claves y
  //    cualquier campo que un agente haya agregado y el panel no conozca.
  const doc = enDisco.doc;
  const indice = (doc.tareas || []).findIndex((t) => t.id === tarea.id);

  if (modo === 'alta') {
    if (indice !== -1) {
      return { codigo: 409, cuerpo: { error: `Ya existe una tarea #${tarea.id}.` } };
    }
    doc.tareas.push(nuevaTarea(doc, tarea));
  } else {
    if (indice === -1) {
      return { codigo: 404, cuerpo: { error: `No hay ninguna tarea #${tarea.id}.` } };
    }
    doc.tareas[indice] = fusionarTarea(doc.tareas[indice], tarea);
  }

  // 4. Escribir de forma atomica. Si la validacion del documento entero falla
  //    aqui, no se toca el archivo.
  try {
    const { hash } = almacen.escribirAtomico(doc);
    return { codigo: 200, cuerpo: { ok: true, hash, doc, siguienteId: siguienteId(doc) } };
  } catch (error) {
    return {
      codigo: 422,
      cuerpo: { error: error.message, errores: error.errores || [] },
    };
  }
}

// --- Servidor -----------------------------------------------------------

async function manejar(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const ruta = url.pathname;

  try {
    if (ruta === '/api/estado' && req.method === 'GET') {
      const estado = estadoActual();
      return responderJson(res, 200, { ...estado, documentos: await listarDocumentos() });
    }

    if (ruta === '/api/documento' && req.method === 'GET') {
      const doc = await leerDocumento(url.searchParams.get('carpeta'), url.searchParams.get('nombre') || '');
      if (!doc) return responderJson(res, 404, { error: 'No se encontro ese documento.' });
      return responderJson(res, 200, doc);
    }

    if (ruta === '/api/tareas' && (req.method === 'POST' || req.method === 'PUT')) {
      const cuerpo = await leerCuerpo(req);
      const { modo, base, hashBase, tarea } = cuerpo;
      if (!base || !tarea || typeof hashBase !== 'string') {
        return responderJson(res, 400, { error: 'Faltan base, hashBase o tarea en la peticion.' });
      }
      const salida = guardarTarea({ modo: modo === 'alta' ? 'alta' : 'edicion', base, hashBase, tarea });
      return responderJson(res, salida.codigo, salida.cuerpo);
    }

    // Estaticos
    if (req.method === 'GET') {
      // El renderizador de Markdown lo comparten servidor y navegador: la
      // propuesta tecnica de una tarea se pinta con el mismo codigo que los
      // documentos de plan/, sin una copia en public/ que se desfase.
      if (ruta === '/lib/markdown.js') {
        if (await servirArchivo(res, path.join(__dirname, 'lib', 'markdown.js'))) return;
      } else {
        const nombre = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
        const completa = path.resolve(PUBLICO, nombre);
        if (completa === PUBLICO || completa.startsWith(PUBLICO + path.sep)) {
          if (await servirArchivo(res, completa)) return;
        }
      }
    }

    return responderJson(res, 404, { error: 'No existe esa ruta.' });
  } catch (error) {
    return responderJson(res, 500, { error: error.message });
  }
}

function abrirNavegador(direccion) {
  const comando = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const argumentos = process.platform === 'win32' ? ['/c', 'start', '', direccion] : [direccion];
  try {
    spawn(comando, argumentos, { stdio: 'ignore', detached: true }).unref();
  } catch { /* si no abre, el usuario tiene la URL impresa */ }
}

function arrancar(puerto, intentos = 10) {
  const servidor = http.createServer(manejar);

  servidor.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && intentos > 0) {
      arrancar(puerto + 1, intentos - 1);
      return;
    }
    console.error('No se pudo arrancar el panel:', error.message);
    process.exit(1);
  });

  servidor.listen(puerto, '127.0.0.1', () => {
    const direccion = `http://127.0.0.1:${puerto}`;
    console.log(`\n  Panel del plan   ${direccion}`);
    console.log(`  Archivo          ${path.relative(RAIZ, ARCHIVO_TAREAS)}`);
    try {
      const { fiel } = almacen.leer();
      if (!fiel) {
        console.log('\n  AVISO: el archivo no se reescribe igual byte a byte.');
        console.log('  El panel arranca en SOLO LECTURA para no cambiarle el formato.');
      }
    } catch (error) {
      console.log(`\n  AVISO: no se pudo leer el archivo: ${error.message}`);
    }
    console.log('\n  Ctrl+C para parar.\n');
    if (process.env.SIN_NAVEGADOR !== '1') abrirNavegador(direccion);
  });
}

if (require.main === module) {
  if (!fs.existsSync(ARCHIVO_TAREAS)) {
    console.error(`No encuentro ${ARCHIVO_TAREAS}. ¿Estas en la raiz del repo de control?`);
    process.exit(1);
  }
  arrancar(PUERTO_BASE);
}

module.exports = { guardarTarea, estadoActual, manejar };
