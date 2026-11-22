# Evidencia de consultas de apoyo — 22 de noviembre de 2026

Informe: [RENDIMIENTO_CONSULTAS_PRESION_2026-11-22.md](../../RENDIMIENTO_CONSULTAS_PRESION_2026-11-22.md). Balance de la serie: [BALANCE_CPU_2026-11-22.md](../../BALANCE_CPU_2026-11-22.md). Tablas: [RESULTADOS.md](RESULTADOS.md). Agregado: [aggregate.json.gz](aggregate.json.gz).

Las medidas ejecutan el juego y Cannon reales en **Node con DOM/GPU simulados**. No representan FPS, RAF, GPU ni el hilo principal de Chrome. Las cargas, contadores y perfiles se ejecutan en serie y en ventanas separadas.

## Referencias independientes

| Identidad | Commit / SHA-256 |
| --- | --- |
| Referencia de este PR, integración del #32 | `274a389b77d0f57c9f4c13d56c5caf86070b1b0d` |
| `game.js` de esa referencia | `847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed` |
| Referencia acumulada, anterior al PR #26 | `1a0425a250b7911a8c230eb5d8534c54e3a03953` |
| `game.js` de la referencia acumulada | `d5b6af65ab6a413634e6cf70bc3ea88a16a0ab9cc81b4d5af2364045caf16159` |
| Commit local del código final medido | `2c6d6ed5677bc4626d8e89ba9d80590031de9d0f` |
| Commit publicado del mismo código | `7a851724ce17a05f0315cd0e0d17b2892566859b` |
| Árbol del código medido | `1a0c8bf4ec80374ef1982c200ddaabfeff3a20b6` |
| `game.js` final | `0fb81005a9a3b2a8baf54bf2b9a10b266905ab9a30e187008c0b4a50bd934085` |
| Runner de procesos fríos, conservado | `8965b491cd2f146928f06c74bbf8ca954c6659d720fe28e2dfa10e7afa062562` |

El commit local y el publicado comparten exactamente el árbol indicado. Cada comando pasa la ruta de referencia y el commit explícitos. `run-series.py` comprueba las identidades esperadas antes de cada carga y registra `expectedSources`: el runner integrado anterior sólo etiqueta `reference-commit`, por lo que esa etiqueta por sí sola no basta para demostrar qué checkout cargó. El agregador verifica el commit y el hash de juego realmente registrados, además del SHA final. Las comparaciones `cumulative-*` usan exclusivamente la referencia anterior a #26; no se mezclan con el A/B del nuevo cambio.

La comparación acumulada usa el runner y los fixtures actuales comunes, cargando los módulos y el harness propios de cada checkout. La revisión estática del harness antiguo encontró sólo exports adicionales de contornos en el nuevo, sin cambios en los stubs de esas operaciones. Los escenarios acumulados son piezas independientes en laboratorio: no incluyen Producción 20, cuyo comportamiento se corrigió expresamente en #28 y no debe exigirse idéntico a la versión defectuosa.

## Ensayos

Los nombres siguientes corresponden a archivos `.json.gz`; los logs y capturas conservan su extensión original seguida de `.gz`.

| Datos | Método y alcance |
| --- | --- |
| `cold-60`, `cold-120`, `cold-240` | Independientes, 16/100/500/1.000/1.500/2.000 piezas; cuatro frames; tres pares AB/BA/AB en procesos nuevos. |
| `cold-settle-120` | 2.000 independientes, 60 frames fríos y tres pares; comprueba trabajo posterior, tiempo y llegada a reposo. |
| `controls-120` | Soldadas, pocos brazos, numerosos mecanismos y fábrica; 100/500/2.000 piezas, cuatro frames fríos y brazos iniciados mediante su controlador. |
| `controls-60`, `controls-240` | Las mismas familias estructurales con 2.000 piezas y las otras preferencias reales. |
| `settled-60`, `settled-120`, `settled-240` | Independientes en las seis escalas; 60 frames de calentamiento y 30 medidos; tres pares. |
| `equivalence` | Producción 19/20, cámara y retrasos; 13 comparaciones funcionales contra la integración del #32. |
| `cumulative-500-1000-120`, `cumulative-2000-60` | A/B directo entre antes de #26 y el código final; escenas iguales y estados completos, sin sumar mejoras históricas. |
| `query-deferred-120` | Operación de ánimo y primera consulta geométrica posterior; grupos de cubos o formas mixtas, con y sin botones, procesos nuevos. |
| `query-counts-120` | Contadores de esa operación, 16/2.000 piezas, ambas familias y presencia/ausencia de botones; una pareja por caso, sin tiempos principales. |
| `reference-*`, `baseline-heap`, `optimized-*` | Diagnósticos separados de funciones, asignaciones/GC y CPU; los bloques anidados no se suman. |
| `exploratory-*` | Pilotos previos preservados con sus fuentes; no sustituyen las series finales. |

