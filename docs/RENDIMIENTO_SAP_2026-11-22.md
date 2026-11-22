# SAP: descartar parejas pasivas conservando la física

Fecha: 22 de noviembre de 2026. Referencia: `a988610`, merge del PR #29. Este bloque continúa la optimización de muchos cuerpos independientes; no vuelve a contabilizar las cinco optimizaciones iniciales, el guardado ni los contornos de cajas.

## Resultado y alcance

Se confirmó un recorrido cuadrático innecesario en `CANNON.SAPBroadphase.collisionPairs`: dos cuerpos que Cannon considera pasivos siguen pasando por el predicado de colisión aunque nunca puedan producir una pareja. El cambio omite esas visitas, mantiene el orden nativo de las parejas admitidas y vuelve a leer el estado de actividad en cada consulta.

Con 2.000 piezas independientes dormidas, 2.006 cuerpos incluyendo el escenario, las visitas a `needBroadphaseCollision` pasan de **2.011.015 a cero**. Se conserva el recorrido de clasificación de 2.006 cuerpos, el mantenimiento de AABB y la ordenación que corresponda. La consulta con poses cambiadas y AABB sucias pasa de **8,286 a 0,726 ms p50**; incluye el mantenimiento, no sólo el uso de un índice ya construido. Con ocho cuerpos activos se mantienen exactamente las ocho parejas de salida.

La mejora tiene alcance concreto: reduce trabajo durante simulación continua cuando predominan cuerpos pasivos. No acelera uniformemente escenas con muchos mecanismos activos. Tampoco resuelve la limpieza de matrices de contacto de Cannon ni los picos fríos observados al crear escenas grandes. **Los datos completos incluyen controles desfavorables y una repetición de 1.500/2.000 piezas a 60 Hz cuyo trabajo total empeora.** No se presenta una promesa global de FPS ni de ausencia de sobrecoste.

Validación funcional: **1.242/1.242 pruebas aprobadas**, 14 nuevas; 21 casos de arquitectura y 36 de contactos con el suelo conservados exactamente. Las 13 comparaciones de producción/cámara/retrasos conservan estados completos, energía, entregas y tiempo. No hay cambios de motor, límite de piezas, geometría, solver, frecuencias, energía, renderizado o guardado.

La decisión de integración se registra en la sección de comparación dentro del mismo mundo, después del diagnóstico de la variación a 60 Hz.

## Identidad de las fuentes

| Elemento | Identidad |
| --- | --- |
| `main` de referencia | `a98861012eb4968f8d58e4fc6ce1aa5c20460a35` |
| Árbol de referencia | `aa4277daacc737d8487682d52ef5e86e0791f3ff` |
| `game.js` de referencia, SHA-256 | `db3f26eee06a5b7768cb27ef3dcb18be15dd1d46d32f92efc33201f6e129f4e7` |
| Commit local de código medido | `bba9f8f02d81e47a21921ff4cc4ceb8e05629787` |
| Commit publicado del mismo código | `c54980ab29e2547f00c311806a3ece6c397e2902` |
| Árbol idéntico local/publicado | `255c317281a0a1ad17d7d347bc11cf57042882a4` |
| `game.js` optimizado, SHA-256 | `84bfc37c0661329ffa2cba69f22e50d2256e35944fad556778926a1fa632be0c` |
| Versión de carga | `20261122-sap-passive-1` |
| Rama de revisión | `perf/sap-passive-pairs-20261122` |

La documentación y los diagnósticos posteriores forman otro commit; no alteran el código de juego medido. El historial publicado permite reproducir ambas fuentes sin depender de commits exclusivos de la máquina de ensayo. Se comprobó nuevamente `origin/main = a988610` durante la preparación; se volverá a comprobar la base antes de integrar.

## Causa y corrección

En el Cannon 0.6.2 distribuido por el proyecto, SAP aplica primero `needBroadphaseCollision`. Sólo si acepta la pareja evalúa `checkBounds`, cuyo resultado puede interrumpir el recorrido interior. Dos cuerpos pasivos son rechazados antes de ese corte. Una escena completamente pasiva termina visitando N·(N−1)/2 parejas aunque no genere contactos.

`installSapPassivePairFilter(world)` se instala sólo sobre el broadphase del mundo del juego. El método original permanece en el prototipo y sirve como referencia ejecutable de las pruebas. La definición de pasivo coincide con el archivo local: algún bit de `STATIC | KINEMATIC`, o `sleepState === SLEEPING`. **`SLEEPY` sigue siendo activo.** Esta clasificación describe el predicado de Cannon; no detiene ni cambia las reglas de integración de un cuerpo cinemático.

La corrección conserva el resultado por estas propiedades:

1. Mantiene `axisList` completa y su ordenación nativa. Si `dirty` está activado, actualiza las AABB y ordena incluso cuando después no queda ningún cuerpo activo.
2. En una fila activa recorre todos los índices posteriores en el orden original. En una fila pasiva visita sólo los índices activos posteriores, también en orden. Los omitidos habrían devuelto siempre `false` antes de producir un corte o añadir una pareja.
3. Mantiene `needBroadphaseCollision → checkBounds → intersectionTest`. Las filas posteriores al último activo sólo contienen parejas pasivas y pueden omitirse.

