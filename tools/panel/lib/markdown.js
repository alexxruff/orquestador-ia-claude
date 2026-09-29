'use strict';

// Renderizador de Markdown minimo, sin dependencias, para leer plan/propuestas
// y plan/handoff con formato. Cubre lo que esos archivos usan hoy:
// encabezados, parrafos, listas, listas numeradas, citas, tablas, bloques de
// codigo, reglas horizontales, y en linea negrita, cursiva, codigo y enlaces.

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Negrita, cursiva, tachado y enlaces sobre texto YA escapado.
function decorar(escapado) {
  return escapado
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, etiqueta, destino) => '<a href="' + destino + '" target="_blank" rel="noreferrer">' + etiqueta + '</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

// El texto se parte por comillas invertidas: los trozos impares son codigo en
// linea y ahi no se interpreta nada mas. Sin centinelas ni marcadores, que es
// justo donde estos renderizadores se rompen.
function enLinea(texto) {
  const partes = String(texto).split('`');
  const balanceado = partes.length % 2 === 1;

  return partes
    .map((parte, indice) => {
      const esCodigo = balanceado && indice % 2 === 1;
      if (esCodigo) return '<code>' + escapar(parte) + '</code>';
      // Comillas invertidas sueltas: se devuelven tal cual, no se comen.
      const prefijo = !balanceado && indice > 0 ? '`' : '';
      return decorar(escapar(prefijo + parte));
    })
    .join('');
}

const esSeparadorTabla = (linea) =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);

