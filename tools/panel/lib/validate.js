'use strict';

// Validacion del esquema de plan/tareas.json.
//
// El archivo lo leen y escriben los agentes de los repos de trabajo: aqui no se
// inventa ni un campo. La lista CAMPOS es exactamente la que ya tiene el
// archivo, y en ese orden.

const CAMPOS = [
  'id',
  'repo',
  'rama',
  'titulo',
  'descripcion',
  'acceptance',
  'handoff',
  'dependsOn',
  'estado',
  'propuestaTecnica',
  'commit',
  'migracion',
  'revisiones',
];

// Campos que pueden NO estar en una tarea sin que eso sea un error. Son los
// que se agregaron despues, y el archivo lo escribe tambien el agente del otro
// repo: si exigieramos la clave, una tarea suya perfectamente buena quedaria
// sin poder guardarse solo por haber nacido antes. Presentes, se validan igual
// de estricto que el resto.
const OPCIONALES = ['rama', 'migracion', 'revisiones'];

// Donde se puede haber corrido una migracion. La lista es cerrada a proposito:
// «prod», «produccion» y «PRODUCCION» serian la misma cosa escrita de tres
// formas y el tablero no sabria contarlas.
const DESTINOS = ['local', 'produccion'];

const CAMPOS_MIGRACION = ['script', 'queHace', 'aplicadaEn'];
const CAMPOS_REVISION = ['fecha', 'motivo'];

const esTexto = (v) => typeof v === 'string';
const esTextoConAlgo = (v) => esTexto(v) && v.trim() !== '';
const esTextoONulo = (v) => v === null || esTexto(v);

// Un entero de verdad: nada de 3.5, NaN ni "3".
const esEntero = (v) => typeof v === 'number' && Number.isInteger(v);

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * `migracion`: null cuando la tarea no necesita ninguna, y si no un objeto con
 * el script, que le pasa a los datos que ya existen, y donde se corrio ya.
 */
function erroresDeMigracion(valor) {
  if (valor === null) return [];
  if (!esObjeto(valor)) return ['migracion tiene que ser un objeto o null.'];

  const errores = [];
  for (const clave of Object.keys(valor)) {
    if (!CAMPOS_MIGRACION.includes(clave)) {
      errores.push(`migracion tiene un campo que el esquema no conoce: "${clave}".`);
    }
  }
  if (!esTextoConAlgo(valor.script)) {
    errores.push('migracion.script tiene que decir que archivo se corre.');
  }
  if (!esTextoConAlgo(valor.queHace)) {
    errores.push('migracion.queHace tiene que explicar, en una frase, que le pasa a los datos que ya existen.');
  }

  if (!Array.isArray(valor.aplicadaEn)) {
    errores.push('migracion.aplicadaEn tiene que ser una lista (vacia si no se ha corrido en ningun lado).');
  } else {
    for (const donde of valor.aplicadaEn) {
      if (!DESTINOS.includes(donde)) {
        errores.push(`migracion.aplicadaEn solo acepta ${DESTINOS.join(' y ')}; "${donde}" no.`);
      }
    }
    if (new Set(valor.aplicadaEn).size !== valor.aplicadaEn.length) {
      errores.push('migracion.aplicadaEn repite un destino.');
    }
  }
  return errores;
}

/**
 * `revisiones`: la bitacora de las veces que la tarea se devolvio desde
 * in_review, con el motivo de cada una. Se acumula, no se pisa: si la misma
 * tarea vuelve dos veces, tienen que verse las dos razones.
 *
 * Puede no estar, y `null` se acepta como equivalente a la lista vacia, para
 * que una tarea que nunca se devolvio no obligue a nadie a escribir el campo.
 */
function erroresDeRevisiones(valor) {
  if (valor === null) return [];
  if (!Array.isArray(valor)) {
    return ['revisiones tiene que ser una lista de devoluciones (o no estar).'];
  }

  const errores = [];
  valor.forEach((entrada, indice) => {
    const donde = `revisiones[${indice}]`;
    if (!esObjeto(entrada)) {
      errores.push(`${donde} no es un objeto con fecha y motivo.`);
      return;
    }
    for (const clave of Object.keys(entrada)) {
      if (!CAMPOS_REVISION.includes(clave)) {
        errores.push(`${donde} tiene un campo que el esquema no conoce: "${clave}".`);
      }
    }
    if (!esTextoConAlgo(entrada.fecha)) errores.push(`${donde}.fecha no puede ir vacia.`);
    if (!esTextoConAlgo(entrada.motivo)) {
      errores.push(`${donde}.motivo no puede ir vacio: una devolucion sin motivo no le dice nada al agente que la retome.`);
    }
  });
  return errores;
}

/**
 * Valida una tarea suelta contra el esquema y contra el resto del plan.
 *
 * @param {object} tarea
 * @param {object} doc documento completo (para estados validos, ids y ciclos)
 * @param {{modo: 'alta'|'edicion'}} opciones
 * @returns {string[]} lista de errores; vacia si la tarea es valida
 */