No se adelanta `checkBounds`: SAP ordena por límites AABB, mientras ese corte usa posición y radio. Modificar ese orden sería otra intervención y tendría riesgos propios. Se conservan orientación y orden de las parejas, máscaras, formas, masas, materiales, narrowphase, solver y procesamiento posterior. El paso físico sigue siendo atómico y no se divide entre workers.

### Complejidad, propietario y validez

Con N cuerpos y A activos, el recorrido especializado queda acotado por O(N + A·N), además de la ordenación y las actualizaciones geométricas nativas. Con A=0 termina después de clasificar y mantener el orden cuando sea necesario. Esto no convierte el paso físico completo en lineal: la ordenación por inserción y otros sistemas de Cannon conservan costes propios.

| Dato | Propietario y vida | Mantenimiento y cambios |
| --- | --- | --- |
| Índices activos `Uint32Array` | Una instancia de broadphase; capacidad reutilizada | Se reescriben en cada consulta a partir de tipo/sueño vivos. No hay caché histórica de actividad. |
| Capacidad del índice | Mayor N observado mientras la escena tenga al menos 32 cuerpos | Crece al superar capacidad. Se sustituye por un array vacío al consultar menos de 32 cuerpos; el anterior queda disponible para GC. |
| `axisList`, orden y AABB | Estructuras nativas de Cannon | Se mantienen `dirty`, `aabbNeedsUpdate` y `sortList`; no se quitan cuerpos del mundo ni de su lista. |

El índice es válido durante una llamada síncrona. Sueño, despertar, cambio de tipo, adición, eliminación, unión, separación y restauración se leen inmediatamente en la siguiente llamada. La pose mantiene el contrato nativo de AABB. Las funciones de producción no mutan tipo/sueño dentro del recorrido; sustituirlas por callbacks que sí lo hagan queda fuera del contrato comprobado.

Con menos de 32 cuerpos se llama directamente al método original. Con más de la mitad activa se clasifica y se vuelve al original sin volver a ordenar. Este segundo camino **sí añade O(N)** y tiene un sobrecoste medido. Los umbrales no garantizan ventaja para toda distribución.

### Memoria añadida

El payload es **4 × capacidad bytes**: 2.024 bytes para 506 cuerpos, 6.024 para 1.506 y **8.024 para 2.006**. Los deltas de `ArrayBuffers` en los perfiles de 500/1.500 coinciden exactamente con los dos primeros valores. Cabecera del objeto, cierre y gestión del runtime no se cuantificaron. Los deltas de heap/RSS del proceso incluyen harness, compilación y profiler; no son el tamaño de esta estructura.

El array guarda índices numéricos, nunca referencias a cuerpos ni un historial. Una reducción de escena que siga por encima de 31 cuerpos conserva la capacidad máxima. Cada crecimiento por encima de la capacidad asigna un nuevo buffer; adiciones sucesivas pueden asignar en cada crecimiento. Las consultas con capacidad estable no asignan nuevos buffers. La primera construcción/reasignación está incluida en las muestras frías; el índice caliente y su reconstrucción están incluidos en las consultas medidas.

## Método de medición

Equipo: **Node v24.22.3, Linux x64, AMD EPYC 9V74, 9 CPU disponibles**. Harness con DOM/GPU simulados a 1280×720, cámara `[0,1.7,0]`, yaw/pitch cero, estilo limpio, sombras y audio desactivados. Tres repeticiones comparables en orden **AB/BA/AB**; una sola carga de rendimiento simultánea. No se alteró el límite actual de **2.000 piezas**.

Cada fotograma sintético integra estas operaciones reales:

```js
advanceSimulation(1 / 60);
updateBatteryLiquids(1 / 60);
updateTarget();
renderScene();
```

Es trabajo parcial de Node: no incluye GPU real, temporización de `requestAnimationFrame` ni toda la interfaz de un navegador. `performance.now()` mide pared transcurrida; `process.cpuUsage()` suma CPU de usuario y sistema del proceso, no uso porcentual ni CPU exclusiva del hilo principal. Los tiempos de CPU y GPU pueden solaparse; aquí no se midió GPU.

Las preferencias reales de **60/120/240 Hz** se aplican antes de construir mecanismos; el runner comprueba `getPhysicsStep() === 1/hz`. Corresponden normalmente 1/2/4 pasos por fotograma sintético. Se registran acumuladores, pasos de juego/Cannon, tiempo simulado y descarte. Las comparaciones usan estados completos; no hay tolerancia física nueva.

