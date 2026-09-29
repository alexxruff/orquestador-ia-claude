---
name: nueva-tarea
description: Convierte lo que el usuario pide en una o más tareas de plan/tareas.json — en lenguaje de negocio, partidas por repo, con dependencias, handoff y acceptance en borrador. Úsala cuando el usuario diga «agrega una tarea», «hay que…», «quiero que…», o traiga una lista de pendientes para cargar al plan.
---

# Cargar una tarea al plan

La tarea la va a leer un agente en otro repo, sin esta conversación. Todo lo
que necesita saber tiene que quedar escrito en ella.

## 1. Entender antes de escribir

- Si el pedido es ambiguo en algo que cambia el alcance, pregunta — **una sola
  ronda**, con opciones concretas. Si no, escribe y deja que el usuario corrija.
- Mira el plan: ¿ya hay una tarea que cubre esto, o una en `pending` que
  convendría ampliar? ¿Depende de algo que ya está?
- Si necesitas entender el sistema para partirla bien, lee el `CLAUDE.md` del
  repo de trabajo (la ruta está en `config/repositories.json`). No más: el
  diseño técnico es la `propuestaTecnica`, y la escribe el agente del repo.

## 2. Partirla por repo

**Una tarea vive en un solo repo.** Si lo pedido toca backend y frontend, son
dos tareas:

- la del repo que expone el contrato va primero, con `handoff` apuntando al
  otro repo (`"handoff": "frontend"`): así queda obligada a dejar escrito
  `plan/handoff/<id>.md`;
- la del otro lado lleva `dependsOn` con el id de la primera, y así lee ese
  handoff antes de empezar.

Si la tarea es grande, pártela en entregas que el usuario pueda probar por
separado. Cada una tiene que dejar el producto funcionando.

## 3. Escribirla

```json
{
  "id": 0,
  "repo": "backend",
  "titulo": "…",
  "descripcion": "…",
  "acceptance": ["…"],
  "dependsOn": null,
  "handoff": null,
  "estado": "pending",
  "propuestaTecnica": null,
  "commit": null,
  "migracion": null
}
```

- `id`: el mayor que exista en el plan + 1. Nunca se recicla uno.
- `repo`: un nombre que exista en `config/repositories.json`.
- `titulo`: qué cambia **para quien usa el producto**. «Que el cliente pueda
  descargar su factura», no «endpoint de facturas».
- `descripcion`: qué pasa hoy, qué tiene que pasar, y los límites (quién
  puede, qué no se hace). En lenguaje de negocio: ni archivos, ni tablas, ni
  rutas — a menos que el usuario las haya dicho.
- `acceptance`: criterios **que se puedan comprobar usando el producto**, uno
  por renglón. Incluye lo que no debe pasar («nadie puede ver lo de otro») y
  los bordes («funciona en teléfono», «con cero resultados»).
- `rama`: **sólo** si el usuario dice que es una prueba o una alternativa que
  no debe entrar a la rama de release todavía.
- No agregues `revisiones` vacío.

## 4. Enseñarla y esperar

- Muéstrale al usuario la tarea (o las tareas) en su bloque JSON, y marca el
  `acceptance` como **borrador**: es el alcance, y lo confirma él.
- **Sólo con su sí** la insertas en `plan/tareas.json`, editando por Node como
  dice el `CLAUDE.md` de este repo, y compruebas que el JSON sigue válido.
- Si el usuario prefiere pensarla, guárdala como propuesta en
  `plan/propuestas/<AAAA-MM-DD>-<repo>-<slug>.md` con el formato de
  `plantillas/propuesta.md`.
- Cierra con el mensaje de commit del plan, listo para copiar:
  `plan: <titulo corto> (<id>)`.
