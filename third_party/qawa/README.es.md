<p align="center">
  <strong>🌐 Idiomas:</strong>
  <a href="README.md">English</a> •
  <a href="README.ar.md">العربية</a> •
  <a href="README.fr.md">Français</a> •
  <a href="README.es.md"><strong>Español</strong></a>
</p>

# qawa — قوى

**La metodología [Superpowers](https://github.com/obra/superpowers), sin el entorno que asume.**

Superpowers es una excelente biblioteca de habilidades: TDD, diseño antes que código, revisión, verificación. Pero toda su maquinaria depende de tres funciones del host — un hook `SessionStart`, una herramienta `Skill` y herramientas `subagent`. Muchos entornos (incluido **Arena.ai Agent Mode**) no tienen ninguna, por lo que la herramienta queda en silencio: nada la activa, nada se la recuerda al agente.

**qawa conserva la metodología y reemplaza la maquinaria con cosas que existen en todas partes: archivos, una línea que el humano puede pegar y un CLI.**

```console
$ qawa boot
Lee /path/to/qawa/bootstrap/ROUTER.md y haz lo necesario. Modo: FAST
```

Eso es todo lo que necesitas. Pega esa línea al inicio de cada sesión, el agente leerá el enrutador y cargará la habilidad correcta.

---

## ¿Por qué qawa y no Superpowers tal cual?

|  | Superpowers en Claude Code | Superpowers en Arena | **qawa** |
|---|---|---|---|
| Activación automática | ✅ Hook `SessionStart` | ❌ Sin hooks | ⚠️ Una línea tuya |
| Cargar una habilidad | ✅ Herramienta `Skill` | ❌ | ✅ `qawa use` |
| Revisión independiente por tarea | ✅ subagent | ❌ | ❌ (auto-revisión declarada) |
| Memoria entre sesiones | ⚠️ vía `compact` | ❌ | ✅ Registro en archivo |
| Coste de arranque | ~3k tokens | ~35k tokens (cargar todo) | **~1.4k tokens** |
| Dependencias | Host | Host | **Solo Python 3.9+** |

Enrutador: **1,425 tokens** vs **28,859** cargando todas las habilidades — **ahorro 20×** (68× medido en producción: 1.1k vs 75k).

---

## Instalación

No necesita instalación. Copia la carpeta y ejecuta:

```bash
git clone https://github.com/supermorkat/qawa-arena.git qawa
cd qawa && ./qawa version
```

O añádelo a tu PATH:

```bash
export PATH="$PATH:/path/to/qawa"
qawa doctor
```

**Único requisito: Python 3.9+.** Sin `pip install`, sin dependencias, sin red.

Verifica tu entorno:

```bash
qawa doctor
# [OK] Python 3.9+ — 3.13.16
# [OK] Índice de habilidades _index.json
# [OK] Archivos de habilidades presentes
# [OK] git
```

---

## Uso

```bash
qawa boot                      # La línea que pegas al inicio de cada sesión
qawa route "añadir favoritos"  # ¿Qué habilidad aplica?
qawa use brainstorming          # Leer la habilidad
qawa skills --all               # Índice (+ no disponibles)
qawa note "Task 3: complete"    # Registrar progreso tras cada tarea
qawa state                      # ¿Dónde estamos?
qawa mode full                  # Cambiar modo
qawa brief plan.md 3            # Extraer una tarea a un archivo
qawa review HEAD~3 HEAD         # Paquete de revisión (commits+stat+diff)
qawa init ./my-project          # Inicializar un proyecto
qawa gen                        # Regenerar tras editar el índice
qawa doctor                     # Diagnóstico
```

### En tu proyecto

```bash
qawa init ./my-project     # Crea .qawa/, AGENTS.md, docs/, entradas .gitignore
```

`AGENTS.md` en la raíz es la red de seguridad: aunque olvides mencionar qawa, el agente lo ve y lee las reglas.

### Dos modos

|  | `FAST` (por defecto) | `FULL` |
|---|---|---|
| Para | Cambio pequeño, prototipo, script | Funcionalidad, proyecto, repo de equipo |
| Ruta | Solo TDD + verificación | Diseño → worktree → plan → ejecución → revisión → cierre |

**Actualización automática:** si el trabajo crece, el agente se detiene, lo comunica y pasa a `FULL`.

---

## El Registro — El hábito más importante

La memoria entre sesiones son **solo archivos**. Actualiza el registro tras cada tarea, no al final:

```bash
qawa note "Task 3: complete (commits fcb8619..832591b, review clean)"
qawa note "Ruling: Los números se normalizan por defecto"
```

Sin registro, cualquier interrupción (nueva sesión, compactación de contexto) significa **rehacer trabajo ya completado** — el fallo más caro, documentado por Superpowers.

---

## Arquitectura

```
qawa/
├── qawa                    # Punto de entrada — sin instalación
├── src/qawa/
│   ├── match.py            # Normalización árabe/latina para matching
│   ├── index.py            # Lee y valida skills/_index.json
│   ├── router.py           # Matching ponderado (reemplaza Skill)
│   ├── state.py            # Registro resistente a fallos
│   ├── render.py           # Genera ROUTER/BOOTSTRAP/AGENTS
│   ├── brief.py            # Brief de tarea + paquete de revisión
│   ├── doctor.py           # Diagnóstico
│   └── cli.py
├── skills/                 # Habilidades Superpowers verbatim (MIT)
│   └── _index.json         # Datos qawa: palabras clave y pesos ← fuente de verdad
├── skills-unavailable/     # Habilidades que requieren subagent (aisladas)
├── bootstrap/              # ROUTER.md, BOOTSTRAP.md  ← generados
├── AGENTS.md               # ← generado
├── templates/              # Plantillas de diseño y plan
└── tests/                  # 347 tests
```

**Regla de diseño:** las habilidades originales en `skills/` **nunca se modifican**. Todos los overrides quedan en `skills/_index.json` y `bootstrap/ROUTER.md`.

### Cómo funciona el enrutamiento

| Tipo de palabra clave | Regla | Por qué |
|---|---|---|
| Árabe | Subcadena del texto normalizado | La morfología impide coincidencia exacta |
| Multi-palabra (`no funciona`) | Subcadena del texto normalizado | La normalización unifica espacios |
| Latín (≥4 letras) | Palabra exacta o prefijo | `test` encuentra `tests` |
| Latín (<4 letras) | Solo coincidencia exacta | `add` no debe dispararse dentro de `address` |

Sin coincidencia → `brainstorming` por defecto con `score = 0`.

---

## Desarrollo

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -t .     # 347 tests
PYTHONPATH=src python3 -m coverage run --source=src/qawa -m unittest discover -s tests -t .
python3 -m coverage report -m                                  # 95%
```

Este proyecto se construyó con la metodología que porta: diseño → plan → TDD → revisión → cierre. Docs en `docs/`.

---

## Soporte de plataformas

| Área | Método | Estado |
|---|---|---|
| Bloqueo del registro | `fcntl.flock` en POSIX, `msvcrt.locking` en Windows, fallback archivo marcador | Diseñado; probado en Linux |
| Escritura atómica | Archivo temporal hermano + `os.replace` | Probado en Linux; atómico en ambas |
| Contención de rutas | `Path.resolve()` luego `os.path.normcase` | Probado en Linux; diseñado para Windows |
| Imports condicionales | `fcntl`/`msvcrt` dentro de funciones | Verificado |
| Codificación | `encoding="utf-8"` explícito en todas partes | Probado |

Ver [`docs/PLATFORM_SUPPORT.md`](docs/PLATFORM_SUPPORT.md) para detalles completos.

---

## Limitaciones — Lo que qawa NO hace

- **Sin revisión paralela.** `subagent-driven-development` está aislado en `skills-unavailable/` porque requiere subagent. La alternativa es una auto-revisión **declarada** en el registro.
- **Nada se ejecuta automáticamente.** Sin hooks. La primera línea depende de ti.
- **Compañero visual manual.** El servidor de vista previa no aparece auto en la nube; alternativa: archivo HTML estático.

---

## Verificado para Agent Arena

Probado en Arena.ai Agent Mode (Python 3.13, Linux):

- **347 tests pasados** (2 omitidos — solo Windows)
- **Enrutador:** ~1.1k tokens vs ~75k para todas las habilidades (ahorro 68×)
- **Registro:** Escrituras concurrentes preservadas, escritura atómica
- **Seguridad:** Contención de rutas + escaneo de secretos
- **Árabe:** Normalización completa

---

## Licencia

- **qawa**: MIT — ver [`LICENSE`](LICENSE).
- **`skills/` & `skills-unavailable/`**: Copia verbatim de [obra/superpowers](https://github.com/obra/superpowers) por Jesse Vincent y Prime Radiant, también MIT.

---

> **qawa** = قوى (árabe para "poderes"). La misma palabra, sin suposiciones sobre el host.
