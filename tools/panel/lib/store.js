'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { CAMPOS, validarDocumento } = require('./validate');

// Campos que, cuando no tienen nada que decir, NO se escriben. Una tarea que
// nunca se devolvio no lleva `revisiones`: el archivo se queda como estaba y
// el agente que solo conoce los campos de siempre lo lee igual que antes.
const SE_OMITEN_VACIOS = ['rama', 'revisiones'];

const sinContenido = (valor) =>
  valor === null ||
  valor === undefined ||
  (Array.isArray(valor) && valor.length === 0) ||
  (typeof valor === 'string' && valor.trim() === '');

function limpiarVacios(tarea) {
  for (const clave of SE_OMITEN_VACIOS) {
    if (clave in tarea && sinContenido(tarea[clave])) delete tarea[clave];
  }
  return tarea;
}

// Como se serializa el archivo: dos espacios de sangria y un salto de linea al
// final. Al arrancar se comprueba que leer y volver a escribir da el mismo byte
// a byte; si no, el panel se queda en solo lectura antes que tocar nada.
//
// El fin de linea NO es fijo. En Windows, Git con core.autocrlf=true deja el
// archivo en CRLF al sacarlo, aunque en el repo viva en LF; serializando
// siempre con LF, releerlo y reescribirlo cambiaria un byte por renglon y el
// panel se quedaria en solo lectura sin que nada este mal. Asi que se escribe
// con el fin de linea que el archivo ya trae, y la comprobacion byte a byte
// sigue siendo de verdad.
const SANGRIA = 2;
const LF = '\n';
const CRLF = '\r\n';

// El del archivo, mirando lo que hay dentro. Uno mezclado sale como CRLF y
// entonces no sera fiel: antes solo lectura que elegir nosotros por el usuario.
function finDeLinea(texto) {
  return texto.includes(CRLF) ? CRLF : LF;
}

function serializar(doc, fin = LF) {
  const texto = JSON.stringify(doc, null, SANGRIA) + LF;
  // JSON.stringify escapa los saltos que van DENTRO de una cadena como los dos
  // caracteres barra y ene, asi que aqui solo quedan los saltos entre renglones.
  return fin === LF ? texto : texto.replace(/\n/g, fin);
}

function hashDe(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16);
}

class AlmacenTareas {
  constructor(rutaArchivo) {
    this.ruta = rutaArchivo;
    this.directorio = path.dirname(rutaArchivo);
  }

  /**
   * Lee el archivo tal cual esta en disco.
   * @returns {{doc: object, hash: string, crudo: string, fin: string, fiel: boolean}}
   *   fiel === false significa que reescribirlo cambiaria su formato; en ese
   *   caso el panel no escribe.
   */
  leer() {
    const crudo = fs.readFileSync(this.ruta, 'utf8');
    const doc = JSON.parse(crudo);
    const fin = finDeLinea(crudo);
    return { doc, crudo, fin, hash: hashDe(crudo), fiel: serializar(doc, fin) === crudo };
  }

  /**
   * El fin de linea que tiene el archivo ahora mismo. Si todavia no existe
   * —solo pasa si se apunta el panel a un archivo que aun hay que crear— se
   * escribe en LF, que es como vive en el repo.
   */
  finEnDisco() {
    try {
      return finDeLinea(fs.readFileSync(this.ruta, 'utf8'));
    } catch {
      return LF;
    }
  }

  /**
   * Escribe el documento de forma atomica: archivo temporal en el MISMO
   * directorio (para que rename no cruce sistemas de archivos), fsync del
   * contenido, rename encima y fsync del directorio. Si algo falla a media
   * escritura, el rename no llega a ocurrir y el archivo anterior queda
   * intacto: nadie ve nunca un JSON a medias.
   */
  escribirAtomico(doc) {
    const errores = validarDocumento(doc);
    if (errores.length > 0) {
      const error = new Error('El documento no paso la validacion.');
      error.errores = errores;
      throw error;
    }

    // Con el fin de linea que el archivo ya trae, para no convertirselo por
    // debajo a los agentes que lo comparten con nosotros.
    const fin = this.finEnDisco();
    const contenido = serializar(doc, fin);

    // Ultima red: lo que vamos a escribir tiene que releerse igual.
    if (serializar(JSON.parse(contenido), fin) !== contenido) {
      throw new Error('La serializacion no es estable. No se escribe nada.');
    }

    const temporal = path.join(
      this.directorio,
      `.tareas.json.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
    );

    let fd;
    try {
      fd = fs.openSync(temporal, 'wx', 0o644);
      fs.writeFileSync(fd, contenido, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporal, this.ruta);
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* da igual: ya vamos de salida */ }
      }
      try { fs.unlinkSync(temporal); } catch { /* puede que ni se creara */ }
      throw error;
    }

    // Que el rename quede en disco y no solo en la cache del directorio.
    try {
      const fdDir = fs.openSync(this.directorio, 'r');
      try { fs.fsyncSync(fdDir); } finally { fs.closeSync(fdDir); }
    } catch { /* algunos sistemas no dejan fsync de directorio; no es fatal */ }

    return { hash: hashDe(contenido) };
  }
}

/**
 * Reconstruye una tarea respetando el orden de claves que ya tenia. Si un
 * agente le agrego un campo que el panel no conoce, ese campo se conserva
 * tal cual en su sitio: el panel edita lo que sabe editar y no borra el resto.
 */
function fusionarTarea(original, cambios) {
  const claves = original ? Object.keys(original) : CAMPOS.slice();
  for (const clave of CAMPOS) {
    if (!claves.includes(clave)) claves.push(clave);
  }

  const salida = {};
  for (const clave of claves) {
    if (CAMPOS.includes(clave) && clave in cambios) salida[clave] = cambios[clave];
    else if (original && clave in original) salida[clave] = original[clave];
  }
  return limpiarVacios(salida);
}

/**
 * Arma una tarea nueva. El orden de las claves se copia de la ultima tarea del
 * archivo, para que la que agrega el panel se lea igual que sus vecinas. Si un
 * agente agrego un campo propio, la tarea nueva lo lleva en null en vez de
 * salir sin el.
 */
function nuevaTarea(doc, cambios) {
  const molde = (doc.tareas || [])[doc.tareas.length - 1] || null;
  const claves = molde ? Object.keys(molde) : CAMPOS.slice();
  for (const clave of CAMPOS) {
    if (!claves.includes(clave)) claves.push(clave);
  }

  const salida = {};
  for (const clave of claves) {
    salida[clave] = clave in cambios ? cambios[clave] : null;
  }
  return limpiarVacios(salida);
}

const siguienteId = (doc) =>
  (doc.tareas || []).reduce((max, t) => (Number.isInteger(t.id) && t.id > max ? t.id : max), 0) + 1;

module.exports = { AlmacenTareas, fusionarTarea, nuevaTarea, siguienteId, serializar, finDeLinea, hashDe };
