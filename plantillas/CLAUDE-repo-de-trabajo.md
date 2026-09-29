<!--
PLANTILLA — el CLAUDE.md de un repo de trabajo.

La skill `iniciar-proyecto` (o `conectar-repo`) la copia a la raíz de cada repo
de trabajo y la llena. Reglas para llenarla:

- Todo lo que va entre {{DOBLES_LLAVES}} se reemplaza. Ninguna debe quedar.
- Las secciones marcadas «SE ESCRIBE LEYENDO EL CÓDIGO» no se inventan: se
  abren los archivos (package.json, la estructura, los scripts, la config) y se
  describe lo que hay de verdad. Si algo no se pudo confirmar, se dice.
- La sección «El plan de tareas» es FIJA: sólo se cambian los nombres.
- Este comentario se borra.
- Mejor corto y cierto que largo y supuesto. Crece con el proyecto: cada
  trampa que muerda una vez se escribe aquí para que no muerda dos.
-->
# CLAUDE.md — {{NOMBRE_DEL_REPO}}

Punto de entrada para cualquier agente o persona que llegue a este repo. Léelo
completo antes de tocar código; toma 3 minutos y evita reescrituras.

## Qué es esto

<!-- SE ESCRIBE LEYENDO EL CÓDIGO: qué hace este repo, para quién, y el stack
en una línea (lenguaje · framework · base de datos · servicios externos). -->
{{QUE_ES}}

**Es el repo `{{NOMBRE_EN_EL_PLAN}}` del plan.** El plan y la coordinación con
los otros repos viven en `../{{REPO_CONTROL}}` (ver «El plan de tareas»).

## Los otros repos

> Las rutas a los otros repos van **relativas a la raíz de éste**
> (`../{{REPO_CONTROL}}`, `../otro-repo`), **nunca absolutas**: la carpeta que
> los contiene se llama distinto en cada máquina.

<!-- Una fila por repo hermano, sacada de ../{{REPO_CONTROL}}/config/repositories.json -->
| Repo | Ruta | Qué es |
| --- | --- | --- |
| {{OTRO_REPO}} | `../{{CARPETA_OTRO_REPO}}` | {{QUE_ES_EL_OTRO}} |

**Nadie edita el código ni los documentos del otro.** Se leen donde viven.
Cuando un cambio de aquí le afecta, se le pasa un **mensaje** con el contrato
técnico y nada más —qué cambia, forma exacta, qué tiene que tocar—, y **sin una
palabra sobre el estado del despliegue**: el despliegue lo coordina el usuario,
y ese dato hace que el otro lado actúe sobre suposiciones. Lo que sale **de una
tarea** del plan va en `../{{REPO_CONTROL}}/plan/handoff/<id>.md`.

## Arrancar

<!-- SE ESCRIBE LEYENDO EL CÓDIGO: los comandos reales de package.json /
Makefile / scripts. Instalar, configurar el .env, levantar lo que haga falta,
correr, probar. -->
```bash
{{COMANDOS_DE_ARRANQUE}}
```

## Estructura

<!-- SE ESCRIBE LEYENDO EL CÓDIGO: el árbol de carpetas que importa, con una
línea por carpeta diciendo qué vive ahí. No todo: lo que alguien nuevo
necesita para encontrar dónde tocar. -->
```
{{ESTRUCTURA}}
```

## Convenciones

<!-- SE ESCRIBE LEYENDO EL CÓDIGO: las reglas que se deducen del código y que
romperlas rompe algo. Idioma de rutas, llaves, mensajes y comentarios; forma
de las respuestas; manejo de errores; nombres de archivos; capas. -->
{{CONVENCIONES}}

## Antes de decir «listo»

<!-- Ajusta a este repo: sus pruebas, su linter, su build. -->
- [ ] {{COMANDO_DE_PRUEBAS}} en verde.
- [ ] Comprobado de verdad —corrido, pedido, abierto—, no supuesto.
- [ ] Lo que la tarea cambia de un contrato con otro repo, en su handoff.
- [ ] La documentación que corresponde, actualizada en el mismo cambio.