| Familia de ensayo | Calentamiento y muestras | Propósito |
| --- | --- | --- |
| SAP aislado, poses estables o cambiadas | 20 consultas + 30 medidas, 3 pares | Coste de consulta, incluido mantenimiento de índice/orden/AABB. Sueño explícito; no simula tiempo. |
| Conteos SAP | Sin calentamiento, 1 consulta fría + 1 caliente por variante | Predicados, cortes, intersecciones, pares y reconstrucción; oráculo separado de los contadores y de los tiempos principales. |
| Matrices en reposo | 60 fotogramas + 30 medidas, 3 pares | Escalas 16/100/500/1.000/1.500/2.000 a 60/120/240 Hz. |
| Arranque/asentamiento | 0 + 30 fotogramas, 3 pares | Picos fríos y cuerpos inicialmente activos a 120 Hz. |
| Soldados/articulados/mecanismos/fábrica | 12 + 30 fotogramas, 3 pares | Escalas 100/500/2.000, coste físico diferente con igual número de piezas. |
| Control integrado pequeño largo | 180 + 180 fotogramas, 3 pares | Coste y variación en 16 piezas a 120 Hz. |
| Tres seguimientos SAP largos | 180 + 180 consultas, 3 pares | Contrastar control pequeño, activos y pico de consulta dormida. |
| Repetición aislada grande a 60 Hz | 60 + 30 fotogramas, 3 pares | Comprobar resultados desfavorables de la matriz. |

Los casos principales tienen presupuesto de **20 s** entre preparación, calentamiento y medición, comprobado entre operaciones síncronas. No se interrumpe la física a mitad de un paso. Con 30 muestras el p99 es el máximo y el p95 la segunda mayor; son colas exploratorias, no estimaciones robustas de eventos infrecuentes. Las tablas muestran la **mediana de los estadísticos de tres repeticiones**, no percentiles de muestras mezcladas. Los datos guardan cada muestra y repetición.

Los temporizadores detallados y capturas Inspector se ejecutan por separado. No hay consola por tick ni historial sin límite. Los perfiles incluyen comparación ON/OFF; su variación impide asignar un coste universal a la instrumentación.

### Corrección del runner, separada del juego

El runner conservaba objetos de reloj originados en la VM del juego. Un diagnóstico con `WeakRef(world)`, cuatro juegos y cinco ciclos de GC separados por turnos del event loop observó **cuatro mundos vivos** mientras se retenían esos relojes originales, y **cero** después de liberar los informes. Copiarlos con `{...t.getTickState()}` permitió observar cero mundos vivos aunque permanecieran los informes. Los bloques anidados del profiler mostraron el mismo patrón; se copian al host mediante JSON. Sus valores permanecen idénticos.

Las copias ocurren fuera de los intervalos principales y se aplican simétricamente a ambas fuentes. `tests/diagnose-benchmark-retention.cjs` documenta observaciones sin exigir que GC recolecte en un plazo garantizado. **Es una corrección de fiabilidad del benchmark, no otra optimización del juego.** No se inspeccionó la cadena interna de retención ni se demuestra que explique el régimen del informe anterior de contornos.

## Operaciones evitadas y tiempos de SAP

### Conteos separados de los tiempos

| Escena | Predicados antes → después | Trabajo conservado |
| --- | ---: | --- |
| 16 piezas dormidas, 22 cuerpos | 231 → 231 | Respaldo nativo; escena pequeña. |
| 500 dormidas, 506 cuerpos | 127.765 → 0 | Clasificación de N, orden/AABB cuando corresponda. |
| 2.000 dormidas, 2.006 cuerpos | 2.011.015 → 0 | Mismos cuerpos, formas y salida vacía. |
| 500 piezas, 8 activas, poses estables | 23.266 → 587 | 587 cortes espaciales, 118 intersecciones, 8 parejas. |
| 2.000 piezas, 8 activas, poses estables | 315.451 → 2.168 | 2.168 cortes, 386 intersecciones, 8 parejas. |
| 2.000 piezas, 8 activas, poses cambiadas | 323.687 → 2.168 | Mismas parejas; una ordenación y 2.000 AABB por consulta caliente. |

Con todos los cuerpos activos no se reducen candidatos; se aplica el respaldo nativo. Los grupos soldados de diez cuerpos permanecen en la ruta pequeña. Cero predicados no significa cero trabajo de física.

### Pared de consulta, mediana de p50, ms

| Escena | Antes | Después |
| --- | ---: | ---: |
| 500 dormidas, poses estables | 0,475748 | 0,001442 |
| 500 dormidas, poses cambiadas | 0,579042 | 0,143373 |
| 1.000 dormidas, poses cambiadas | 2,064834 | 0,321869 |
| 1.500 dormidas, poses cambiadas | 4,499559 | 0,489699 |
| 2.000 dormidas, poses estables | 7,189743 | 0,005198 |
| 2.000 dormidas, poses cambiadas | 8,285676 | 0,726201 |
| 2.000 piezas, 8 activas, poses estables | 1,405132 | 0,080219 |
| 2.000 piezas, 8 activas, poses cambiadas | 2,186506 | 0,739681 |

