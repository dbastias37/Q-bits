# Evidencia de SAP: parejas pasivas — 2026-11-22

Este paquete conserva las mediciones completas del filtro local de parejas pasivas de `SAPBroadphase`, los casos desfavorables, la ejecución incompleta y los diagnósticos posteriores. La interpretación y la decisión de integración se mantienen en [RENDIMIENTO_SAP_2026-11-22.md](../../RENDIMIENTO_SAP_2026-11-22.md). Las tablas detalladas están en [RESULTADOS.md](RESULTADOS.md). Este archivo no certifica la publicación o fusión de un PR.

**Todas las cifras de rendimiento son de Node con el juego y Cannon reales y DOM/GPU simulados. No son FPS ni tiempos del hilo Main de Chrome.** El intento de Chromium terminó con `socket() failed: Operation not permitted`; se preserva [el error completo](chromium-no-disponible.txt). No hubo medidas nuevas de RAF, GPU, asignaciones del navegador ni una partida visual. Los perfiles CPU/heap se obtuvieron con Node Inspector.

## Fuentes y máquina

| Fuente medida | Commit local | Árbol |
| --- | --- | --- |
| Referencia | `a98861012eb4968f8d58e4fc6ce1aa5c20460a35` | `aa4277daacc737d8487682d52ef5e86e0791f3ff` |
| Juego optimizado | `bba9f8f02d81e47a21921ff4cc4ceb8e05629787` | `255c317281a0a1ad17d7d347bc11cf57042882a4` |

Estos hashes identifican los checkouts medidos; una publicación que añada documentación o herramientas puede tener otro commit. Los JSON conservan también estado local y hashes de los archivos efectivamente leídos. La identidad del código de producción se puede verificar sin depender del nombre de la rama:

El commit publicado `c54980ab29e2547f00c311806a3ece6c397e2902` contiene exactamente el árbol de código medido `255c317281a0a1ad17d7d347bc11cf57042882a4`; permite recuperar esa fuente desde un clon nuevo, aunque el commit local `bba9f8f` no esté en su historial.

| Archivo | SHA-256 |
| --- | --- |
| `assets/js/game.js`, referencia | `db3f26eee06a5b7768cb27ef3dcb18be15dd1d46d32f92efc33201f6e129f4e7` |
| `assets/js/game.js`, optimizado | `84bfc37c0661329ffa2cba69f22e50d2256e35944fad556778926a1fa632be0c` |
| Cannon distribuido | `0e63a043c15379cdbf940ab364c239363fc4e2803013a4c98ee3788fd3aa27ab` |
| `tests/game-harness.cjs` | `31fe69bfa20d98ec32685cb7c62e5c3cd55657b29c805499481dc0fea2f20487` |
| `tests/cpu-audit-fixtures.cjs` | `36b6aa95a16445a9ef2af8015f6f19432c0c814340d6b6aa06abd234dda8b051` |
| `tests/benchmark-sap-broadphase.cjs` | `7d88b6f1cb453a7d70557bc8375c6566fd564798cef03e9f462fc9d3fd4da82f` |
| `tests/profile-sap-matrix-diagnostic.cjs` | `a47e8178dd8a6badb4792f1960403de5475e878b11056e5835f7df14ea0bedf1` |
| `tests/benchmark-sap-crossover.cjs` | `2a3ce197266be6fc3304ea4229c73fe3618646a5589e9bafd7dd0be6a35b4de8` |

Entorno registrado: **Node v24.22.3, Linux x64, AMD EPYC 9V74 80-Core Processor**, `availableParallelism=9`. Los ensayos se ejecutaron en serie, sin otras pruebas del juego en paralelo. El número de CPU informado no equivale a nueve hilos utilizados por la simulación. El agregado y el manifiesto usan sólo la biblioteca estándar de Python 3; el empaquetado se hizo con Python 3.12.14.

Configuración común: viewport lógico de **1280 × 720**, cámara `[0, 1.7, 0]`, sombras y audio desactivados. Las preferencias reales de **60, 120 o 240 Hz** se aplican antes de construir cuerpos o articulaciones. El runner de frames solicita intervalos de 1/60 s; a 240 Hz corresponden cuatro pasos por frame regular. Las fuentes, fixture, cámara y configuración se mantienen entre variantes. `--expose-gc` sólo habilita una capacidad: los benchmarks principales registran `forcedGc=false`. El diagnóstico de retención sí solicita GC explícitamente y se conserva por separado.

## Contenido y diseño de los ensayos