## Commits

<!-- Lo decide el usuario en `iniciar-proyecto`. Ésta es la versión por
defecto: el agente no commitea. -->
{{REGLA_DE_COMMITS}}

Cuando redactes el mensaje para que el usuario lo use:

- Título corto, con prefijo (`feat:`, `fix:`, `chore:`, `docs:`). Mira
  `git log` y sigue ese tono: dice **qué cambia para quien usa el producto**,
  no qué archivo se tocó.
- Cuerpo sólo si hay una decisión no obvia que explicar. El porqué, no el qué.
- {{REGLA_DE_ATRIBUCION}}
- Termina tu respuesta con el mensaje completo en un bloque de código listo
  para copiar.

## El plan de tareas

Las tareas viven en **`../{{REPO_CONTROL}}/plan/tareas.json`**, compartido con
los otros repos. Este repo es `"repo": "{{NOMBRE_EN_EL_PLAN}}"`. La forma de una
tarea está en el `README.md` de ese repo.

Cuando se te pida **«implementa la siguiente tarea pendiente»**:

1. Lee `../{{REPO_CONTROL}}/plan/tareas.json`.
2. Toma la primera con `"repo": "{{NOMBRE_EN_EL_PLAN}}"`, estado `pending`, y
   cuyo `dependsOn` —si lo tiene— esté en `done` o `in_review`. Si no hay
   ninguna, dilo y para. Si la tarea trae `rama`, trabaja en esa rama y no en
   la de release.
3. Si tiene `dependsOn`, lee `../{{REPO_CONTROL}}/plan/handoff/<id>.md`: ahí
   está lo que el otro lado dejó escrito.
4. **Antes de tocar código**, escribe tu traducción técnica en
   `propuestaTecnica` —qué archivos y campos concretos vas a tocar, en 3-5
   renglones—, pon el estado en `proposed` y **para**. La tarea está escrita en
   el idioma del usuario, no en el nuestro: traducirla es tu primer trabajo, y
   confirmarla evita implementar lo que no era.
5. Aprobada: `in_progress` y trabaja. El `acceptance` es el alcance; nada fuera
   de ahí. Si la tarea trae `revisiones`, **léelas todas** —son los intentos
   anteriores— y lo que dice la última entra en el alcance junto con el
   `acceptance`. No las borres ni las reescribas: son del usuario.
6. Al cerrar, aplica «Antes de decir listo», sin excepción.
7. Si la tarea tiene `handoff`, escribe
   `../{{REPO_CONTROL}}/plan/handoff/<id>.md` con **el contrato listo para
   copiar** (formato en `../{{REPO_CONTROL}}/plantillas/handoff.md`). Es lo
   único que el otro lado va a leer: si algo no está ahí, para ellos no existe.
   Y **sin una palabra sobre el despliegue**.
8. Estado `in_review`, y escribe en `commit` el mensaje que el usuario debe
   usar.

**`in_review` no es `done`.** Tú no cierras una tarea: la dejas lista para que
el usuario la pruebe.

**No escribas tareas nuevas en `tareas.json` por tu cuenta.** Si a media tarea
descubres que falta trabajo —de este lado o del otro—, escribe la propuesta en
`../{{REPO_CONTROL}}/plan/propuestas/<AAAA-MM-DD>-<repo>-<slug>.md` **en
lenguaje de negocio** (formato en `../{{REPO_CONTROL}}/plantillas/propuesta.md`),
muéstrasela con el bloque JSON de la tarea listo para pegar, y espera. Sólo
cuando diga que sí la insertas.

Al escribir en `tareas.json` —estado, `propuestaTecnica`, `commit`— edítalo por
Node (`JSON.parse` → cambio → `JSON.stringify(doc, null, 2) + "\n"`), nunca
reescribiéndolo a mano, y conserva los campos que no conozcas: lo comparten los
otros repos y el panel.

Si te bloqueas: estado `blocked`, escribe el porqué y para. No improvises un
rodeo.
