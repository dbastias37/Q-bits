# Consultas de presión: omitir geometría cuando no hay botones

Fecha: 22 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

El perfil del arranque que quedó después del [PR #32](https://github.com/dbastias37/Q-bits/pull/32) mostró un trabajo independiente del solver: `updateMoods` preguntaba si cada grupo estaba sobre un botón y `onCampaignPad` calculaba sus límites geométricos incluso cuando la lista de botones estaba vacía. El cambio consulta primero esa lista y devuelve `false` si no contiene elementos. Conserva el predicado geométrico completo cuando sí hay botones y mantiene todas las actualizaciones de ánimo, energía, física y producción.

En la escena final de 2.000 cuerpos independientes/120 Hz, cuatro frames ejecutan las mismas 16.000 consultas de presión, pero **16.000 llamadas a `bounds` pasan a cero en esa ruta**. En tres parejas sin instrumentación interna, la mediana de la ventana fría baja de **1.237,302 a 1.125,271 ms**. La ventana de 60 frames baja de **5.612,005 a 5.043,864 ms**, con los mismos 120 pasos, un segundo simulado y llegada a reposo. No es una mejora uniforme: se conservan controles pequeños y escenas de mecanismos desfavorables.

Entrega: [PR #33](https://github.com/dbastias37/Q-bits/pull/33), con mediciones finales, conservación y verificaciones integradas completadas; **1.269/1.269 pruebas aprobadas**. El PR registra el commit de integración; este informe fija el código medido y su objeto Git publicado.

## Referencia y fuentes medidas

| Elemento | Identidad |
| --- | --- |
| Referencia incremental, integración del PR #32 | `274a389b77d0f57c9f4c13d56c5caf86070b1b0d` |
| Árbol de referencia | `5cb413307909bf8889aedc61b951cc16429aa1f4` |
| SHA-256 de `game.js` de referencia | `847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed` |
| Commit local del código final medido | `2c6d6ed5677bc4626d8e89ba9d80590031de9d0f` |
| Commit del código publicado como objeto Git | `7a851724ce17a05f0315cd0e0d17b2892566859b` |
| Árbol del código final medido | `1a0c8bf4ec80374ef1982c200ddaabfeff3a20b6` |
| SHA-256 de `game.js` final | `0fb81005a9a3b2a8baf54bf2b9a10b266905ab9a30e187008c0b4a50bd934085` |
| Checkout de referencia limpio | `../qbits-physics-baseline` |
| Versión de carga | `20261122-pressure-query-1` |
| Runner frío conservado | `8965b491cd2f146928f06c74bbf8ca954c6659d720fe28e2dfa10e7afa062562` |

El commit local medido y el objeto de código publicado tienen exactamente el mismo árbol `1a0c8bf4ec80374ef1982c200ddaabfeff3a20b6`; difieren los metadatos del commit. Los archivos de producción medidos son los publicados, sin cambios posteriores de comportamiento para preparar la documentación.

Los comandos pasan la ruta y el commit de referencia explícitos. La cola comprueba el SHA de los archivos cargados: una etiqueta `reference-commit` por sí sola no demuestra qué checkout leyó un runner. El [balance de la serie](BALANCE_CPU_2026-11-22.md) usa además una comparación acumulada separada contra `1a0425a250b7911a8c230eb5d8534c54e3a03953`, anterior al PR #26. Esa comparación no sustituye la referencia de este cambio ni se obtiene sumando porcentajes históricos.

Las mejoras anteriores de apuntado, Ctrl, sensores, baterías, guardado, Producción 20, contornos, SAP y matrices se conservan. En particular, el congelamiento de varios segundos por crecimiento de matriz ya se corrigió en el PR #32 y no se contabiliza de nuevo aquí.

## Causa observada y atribución

La ruta original, en [game.js](../assets/js/game.js), evaluaba `bounds(g)` antes de `activePressureButtons().some(...)`. Con cero botones, `some` devuelve `false` cualquiera que sea la geometría del grupo. El coste no era una consulta necesaria del solver: provenía de la comprobación de deberes de `updateMoods`, ejecutada por paso de simulación. `availableHaulers` también usa el mismo predicado y conserva su filtrado y orden.

Los [bloques de referencia](mediciones/presion-20261122/reference-blocks.json.gz) y del [candidato](mediciones/presion-20261122/optimized-blocks.json.gz) usan procesos nuevos, 2.000 piezas independientes, 120 Hz, cuatro frames y ocho pasos. Durante `advanceSimulation` registran:

| Función | Llamadas referencia → final | Tiempo inclusivo referencia → final, ms |
| --- | ---: | ---: |
| `onCampaignPad` | 16.000 → 16.000 | 141,421 → 9,380 |
| `bounds` | 16.000 → 0 | 126,172 → 0 |
| `rotatedGroupBounds` | 16.000 → 0 | 112,769 → 0 |
| `rigidQueryPoses` | 15.035 → 0 | 20,687 → 0 |
| `collisionPoseBounds` | 15.035 → 0 | 34,158 → 0 |
| `activePressureButtons` | 16.008 → 16.008 | 2,294 → 2,392 |
| `updateMoods` | 8 → 8 | 212,891 → 93,946 |

Los bloques están anidados y **no se suman**. Sus wrappers añaden coste; las series principales, sin esos wrappers, determinan los tiempos integrados. La reducción de llamadas sí localiza el trabajo eliminado. El contador de `activePressureButtons` incluye otros consumidores y no se confunde con el de `onCampaignPad`.

El [perfil CPU de referencia](mediciones/presion-20261122/reference-cpu.cpuprofile.gz) atribuye **149,940 ms inclusivos muestreados** al subárbol de `onCampaignPad`, dentro de 213,024 ms de `updateMoods`. El [perfil final](mediciones/presion-20261122/optimized-cpu.cpuprofile.gz) no contiene muestras de `onCampaignPad`, y registra 36,859 ms inclusivos de `updateMoods`. La ausencia de muestras no significa coste exactamente cero. El solver nativo conserva un tiempo propio importante, 446,159→355,984 ms en estas capturas individuales; no se modifica ni se atribuye esa diferencia de muestreo a una optimización del solver.

Los seis diagnósticos de bloques, CPU y heap, en ambas fuentes, producen el mismo estado final `09e4477f46646dcf2764ffa9b3b579a89a58a59a3d87a304bc0134ebb05f33e2`, ocho pasos y 1/15 s simulado, sin descarte. La creación instrumentada cuesta 181,079→184,554 ms; la primera consulta `updateTarget`, 10,413→6,931 ms; la primera preparación de dibujo, 17,795→15,038 ms. Son fases distintas y mediciones individuales, no una atribución de todos los costes fríos a presión.

## Cambio y contrato conservado

La función obtiene la colección viva y añade un único retorno temprano:

```js
const buttons = activePressureButtons();
if (!buttons.length) return false;
const bb = bounds(g);
return buttons.some(/* predicado geométrico original */);
```

No almacena una respuesta ni una colección entre llamadas. `activePressureButtons` sigue seleccionando `puzzle.buttons` si el puzzle está activo; en otro caso usa `storyWorld.buttons || []`. Un puzzle activo con lista vacía **no** usa como alternativa los botones de campaña. No se añaden filtros por escena, puerta activa, resuelta, carga requerida o estado de pulsación que la función original no tenía.

Con botones presentes se mantiene exactamente el orden de `some` y el primer acierto. El grupo debe caber por completo en x/z, con margen inclusivo de 0,006, y su mínimo y debe ser estrictamente menor que `(surface || 0) + 0,025`. Se usa `surface`, no `b.p.y`; no se añade una condición de altura máxima. Posición, orientación, tamaño y superficie se leen de los objetos actuales.

Insertar, retirar, sustituir o mover botones tiene efecto en la llamada siguiente. Los cambios de nivel, `clearCampaign`, entrada/salida de puzzle y restauración siguen gestionando las listas existentes. Unión, separación y reconstrucción de cuerpos siguen creando la geometría correspondiente por las rutas vigentes; no aparece una nueva política de invalidación.

`updateMoods` conserva `onPuzzleButton(g) || onCampaignPad(g) || ...`. `onPuzzleButton` tiene su propio contrato y umbral de 0,02, y puede consultar límites antes de llegar a esta función. Por ello, el retorno temprano de `onCampaignPad` no implica cero consultas geométricas en cualquier escena de puzzle. Se mantiene la detección de deberes, ánimo, descanso, energía y elegibilidad para transportar materia.

Sin botones, esta comprobación pasa a trabajo O(1) sin leer la geometría. Con botones conserva el coste anterior de límites y búsqueda, más la lectura de `length`. No se difiere el avance físico ni se reparte un paso entre frames, y no se cambia el tiempo simulado para producir el ahorro.

## Memoria, vida de datos y primera consulta posterior

El cambio no añade arrays, mapas, sets, índices ni referencias persistentes. La variable local sólo mantiene la colección durante la llamada. No requiere liberación ni invalidación adicionales. Los objetos temporales de límites que ya no hacen falta tampoco se construyen en esta ruta.

Las cachés existentes siguen perteneciendo a cada grupo: `rotatedBoundsCache` conserva hasta 12 orientaciones exactas y referencia la identidad de `g.parts`; `rigidQueryLayout` y, para más de 16 piezas, `localBoundsTree`, se construyen cuando la geometría los necesita. Sus datos se reemplazan al cambiar la identidad de partes y se liberan con el grupo cuando deja de estar referenciado. Este PR no cambia sus límites, algoritmos ni reglas de validez. El índice `partQueryCache` de selección es otro índice y no se identifica con `localBoundsTree`.

Hay dos efectos distintos. Se elimina el cálculo repetido de límites sin un consumidor posible. También puede dejar de precalentarse una caché que antes se construía accidentalmente: los cubos suelen pagar límites durante `makeGroup → analyzeBlock`, pero un grupo mixto con T-bits/couplers puede llegar sin árbol de límites. Su primera consulta necesaria sigue siendo síncrona y debe pagar entonces esa construcción. Ese coste exige medir creación, lote sin botones, primera consulta y total, sin borrar cachés para simular frío.

El muestreo de asignaciones de [referencia](mediciones/presion-20261122/baseline-heap.heapprofile.gz) y [final](mediciones/presion-20261122/optimized-heap.heapprofile.gz) atribuye 5.077.224→115.240 bytes al subárbol de `onCampaignPad`. La captura completa estima 562.546.784→490.445.096 bytes. Son estimaciones de asignaciones muestreadas durante la captura, **no memoria retenida ni tamaños exactos de caché**. La diferencia total incluye variación del resto del proceso. El observador de GC registra 79,703→65,242 ms en esas capturas; el perfil CPU separado registra 89,553→79,297 ms de eventos observados. No se suman a los tiempos inclusivos ni se fuerza GC.

### Medición de la preparación diferida

[query-deferred-120](mediciones/presion-20261122/query-deferred-120.json.gz) completa 24 configuraciones: cubos o mezcla de cubos/pirámides/couplers; 16/100/500/1.000/1.500/2.000 piezas en un grupo; con/sin botones desde el principio. Cada una tiene tres parejas AB/BA/AB en procesos nuevos. Los **72 pares** conservan exactamente estado completo, salidas, inventarios y relojes. Los [ocho pares de conteos](mediciones/presion-20261122/query-counts-120.json.gz), separados y limitados a 16/2.000 piezas, también coinciden. No se borran cachés ni se fuerza GC.

El ensayo mide creación, ocho llamadas a `updateMoods` con la preferencia real de 120 Hz, la primera `bounds` posterior, ocho consultas calientes y una consulta tras añadir/reemplazar el botón y rotar el cuerpo. Ejecuta **cero pasos físicos y cero ciclos lógicos**; el lote aislado de ánimo no representa tiempo simulado. El total frío termina tras la primera `bounds`; el total completo incluye las otras consultas. Ambos contienen creación y bookkeeping, pero excluyen inicialización del harness y captura final de estado.

| Grupo de 2.000 piezas | Botón inicial | Lote de ánimo, ms | Primera `bounds`, ms | Total frío, ms | Total completo, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Cubos | No | 25,7231 → 24,9782 | 0,0461 → 0,0622 | 46,8502 → 46,2590 | 47,6736 → 47,1135 |
| Cubos | Sí | 24,1732 → 27,5408 | 0,0438 → 0,0512 | 44,8869 → 47,7033 | 45,8194 → 48,5027 |
| Mixto | No | 195,0545 → 31,9906 | 0,0439 → 126,6646 | 279,4584 → 235,9607 | 280,4113 → 236,8702 |
| Mixto | Sí | 190,6419 → 173,1894 | 0,0481 → 0,0424 | 265,9874 → 252,7710 | 266,8439 → 253,7416 |

Cada celda es la mediana de su fase entre repeticiones; sumar medianas de fases no reconstruye necesariamente la mediana del total. La creación del mixto/2.000 sin botones cuesta 84,0036→72,8417 ms y su CPU de total completo 407,092→349,522 ms; esas diferencias de una etapa sin cambios de código forman parte de la variación observada, no de un nuevo algoritmo de creación.

**La primera consulta del grupo mixto sí recibe un coste frío trasladado.** A 2.000 piezas, su mediana pasa de 0,0439 a 126,6646 ms, con rango final 124,1563–152,8035 ms. Los conteos muestran una única construcción de `collisionIndex` y seis consultas de soporte en ambas variantes: antes suceden dentro del lote de ánimo; después, en la primera `bounds`. Esa construcción no desaparece. El ahorro de aproximadamente 163 ms en el lote no se presenta como reducción equivalente de trabajo total. La ventana fría completa varía entre 246,5508–334,1498 ms de referencia y 225,1404–258,7000 ms finales.

Los cubos de 2.000 piezas ya tienen árbol y una orientación cacheada al acabar la creación en ambas variantes. Sin botones, el lote elimina ocho llamadas a límites; con botones, todos los conteos de geometría son iguales. La consulta con botón añadido y nueva orientación conserva dos orientaciones cacheadas y 12 consultas de soporte acumuladas, sin reconstruir el árbol. Su tiempo en el mixto sin botón inicial es 0,1404→0,1316 ms; las ocho consultas calientes cuestan 0,0333→0,0550 ms. Esta consulta añadida ya ocurre después de pagar la primera preparación y no se presenta como otro ensayo frío independiente.

Se mantienen adversos: el total frío de mixtos sin botones pasa de 20,6988 a 21,0302 ms con 100 piezas y de 91,1064 a 92,4389 ms con 500; con botón inicial, los mixtos de 100/500/1.000/1.500 empeoran su mediana de total frío. En mixto/2.000 con botón, la primera pareja de total completo empeora 266,8439→342,8470 ms aunque la mediana de tres mejore. Los cubos/2.000 sin botón tienen pared total algo mejor, pero CPU total 71,443→71,717 ms. Por tanto, este ensayo acredita corrección y el traslado explícito de preparación; no demuestra una aceleración universal de consultas con botones ni elimina el pendiente del coste de primera consulta en chasis grandes.

## Método de las comparaciones integradas

Entorno registrado: Node `v24.22.3`, Linux, AMD EPYC 9V74, nueve procesadores disponibles para el proceso. Todas las cargas se ejecutan en serie. Los fríos crean proceso, VM y escena nuevos para cada variante y repetición; no se hace calentamiento, snapshot, selección ni dibujo antes de los primeros frames. Las cachés de archivos del sistema operativo pueden permanecer calientes. Se conserva AB/BA/AB y tres parejas por configuración.

La cámara es `(0, 1,7, 0)`, yaw/pitch cero, viewport 1280×720 y sombras apagadas. El harness ejecuta lógica y Cannon reales con DOM/GPU simulados. Cada frame sintético avanza 1/60 s y llama después a líquidos, selección y preparación de dibujo. La preferencia real de **60, 120 o 240 Hz se establece antes de crear articulaciones**; los contadores verifican uno, dos o cuatro pasos por frame.

Se separan inicialización de módulos/harness, preferencias, creación, avance, consultas, preparación gráfica y captura de estado. Los tiempos principales no contienen wrappers internos. Los informes copian datos de la VM al contexto anfitrión y capturan el estado completo después de la ventana; se conserva la corrección previa de retención de mundos.

`performance.now()` mide pared transcurrida; `process.cpuUsage()` registra usuario+sistema del proceso, incluidos posibles hilos auxiliares. La CPU puede superar la pared y no es un porcentaje de uso ni el tiempo exclusivo del hilo principal. Las tablas muestran la mediana entre tres estadísticos por ejecución. Con cuatro frames, p95 y p99 son el máximo; no estiman con precisión las colas de una partida larga.

Los relojes conservan pasos del juego/Cannon, `simTime`, acumuladores y tiempo descartado. El doble incremento histórico de `world.time` se registra, pero no se usa como tiempo simulado. Las comparaciones de estado son exactas; la tolerancia de 1e-8 sólo corresponde a aserciones de acumulación de duración. Los presupuestos se comprueban entre operaciones completas, sin cortar la resolución física.

## Arranque: escalas y variación

Fuentes finales: [60 Hz](mediciones/presion-20261122/cold-60.json.gz), [120 Hz](mediciones/presion-20261122/cold-120.json.gz), [240 Hz](mediciones/presion-20261122/cold-240.json.gz). Las 18 configuraciones completan tres parejas, con estados completos, relojes e inventarios exactos. Todos los valores siguientes están en ms, referencia → final; la ventana contiene cuatro frames.

| Piezas | Hz | p50 de frame | p95 = p99 de frame | Pared de la ventana |
| ---: | ---: | ---: | ---: | ---: |
| 16 | 60 | 3,651 → 2,598 | 20,800 → 17,647 | 48,566 → 29,538 |
| 100 | 60 | 11,919 → 9,653 | 30,756 → 34,429 | 67,327 → 77,211 |
| 500 | 60 | 47,480 → 57,668 | 77,642 → 99,952 | 218,977 → 279,462 |
| 1.000 | 60 | 70,912 → 88,638 | 142,445 → 146,914 | 360,306 → 408,616 |
| 1.500 | 60 | 134,970 → 121,437 | 173,852 → 164,248 | 584,236 → 523,364 |
| 2.000 | 60 | 184,502 → 171,004 | 268,710 → 196,606 | 833,636 → 685,377 |
| 16 | 120 | 3,446 → 3,181 | 23,184 → 31,011 | 33,813 → 40,666 |
| 100 | 120 | 15,045 → 13,789 | 41,786 → 41,767 | 86,152 → 84,220 |
| 500 | 120 | 67,809 → 54,205 | 132,725 → 126,492 | 332,216 → 302,678 |
| 1.000 | 120 | 131,096 → 107,867 | 261,823 → 251,315 | 702,232 → 562,071 |
| 1.500 | 120 | 198,773 → 172,518 | 325,956 → 282,151 | 987,047 → 828,850 |
| 2.000 | 120 | 285,652 → 249,458 | 364,544 → 354,537 | 1.237,302 → 1.125,271 |
| 16 | 240 | 5,324 → 5,072 | 26,035 → 27,998 | 43,437 → 43,874 |
| 100 | 240 | 18,196 → 14,749 | 62,121 → 53,216 | 131,691 → 118,468 |
| 500 | 240 | 102,239 → 93,556 | 205,471 → 192,606 | 541,663 → 483,253 |
| 1.000 | 240 | 228,718 → 175,187 | 345,444 → 337,548 | 1.034,962 → 924,460 |
| 1.500 | 240 | 369,855 → 299,266 | 560,172 → 521,847 | 1.674,955 → 1.443,990 |
| 2.000 | 240 | 540,541 → 474,762 | 767,333 → 668,587 | 2.372,028 → 2.104,802 |

En 2.000 piezas hay 2.000 grupos dinámicos y 2.006 cuerpos/formas incluyendo el recinto, cero articulaciones, sensores y motores. Tras cuatro frames quedan 2.000 despiertos, 8.000 contactos y 16.000 fricciones en ambas fuentes. Las ventanas ejecutan 4/8/16 pasos a 60/120/240 Hz, todas 1/15 s simulado, sin descarte. El acumulador residual de 240 Hz es aproximadamente 5,2e-18 s e idéntico entre variantes.

| 2.000 piezas | Pared por repetición, referencia → final, ms | CPU mediana de ventana, ms |
| --- | --- | ---: |
| 60 Hz | 840,184 / 705,080 / 833,636 → 705,077 / 685,377 / 658,365 | 1.228,934 → 1.070,980 |
| 120 Hz | 1.415,823 / 1.224,287 / 1.237,302 → 1.202,482 / 1.076,772 / 1.125,271 | 1.797,787 → 1.642,742 |
| 240 Hz | 2.490,462 / 2.372,028 / 2.275,438 → 2.104,802 / 2.077,556 / 2.170,593 | 3.149,707 → 2.690,564 |

La creación de la escena de 2.000/120 cuesta 167,405→170,900 ms de pared mediana y se informa aparte. La mejora no acelera por contrato la construcción de cuerpos. Los adversos fríos de 100/500/1.000 a 60 Hz y del control de 16 a 120/240 Hz permanecen en el paquete. No se ocultan detrás de una media de escalas ni se declara aceleración universal.

### Ventana extendida hasta reposo

El [ensayo de 60 frames/120 Hz](mediciones/presion-20261122/cold-settle-120.json.gz) empieza también en frío, con tres parejas. Mantiene exactamente 120 pasos, 15 ciclos lógicos y aproximadamente 1 s simulado, acumuladores finales cero, sin descarte. Finaliza con 2.000 piezas, 2.006 cuerpos/formas y cero despiertos/contactos en ambas variantes.

| Estadístico de 2.000/120 | Referencia | Final |
| --- | ---: | ---: |
| p50 por frame, ms | 16,157 | 12,876 |
| p95 por frame, ms | 282,538 | 256,197 |
| p99 y máximo por ejecución, ms | 407,998 | 361,583 |
| Pared de ventana, mediana, ms | 5.612,005 | 5.043,864 |
| Pared de ventana, mínimo–máximo, ms | 5.455,452–5.918,991 | 4.910,911–5.089,158 |
| CPU de proceso de ventana, mediana, ms | 6.593,818 | 5.819,628 |

El máximo de la tercera pareja sube de 407,998 a 434,675 ms, aunque la ventana baja de 5.455,452 a 5.089,158 ms. La reducción total no garantiza la desaparición de cada pausa. La ventana larga incluye el trabajo posterior de la escena independiente; la posible construcción diferida de árboles en grupos mixtos se estudia aparte.

## Controles de geometría y mecanismos

Los [controles de 120 Hz](mediciones/presion-20261122/controls-120.json.gz) cubren 100/500/2.000 piezas; los de [60 Hz](mediciones/presion-20261122/controls-60.json.gz) y [240 Hz](mediciones/presion-20261122/controls-240.json.gz), 2.000. Las 20 configuraciones completan tres parejas con estados, inventarios y relojes exactos. Los brazos se activan mediante `startRobotArm` antes de medir, conservando la corrección simétrica del instrumento del PR anterior.

| Familia a 2.000 piezas | Inventario al final de cuatro frames a 120 Hz | Ventana 60 Hz, ms | Ventana 120 Hz, ms | Ventana 240 Hz, ms |
| --- | --- | ---: | ---: | ---: |
| Soldadas | 4 grupos; 10 cuerpos/formas; 16 contactos, 32 fricciones | 44,263 → 44,604 | 64,187 → 73,335 | 85,329 → 83,761 |
| Pocos brazos | 20 grupos; 26 cuerpos, 62 formas; 32 restricciones, 96 ecuaciones; 16 motores activos | 141,277 → 136,637 | 166,746 → 145,465 | 192,681 → 192,444 |
| Muchos mecanismos | 129 grupos; 135 cuerpos, 136 formas; 64 restricciones, 384 ecuaciones; 64 motores activos | 94,625 → 103,014 | 164,088 → 180,781 | 246,543 → 239,887 |
| Fábrica | 114 grupos, 12 virtuales; 108 cuerpos, 180 formas; 110 contactos, 220 fricciones; 12 motores activos | 130,435 → 121,266 | 160,670 → 162,841 | 208,015 → 207,196 |

Todas estas familias tienen cero sensores en ese fixture; no se confunden con las regresiones de sensores del juego. Los despiertos son respectivamente 4, 16, 129 y 98. Fábrica conserva diferentes contactos según frecuencia: 404 a 60 Hz, 110 a 120 y 46 a 240; cada comparación mantiene su configuración exacta. El ensayo de cuatro frames verifica actividad y conservación de esa ventana, no la finalización de Producción 19/20.

Los casos desfavorables incluyen soldados/2.000/120 y muchos mecanismos/2.000/60 y /120. En muchos mecanismos/2.000/240 la pared baja de 246,543 a 239,887 ms, pero la CPU sube de 375,094 a 417,151 ms. No se presenta este bloque como solución del coste de numerosos motores activos. Los percentiles, CPU, rangos y escalas intermedias permanecen en los datos y tablas del paquete.

## Simulación en reposo

El runner integrado usa 60 frames de calentamiento y 30 medidos, tres parejas AB/BA/AB. Los archivos de [60 Hz](mediciones/presion-20261122/settled-60.json.gz), [120 Hz](mediciones/presion-20261122/settled-120.json.gz) y [240 Hz](mediciones/presion-20261122/settled-240.json.gz) completan las 18 configuraciones con estado final exacto, incluida la escala de 2.000. Las siguientes cifras son p50 de pared por frame, referencia → final, en ms.

| Piezas | 60 Hz | 120 Hz | 240 Hz |
| ---: | ---: | ---: | ---: |
| 16 | 0,2426 → 0,1865 | 0,2871 → 0,2919 | 0,4351 → 0,4042 |
| 100 | 0,7939 → 0,7359 | 1,0196 → 0,9269 | 1,5410 → 1,2751 |
| 500 | 3,5249 → 3,1565 | 4,4686 → 4,0733 | 7,1027 → 6,2005 |
| 1.000 | 5,2774 → 4,9585 | 8,1098 → 6,8180 | 13,9399 → 11,5239 |
| 1.500 | 7,0020 → 6,1664 | 10,5564 → 8,9529 | 18,4708 → 15,8343 |
| 2.000 | 9,0183 → 7,9726 | 14,7733 → 12,3842 | 24,3676 → 19,9186 |

A 2.000/120, p95 pasa de 17,3881 a 14,6327 ms y p99 de 18,9312 a 14,8664; la CPU p50 pasa de 14,791 a 12,438 ms. Hay colas adversas: 500/120 conserva p50 mejor, pero p95 5,0610→5,2355 y p99 5,3517→6,8239 ms; 16/60 pasa de p95 0,2903 a 0,3640. El presupuesto de 16,67 ms corresponde al frame completo y no se convierten estas cifras parciales de Node en una garantía gráfica.

A 2.000/240, p95/p99 pasan de 26,4663/27,5417 a 22,3578/22,8749 ms y CPU p50 de 24,763 a 20,061 ms. Los p50 de pared por repetición son 24,4354 / 24,3676 / 23,0079 frente a 19,6669 / 20,1838 / 19,9186 ms. En las tres frecuencias, los 30 frames medidos ejecutan 30/60/120 pasos y aproximadamente 0,5 s simulado, sin descarte. La escena final de 2.000 mantiene 2.006 cuerpos/formas, cero despiertos/contactos y los mismos acumuladores. Todas las escalas terminan dentro del presupuesto de 20 s por brazo; no se arrastra la parada incompleta del PR anterior a esta serie nueva.

## Conservación, pruebas y evidencia reproducible

[pressure-pad-query.test.cjs](../tests/pressure-pad-query.test.cjs) compara la función nueva con una copia literal del predicado original en VMs separadas. Cubre lista vacía sin precalentar la variante candidata; inserción, retirada y sustitución; prioridad de puzzle; límites inclusivos y altura estricta; cambios de superficie, tamaño, posición y orientación; deberes/ánimo/energía a 60/120/240 Hz; primera selección y validación de colocación en un grupo grande mixto con hueco; y elegibilidad/orden de transportistas. No impone tiempos rígidos ni replica la estructura del retorno temprano como única prueba de comportamiento.

Las ocho regresiones dirigidas terminan aprobadas. La cobertura de rendimiento final suma 243 parejas principales con certificado de equivalencia: 117 frías, 54 en reposo y 72 de consultas; además hay ocho parejas de conteos y las 13 equivalencias funcionales siguientes. Las nueve parejas acumuladas pertenecen al balance separado. No quedan configuraciones parciales en estas series finales; los pilotos se conservan con su propia identidad.

Las [13 comparaciones funcionales](mediciones/presion-20261122/equivalence.json.gz) completan con estado final y resumen exactamente iguales. Producción 19 entrega tres unidades y Producción 20 seis; ninguna falla ni descarta tiempo. Los valores siguientes son comunes a ambas fuentes; el redondeo de la tabla no sustituye la igualdad exacta de los datos.

| Producción | Hz | Pasos | Segundos simulados | Energía registrada, J |
| --- | ---: | ---: | ---: | ---: |
| 19, 30 rpm | 60 | 998 | 16,633333 | 6,817645089 |
| 19, 30 rpm | 120 | 1.990 | 16,583333 | 6,944895769 |
| 19, 30 rpm | 240 | 4.100 | 17,083333 | 7,192279864 |
| 20, 30 rpm | 60 | 2.404 | 40,066667 | 26,802111116 |
| 20, 30 rpm | 120 | 4.798 | 39,983333 | 26,857198332 |
| 20, 30 rpm | 240 | 9.584 | 39,933333 | 26,890718350 |
| 20, 29 rpm | 60 | 2.486 | 41,433333 | 26,974303756 |

Las comparaciones de fábrica con cambios de cámara mantienen tres segundos y 180/360/720 pasos. Las de retrasos deliberados mantienen 184/368/736 pasos, aproximadamente 3,066667 s simulados y el mismo descarte de 0,25 s. La optimización no obtiene su ahorro omitiendo esos pasos o alterando producción fuera de cámara.

La [validación integrada](mediciones/presion-20261122/validation-summary.json) ejecuta `node --test tests/*.test.cjs` sobre las fuentes correspondientes: **1.261/1.261** pruebas en la referencia y **1.269/1.269** en el candidato, sin fallos, cancelaciones, omisiones ni pendientes. Las ocho regresiones nuevas se suman a las anteriores de impactos, reposo, sensores, agarre, unión/separación, restauración, guardados, mecanismos, energía y producción; no añaden tolerancias físicas ni umbrales temporales dependientes del hardware.

Los **21 informes de arquitectura** y los **36 casos de contacto con suelo** son exactamente iguales entre fuentes tras excluir únicamente `sourceSha256`. Los 36 observan contacto y terminan en reposo; conservan materia y masa, velocidades finales cero y deriva final de posición cero. Las duraciones de estas suites verifican su ejecución, no se usan como mediciones de rendimiento del juego.

Los [comandos](mediciones/presion-20261122/commands.json), [README](mediciones/presion-20261122/README.md), [tablas completas](mediciones/presion-20261122/RESULTADOS.md), [agregado](mediciones/presion-20261122/aggregate.json.gz) y [manifiesto](mediciones/presion-20261122/manifest.json) fijan escenas, presupuesto, hashes y orden. Se preservan todos los pilotos y resultados adversos con su identidad. Los diagnósticos no sustituyen las mediciones principales. El benchmark de consulta posterior está en [benchmark-pressure-pad-query.cjs](../tests/benchmark-pressure-pad-query.cjs); exige referencia explícita y crea procesos nuevos, con mediciones y contadores en ejecuciones distintas.

```bash
node tests/benchmark-startup.cjs --baseline-root=../qbits-physics-baseline --baseline-commit=274a389b77d0f57c9f4c13d56c5caf86070b1b0d --families=independent --scales=2000 --hz=120 --frames=4 --repetitions=3
node tests/benchmark-pressure-pad-query.cjs --baseline-root=../qbits-physics-baseline --baseline-commit=274a389b77d0f57c9f4c13d56c5caf86070b1b0d --mode=timing --hz=120 --repetitions=3
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
```

El paquete comprime datos, logs y perfiles sin cambiar sus bytes decodificados; documentación, comandos, resumen de validación y manifiesto permanecen en texto. El verificador comprueba hashes, cobertura del directorio y regeneración exacta del agregado y las tablas. Esa comprobación de integridad terminó aprobada y no vuelve a ejecutar física ni sustituye las pruebas del juego.

## Limitaciones y continuación

El ahorro depende de que la colección seleccionada esté vacía. Con botones reales se necesita la geometría; no se desactiva su detección. Las consultas espaciales posteriores mantienen su coste propio. Persisten frames fríos de cientos de milisegundos por contactos, solver, creación y otros subsistemas; esta optimización no resuelve todos ellos ni modifica mecanismos fuera de cámara.

El intento real de Chromium de esta sesión, durante el PR #31, falló al crear sockets antes de cargar el juego: [log conservado](mediciones/contact-matrix-20261122/browser-probe.log.gz). No se inventa otro intento para este PR. Hilo principal de Chrome, interacciones visuales, FPS y GPU permanecen sin medir. La medición de preparación gráfica sólo abarca JavaScript con llamadas a GPU simuladas.

## Fuentes

- Código normativo: [game.js](../assets/js/game.js), `activePressureButtons`, `onCampaignPad`, `updateMoods`, `availableHaulers`, `bounds`, `rotatedGroupBounds`, `rigidQueryPoses`, `makeGroup` y `analyzeBlock`.
- Evidencia local: los perfiles y series enlazados arriba; [auditoría del arranque anterior](RENDIMIENTO_ARRANQUE_2026-11-22.md) para distinguir la causa ya resuelta de crecimiento de matriz.
- [MDN: `performance.now()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now), reloj monotónico de tiempo transcurrido; no es utilización de CPU.
- [Node: `process.cpuUsage()`](https://nodejs.org/api/process.html#processcpuusagepreviousvalue), tiempo de CPU de usuario y sistema del proceso. La versión ejecutada consta en los datos, independientemente de la versión que muestre la documentación pública.
