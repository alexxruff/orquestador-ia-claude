<!--
PLANTILLA — plan/propuestas/<AAAA-MM-DD>-<repo>-<slug>.md

Trabajo que alguien descubrió y todavía no es tarea. Se escribe EN LENGUAJE DE
NEGOCIO: qué se quiere y por qué importa, no qué archivos se tocan (eso es la
`propuestaTecnica`, y viene después). Se le enseña al usuario con el bloque JSON
listo, y sólo se inserta en tareas.json con su sí.

Al insertarla, se cambia la línea de estado a «**insertada como #<id>**».
Este comentario se borra.
-->
# Propuesta — {{TITULO_EN_LENGUAJE_DE_NEGOCIO}}

{{FECHA}} · {{REPO}} · **propuesta, no aprobada**

## Qué se quiere

Lo que tiene que pasar, contado como lo contaría quien usa el producto.

## Por qué importa

Qué se puede hacer hoy, qué no, y qué cuesta que no se pueda.

## Las decisiones que hay que tomar

Si hay más de un camino, cada uno con lo que gana y lo que cuesta, y cuál se
recomienda. Si no hay decisiones, se borra esta sección.

## La tarea, lista para insertar

```json
{
  "id": {{SIGUIENTE_ID}},
  "repo": "{{REPO}}",
  "titulo": "…",
  "descripcion": "…",
  "acceptance": [
    "…"
  ],
  "dependsOn": null,
  "handoff": null,
  "estado": "pending",
  "propuestaTecnica": null,
  "commit": null,
  "migracion": null
}
```
