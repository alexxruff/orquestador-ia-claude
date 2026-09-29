---
name: iniciar-proyecto
description: Configura este repo de control para un proyecto nuevo — pregunta por los repos de trabajo, llena config/repositories.json y le escribe a cada repo su CLAUDE.md con el flujo del plan. Úsala la primera vez que se abre el repo, cuando repositories.json todavía trae los repos de ejemplo, o cuando el usuario diga «inicia el proyecto».
---

# Iniciar el proyecto

El objetivo: que al terminar, abrir Claude en cualquier repo de trabajo y decir
«implementa la siguiente tarea pendiente» funcione sin más explicación.

## 1. Preguntar lo que no se puede deducir

Antes de preguntar, mira el directorio padre (`ls ..`): los repos de trabajo
suelen ya estar ahí, y es mejor proponer «veo `../tienda-api` y `../tienda-web`,
¿son éstos?» que preguntar en blanco.

Lo que necesitas saber, en **una sola ronda de preguntas**:

1. **Qué repos de trabajo** entran al plan, y con qué nombre corto se les va a
   llamar en las tareas (`backend`, `frontend`, `api`, `movil`…). El nombre es
   el valor de `repo` en cada tarea: corto, en minúscula, sin espacios.
2. **Su rama de release** (`main`, `master`…). Compruébala con
   `git -C ../<repo> branch --show-current` en vez de preguntarla, si puedes.
3. **Commits**: ¿el agente commitea, o sólo deja el mensaje listo y el usuario
   commitea? (Por defecto: el usuario commitea.) ¿Los mensajes llevan
   atribución a Claude o no?
4. Si el repo de control **se va a renombrar** (p. ej. `tienda-ops`). Importa:
   todos los `CLAUDE.md` de trabajo apuntan a `../<nombre-de-esta-carpeta>`.
   Si se va a renombrar, que lo haga **antes** de seguir.

No preguntes por lo que puedes leer del código (stack, comandos, estructura).

## 2. Llenar `config/repositories.json`

Reemplaza los repos de ejemplo por los reales. Por cada repo:

```json
"backend": {
  "path": "../tienda-api",
  "remote": "origin",
  "remoteUrl": null,
  "releaseBranch": "main",
  "deployScript": null
}
```

- `path` siempre relativo a este repo y hermano (`../algo`).
- `remoteUrl`: el de `git -C ../<repo> remote get-url origin` si lo hay; si
  no, `null`.
- `deployScript`: la ruta al script de despliegue dentro del repo, si existe.
- Se pueden agregar campos propios del proyecto (la app de hosting, la cuenta);
  el panel los ignora.
- El `remoteUrl` del `controlPlane` se deja en `null` hasta que el usuario
  conecte este repo a GitHub.

## 3. Escribirle a cada repo su `CLAUDE.md`

A partir de `plantillas/CLAUDE-repo-de-trabajo.md`. **Éste es el trabajo que
más importa**, y es de lectura: para cada repo, antes de escribir,

- abre su `package.json` (o lo equivalente: `pyproject.toml`, `go.mod`,
  `Gemfile`…), su árbol de carpetas, su README, su `.env.example`, sus
  scripts y un par de archivos representativos de cada capa;
- saca de ahí el stack, los comandos reales, la estructura y las convenciones
  que se ven en el código.

Si puedes, reparte los repos en subagentes en paralelo: cada uno lee su repo y
devuelve el `CLAUDE.md` lleno.

Reglas:

- **Si el repo ya tiene un `CLAUDE.md`, no lo pises.** Enséñale al usuario qué
  le falta y agrégale sólo la sección «El plan de tareas» (y «Los otros
  repos», si no la tiene), adaptada.
- **Ninguna `{{LLAVE}}` puede quedar**, ni los comentarios de la plantilla.
- **Lo que no se pudo confirmar se dice** («no encontré pruebas automáticas»),
  no se inventa.
- La sección «El plan de tareas» es fija: sólo se cambian el nombre del repo
  de control y el nombre del repo en el plan.