Rango p50 entre repeticiones para 2.000 dormidas con poses cambiadas: **7,782636–8,721314 → 0,720963–0,727192 ms**. Con poses estables: **6,972530–7,699142 → 0,004677–0,041863 ms**. Las primeras consultas frías, una observación por repetición, incluyen orden e índice: estables **15,646875 → 6,783448 ms**, cambiadas **18,389078 → 9,081640 ms**.

La primera repetición optimizada de 2.000 dormidas/estables contiene un máximo/p99 de **30,029897 ms**, frente a 8,492003 ms de referencia; el p95 optimizado es 5,230607 ms. No se atribuye a GC o compilación sin evidencia. El seguimiento largo no lo reproduce, pero no borra esa observación.

### Sobrecoste y seguimientos

| Seguimiento, 180 + 180 consultas | p50 antes → después | p95 antes → después | p99 antes → después | CPU de proceso media antes → después |
| --- | ---: | ---: | ---: | ---: |
| 16, pocas activas, poses cambiadas | 0,005117 → 0,005128 | 0,005979 → 0,005979 | 0,023254 → 0,030105 | 0,019156 → 0,012278 |
| 500, todas activas, poses cambiadas | **0,250723 → 0,255521** | **0,314738 → 0,347998** | **0,446395 → 0,601866** | **0,263528 → 0,303283** |
| 2.000 dormidas, poses estables | 7,693455 → 0,004477 | 8,118177 → 0,006800 | 11,625980 → 0,034592 | 7,795989 → 0,013461 |

En 500 activas se confirma un coste de clasificación sin ahorro de candidatos; la repetición optimizada más lenta amplía las colas. Su rango p50 es 0,244304–0,326606 ms, frente a 0,244534–0,257694. El control corto de 16 piezas había empeorado de 0,013360 a 0,021732 ms; el largo queda prácticamente igual en p50. Los máximos de las tres repeticiones largas de 2.000 dormidas son 0,051357/0,042634/0,204996 ms. Se conservan todos los resultados cortos y largos.

## Trabajo total parcial de Node

Las tablas completas de cada escala, p50/p95/p99, CPU de proceso, rangos y repeticiones se reproducen en [RESULTADOS.md](mediciones/sap-20261122/RESULTADOS.md) y en el agregado verificable. Aquí se seleccionan escalas relevantes **incluyendo las desfavorables**.

| Piezas / Hz | Pared p50 antes → después | Pared p95 antes → después | CPU de proceso media antes → después |
| --- | ---: | ---: | ---: |
| 500 / 60 | 4,700018 → 4,197289 | 5,879614 → 4,989969 | 5,508733 → 5,010633 |
| 1.000 / 60 | 11,093308 → 8,807624 | 12,828510 → 9,894541 | 12,717300 → 10,099767 |
| 1.500 / 60 | **13,356406 → 15,904900** | 23,364179 → 20,379552 | **16,110133 → 16,700500** |
| 2.000 / 60 | **21,759539 → 25,362272** | **25,885808 → 27,171757** | **22,762000 → 24,973100** |
| 500 / 120 | 7,364494 → 6,491325 | **8,078118 → 9,073806** | 8,637033 → 7,958833 |
| 1.000 / 120 | 21,860275 → 15,044358 | 29,332908 → 17,314168 | 34,082367 → 16,342867 |
| 1.500 / 120 | 24,491293 → 13,914126 | 32,026752 → 15,465796 | 26,092400 → 14,437633 |
| 2.000 / 120 | 63,478849 → 47,853307 | 67,508839 → 53,041251 | 64,700800 → 49,897700 |
| 500 / 240 | 11,885045 → 10,731836 | 13,078853 → 11,559380 | 14,487767 → 11,656267 |
| 1.000 / 240 | 35,701893 → 26,975341 | 39,775411 → 36,408352 | 37,799333 → 31,573567 |
| 1.500 / 240 | 72,610287 → 53,466630 | 76,086400 → 58,521599 | 74,346867 → 54,176933 |

La dispersión es material. A 1.500/240, p50 de referencia **42,364523–73,861426**, optimizado **25,329102–55,231552 ms**. A 2.000/120, **37,204654–65,126575 → 19,333384–51,187033 ms**. No se suman porcentajes de SAP, física y dibujo para fabricar una mejora global.

**2.000/240 no completó una pareja válida**: la referencia, repetición 1, rebasó 20.000 ms al terminar la medición, después de 30 muestras; total 20.001,105042 ms. Ejecutó 360 pasos incluyendo calentamiento, 1,5 s simulados y cero descarte. Se detuvo allí y no se infiere una cifra optimizada. La última escala completa fue 1.500.

El primer p95 completo que rebasa **16,67 ms** en esta matriz permanece en **1.500/60 y 1.000/120–240**. A 120 Hz el resultado optimizado no es monótono: p95 de 1.000 = 17,314168; 1.500 = 15,465796; 2.000 = 53,041251 ms. Es un cruce observado del presupuesto parcial en esta máquina, no capacidad garantizada ni FPS del navegador. A 240 Hz cuatro pasos comparten el presupuesto del fotograma.