Los siguientes **16 inputs** alimentan [aggregate.json.gz](aggregate.json.gz). Cada JSON comprimido contiene todos sus datos originales, incluidas las muestras individuales; el agregado no vuelve a duplicarlas. `A` es la referencia y `B` la fuente optimizada.

| Input `.json.gz` | Escenario | Calentamiento y muestras por variante | Repeticiones |
| --- | --- | --- | --- |
| `sap-timings` | 16, 100, 500, 1.000, 1.500 y 2.000 piezas independientes; dormidas, 8 activas, todas activas; poses estables/cambiadas | Una consulta fría, 20 de calentamiento, 30 medidas | 3 pares AB/BA/AB |
| `sap-counts` | Las seis escalas, independientes y soldadas; tres estados, dos fases | 0 de calentamiento; una consulta fría y una caliente instrumentadas por variante; oráculo nativo aparte | 1 par por configuración |
| `sap-welded-timings` | 16, 500 y 2.000 piezas en pocos cuerpos; dormidas/todas activas; dos fases | Una fría, 20 + 30 | 3 pares AB/BA/AB |
| `matrix-settled-60` | Independientes en reposo, seis escalas, 60 Hz | 60 frames + 30 | 3 pares AB/BA/AB |
| `matrix-settled-120` | Igual, 120 Hz | 60 + 30 | 3 pares AB/BA/AB |
| `matrix-settled-240` | Igual, 240 Hz | 60 + 30; 2.000 incompleto | 3 pares previstos |
| `matrix-settling-120` | Asentamiento, 16/500/1.500/2.000, 120 Hz | 0 + 30 | 3 pares AB/BA/AB |
| `matrix-controls-120` | Soldadas, pocos brazos, muchos mecanismos, fábrica; 100/500/2.000 | 12 + 30 | 3 pares AB/BA/AB |
| `control-long-120` | Control integrado de 16 independientes en reposo | 180 + 180 | 3 pares AB/BA/AB |
| `sap-control16-long` | SAP: 16, pocas activas, poses cambiadas | Una fría, 180 + 180 | 3 pares AB/BA/AB |
| `sap-active500-long` | SAP: 500, todas activas, poses cambiadas | Una fría, 180 + 180 | 3 pares AB/BA/AB |
| `sap-sleep2000-long` | SAP: 2.000 dormidas, poses estables | Una fría, 180 + 180 | 3 pares AB/BA/AB |
| `equivalence` | Producción 19/20, cámara y retrasos, preferencias reales | Ventanas funcionales completas, definidas por el runner | 13 pares exactos |
| `profile-500-120` | Fases, instrumentación, CPU sampling, heap sampling, GC | 60 + 30; capturas y diagnóstico separados | 3 pares ON/OFF por fuente, más capturas |
| `profile-1500-240` | Igual para 1.500/240 | 60 + 30 | Igual |
| `isolated-large-60` | Repetición independiente de 1.500/2.000 en reposo | 60 + 30 | 3 pares AB/BA/AB |

Las consultas SAP no avanzan física: fijan explícitamente estados de actividad para aislar `collisionPairs`. Incluyen el coste completo de actualización de AABB, ordenación e índice dentro de esa función. Los cambios de pose que preparan el caso `dirty` ocurren fuera de su temporizador; el mantenimiento que causan queda dentro. Los costes fríos y de preparación se registran aparte. Las matrices integradas y la equivalencia comprueban el juego en marcha, energía, producción y tiempo simulado.

Los conteos instrumentados se ejecutan aparte de las mediciones principales. El oráculo ejecuta la implementación nativa sin incluirla en las muestras o contadores del candidato. Los datos distinguen piezas, grupos, cuerpos dinámicos/estáticos/cinemáticos, cuerpos despiertos/dormidos/`SLEEPY`, formas, restricciones, contactos, ecuaciones, sensores y motores. El fixture de muchos mecanismos se limita a 64 motores; no representa un motor por pieza. El control de pocos brazos tiene los motores apagados. En los compuestos soldados, muchas piezas pueden reducirse a pocas formas físicas; consultar siempre el inventario.

Presupuesto de parada: **20.000 ms por caso** en los runners principales, con registro de la última configuración completa. La matriz de 2.000/240 se detuvo en la referencia de la primera repetición, después de 30 muestras medidas y 20.001,105042 ms totales. No hay pareja optimizada válida para esa escala. Se mantienen las muestras parciales y los relojes del caso.

