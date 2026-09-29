# orquestador-ia-claude

Plantilla de un **repo de control** para trabajar con Claude Code en un
proyecto de varios repos (backend, frontend, landing, lo que sea). **No tiene
código de producto: sólo coordina.**

El problema que resuelve: sin esto, el contexto vive en la conversación. Cada
sesión arranca de cero, hay que volver a explicar qué se hizo, y coordinar el
backend con el front es pasar mensajes a mano. Aquí el plan, los contratos entre
repos y las decisiones quedan **escritos en archivos**, y cualquier sesión de
Claude —en cualquiera de los repos— arranca sabiendo dónde está parado.

## Cómo se acomoda

El repo de control y los repos de trabajo son **hermanos**: cuelgan del mismo
directorio padre.

```
mis-proyectos/
  orquestador-ia-claude/   ← éste (renómbralo: mi-proyecto-ops, por ejemplo)
  mi-proyecto-backend/
  mi-proyecto-frontend/
```

Por eso todas las rutas entre repos van **relativas** (`../mi-proyecto-backend`)
y nunca absolutas: la carpeta que los contiene se llama distinto en cada
máquina.

## Qué hay

```
CLAUDE.md                  lo que Claude lee al abrir este repo: cómo se usa
config/repositories.json   dónde está cada repo y su rama de release
plan/tareas.json           EL plan. Compartido entre todos los repos
plan/handoff/<id>.md       lo que un repo le deja escrito al otro
plan/propuestas/           trabajo que alguien descubrió y todavía no es tarea
plan/referencia/           material de apoyo que una tarea necesita
plantillas/                el CLAUDE.md de cada repo de trabajo, y los formatos
.claude/skills/            iniciar el proyecto, conectar un repo, cargar tareas, revisar
tools/panel/               el tablero local, sobre plan/tareas.json
```

## Empezar

1. Copia esta carpeta junto a tus repos y renómbrala si quieres
   (`mi-proyecto-ops`). Haz `git init` si todavía no es repo.
2. Abre Claude Code **en esta carpeta** y dile:

   > inicia el proyecto

   Claude carga la skill `iniciar-proyecto`: te pregunta qué repos tienes,
   llena `config/repositories.json`, y le escribe a cada repo de trabajo su
   `CLAUDE.md` con el flujo del plan (a partir de
   `plantillas/CLAUDE-repo-de-trabajo.md`), leyendo el código para describir el
   stack y las convenciones reales.
3. Carga tus primeras tareas —«agrega una tarea: …»— o escríbelas en el panel.
4. Abre Claude en un repo de trabajo y dile:

   > implementa la siguiente tarea pendiente

## Cómo se trabaja una tarea

El flujo completo está escrito en el `CLAUDE.md` de cada repo de trabajo —ahí es
donde se lee—. El resumen:

1. Se toma la primera tarea `pending` del repo que toca, cuyo `dependsOn` esté
   en `done` o `in_review`.
2. Si tiene `dependsOn`, se lee `plan/handoff/<id>.md`: ahí está lo que el otro
   lado dejó escrito.
3. **Antes de tocar código**, el agente escribe su `propuestaTecnica` y pasa la
   tarea a `proposed`. Para ahí. El usuario la aprueba o la corrige.
4. Aprobada: `in_progress`. El `acceptance` es el alcance; nada fuera de ahí.
5. Si la tarea tiene `handoff`, se escribe `plan/handoff/<id>.md` con el
   contrato **listo para copiar**. Es lo único que el otro lado va a leer.
6. `in_review`, con el mensaje de commit escrito en `commit`.

**`in_review` no es `done`.** El agente no cierra tareas: las deja listas para
que el usuario las pruebe. Él pasa a `done`, o las devuelve a `in_progress` con
el motivo escrito en `revisiones`.

**Nadie escribe en `tareas.json` por su cuenta.** Si a media tarea se descubre
trabajo que falta, se escribe una propuesta en `plan/propuestas/` en lenguaje de
negocio, se muestra con el bloque JSON listo para pegar, y se espera el sí.

