'use strict';

// Comparar dos versiones de plan/tareas.json y decir, campo por campo, que se
// movio. Existe para que un choque de escritura nunca se resuelva con «el
// archivo cambio, recarga»: quien esta delante tiene que poder ver que tarea y
// que campo toco el otro lado antes de decidir si tira su trabajo.

const ETIQUETAS = {
  id: 'numero',
  repo: 'repo',
  titulo: 'titulo',
  descripcion: 'descripcion',
  acceptance: 'criterios de aceptacion',
  handoff: 'handoff',
  dependsOn: 'depende de',
  estado: 'estado',
  propuestaTecnica: 'propuesta tecnica',
  commit: 'commit',
  migracion: 'migracion',
  revisiones: 'devoluciones',
};

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function comparar(base, actual) {
  const cambios = [];

  if (!igual(base?.schemaVersion, actual?.schemaVersion)) {
    cambios.push({
      tipo: 'sobre',
      etiqueta: 'schemaVersion',
      campo: 'schemaVersion',
      antes: base?.schemaVersion ?? null,
      despues: actual?.schemaVersion ?? null,
    });
  }

  if (!igual(base?.reglas, actual?.reglas)) {
    const claves = new Set([
      ...Object.keys(base?.reglas || {}),
      ...Object.keys(actual?.reglas || {}),
    ]);
    for (const clave of claves) {
      if (igual(base?.reglas?.[clave], actual?.reglas?.[clave])) continue;
      cambios.push({
        tipo: 'sobre',
        etiqueta: `reglas.${clave}`,
        campo: `reglas.${clave}`,
        antes: base?.reglas?.[clave] ?? null,
        despues: actual?.reglas?.[clave] ?? null,
      });
    }
  }

  const baseTareas = new Map((base?.tareas || []).map((t) => [t.id, t]));
  const actualTareas = new Map((actual?.tareas || []).map((t) => [t.id, t]));

  for (const [id, tarea] of actualTareas) {
    if (!baseTareas.has(id)) {
      cambios.push({
        tipo: 'tarea-nueva',
        id,
        titulo: tarea.titulo || '(sin titulo)',
        etiqueta: `#${id} ${tarea.titulo || ''}`.trim(),
      });
    }
  }

  for (const [id, tarea] of baseTareas) {
    if (!actualTareas.has(id)) {
      cambios.push({
        tipo: 'tarea-borrada',
        id,
        titulo: tarea.titulo || '(sin titulo)',
        etiqueta: `#${id} ${tarea.titulo || ''}`.trim(),
      });
    }
  }

  for (const [id, tareaBase] of baseTareas) {
    const tareaActual = actualTareas.get(id);
    if (!tareaActual) continue;

    const claves = new Set([...Object.keys(tareaBase), ...Object.keys(tareaActual)]);
    for (const clave of claves) {
      if (igual(tareaBase[clave], tareaActual[clave])) continue;
      cambios.push({
        tipo: 'campo',
        id,
        titulo: tareaActual.titulo || tareaBase.titulo || '(sin titulo)',
        campo: clave,
        etiqueta: ETIQUETAS[clave] || clave,
        antes: tareaBase[clave] ?? null,
        despues: tareaActual[clave] ?? null,
      });
    }
  }

  // Primero lo que toca a tareas concretas, ordenado por numero.
  cambios.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return cambios;
}

/**
 * ¿Los cambios de fuera pisan la tarea que tengo abierta?
 * Si no la tocan, lo mio se puede volver a aplicar encima de la version nueva
 * sin perder nada de ninguno de los dos lados.
 */
function chocaCon(cambios, idTarea) {
  return cambios.some((c) => {
    if (c.tipo === 'sobre') return true; // cambio el sobre: mejor mirar
    return c.id === idTarea;
  });
}

function resumir(cambios) {
  if (cambios.length === 0) return 'No se ve ninguna diferencia.';
  const partes = cambios.slice(0, 3).map((c) => {
    if (c.tipo === 'tarea-nueva') return `apareció la tarea #${c.id}`;
    if (c.tipo === 'tarea-borrada') return `desapareció la tarea #${c.id}`;
    if (c.tipo === 'sobre') return `cambió ${c.etiqueta}`;
    return `#${c.id} cambió ${c.etiqueta}`;
  });
  const resto = cambios.length - partes.length;
  return partes.join(', ') + (resto > 0 ? ` y ${resto} cambio${resto === 1 ? '' : 's'} mas` : '') + '.';
}

module.exports = { comparar, chocaCon, resumir, ETIQUETAS };