El agregado principal tiene **346 pares completos**, incluidos 72 de conteos. Matrices, control integrado largo y ensayo aislado suman **36 configuraciones completas, 108 pares, 7.380 frames medidos, 15.120 pasos y 123 s simulados agregados entre variantes**, cero descarte, más una configuración detenida. No se suman a esos totales los diagnósticos siguientes ni la suite de pruebas.

### Evidencia adicional separada

El crossover usa una variante **inicialmente cargada al 100 % y neutral**, con seis segundos simulados por mundo. Su carga inicial y calentamiento difieren de la matriz principal; sirve para comparar las dos rutas sobre un estado mecánico/energético invariante y no la reemplaza.

- `matrix-diagnostic-2000-60.json.gz` y su `-summary`: tres parejas, temporizadores inclusivos de `world.step`/`collisionMatrixTick` y fases nativas de Cannon. 60 frames de calentamiento y 30 medidos, presupuesto de 20 s por fase. La introspección opcional de V8 se usa sólo en este diagnóstico Node.
- `sap-crossover-2000-60.json.gz` y su `-summary`: tres mundos optimizados nuevos de 2.000 piezas/60 Hz. Cada mundo alterna las referencias de función SAP nativa y filtrada sobre **los mismos cuerpos y matrices**; orden AB/BA/AB, calentamiento común de 180 frames alternando rutas, 30 de recalentamiento por ruta y 60 medidos por ruta. No usa temporizadores de fases, contadores detallados, introspección V8 ni GC forzado. Comprueba identidades, pares y estado fuera del intervalo medido. Se normalizan sólo campos de reloj enumerados, incluidos los temporizadores `mood.idle/fullTime`, y se comprueban por separado los pasos y el reloj de simulación. Hay una inconsistencia de metadatos: en el primer brazo del mundo 2, `clock.simTime` marca 4,5 s y `moodClockRange` marca 6 s. Se conserva sin explicación causal confirmada; los rangos mood no se usan como evidencia temporal. Cada brazo medido sí registra 60 pasos físicos, 15 lógicos, 1 s simulado y cero descarte, con energía y estado normalizado iguales. No se atribuye la inconsistencia a V8/VM. Son 3 comparaciones adicionales, 360 frames y 360 pasos medidos, **fuera del agregado de 16 inputs**.
- Ocho archivos `*.cpuprofile.gz` / `*.heapprofile.gz`: capturas Inspector originales, una CPU y una heap por fuente en cada escenario de perfiles. Se pueden descomprimir para inspeccionarlas con herramientas compatibles; verlas en DevTools no las transforma en capturas del navegador.
- `architecture-{baseline,final}.json.gz`, `ground-{baseline,final}.json.gz`: datos completos de los dos benchmarks existentes; 21 informes de arquitectura y 36 casos de suelo idénticos entre fuentes.
- `tests-{baseline,final}.txt`: salidas completas, **1.228/1.228 → 1.242/1.242** pruebas aprobadas, cero fallos, cancelaciones u omisiones. Sus duraciones no son una medición de mejora de rendimiento.
- `benchmark-retention.json.gz`: diagnóstico acotado de `WeakRef` y GC. Guardar objetos del contexto VM retenía cuatro mundos mientras se conservaban los informes; copiar sus campos al contexto anfitrión retenía cero. El instrumento corregido se utilizó para ambas fuentes. No se contabiliza como optimización del juego ni se afirma que explique por sí solo los regímenes observados.
- `commands.json` y `validation-commands.json`: registros originales, conservados sin modificar sus bytes, argumentos, rutas ni duraciones. `additional-commands.json` distingue las invocaciones reconstruidas de las registradas. `execution-logs.json` conserva juntos los `.log` y `.stderr`, incluidos los vacíos; la salida completa de Chromium está en su archivo propio.

## Cómo leer los resultados

`resumir.py` calcula mediana, mínimo y máximo de los estadísticos de cada repetición. Conserva los valores individuales y las diferencias **pareadas** optimizado menos referencia. La diferencia de medianas marginales puede tener signo distinto de la mayoría de las diferencias pareadas; los dos datos se mantienen. Los rangos no son intervalos de confianza. Con 30 muestras y percentil por rango más cercano, p99 es el máximo y p95 la segunda muestra más alta. Hay una observación fría por repetición, insuficiente para caracterizar todas las colas de arranque.

`performance.now()` aporta tiempo de pared transcurrido. `process.cpuUsage()` aporta tiempo de proceso usuario+sistema y puede incorporar actividad de otros hilos del proceso. Ninguna cifra es utilización porcentual de un núcleo. SAP y matriz están incluidos dentro de `world.step`: **no sumar tiempos inclusivos**. Tampoco sumar CPU y GPU; aquí no se midió GPU. Heap sampling no cuenta todas las asignaciones; las diferencias de heap/RSS incluyen efectos del VM, harness y profiler.