### Controles por estructura física

| Familia / piezas | Cuerpos / formas / restricciones | Despiertos / motores activos en inventario | p50 antes → después, ms |
| --- | --- | --- | ---: |
| Soldados / 2.000 | 10 / 10 / 0 | 4 / 0 | **4,086906 → 4,192123** |
| Pocos brazos / 500 | 26 / 62 / 16 | 20 / 0 | **5,405750 → 5,450686** |
| Muchos mecanismos / 500 | 135 / 136 / 64 | 129 / 64 | **21,744718 → 22,115741** |
| Muchos mecanismos / 2.000 | 135 / 136 / 64 | 129 / 64 | **24,203429 → 24,638777** |
| Fábrica / 100 | 13 / 67 / 0 | 4 / 9 | **2,744176 → 2,882552** |
| Fábrica / 2.000 | 108 / 180 / 0 | 98 / 12 | 14,934778 → 14,664676 |

Los brazos del control tienen motores apagados; los numerosos mecanismos pequeños y las cintas de fábrica están activos. El límite del fixture de mecanismos se alcanza con 64 motores, no con un motor por pieza. Los inventarios completos incluyen también contactos y ecuaciones. Muchos mecanismos/2.000 empeora p95 **29,947562 → 35,084763 ms** y CPU **32,736467 → 32,876533 ms**. No se atribuye una mejora de articulaciones a este cambio.

El control largo integrado de 16 piezas/120 Hz da p50 **0,231995 → 0,220819**, p95 **0,366666 → 0,322730**, p99 **0,570720 → 0,374267 ms** y CPU **0,432683 → 0,381056 ms**. Su máximo mediano empeora 0,583880 → 0,954131 ms; no elimina los controles cortos desfavorables.

### Arranque y asentamiento

Sin calentamiento, 500/120 pasa de **42,246325 a 43,325299 ms p50**, 1.500 de **138,904327 a 154,995106** y 2.000 de **235,540540 a 239,190557**. El p99/máximo mediano de 2.000 permanece en **6.517,283075 → 6.513,270542 ms**, aproximadamente **6,5 segundos**. Este bloque no corrige ese congelamiento inicial. Hace falta perfilarlo por separado antes de atribuirlo a un BVH, a contactos, a asignaciones u otro sistema.

## Variación grande a 60 Hz: comprobación adicional

Una ejecución aislada, con las mismas fuentes, configuración y tres pares AB/BA/AB, volvió a obtener medianas desfavorables:

| Piezas | p50 antes → después | p95 antes → después | p99 antes → después | CPU media antes → después |
| --- | ---: | ---: | ---: | ---: |
| 1.500 | **13,467998 → 15,563814** | 18,326915 → 17,639003 | 21,721431 → 19,114753 | **14,762567 → 16,278700** |
| 2.000 | **21,068237 → 26,513780** | **24,599245 → 32,964098** | **49,294107 → 50,497652** | **21,807667 → 29,114533** |

Dos de tres parejas por escala empeoran. En 2.000 los deltas p50 pareados son **+6,578904 / −8,314229 / +6,057403 ms**; el máximo optimizado alcanza **92,398328 ms**. Estos resultados impidieron concluir simplemente que la mejora aislada de SAP garantizaba mejor trabajo total y motivaron los diagnósticos siguientes. No se descartaron ni sustituyeron por una repetición favorable.

### Localización directa del régimen de matriz

`tests/profile-sap-matrix-diagnostic.cjs` mide seis ejecuciones de 2.000/60, 60 frames de calentamiento y 30 medidos. Combina temporizadores nativos de Cannon con wrappers inclusivos de `world.step` y `collisionMatrixTick`. Es un ensayo instrumentado distinto de la medición principal, con presupuesto de 20 s **por fase**.

| Corrida | SAP | `collisionMatrixTick` | `world.step` | Frame instrumentado |
| --- | ---: | ---: | ---: | ---: |
| Referencia 1 | 7,706924 | 2,093529 | 10,791739 | 20,365904 |
| Optimizada 1 | 0,123691 | 2,142527 | 3,193784 | 12,911835 |
| Optimizada 2 | 0,136562 | **15,866446** | 17,008634 | 26,857860 |
| Referencia 2 | 7,547744 | 2,154752 | 10,756076 | 21,296857 |
| Referencia 3 | 7,710511 | **16,640318** | 25,811293 | 35,868950 |
| Optimizada 3 | 0,236400 | 2,229990 | 3,551869 | 16,266332 |

Unidad: media ms/frame instrumentado. **La variación grande está directamente dentro de `collisionMatrixTick` y aparece en ambas fuentes.** El bloque incluye intercambio de matrices y limpieza. No forma parte de las cinco fases que Cannon cronometra originalmente. El resto de `world.step` fuera de matriz/fases queda en 0,66–0,85 ms/frame; la resta sólo delimita trabajo sin atribuir.

