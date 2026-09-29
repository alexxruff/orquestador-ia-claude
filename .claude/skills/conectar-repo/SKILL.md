---
name: conectar-repo
description: Agrega un repo de trabajo más a un proyecto ya iniciado — lo registra en config/repositories.json y le escribe su CLAUDE.md con el flujo del plan. Úsala cuando el usuario diga «agrega el repo …», «conecta …», o cuando una tarea nueva necesita un repo que el plan no conoce.
---

# Conectar un repo de trabajo

Son los pasos 2 y 3 de `iniciar-proyecto`, para un solo repo. Léela
(`.claude/skills/iniciar-proyecto/SKILL.md`) y sigue esos dos pasos, más esto:

1. **Confirma el nombre corto** con el que se le va a llamar en las tareas, y
   que no choque con uno que ya exista en `config/repositories.json`.
2. **La carpeta tiene que ser hermana** de este repo (`../algo`). Si no lo es,
   díselo al usuario: las rutas relativas son lo que permite que el esquema
   funcione en cualquier máquina. Que lo mueva, o que lo clone ahí.
3. Agrégalo a `config/repositories.json` sin tocar los demás.
4. Escríbele su `CLAUDE.md` desde `plantillas/CLAUDE-repo-de-trabajo.md`,
   leyendo su código. En la tabla «Los otros repos» van todos los demás del
   plan.
5. **Los otros repos también lo tienen que conocer**: agrega su fila a la tabla
   «Los otros repos» del `CLAUDE.md` de cada repo de trabajo ya conectado. Es
   la única edición que se les hace.
6. Dale su color en el panel, como dice «Los colores del panel» en el paso 4
   de `iniciar-proyecto`.
7. Cierra con qué se escribió y dónde, para que el usuario lo revise.