Los siguientes límites y resultados desfavorables son parte del resultado:

- En 2.000 dormidas/estables, SAP baja de 7,189743 a 0,005198 ms p50; con poses cambiadas, de 8,285676 a 0,726201 ms. El índice cuesta **4N bytes de payload**, 8.024 bytes para 2.006 cuerpos, además de cabeceras/cierre. Los perfiles observan +2.024/+6.024 bytes de ArrayBuffers en 506/1.506 cuerpos. No es el coste total de memoria del proceso.
- El control corto SAP de 16 piezas/pocas activas/dirty empeora de 0,013360 a 0,021732 ms p50. En el seguimiento largo queda 0,005117 → 0,005128 ms. En 500/todas activas/dirty el seguimiento largo sigue peor: p50 0,250723 → 0,255521, p95 0,314738 → 0,347998 ms. El fallback nativo conserva un coste de clasificación sin ahorro de candidatos.
- Las medianas integradas de 1.500 y 2.000 a 60 Hz empeoran y una repetición aislada lo vuelve a observar. Para 2.000 aisladas, p50 21,068237 → 26,513780 ms; dos de tres parejas empeoran. No se reemplazan estas observaciones por otras favorables.
- El diagnóstico localiza ventanas de limpieza de matrices de aproximadamente 2 y 16 ms por paso en ambas fuentes. En los puntos observados las matrices son `fast-holey`, `dictionary=false`; no se demuestra una transición a diccionario ni una causa de JIT/GC. El crossover reduce p50 dentro de cada mundo: 21,881781 → 12,535115; 19,853080 → 12,298111; 34,580610 → 26,905321 ms. Confirma el ahorro de la ruta local y conserva un tercer mundo más lento; no elimina la variación global.
- El primer p95 completo por encima de 16,67 ms en la matriz principal permanece en **1.500/60 y 1.000/120–240**. A 120 Hz hay no monotonicidad: 1.000 optimizado = 17,314168 ms; 1.500 = 15,465796; 2.000 = 53,041251. No es un nuevo límite de piezas ni una certificación de 60 FPS.
- Sin calentamiento permanece un pico de unos **6,5 segundos** para 2.000 independientes. Los numerosos mecanismos activos tampoco obtienen una mejora general. El escenario de 2.000/240 permanece incompleto.
- Los resultados funcionales mantienen producción, estados y relojes comparables. Los retrasos deliberados descartan 0,25 s en ambas fuentes conforme al límite existente; las ventanas regulares no descartan tiempo. No se presentan estos descartes como ahorro.

## Regenerar el agregado y verificar integridad

Desde la raíz del checkout del PR:

```bash
python3 docs/mediciones/sap-20261122/verificar.py
python3 docs/mediciones/sap-20261122/resumir.py docs/mediciones/sap-20261122 --require-all --output=/tmp/qbits-sap-aggregate.json
```

No se ejecuta el juego con estos comandos. El verificador valida bytes, SHA-256 almacenado/decodificado, `mtime=0` de gzip, ausencia de evidencias omitidas del manifiesto y igualdad byte a byte del agregado regenerado. También comprueba igualdad de los informes de arquitectura y de los casos/resumen de suelo. `manifest.json` se excluye de su propia lista para evitar autorreferencia. El agregado se reconstruye indistintamente desde JSON sin comprimir o `.json.gz`; se prefiere el primero cuando están ambos presentes. `--require-all` exige los 12 inputs centrales; el verificador del paquete exige además los cuatro seguimientos opcionales, los 16 inputs y los 346 pares de esta entrega.

Para agregar evidencia adicional, conservarla con gzip determinista y actualizar el manifiesto mediante `python3 docs/mediciones/sap-20261122/verificar.py --refresh`. El diagnóstico de matriz y el crossover **no se añaden a la lista de inputs del agregado**. Regenerar un manifiesto acredita coherencia de archivos, no repite ni aprueba una prueba del juego.

## Repetir los ensayos en otra máquina

Se necesita el checkout del PR con el código medido o equivalente por SHA y un worktree de la referencia. No hace falta bundler ni compilación:

```bash
git worktree add --detach ../qbits-sap-baseline a98861012eb4968f8d58e4fc6ce1aa5c20460a35
python3 docs/mediciones/sap-20261122/repetir.py --baseline-root=../qbits-sap-baseline --output-root=../sap-reproduction
```