El frame sintético ejecuta `advanceSimulation(1/60)`, líquidos, objetivo y preparación de dibujo. Las preferencias reales de 60/120/240 Hz se eligen **antes** de crear articulaciones, y los relojes comprueban 1/2/4 pasos físicos por frame, duración simulada, acumuladores y descarte. Cambiar sólo el `dt` de una llamada no representa una preferencia distinta.

En los procesos fríos no se hace un snapshot, una consulta espacial o un render preparatorio antes de los frames. Creación del harness, preferencias, escena, fases del frame y captura final se registran por separado. La captura completa queda después de la medición. El proceso nuevo recrea VM y cachés del juego, aunque el sistema operativo conserve sus cachés de archivos.

La operación `pressure-pad-query` **no ejecuta física ni ciclos lógicos**. Llama a `updateMoods` con el intervalo real seleccionado y mide, por separado, creación, lote de ánimo, primera consulta `bounds`, consultas calientes y una consulta tras añadir/reemplazar un botón y rotar el cuerpo. Ese trabajo aislado no se presenta como tiempo físico simulado. El total frío incluye creación, bookkeeping y primera consulta; el total completo incluye además las consultas posteriores. No se borran cachés a mano. Los grupos mixtos permiten observar el coste de geometría que no se hubiera construido durante `analyzeBlock`; los cubos pueden llegar con esa preparación ya pagada.

## Lectura de resultados y conservación

Las tablas muestran la mediana entre repeticiones de p50/p95/p99, CPU y latencias, con rangos y diferencias pareadas en el agregado. Con cuatro frames, p95 y p99 son el máximo de esa ventana. Con 30 muestras, p99 también es el máximo y p95 la segunda mayor. No son estimaciones robustas de pausas raras durante una partida larga.

`performance.now()` mide pared transcurrida. `process.cpuUsage()` mide usuario+sistema del proceso y puede incluir hilos auxiliares; no es utilización porcentual ni CPU exclusiva de un hilo. Los deltas de memoria incluyen VM, JIT y GC, y no equivalen a bytes exactos de una caché. Los conteos y perfiles se mantienen fuera de las mediciones principales.

Se registran piezas, cuerpos, formas, restricciones, actividad, contactos, ecuaciones, sensores, motores, relojes y consumo/producción cuando corresponde. Los estados completos se comparan exactamente. La tolerancia `1e-8` de las aserciones de duración sólo cubre acumulación de coma flotante; no introduce tolerancia física entre variantes. El contador `world.time` de Cannon conserva su doble incremento histórico; el tiempo físico se acredita con `simTime` y los pasos del juego/Cannon.

Los presupuestos se comprueban entre operaciones completas; no interrumpen un paso físico. Las paradas y última escala completa permanecen en los datos. El runner caliente anterior sólo certifica el estado al acabar todas las repeticiones: si se detiene después de pares temporales completos, esos pares se conservan sin inferir un certificado de equivalencia.

El cambio de juego evita una consulta geométrica innecesaria cuando la colección de botones está vacía. No añade una caché de respuestas ni un registro nuevo de botones. La disponibilidad de las consultas, incorporación/eliminación de botones, geometría con botones presentes y restauración se verifican mediante regresiones y el ensayo de consulta posterior.

## Cobertura y resultado de la consulta posterior

Las series principales completaron **243 pares con equivalencia certificada**: 117 fríos, 54 de reposo y 72 de consultas aisladas. La comparación acumulada completó otros nueve pares sobre tres configuraciones. Los 13 escenarios funcionales de producción/cámara/retrasos y los ocho pares de conteos están separados. No hay un caso incompleto entre esas series finales; los pilotos y perfiles siguen en categorías propias.