```
pending ──► proposed ──► in_progress ──► in_review ──► done
               │  ▲            │              │
               └──┘ corrige    ▼              └─► in_progress (con revisiones)
                            blocked
```

## La forma de una tarea

Hay un ejemplo completo en `plantillas/tareas-ejemplo.json`: un par backend → frontend, la primera con `handoff` y la segunda con `dependsOn`.

| Campo | Para qué |
| --- | --- |
| `id` | número, único y creciente |
| `repo` | el nombre del repo tal como está en `repositories.json` (`backend`, `frontend`…) |
| `rama` | sólo si la tarea **no vive en la rama de release**: el nombre de la rama donde vive. Sin el campo, va en la rama de release del repo |
| `titulo` · `descripcion` | qué y dónde, **en lenguaje de negocio** |
| `acceptance` | criterios verificables. **Los escribe (o aprueba) el usuario**: son el alcance |
| `dependsOn` | id de la tarea de la que depende, o `null` |
| `handoff` | nombre del repo al que debe dejarle instrucciones, o `null` |
| `estado` | uno de los seis de `reglas.estados` |
| `propuestaTecnica` | cómo se va a hacer. La escribe el agente, la aprueba el usuario |
| `commit` | el mensaje de commit, redactado antes de commitear |
| `migracion` | `{ script, queHace, aplicadaEn: [] }` si el cambio necesita migración, o `null` |
| `revisiones` | sólo si la tarea volvió de `in_review`: lista de `{ fecha, motivo }`. **No se agrega vacío** |

## El panel

```bash
npm run panel           # http://127.0.0.1:4321, y abre el navegador solo
npm run panel:probar    # su propia suite
```

Sin dependencias: es Node pelón (18+), así que no hace falta `npm install`.

- **Escucha sólo en `127.0.0.1`.** Es una herramienta de una persona en su
  máquina: no hay usuarios ni sesiones. No lo expongas.
- Si el puerto está ocupado prueba el siguiente, hasta diez veces.
  `PUERTO=5000 npm run panel` lo fija; `SIN_NAVEGADOR=1` evita que lo abra.
- **Lo único que se toma en serio es no estropear `plan/tareas.json`**, que lo
  comparten los agentes de todos los repos. Por eso: escritura atómica, y si al
  arrancar detecta que reescribir el archivo le cambiaría el formato, entra en
  **solo lectura** antes que tocarlo.
- Si un agente escribió el archivo mientras tú editabas, **no guarda encima**:
  te dice qué tarea y qué campo cambiaron, y te enseña los dos lados.
- Conserva campos que no conoce: si un agente le agrega uno propio a una tarea,
  el panel lo deja donde está.
- El selector de repo ofrece los de `config/repositories.json` más los que ya
  aparezcan en el plan.

Dos pruebas de la suite necesitan un plan ya en marcha —una `propuestaTecnica`
escrita, un documento en `plan/propuestas/`— y se **omiten** mientras no haya
con qué correrlas, en vez de fallar. Vuelven solas en cuanto se trabaje la
primera tarea.

## Adaptarlo

- **Los ejemplos se adaptan solos.** `repositories.json`,
  `plantillas/tareas-ejemplo.json` y los colores del panel vienen con un
  proyecto inventado (una tienda con `backend` y `frontend`). Al correr
  `iniciar-proyecto`, Claude los reescribe con tus repos y con un ejemplo de tu
  dominio. Los nombres son libres: `api`, `app`, `landing`, `movil`…
- **Las reglas de commit** (que el agente no commitee, el tono del mensaje, la
  atribución) son decisiones tuyas: `iniciar-proyecto` te las pregunta y quedan
  en el `CLAUDE.md` de cada repo de trabajo.
- **Un solo repo de trabajo también sirve.** Se pierde el handoff, pero el plan,
  las propuestas y el «propón antes de tocar código» siguen valiendo.
