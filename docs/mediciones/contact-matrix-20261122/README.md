# Evidencia de matrices de contacto — 22 de noviembre de 2026

Informe e interpretación: [RENDIMIENTO_MATRIZ_CONTACTOS_2026-11-22.md](../../RENDIMIENTO_MATRIZ_CONTACTOS_2026-11-22.md). Tablas completas: [RESULTADOS.md](RESULTADOS.md). Agregado verificable: [aggregate.json.gz](aggregate.json.gz).

Todas las cifras son de **Node con el juego/Cannon reales y DOM/GPU simulados**. No son FPS, GPU ni un perfil Main de Chrome. El intento de Chromium y su bloqueo de sockets están en [browser-probe.log.gz](browser-probe.log.gz).

## Identidad y conservación de los datos

- Referencia explícita de este PR: `1465a6c12160432c5df52b35d782c2f2527720cf`, árbol `48be0131e9eb676bfa8c88db403b454f610789bb`.
- Código local medido: `5405c35c764ade4d6bea6788b8daa85d61a78962`, árbol `def1dc62430b726c9c522be2421739551f6c94a3`.
- `game.js` de referencia: `84bfc37c0661329ffa2cba69f22e50d2256e35944fad556778926a1fa632be0c`.
- `game.js` final: `c77f65c197f80f340f7f390a8d72155601589fb500bbb1014c0cbee3a3b97b4c`.
- Cannon distribuido: `0e63a043c15379cdbf940ab364c239363fc4e2803013a4c98ee3788fd3aa27ab`, sin modificaciones.

Los datos guardan rutas, hashes, configuración, muestras individuales, inventarios y paradas. La relación con los commits publicados se registra en el informe principal. `commands.json` conserva las invocaciones de la cola serial y sus tiempos de pared. Las invocaciones previas se reconstruyen de los comandos ejecutados en `additional-commands.json`, explícitamente identificadas como reconstruidas y sin inventar duraciones.

Los JSON y logs completos se comprimen de forma determinista con gzip (`mtime=0`). `manifest.json` registra bytes y SHA-256 tanto almacenados como decodificados. No se eliminan resultados desfavorables ni ensayos incompletos. Los patches de los candidatos exploratorios se aplican sobre la referencia `1465a6c`; no están activos en el juego final.

Los nombres de datos de la tabla siguiente corresponden a archivos `.json.gz`; los logs conservan su extensión original seguida de `.gz`, incluidos los vacíos. Las rutas originales de los comandos permanecen intactas en sus registros. Scripts, documentación, patches y `commands.json`, `additional-commands.json` y `validation-summary.json` permanecen en texto. El manifiesto distingue evidencia original de los resultados generados `aggregate.json.gz` y `RESULTADOS.md`.

## Ensayos

| Archivo | Alcance | Configuración |
| --- | --- | --- |
| `reference-diagnostic-2000-60` | Reproducción fresca del coste anterior | Las dos etiquetas apuntan a **la misma referencia**; 3 pares, 60 frames de calentamiento y 30 medidos. No es una comparación del cambio. |
| `exploratory-set-only` | Candidato sin respaldo denso/pequeño | 506/2.006 cuerpos; dense, sparse, repeated, toggling; 4 + 10 rondas; 3 pares. |
| `exploratory-bounded-set` | Candidato con respaldo denso inicial | 106/506/2.006 cuerpos; dense/sparse; 4 + 10; 3 pares. Todavía no usa la ruta pequeña final ni la fracción 1/128 final. |
| `matrix-operations` | Coste total de operaciones de matriz | 22/106/506/1.006/1.506/2.006 cuerpos; 7 casos; 8 + 30 rondas; 3 pares AB/BA/AB. |
| `matrix-counts` | Conteos de accesos a arrays, separados de tiempos | Dormant/sparse/repeated/toggling/churn; 22/506/2.006 cuerpos; una pareja, 2 rondas medidas. |
| `matrix-dense-counts` | Conteo denso acotado | 22/506 cuerpos; una pareja, 2 rondas. |
| `matrix-warm-counts` | Seguimiento de la limpieza tras inicializar ambas matrices | Sparse/repeated/toggling/churn, 506/2.006 cuerpos; 3 rondas de calentamiento y 2 medidas; una pareja. Los conteos fríos originales permanecen. |
| `settled-60`, `settled-120`, `settled-240` | Trabajo parcial integrado por frame en reposo | 16/100/500/1.000/1.500/2.000 piezas independientes; 60 + 30 frames; 3 pares. |
| `controls-120` | Diferentes estructuras físicas | Soldadas, pocos brazos, muchos mecanismos y fábrica; 100/500/2.000 piezas; 12 + 30 frames; 3 pares. |
| `control-long-120` | Seguimiento del control pequeño desfavorable | 16 piezas/120 Hz; 180 + 180 frames; 3 pares. No reemplaza el resultado corto. |
| `equivalence` | Producción útil, cámaras y atrasos deliberados | 13 escenarios deterministas completos, preferencias reales 60/120/240 Hz. |
| `diagnostic-2000-60`, `diagnostic-1500-240` | Temporizadores inclusivos de matriz, mundo y fases nativas | 60 + 30 frames, 3 pares; separados de las mediciones principales. |
| `architecture-*`, `ground-*`, `tests-*` | Validaciones completas de las fuentes | Referencia y código final; los tiempos de suite no son un benchmark del juego. |

Un frame integrado ejecuta `advanceSimulation(1/60)`, líquidos, objetivo y preparación de `renderScene`. Se seleccionan las preferencias de 60/120/240 Hz antes de construir articulaciones y se verifica el paso efectivo. Se conservan las copias de relojes y bloques del profiler al contexto anfitrión; los informes no guardan referencias a mundos de la VM.

