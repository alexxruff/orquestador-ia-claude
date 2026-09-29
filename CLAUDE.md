# CLAUDE.md — repo de control (orquestador-ia-claude)

Punto de entrada para cualquier agente que abra este repo. Léelo completo:
aquí no hay código de producto, sólo el plan y las reglas para coordinar varios
repos de trabajo. La versión para personas está en `README.md`.

## Qué es esto

Un **repo de control**. Coordina a uno o más repos de trabajo que son sus
**hermanos** (cuelgan del mismo directorio padre):

- `config/repositories.json` dice cuáles son, dónde están y su rama de release.
- `plan/tareas.json` es **el plan**, compartido por los agentes de todos los
  repos.
- `plan/handoff/<id>.md` es lo que un repo le deja escrito al otro al cerrar
  una tarea.
- `plan/propuestas/` es trabajo descubierto que todavía no es tarea.
- `plan/referencia/` es material de apoyo que alguna tarea necesita.
- `plantillas/` son los formatos: el `CLAUDE.md` de un repo de trabajo, un
  handoff, una propuesta, una tarea.
- `tools/panel/` es el tablero local (`npm run panel`).

**Aquí no se implementa nada.** El código se escribe en los repos de trabajo,
cada uno con su `CLAUDE.md`. En éste se planea, se revisa y se ordena.

## Lo primero: ¿el proyecto ya está iniciado?

Revisa `config/repositories.json`. Si sus repos siguen siendo los del ejemplo
(`../mi-proyecto-backend`, `../mi-proyecto-frontend`), o si alguna `path` no
existe en disco, **el proyecto no está iniciado**. Dilo en una línea y ofrece
correr la skill `iniciar-proyecto` antes de cualquier otra cosa: sin repos
reales, el plan no tiene a quién apuntar.

Lo que trae la plantilla de ejemplo —los repos de `repositories.json`, las
tareas de `plantillas/tareas-ejemplo.json` y los colores `backend`/`frontend`
del panel— **se adapta al proyecto al iniciarlo**, no se borra: la skill dice
cómo.

## Skills de este repo

En `.claude/skills/`, y se cargan sólo cuando hacen falta:

| Skill | Cuándo |
| --- | --- |
| `iniciar-proyecto` | la primera vez: preguntar por los repos, llenar `repositories.json`, escribirle a cada repo su `CLAUDE.md` |
| `conectar-repo` | agregar un repo de trabajo más a un proyecto ya iniciado |
| `nueva-tarea` | el usuario pide algo («agrega una tarea…», «hay que…») y hay que convertirlo en tarea del plan |
| `revisar-tarea` | el usuario probó una tarea `in_review`: pasarla a `done` o devolverla con su motivo |

## Lo que se le pide a este repo, y qué hacer

- **«¿Cómo vamos?» / «¿qué sigue?»** — Lee `plan/tareas.json` y resume por
  estado: qué está en `in_review` esperando que el usuario lo pruebe, qué está
  en `proposed` esperando aprobación, qué está `blocked` y por qué, y cuál es
  la siguiente `pending` de cada repo (la primera cuyo `dependsOn` esté en
  `done` o `in_review`). Corto: una línea por tarea, con su id.
- **«Agrega una tarea…»** — skill `nueva-tarea`.
- **«Ya probé la #N»** — skill `revisar-tarea`.
- **«Aprueba la propuesta de la #N»** — Revisa que la tarea esté en `proposed`
  y cambia su estado a `in_progress`. Si el usuario corrige algo de la
  propuesta, escríbelo en `propuestaTecnica` y déjala en `proposed` hasta que
  diga que sí.
- **«Revisa las propuestas»** — Lista `plan/propuestas/` con su estado (las que
  ya se insertaron llevan el id de la tarea). Las nuevas se muestran con su
  bloque JSON listo para insertar; **se insertan sólo con un sí explícito.**
- **«Implementa la #N»** estando aquí — No. Explica que eso se hace abriendo
  Claude en el repo de trabajo que dice `repo` (la ruta está en
  `repositories.json`), con «implementa la siguiente tarea pendiente».

## Cómo se escribe en `plan/tareas.json`

Lo comparten los agentes de todos los repos y el panel. Romperlo detiene a
todos.

- **Nunca lo reescribas entero a mano.** Edítalo con una lectura y escritura
  por Node, que conserva el formato que el panel espera (dos espacios de
  sangría, LF, salto de línea final):

  ```bash
  node -e '
  const fs = require("fs");
  const f = "plan/tareas.json";
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  const t = doc.tareas.find((t) => t.id === 12);
  t.estado = "done";
  fs.writeFileSync(f, JSON.stringify(doc, null, 2) + "\n");
  '
  ```

- **Conserva los campos que no conozcas.** Si una tarea trae uno de más, se
  queda.
- **Los ids son crecientes y no se reciclan**: el siguiente es el mayor + 1,
  aunque se hayan borrado tareas.
- **`revisiones` no se agrega vacío**, y lo que ya tiene no se reescribe: es la
  historia de lo que el usuario devolvió.
- **`acceptance` es del usuario.** Puedes proponerlo en borrador, pero es el
  alcance: no lo cambies sin que lo apruebe.
- Después de escribir, comprueba que sigue siendo JSON válido:
  `node -e 'JSON.parse(require("fs").readFileSync("plan/tareas.json","utf8"))'`.

## Las reglas del formato

Éstas son las que hacen que el esquema funcione; valen aquí y en cada repo de
trabajo.

1. **Una tarea a la vez por repo** (`reglas.unaTareaALaVez`).
2. **Antes de código, propuesta.** El agente traduce la tarea —escrita en
   lenguaje de negocio— a qué archivos y qué campos va a tocar, la pone en
   `propuestaTecnica`, pasa a `proposed` y **para**.
3. **El `acceptance` es el alcance.** Lo que no está ahí no se hace; si hace
   falta, es otra tarea.
4. **Nadie se auto-asigna trabajo.** Lo descubierto va a `plan/propuestas/` en
   lenguaje de negocio, con el bloque JSON listo, y espera el sí.
5. **`in_review` no es `done`.** El agente no cierra: el usuario prueba y
   decide.
6. **El handoff es lo único que el otro lado lee.** Si no está en
   `plan/handoff/<id>.md`, para ellos no existe. Contrato listo para copiar,
   sin estado de despliegue.
7. **Si te bloqueas, `blocked` con el porqué.** No se improvisan rodeos.
8. **Rutas relativas entre repos** (`../otro-repo`), nunca absolutas.

## Commits de este repo

Los cambios de aquí son de plan (tareas, propuestas, handoffs). Salvo que el
usuario diga otra cosa, **no hagas `git commit`**: deja el árbol como está y
termina con el mensaje listo para copiar, en español y en minúscula, con el
prefijo `plan:` — por ejemplo `plan: el alta de clientes (12), en revisión`.