- La regla de commits y de atribución, según lo que contestó el usuario en el
  paso 1.
- Copia también `plantillas/settings-repo-de-trabajo.json` a
  `<repo>/.claude/settings.json` si no existe (si existe, no lo toques).

## 4. Adaptar los ejemplos al proyecto

La plantilla trae ejemplos genéricos (una tienda que vende y factura, repos
`backend` y `frontend`). Se quedan, pero **hablando del proyecto del usuario**:
un ejemplo en su dominio y con sus nombres enseña el formato mucho mejor.

### `plantillas/tareas-ejemplo.json`

Reescríbelo para este proyecto, **conservando la estructura**, porque es lo
que enseña el flujo:

- **Dos tareas.** La #1 en el repo que expone el contrato, con `handoff`
  apuntando al segundo, en `in_review`, con su `propuestaTecnica`, su `commit`
  y una entrada en `revisiones`. La #2 en el otro repo, con `dependsOn: 1`, en
  `pending` y sin propuesta.
- **Los nombres de repo reales**, tal como quedaron en `repositories.json`.
  Con un solo repo, las dos tareas van en él y la #1 lleva `handoff: null`.
- **Una funcionalidad inventada pero verosímil en su dominio**, que se entienda
  sin conocer el código, escrita como dice la skill `nueva-tarea` (título y
  descripción en lenguaje de negocio, `acceptance` comprobable). La
  `propuestaTecnica` sí nombra archivos y rutas, y tienen que parecerse a los
  de su stack (lo leíste en el paso 3).
- **Que no sea trabajo real.** Es un ejemplo: no copies nada que el usuario
  haya pedido de verdad, porque alguien lo confundiría con una tarea.
- **El mismo orden de claves** que ya tiene el archivo. El panel valida ese
  orden.

Después corre `npm run panel:probar`: con el plan vacío, la suite usa estas
tareas como semilla, así que tiene que quedar en verde.

### Los colores del panel (`tools/panel/public/estilos.css`)

Cada repo tiene su color en el tablero. La clase es `repo-` + el nombre en
minúscula, con cualquier carácter que no sea letra o número cambiado por `-`.
El CSS trae dos: `repo-backend` (magenta) y `repo-frontend` (lima).

- Reemplaza `repo-backend` y `repo-frontend` por los nombres reales, en **todas**
  sus apariciones (variables y reglas).
- Con un tercer repo o más, copia el bloque de variables y las reglas de uno de
  ellos con el nombre nuevo y un tono que la paleta no use todavía. Los estados
  ya usan gris, violeta, naranja, cian, verde y rojo, y el acento es azul: si el
  repo usa el mismo color que un estado, la tarjeta dice dos cosas con el mismo
  color.
- Con un solo repo, deja uno y borra el otro.

### Lo que no se adapta

`plantillas/CLAUDE-repo-de-trabajo.md`, `handoff.md`, `propuesta.md` y
`settings-repo-de-trabajo.json` son **formatos**: se quedan genéricos, porque
de ahí salen los repos que se conecten después.

## 5. Dejar el plan listo

- `plan/tareas.json` se queda con `"tareas": []` si el usuario no trae tareas.
  Si trae una lista de pendientes, conviértelas con la skill `nueva-tarea` —
  con su `acceptance` en **borrador**, y dilo: es lo que define el alcance, y
  lo tiene que confirmar él.

## 6. Cerrar

Termina con:

1. La tabla de repos conectados (nombre en el plan → carpeta → rama).
2. Qué archivos se escribieron en cada repo de trabajo, y qué se adaptó aquí
   (`repositories.json`, el ejemplo de tareas, los colores), para que lo
   revise.
3. El siguiente paso, literal: cargar la primera tarea aquí, y luego abrir
   Claude en el repo que toca con «implementa la siguiente tarea pendiente».
4. Si este repo no es git todavía: `git init` y el primer commit, con el
   mensaje listo para copiar.