La hipótesis de diferente representación `dictionary` no se confirmó. Con introspección privada opcional de V8, ambas matrices tenían longitud **2.011.015**, representación `fast-holey` y `dictionary=false` después del calentamiento y después de la medición en las seis corridas. Antes, la matriz actual tenía ese tamaño y la anterior longitud cero. Son puntos de observación, no una prueba de que V8 nunca cambie de estado entre ellos. No se afirma una causa concreta de optimización, GC, caché o memoria física.

Las tres parejas conservaron estado inicial, calentado y final exactamente. Cada ventana ejecutó 30 pasos, 0,5 s simulados, cero descarte y terminó con cero cuerpos despiertos y cero contactos. No se cambió la implementación de matrices para obtener estos resultados.

### Comparación de ambas rutas dentro del mismo mundo

`tests/benchmark-sap-crossover.cjs` alterna las referencias al SAP nativo y al filtrado **sobre el mismo mundo**, con los mismos cuerpos, matrices, orden, cámara y estado físico. Usa tres mundos independientes en orden AB/BA/AB, 180 frames comunes alternando ambas rutas, 30 de recalentamiento por brazo y 60 medidos. Temporizadores detallados, contadores, introspección V8 y GC forzado están desactivados. Cada fase tiene presupuesto de 20 s; la ejecución completa duró 51,889173 s.

Es un control adicional distinto de la matriz principal: las 2.000 piezas parten con energía 1 y ánimo neutral, para que su estado mecánico y energético sea invariante durante los seis segundos simulados de cada mundo. Se ejecutan normalmente física, energía, ánimo, selección y renderizado del harness. Sólo se excluyen de la comparación de estado los campos temporales `clocks`, `worldTime`, `data.runtime.time`, `data.groups[*].parts[*].mood.idle` y `...mood.fullTime`. Energía, estado/blend de ánimo, posiciones, fuerzas, masas, IDs, geometría y demás estado guardado se comparan exactamente; se comprueba además que no se cruza una transición de ánimo.

| Mundo | Orden medido | Pared p50 nativo → filtrado | Pared p95 nativo → filtrado | CPU media nativo → filtrado |
| --- | --- | ---: | ---: | ---: |
| 1 | Nativo / filtrado | 21,881781 → 12,535115 | 25,964780 → 15,084801 | 22,293150 → 13,017133 |
| 2 | Filtrado / nativo | 19,853080 → 12,298111 | 22,719678 → 14,081547 | 20,615350 → 12,647367 |
| 3 | Nativo / filtrado | 34,580610 → 26,905321 | 37,553436 → 30,001841 | 34,800133 → 27,037333 |

Unidad: ms/frame sintético. Cada brazo ejecuta **60 pasos físicos de juego y Cannon, 15 pasos lógicos, 1 s simulado y cero descarte**. Los acumuladores se registran; los brazos ocurren en momentos sucesivos y no se exige que sus relojes absolutos sean iguales. Las matrices conservan las mismas referencias y longitud, todas sus entradas siguen a cero, `axisList` conserva cuerpos y orden y ambas consultas producen exactamente la misma salida vacía. Las comprobaciones y escaneos exhaustivos ocurren fuera del tiempo medido.

**Anomalía de metadatos conservada:** el primer brazo del mundo 2 registra `clock.simTime = 4,5 s` y un `moodClockRange` de 6 s; las otras validaciones siguen la secuencia 3/4,5/6 s. La revisión estática del runner y de captura/serialización no explica ese rango. El raw no se modificó. Esos dos cronómetros de ánimo ya estaban excluidos explícitamente de la igualdad de estado; **no se usan sus rangos como evidencia de tiempo**. Los pasos de juego/Cannon, acumuladores, tiempo simulado y descarte se verifican por separado. No se atribuye la anomalía a retención VM ni a una causa V8 sin prueba.

**Decisión de integración:** aceptar la reducción local de trabajo de SAP, respaldada por la prueba del predicado, pares/estados exactos, conteos, mantenimiento medido y una mejora dentro de los tres mundos. El tercer mundo permanece más caro en ambas rutas y aun así mejora al usar el filtro. Esta comprobación acota la duda entre instancias; **no demuestra que todas las escenas o todos los frames mejoren**, ni identifica la causa del régimen de matriz, ni sustituye los resultados desfavorables de las ejecuciones independientes. El sobrecoste con todos activos y el pico frío quedan documentados. La matriz se mantiene para un PR separado.

## Perfil de fases, asignaciones y GC

Los perfiles de 500/120 y 1.500/240 usan tres pares ON/OFF y capturas Inspector separadas. Incluyen CPU sampling, heap sampling y eventos de GC, con informes acotados. Estos son **bloques inclusivos**: SAP y matriz ya están incluidos en `world.step`.