### Operaciones sintéticas de matriz

El microbenchmark no tiene formas, narrowphase, solver ni producción. Cada ronda incluye intercambio actual/anterior, limpieza, consultas y escrituras; `churn` añade retirada, creación, reindexado y resize. El crecimiento inicial mide cuerpos y `World.addBody`. Un oráculo nativo independiente, fuera del intervalo medido, reproduce todas las operaciones y compara lecturas, valores, huecos, longitudes e índices.

`none` representa un mundo que nunca tuvo contactos: sólo una matriz fue dimensionada por `addBody`; la otra sigue vacía. `dormant` representa dos matrices ya usadas: el priming separado ejecuta dos tick/set y dos ticks adicionales, con coste y memoria explícitos. Ambas quedan con longitud completa. La primera ronda de los otros casos limpia inicialmente la matriz vacía; la inicialización de las matrices grandes sucede también en las siguientes rondas y queda incluida en el tiempo total de calentamiento. No se interpreta sólo `cold` como coste completo del arranque.

`sparse` escribe una pareja por cuerpo; `repeated` repite cuatro escrituras verdaderas por pareja; `toggling` alterna true/false cuatro veces; `dense` visita todas las parejas. La fórmula y los huecos son los de Cannon distribuido, no una triangular corregida.

Los conteos usan Proxies **sólo en su ejecución propia**. `growthCounts`, `coldCounts`, `primingCounts` y `totalCounts` son snapshots acumulados; el resumen calcula deltas cuando corresponde. Los accesos numéricos no cuentan internamente las búsquedas de Set, GC o el coste de extender arrays. Los tiempos principales sí incluyen todo el mantenimiento. El priming y la verificación exacta pueden agotar el presupuesto de un ensayo instrumentado: esas paradas se preservan.

### Límites de medición

Tres repeticiones principales AB/BA/AB, una carga de rendimiento a la vez, sin GC forzado. Se informa mediana de los estadísticos de cada repetición, rangos mínimo/máximo y diferencias pareadas; no son intervalos de confianza. Con 30 muestras, p99 es el máximo y p95 la segunda mayor. El control de variación se conserva, sin atribuir los regímenes a V8 o GC sin prueba.

`performance.now()` mide pared. `process.cpuUsage()` mide CPU de proceso usuario+sistema, no utilización porcentual ni CPU exclusiva del hilo principal. Los diagnósticos de matriz y fases están contenidos en `world.step`; no se suman como trabajo adicional. Los deltas de memoria son observaciones del proceso, no tamaños exactos de los Sets. El juego conserva sus arrays O(N²); la estructura auxiliar tiene un máximo transitorio de 4.097 entradas por matriz.

Los runners principales tienen presupuesto de 20 s por caso, con controles entre operaciones atómicas. Los diagnósticos tienen 30 s por fase. El límite no interrumpe una operación síncrona a mitad: se registra cuánto terminó y dónde se detuvo. El resumen distingue parejas completas, casos completos y trabajo parcial. Los relojes de física, pasos, acumuladores y descarte se verifican por separado de cualquier metadato de ánimo.

## Reproducción

Desde un checkout del código publicado del PR, crear una referencia limpia:

```bash
git worktree add --detach ../qbits-matrix-baseline 1465a6c12160432c5df52b35d782c2f2527720cf
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
node tests/benchmark-contact-matrix.cjs --baseline-root=../qbits-matrix-baseline --baseline-commit=1465a6c12160432c5df52b35d782c2f2527720cf --output=/tmp/matrix-operations.json
node tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-matrix-baseline --reference-commit=1465a6c12160432c5df52b35d782c2f2527720cf --mode=matrix --families=independent --phase=settled --scales=16,100,500,1000,1500,2000 --hz=120 --warmup=60 --samples=30 --repetitions=3 --case-budget-ms=20000 --output=/tmp/settled-120.json
node tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-matrix-baseline --reference-commit=1465a6c12160432c5df52b35d782c2f2527720cf --mode=equivalence --output=/tmp/equivalence.json
node tests/profile-sap-matrix-diagnostic.cjs --baseline-root=../qbits-matrix-baseline --pieces=2000 --hz=60 --warmup=60 --frames=30 --repetitions=3 --phase-budget-ms=30000 --output=/tmp/diagnostic-2000-60.json
```

Repetir la matriz integrada con `--hz=60` y `--hz=240`, conservando las demás opciones. Las invocaciones exactas de controles, conteos, variantes exploratorias y diagnósticos están en los registros de comandos. Ningún runner de esta entrega usa el baseline antiguo de SAP por omisión: todas las llamadas pasan una ruta explícita y el agregador exige el commit/hash correctos.

Para verificar los datos y regenerar las tablas sin ejecutar física:

```bash
python3 docs/mediciones/contact-matrix-20261122/verificar.py
python3 docs/mediciones/contact-matrix-20261122/resumir.py --require-all
```

El agregador exige además el SHA de `game.js` final indicado arriba en los inputs principales. Los candidatos descartados y el diagnóstico de referencia se mantienen en categorías separadas.

`resumir.py --require-all` lee directamente los datos comprimidos y regenera `aggregate.json` sin comprimir y `RESULTADOS.md`. El verificador comprueba también que esos resultados se reconstruyen exactamente; si existe además el `aggregate.json` regenerado, exige que coincida con el `.gz` publicado. Ninguno de estos comandos vuelve a ejecutar física ni rendimiento.