const celdas = (linea) =>
  linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function render(fuente) {
  const lineas = String(fuente).replace(/\r\n?/g, '\n').split('\n');
  const salida = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];

    // Bloque de codigo con vallas
    const valla = linea.match(/^\s*```+\s*(\S*)\s*$/);
    if (valla) {
      const lenguaje = valla[1];
      const cuerpo = [];
      i += 1;
      while (i < lineas.length && !/^\s*```+\s*$/.test(lineas[i])) {
        cuerpo.push(lineas[i]);
        i += 1;
      }
      i += 1; // la valla de cierre
      const clase = lenguaje ? ' class="lenguaje-' + escapar(lenguaje) + '"' : '';
      salida.push('<pre' + clase + '><code>' + escapar(cuerpo.join('\n')) + '</code></pre>');
      continue;
    }

    if (/^\s*$/.test(linea)) { i += 1; continue; }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(linea)) { salida.push('<hr>'); i += 1; continue; }

    const encabezado = linea.match(/^(#{1,6})\s+(.*)$/);
    if (encabezado) {
      const nivel = encabezado[1].length;
      salida.push('<h' + nivel + '>' + enLinea(encabezado[2].trim()) + '</h' + nivel + '>');
      i += 1;
      continue;
    }

    // Tabla: encabezado seguido de separador
    if (linea.includes('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      const cabeceras = celdas(linea);
      i += 2;
      const filas = [];
      while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim() !== '') {
        filas.push(celdas(lineas[i]));
        i += 1;
      }
      const thead = '<thead><tr>' + cabeceras.map((c) => '<th>' + enLinea(c) + '</th>').join('') + '</tr></thead>';
      const tbody = '<tbody>' + filas
        .map((f) => '<tr>' + f.map((c) => '<td>' + enLinea(c) + '</td>').join('') + '</tr>')
        .join('') + '</tbody>';
      salida.push('<div class="tabla-scroll"><table>' + thead + tbody + '</table></div>');
      continue;
    }

    // Cita
    if (/^\s*>/.test(linea)) {
      const cuerpo = [];
      while (i < lineas.length && /^\s*>/.test(lineas[i])) {
        cuerpo.push(lineas[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      salida.push('<blockquote>' + render(cuerpo.join('\n')) + '</blockquote>');
      continue;
    }

    // Listas: se agrupan los renglones y sus continuaciones sangradas
    const marcaLista = linea.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (marcaLista) {
      const ordenada = /\d/.test(marcaLista[2]);
      const puntos = [];
      while (i < lineas.length) {
        const actual = lineas[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (actual && /\d/.test(actual[2]) === ordenada) {
          const cuerpo = [actual[3]];
          i += 1;
          while (
            i < lineas.length &&
            lineas[i].trim() !== '' &&
            !/^(\s*)([-*+]|\d+[.)])\s+/.test(lineas[i]) &&
            !/^\s*(#{1,6}\s|>|```)/.test(lineas[i])
          ) {
            cuerpo.push(lineas[i].trim());
            i += 1;
          }
          puntos.push(cuerpo.join(' '));
        } else if (
          lineas[i].trim() === '' &&
          i + 1 < lineas.length &&
          /^(\s*)([-*+]|\d+[.)])\s+/.test(lineas[i + 1])
        ) {
          i += 1; // hueco en blanco dentro de la misma lista
        } else {
          break;
        }
      }
      const etiqueta = ordenada ? 'ol' : 'ul';
      salida.push('<' + etiqueta + '>' + puntos.map((p) => '<li>' + enLinea(p) + '</li>').join('') + '</' + etiqueta + '>');
      continue;
    }

    // Parrafo: hasta la proxima linea en blanco o el proximo bloque
    const parrafo = [];
    while (
      i < lineas.length &&
      lineas[i].trim() !== '' &&
      !/^\s*(#{1,6}\s|>|```|(---+|\*\*\*+|___+)\s*$)/.test(lineas[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lineas[i]) &&
      !(lineas[i].includes('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1]))
    ) {
      parrafo.push(lineas[i].trim());
      i += 1;
    }
    if (parrafo.length > 0) salida.push('<p>' + enLinea(parrafo.join(' ')) + '</p>');
    else i += 1;
  }

  return salida.join('\n');
}

// Los agentes escriben la propuesta tecnica en un solo renglon, con la
// enumeracion metida dentro del parrafo: «...esa es la premisa. 1) Esto.
// 2) Lo otro.». Renderizado tal cual sale un ladrillo. Esto reconoce SOLO esa
// forma —una serie 1), 2), 3)... completa, en orden y fuera de los `codigo en
// linea`— y la desdobla en una lista de verdad, sin tocar el texto. Si falta
// un numero o van desordenados, se devuelve intacto: mejor un parrafo largo
// que una lista inventada.
function desdoblarEnumeracion(texto) {
  const fuente = String(texto);
  // Si ya trae renglones, el autor le dio su propia estructura: no se toca.
  if (fuente.includes('\n')) return fuente;

  const dentroDeCodigo = (hasta) => {
    let comillas = 0;
    for (let i = 0; i < hasta; i += 1) if (fuente[i] === '`') comillas += 1;
    return comillas % 2 === 1;
  };

  const marcas = [];
  let esperado = 1;
  const patron = /(^|\s)(\d{1,2})\)\s+/g;
  let encontrado;
  while ((encontrado = patron.exec(fuente)) !== null) {
    if (Number(encontrado[2]) !== esperado) continue;
    const inicio = encontrado.index + encontrado[1].length;
    if (dentroDeCodigo(inicio)) continue;
    marcas.push({ inicio, fin: encontrado.index + encontrado[0].length });
    esperado += 1;
  }
  if (marcas.length < 2) return fuente;

  const entrada = fuente.slice(0, marcas[0].inicio).trim();
  const puntos = marcas.map((marca, indice) => {
    const hasta = indice + 1 < marcas.length ? marcas[indice + 1].inicio : fuente.length;
    return (indice + 1) + ') ' + fuente.slice(marca.fin, hasta).trim();
  });

  return (entrada ? [entrada] : []).concat(puntos).join('\n\n');
}

const api = { render, escapar, desdoblarEnumeracion };

// El mismo archivo lo carga el servidor (require) y el navegador (<script>):
// la propuesta tecnica de una tarea se pinta con el codigo que ya usan los
// documentos de plan/, sin una segunda copia que se desfase.
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.Markdown = api;