function validarTarea(tarea, doc, { modo }) {
  const errores = [];

  if (tarea === null || typeof tarea !== 'object' || Array.isArray(tarea)) {
    return ['La tarea no es un objeto.'];
  }

  const estados = Array.isArray(doc?.reglas?.estados) ? doc.reglas.estados : [];
  const otras = (doc?.tareas || []).filter((t) => t.id !== tarea.id);

  // 1. Ningun campo de mas. Un campo desconocido es justo lo que romperia a
  //    quien lee el archivo del otro lado, asi que se rechaza en vez de pasar.
  for (const clave of Object.keys(tarea)) {
    if (!CAMPOS.includes(clave)) {
      errores.push(`Campo desconocido: "${clave}". El esquema no lo tiene.`);
    }
  }

  // 2. Ningun campo de menos, salvo los opcionales.
  for (const clave of CAMPOS) {
    if (OPCIONALES.includes(clave)) continue;
    if (!(clave in tarea)) errores.push(`Falta el campo "${clave}".`);
  }

  // 3. Tipos, uno por uno.
  if (!esEntero(tarea.id) || tarea.id < 1) {
    errores.push('El id tiene que ser un entero mayor que cero.');
  } else if (otras.some((t) => t.id === tarea.id)) {
    errores.push(`Ya existe una tarea con el id ${tarea.id}.`);
  }

  if (!esTextoConAlgo(tarea.repo)) errores.push('El repo no puede ir vacio.');

  // `rama` solo esta cuando la tarea NO vive en la rama de release del repo:
  // lleva el nombre de la rama donde vive. Sin el campo, va en la de release,
  // asi que una rama vacia no significa nada y se rechaza en vez de escribirse.
  if ('rama' in tarea && tarea.rama !== null && !esTextoConAlgo(tarea.rama)) {
    errores.push('rama tiene que ser el nombre de la rama donde vive la tarea, o no estar.');
  }
  if (!esTextoConAlgo(tarea.titulo)) errores.push('El titulo no puede ir vacio.');
  if (!esTexto(tarea.descripcion)) errores.push('La descripcion tiene que ser texto.');

  if (!Array.isArray(tarea.acceptance)) {
    errores.push('acceptance tiene que ser una lista.');
  } else if (!tarea.acceptance.every(esTextoConAlgo)) {
    errores.push('Cada criterio de acceptance tiene que ser texto con contenido.');
  }

  if (!esTextoONulo(tarea.handoff)) errores.push('handoff tiene que ser texto o null.');
  if (!esTextoONulo(tarea.propuestaTecnica)) errores.push('propuestaTecnica tiene que ser texto o null.');
  if (!esTextoONulo(tarea.commit)) errores.push('commit tiene que ser texto o null.');

  if ('migracion' in tarea) errores.push(...erroresDeMigracion(tarea.migracion));
  if ('revisiones' in tarea) errores.push(...erroresDeRevisiones(tarea.revisiones));

  if (!estados.includes(tarea.estado)) {
    errores.push(
      `El estado "${tarea.estado}" no esta en reglas.estados (${estados.join(', ')}).`
    );
  }

  // 4. dependsOn: entero o null, apuntando a una tarea que exista y sin ciclos.
  if (tarea.dependsOn !== null) {
    if (!esEntero(tarea.dependsOn)) {
      errores.push('dependsOn tiene que ser un numero de tarea o null.');
    } else if (tarea.dependsOn === tarea.id) {
      errores.push('Una tarea no puede depender de si misma.');
    } else if (!otras.some((t) => t.id === tarea.dependsOn)) {
      errores.push(`dependsOn apunta a la tarea #${tarea.dependsOn}, que no existe.`);
    } else {
      const ciclo = buscarCiclo(tarea, otras);
      if (ciclo) errores.push(`La dependencia forma un ciclo: ${ciclo.map((n) => `#${n}`).join(' -> ')}.`);
    }
  }

  if (modo === 'edicion' && !(doc?.tareas || []).some((t) => t.id === tarea.id)) {
    errores.push(`No hay ninguna tarea #${tarea.id} que editar.`);
  }

  return errores;
}

// Sigue la cadena de dependencias hacia arriba; devuelve el ciclo si lo hay.
function buscarCiclo(tarea, otras) {
  const porId = new Map(otras.map((t) => [t.id, t]));
  const camino = [tarea.id];
  const vistos = new Set([tarea.id]);
  let actual = tarea.dependsOn;

  while (actual !== null && actual !== undefined) {
    camino.push(actual);
    if (vistos.has(actual)) return camino;
    vistos.add(actual);
    const siguiente = porId.get(actual);
    if (!siguiente) return null;
    actual = siguiente.dependsOn;
  }
  return null;
}

/**
 * Valida el documento completo antes de escribirlo. Comprueba lo del sobre
 * —schemaVersion, reglas— y luego cada tarea.
 */
function validarDocumento(doc) {
  const errores = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return ['El documento no es un objeto.'];
  }
  if (!esEntero(doc.schemaVersion)) errores.push('Falta schemaVersion o no es un entero.');
  if (!doc.reglas || typeof doc.reglas !== 'object') errores.push('Falta el bloque reglas.');
  if (!Array.isArray(doc.reglas?.estados) || doc.reglas.estados.length === 0) {
    errores.push('reglas.estados tiene que ser una lista no vacia.');
  }
  if (!Array.isArray(doc.tareas)) errores.push('tareas tiene que ser una lista.');
  if (errores.length > 0) return errores;

  const ids = new Set();
  for (const tarea of doc.tareas) {
    if (ids.has(tarea?.id)) errores.push(`El id ${tarea.id} esta repetido.`);
    ids.add(tarea?.id);
    for (const error of validarTarea(tarea, doc, { modo: 'edicion' })) {
      errores.push(`Tarea #${tarea?.id ?? '?'}: ${error}`);
    }
  }
  return errores;
}

module.exports = { CAMPOS, OPCIONALES, DESTINOS, validarTarea, validarDocumento };