En el grupo mixto de 2.000 piezas sin botones, la preparación geométrica **sí se difiere**: el lote de ocho llamadas a ánimo baja de 195,055 a 31,991 ms, mientras la primera consulta posterior `bounds` pasa de 0,044 a 126,665 ms. El total hasta esa consulta, incluida creación, baja de 279,458 a 235,961 ms; el total con las consultas siguientes baja de 280,411 a 236,870 ms. Las salidas, inventario, estado y relojes son exactos. Los contadores confirman que el árbol se construye una vez en ambas variantes, durante ánimo antes y durante la consulta necesaria después. Se eliminan llamadas repetidas, sin afirmar que desaparezca el coste de esa construcción ni que toda primera consulta mejore.

En los cubos regulares la construcción ya había pagado esa geometría. Con 2.000 cubos y botones presentes, el total de pared empeora de 45,819 a 48,503 ms. Las 24 configuraciones de consultas preservan sus tres pares, rangos y resultados desfavorables; sus tiempos no se suman a los frames de física. Los conteos de `localBoundsSupport` y `collisionIndex` pueden incluir llamadas recursivas y no equivalen a una cantidad de árboles construidos.

El A/B acumulado, medido directamente entre `1a0425a` y la fuente final, reduce la mediana de medias de CPU de proceso **79,682126 % / 81,125475 % / 78,484141 %** en independientes dormidas de 500/120, 1.000/120 y 2.000/60, respectivamente. Las tres escenas mantienen estados completos, 30 frames medidos, medio segundo simulado y descarte cero. Son reducciones de ese coste medido; no son porcentajes de utilización del PC ni una promesa para todas las escenas.

## Comandos, validación e integridad

[commands.json](commands.json) conserva los 32 registros de invocaciones y sus resultados. Las fuentes de perfil y pilotos permanecen en el paquete; los errores o resultados desfavorables no se eliminan. [validation-summary.json](validation-summary.json) recoge las verificaciones sobre las fuentes correspondientes y enlaza sus salidas completas. Los tiempos de suite no se presentan como rendimiento del juego.

| Validación | Referencia del PR | Código final | Resultado |
| --- | ---: | ---: | --- |
| Suite de lógica/Cannon | 1.261/1.261 | 1.269/1.269 | Cero fallos, cancelaciones u omisiones; ocho regresiones nuevas. |
| Auditoría de arquitectura | 21 casos | 21 casos | Salidas exactas excluyendo sólo `sourceSha256`. |
| Contactos con suelo | 36 casos | 36 casos | Salidas exactas excluyendo sólo `sourceSha256`. |

[day-pr-metadata.json](day-pr-metadata.json) conserva la lectura de GitHub que sitúa el inicio del período en #26 y las integraciones hasta #32, con fechas convertidas a America/Santiago. Es evidencia histórica para el balance, separada de las mediciones de rendimiento.

```bash
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
```

Para regenerar resultados sin ejecutar Node ni física:

```bash
python3 docs/mediciones/presion-20261122/resumir.py --require-all
python3 docs/mediciones/presion-20261122/verificar.py
```

El agregador es independiente de los paquetes históricos y fija las dos referencias de la tabla inicial. Acepta JSON o gzip y exige bytes iguales si coexisten ambos. El manifiesto registra SHA-256 y bytes almacenados/decodificados; gzip usa `mtime=0`. Scripts, documentación, patches, comandos, resumen de validación y metadatos históricos de PR permanecen en texto. Datos, logs y perfiles se comprimen sin cambiar sus bytes decodificados, incluidos logs vacíos y ensayos incompletos.

[manifest.json](manifest.json) distingue los originales de `aggregate.json.gz` y `RESULTADOS.md`, que son generados. El verificador comprueba cobertura completa del directorio y regeneración exacta en memoria. `resumir.py` crea un `aggregate.json` sin comprimir; si queda junto al `.gz` publicado, el verificador exige que ambos coincidan. Ninguno de estos comandos vuelve a ejecutar o aprobar las pruebas del juego.