| Perfil | SAP antes → después | `world.step` antes → después | Matriz antes → después |
| --- | ---: | ---: | ---: |
| 500 / 120 | 0,920966 → 0,037007 | 3,290362 → 2,549407 | 2,001584 → 2,085213 |
| 1.500 / 240 | 17,552766 → 0,410445 | 26,390248 → 8,364778 | 5,045124 → 4,925409 |

Medianas de medias, ms/frame instrumentado. En 1.500/240 son aproximadamente **1,23 ms por paso** para limpiar matrices aun sin cuerpos despiertos ni contactos. Es un coste residual demostrado, candidato del próximo PR. El profiler separa también controladores, energía, baterías, sensores, enfriadores, ánimo, consultas, preparación gráfica y serialización según los bloques disponibles; consultar datos completos sin sumar bloques anidados.

La instrumentación no tiene efecto constante: referencia 1.500/240 repetición 2, OFF **79,950019 ms/frame** frente a ON **50,234741**. Por ello no se resta una pareja para anunciar un porcentaje fijo de sobrecarga ni se sustituye la matriz principal por los perfiles.

No se demuestra reducción de GC: las capturas CPU registran **50 → 50 eventos** en 500 y **70 → 71** en 1.500. Las capturas de asignaciones y memoria retenida se conservan, pero no cuantifican todas las asignaciones del juego ni certifican ausencia de fugas a largo plazo.

## Conservación y validación integrada

| Verificación | Resultado |
| --- | --- |
| Suite fresca en `a988610` | **1.228/1.228**, cero fallos, cancelaciones u omisiones; 58,898943 s. |
| Suite sobre código final `bba9f8f` | **1.242/1.242**, cero fallos, cancelaciones u omisiones; 54,389619 s. La duración de suite no es un benchmark. |
| Benchmark de arquitectura | **21 informes idénticos**, salvo SHA de fuente. |
| Benchmark de contactos con suelo | **36 casos y resumen idénticos**, salvo SHA de fuente. |
| Pares nativos/orientación/orden | 96 comparaciones combinando ejes, AABB/esfera, dirty/clean y varias rondas. |
| Impactos, agarre, cargas, restauración, unión/separación | Estados completos exactos entre nativo y optimizado. |
| Producción, cámara y retrasos | **13 comparaciones exactas**, incluidas 60/120/240 Hz. |

Las 14 nuevas regresiones comprueban planos, compuestos asimétricos, offsets rotados, tangencias, máscaras, tipos/sueño incluidos `KINEMATIC` y `SLEEPY`, el orden filtro-antes-del-corte, AABB dirty, prefijos de salida, despertar sin dirty, retirada y reemplazo de escena, transiciones 31→32→31 y densidad activa. Incluyen 128 cuerpos pasivos, **8.128 visitas nativas → cero** conservando ordenación y salida.

Las pruebas de juego agregan 64 cuerpos dormidos de fondo a impactos, agarrar/soltar, reiniciar un motor, sensores de peso con pilas dormidas, añadir/retirar cargas, restaurar un guardado y soldar/separar. Comprueban estados completos, IDs, masas, formas y pertenencia actual al broadphase; los cuerpos retirados desaparecen de `axisList`.

Los benchmarks existentes conservan respuesta al suelo, reposo contextual, penetración, deriva y materia. Las pruebas de conservación existentes cubren los sistemas no modificados, incluidas pausas/menús/pestaña oculta, frenos, consumo, activaciones, almacenamiento y consultas espaciales. No se presenta esa ejecución lógica como una partida visual.

### Producción útil y tiempo

| Escenario / Hz | Entregas antes = después | Tiempo final, s | Energía, J |
| --- | ---: | ---: | ---: |
| Producción 19 / 60 | 3 | 16,633333 | 6,817645 |
| Producción 19 / 120 | 3 | 16,583333 | 6,944896 |
| Producción 19 / 240 | 3 | 17,083333 | 7,192280 |
| Producción 20 / 60 | 6 | 40,066667 | 26,802111 |
| Producción 20 / 120 | 6 | 39,983333 | 26,857198 |
| Producción 20 / 240 | 6 | 39,933333 | 26,890718 |
| Producción 20 / 60, 29 rpm | 6 | 41,433333 | 26,974304 |

Son valores idénticos entre variantes, además del estado completo; cero descarte. Los 39,983333 s de Producción 20/120 corresponden al final del frame del runner; el informe anterior anotó 39,975 s en el paso terminal. No es una alteración de la producción.

La fábrica conserva la simulación y el estado al cambiar cámara, con 3 s simulados y 180/360/720 pasos. Los retrasos deliberados solicitan 3,316667 s, ejecutan 3,066667 y descartan **0,25 s en ambas fuentes**, conforme al límite ya existente; 184/368/736 pasos. No se gana tiempo omitiendo simulación.

Los 16 inputs del agregado principal reúnen **346 pares completos**, incluidos 72 de conteos. Matrices, control integrado largo y repetición aislada grande suman **36 configuraciones, 108 pares, 7.380 frames, 15.120 pasos y 123 s simulados agregados**, cero descarte en esas ventanas, más un caso detenido. No se suman perfiles, diagnóstico de matrices, crossover ni pruebas unitarias a ese total.

