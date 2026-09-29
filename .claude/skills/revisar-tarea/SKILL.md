---
name: revisar-tarea
description: Cierra el ciclo de una tarea en in_review después de que el usuario la probó — la pasa a done, o la devuelve a in_progress con el motivo en revisiones. Úsala cuando el usuario diga «ya probé la #N», «la #N está bien», «la #N falla en…», o pida qué tiene pendiente de revisar.
---

# Revisar una tarea

`in_review` quiere decir que el agente terminó y **el usuario tiene que
probarla**. Sólo él decide si está.

## Si pregunta qué tiene por revisar

Lista las tareas en `in_review`, cada una con su id, su título, su `acceptance`
(es lo que tiene que probar) y su `commit` si está escrito. Si alguna tiene
`handoff`, recuérdale que el otro lado depende de ella.

## Si la aprueba

- Estado `done`.
- Si tenía `commit` y el usuario no ha commiteado el repo de trabajo, recuérdale
  el mensaje, listo para copiar.
- Dile qué tareas se destraban: las `pending` cuyo `dependsOn` era ésta.

## Si la devuelve

- Estado `in_progress`.
- Agrega a `revisiones` (créalo si no existe) un
  `{ "fecha": "AAAA-MM-DD", "motivo": "…" }` con la fecha de hoy (sácala con
  `date`, no de memoria) y el motivo **en las palabras del usuario**,
  completo: el agente que la retome sólo va a tener eso.
- Lo que ya tiene `revisiones` no se toca: es la historia.
- Si lo que pide está fuera del `acceptance`, díselo: o se amplía el
  `acceptance` (con su sí) o es otra tarea (skill `nueva-tarea`).
- Dile que la retome abriendo Claude en el repo de trabajo con «implementa la
  siguiente tarea pendiente» — o, si ésta no es la primera en la fila, «retoma
  la #N».

Edita `plan/tareas.json` por Node, como dice el `CLAUDE.md` de este repo, y
cierra con el mensaje de commit del plan listo para copiar
(`plan: <titulo corto> (<id>), hecha` / `devuelta`).