El segundo comando **sólo imprime** las 16 invocaciones portátiles, en el orden original. `repetir.py` cambia exclusivamente la raíz baseline y la salida, ejecuta los runners de este checkout y evita sobrescribir datos existentes. Para ejecutar, usar un directorio nuevo y añadir `--run`; se pueden seleccionar inputs concretos:

```bash
python3 docs/mediciones/sap-20261122/repetir.py --select=sap-counts --output-root=../sap-counts-reproduction --run
python3 docs/mediciones/sap-20261122/repetir.py --select=sap-timings,sap-welded-timings --output-root=../sap-timings-reproduction --run
python3 docs/mediciones/sap-20261122/repetir.py --output-root=../sap-reproduction-complete --run
```

La ejecución es serial y añade un límite de 600 s por proceso, además de los presupuestos internos originales. No se deben ejecutar conteos, pruebas, perfiles o tareas pesadas en paralelo con timings. El helper guarda sus nuevos comandos y salidas en la carpeta elegida; no modifica los registros originales. Para repetir exactamente el conjunto, dejar libres recursos comparables y mantener los parámetros de `commands.json`. Las diferencias de hardware, carga y versión de Node impiden esperar tiempos idénticos.

Validación funcional, ejecutada separadamente de las medidas:

```bash
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
node --expose-gc tests/diagnose-benchmark-retention.cjs --mode=all
```

Los tres primeros se ejecutaron también sobre la referencia según los logs; `validation-commands.json` conserva las invocaciones de arquitectura/suelo antes y después y la suite final. La suite baseline tiene su log completo, sin inventar un registro de duración de proceso que no se capturó allí.

Diagnósticos adicionales, desde el checkout del PR y una carpeta de salida existente:

```bash
node --allow-natives-syntax tests/profile-sap-matrix-diagnostic.cjs --v8-elements=true --baseline-root=../qbits-sap-baseline --pieces=2000 --hz=60 --warmup=60 --frames=30 --repetitions=3 --phase-budget-ms=20000 --output=../sap-reproduction/matrix-diagnostic-2000-60.json
node tests/benchmark-sap-crossover.cjs --pieces=2000 --phase-budget-ms=20000 --output=../sap-reproduction/sap-crossover-2000-60.json
```

Las intrínsecas de V8 son privadas, opcionales y dependientes de versión; no están en el juego. Para repetir el diagnóstico sin ellas, omitir `--allow-natives-syntax` y `--v8-elements=true`. El JSON de crossover registra su invocación exacta y todos los valores predeterminados efectivos, incluida frecuencia, calentamiento y muestras.

El intento de navegador está documentado en `additional-commands.json`. Para repetirlo se requieren una instalación de Playwright y un Chromium ejecutable en el entorno. Su fallo observado no se convierte en cero FPS ni se sustituye por el benchmark de Node. Long Animation Frames, si se emplea en otro equipo, debe comprobarse por compatibilidad y su umbral de 50 ms no basta para detectar cada incumplimiento de 16,67 ms.

## Fuentes primarias

- [Cannon: SAPBroadphase](https://schteppe.github.io/cannon.js/docs/files/src_collision_SAPBroadphase.js.html) y [Broadphase distribuido con Cannon 0.6.2](https://app.unpkg.com/cannon%400.6.2/files/docs/files/src_collision_Broadphase.js.html). La primera página se etiqueta 0.6.1; gobierna el código 0.6.2 local identificado por SHA. El criterio de pasividad incluye `STATIC | KINEMATIC` y `SLEEPING`; `SLEEPY` sigue activo.
- [Chrome DevTools: Performance](https://developer.chrome.com/docs/devtools/performance/) y [diagnóstico de memoria](https://developer.chrome.com/docs/devtools/memory-problems/): trabajo del hilo principal, perfiles, asignaciones y retención son mediciones diferentes.
- [MDN: performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now), [Long Animation Frames](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming) y [Node: process.cpuUsage](https://nodejs.org/api/process.html#processcpuusagepreviousvalue): significado y límites de los relojes y observadores usados.
- [V8: Elements kinds](https://v8.dev/blog/elements-kinds): contexto de las representaciones internas y diferencia entre arrays packed/holey. Que un array observado sea `fast-holey` no identifica la causa de un cambio de latencia; este diagnóstico no demuestra una transición interna entre puntos de observación.
- [Box2D: simulación y sueño](https://box2d.org/documentation/md_simulation.html): referencia arquitectónica para evitar trabajo pasivo. Sus reglas no sustituyen la semántica de Cannon comprobada aquí.