## Navegador, fuentes y reproducción

Se intentó ejecutar `tests/benchmark-cpu-browser.cjs` con Playwright y `/usr/bin/chromium`. Chromium terminó con `socket() failed: Operation not permitted`; log guardado. **No se midieron FPS, RAF, hilo Main de Chrome, GPU ni capturas nuevas de navegador.** No cambia renderizado y no se contabilizan de nuevo las capturas GLES del PR anterior. El panel de rendimiento y los runners existentes se reutilizan; no se añadió telemetría paralela al juego.

Evidencia completa, comandos originales, hashes, datos de cada repetición, CPU/heap profiles y scripts de agregación: [mediciones/sap-20261122/README.md](mediciones/sap-20261122/README.md). El manifiesto verifica datos comprimidos y decodificados. Los comandos funcionales son:

```bash
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
```

El README incluye la creación del worktree baseline, variantes de SAP/matrices/perfiles y comandos para regenerar el agregado; no es necesario reconstruir ni empaquetar el juego. La prueba con introspección de V8 es opcional y pertenece sólo al diagnóstico Node.

Fuentes primarias consultadas:

- [Cannon: SAPBroadphase](https://schteppe.github.io/cannon.js/docs/files/src_collision_SAPBroadphase.js.html). La página se etiqueta 0.6.1: se contrastó con el 0.6.2 local, que gobierna este cambio.
- [Cannon 0.6.2: Broadphase distribuido](https://app.unpkg.com/cannon%400.6.2/files/docs/files/src_collision_Broadphase.js.html). Confirma el criterio `STATIC | KINEMATIC` y sueño.
- [Chrome DevTools: Performance y Main](https://developer.chrome.com/docs/devtools/performance/) y [Memory problems](https://developer.chrome.com/docs/devtools/memory-problems/). Guían la separación de trabajo, asignaciones y retención; no convierten un perfil Node en uno de Chrome.
- [MDN: performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) y [Long Animation Frames](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming). El umbral de 50 ms y su compatibilidad limitada no detectan todos los incumplimientos de 16,67 ms. No se usó LoAF como sustituto de muestras de frame.
- [Node: process.cpuUsage](https://nodejs.org/api/process.html#processcpuusagepreviousvalue). Tiempo de proceso usuario+sistema, distinto de pared y de utilización porcentual.
- [V8: Elements kinds](https://v8.dev/blog/elements-kinds). Contexto de las representaciones internas de arrays; las intrínsecas del diagnóstico son privadas, opcionales y no forman parte de una API estable ni del juego.
- [Box2D: simulación y sueño](https://box2d.org/documentation/md_simulation.html). Referencia del patrón de evitar trabajo pasivo; no se trasladaron reglas de otro motor a Cannon.

## Descartes y siguiente bloque

Se descartó adelantar el corte espacial por el riesgo de cambiar orden y resultados; eliminar cuerpos pasivos de `axisList` rompería consultas y despertares. Tampoco se usó una caché histórica de actividad que requiriera interceptar cada despertar. No se sustituyó Cannon, no se recortó simulación fuera de cámara y no se cambiaron límites de tiempo. Workers no se justifican para esta eliminación local de candidatos: no se realizó ni se afirma un benchmark de transferencias.

Se descartó como explicación demostrada la hipótesis de matrices `dictionary` frente a `fast`; los puntos observados fueron iguales. La retención de mundos por informes se corrigió como defecto del instrumento, sin atribuirle automáticamente los regímenes de otros informes.

Pendientes por impacto y riesgo:

1. **Matriz triangular de contactos de Cannon.** Coste continuo demostrado incluso sin contactos, incluido régimen de 2 a 16 ms por paso en 2.006 cuerpos. Examinar limpieza proporcional a entradas realmente escritas y conservación de matriz actual/anterior, eventos de inicio/fin de contacto, índices de cuerpos, retirada y despertares. Riesgo alto por su semántica; PR separado con oráculo nativo.
2. **Pico frío de escenas grandes.** Congelamiento de aproximadamente 6,5 s aún reproducible en 2.000 independientes. Separar creación de índices/geometry, primer paso, asignaciones y preparación gráfica antes de escoger corrección. Riesgo medio/alto; no atribuirlo sin traza.
3. **Numerosas articulaciones y mecanismos activos.** El control de 64 motores continúa por encima del presupuesto; comprobar trabajo repetido por articulación y posibles estados compartidos sin cambiar torque/consumo/frenos.
4. **Sombras, sensores de movimiento y guardados grandes.** Hipótesis pendientes de medición tras las mejoras ya entregadas. No contabilizar un supuesto ahorro sin escena y evidencia propia.

Este bloque beneficia la simulación continua de escenas con muchos cuerpos pasivos; sus efectos al construir proceden de la misma consulta física. No añade una optimización específica de selección, guía Ctrl o serialización, que mantienen las mejoras anteriores.
