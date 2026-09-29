<!--
PLANTILLA — plan/handoff/<id>.md

Lo escribe el repo que cierra la tarea, cuando la tarea tiene `handoff`. Es lo
ÚNICO que el otro lado va a leer: si algo no está aquí, para ellos no existe.

- Listo para copiar: rutas, cuerpos y respuestas completos, no descritos.
- Los errores con su mensaje tal cual.
- Qué quedó fuera, dicho explícitamente.
- Ni una palabra sobre el estado del despliegue.
- Este comentario se borra.
-->
# Tarea #{{ID}} — {{TITULO}}

**Contrato para {{REPO_DESTINO}}, para la #{{ID_DE_LA_TAREA_QUE_LO_USA}}.**
Comprobado con {{CÓMO_SE_COMPROBÓ}}. El detalle completo en
`../{{REPO_ORIGEN}}/docs/{{DOCUMENTO}}.md`.

---

## La petición

```
{{METODO}} {{RUTA}}
Authorization: Bearer <token>
```

```json
{
  "campo": "valor"
}
```

- Qué campos son obligatorios, cuáles opcionales, y qué valores aceptan.

## La respuesta — `200`

```json
{
  "status": "success",
  "data": {}
}
```

## Los errores

| Código | Cuándo | `message` tal cual |
| --- | --- | --- |
| `400` | … | «…» |
| `404` | … | «…» |

## Lo que tienen que tocar

- Pantalla / módulo / tipo que cambia, y cómo.

## Lo que quedó fuera

- Lo que la tarea no cubre, para que nadie lo suponga.
