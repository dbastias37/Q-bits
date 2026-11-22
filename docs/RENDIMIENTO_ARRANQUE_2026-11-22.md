# Arranque de escenas grandes: crecimiento de la matriz de contactos

Fecha: 22 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

Informe del segundo PR, basado en el `main` que integra el PR #31. El diagnóstico localiza el congelamiento de varios segundos en las **escrituras que hacen crecer una matriz de contactos durante el tercer paso físico**, dentro del segundo fotograma a 120 Hz. La corrección añade una condición de crecimiento explícito al `set` instalado por el PR anterior. Conserva el array, su longitud observable, los huecos, contactos, eventos y pasos.

En tres parejas frías finales con 2.000 piezas independientes a 120 Hz, la mediana del máximo por ejecución baja de **6.477,938 a 369,776 ms**, y la ventana de cuatro frames de **7.372,459 a 1.240,973 ms**. Los estados completos, inventarios y relojes son exactamente iguales. El control extendido de 60 frames confirma la reducción de la ventana total, **11.310,300→5.488,819 ms**, y alcanza el mismo reposo. Persisten frames fríos de cientos de milisegundos. No se declara que el arranque completo cumpla 16,67 ms ni se atribuyen FPS o GPU.

Preparado para publicación del PR: mediciones, controles, conservación y suites integradas finalizados; **1.261/1.261 pruebas aprobadas**. El control caliente conserva una configuración incompleta por presupuesto, detallada abajo. Este informe identifica los objetos de código publicados y no atribuye todavía un merge.

## Referencia e identidad

| Elemento | Identidad |
| --- | --- |
| Referencia de este PR | `4fc563cc8d27e653129fc11a14524a7cfc626a5e` |
| Integración anterior | [PR #31](https://github.com/dbastias37/Q-bits/pull/31) |
| Árbol de referencia | `09e6452b9524537ea0099fc30f4153cfc95c8c15` |
| SHA-256 de `game.js` de referencia | `c77f65c197f80f340f7f390a8d72155601589fb500bbb1014c0cbee3a3b97b4c` |
| Commit del código final medido | `e362708c4c9472133771394fd048541992ac29ae` |
| Commit del código publicado como objeto Git | `4d7c128517e4951ba7acb56562e378a7ecaff904` |
| Árbol del código final | `71f18000064b816dc66b52424f338bb5920d92d4` |
| SHA-256 de `game.js` final | `847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed` |
| SHA-256 de Cannon, conservado | `0e63a043c15379cdbf940ab364c239363fc4e2803013a4c98ee3788fd3aa27ab` |
| Checkout de referencia | `../qbits-startup-baseline`, limpio y fijado al commit anterior |
| Versión de carga del candidato | `20261122-startup-matrix-growth-1` |

El commit local medido y el objeto publicado tienen exactamente el mismo árbol `71f18000064b816dc66b52424f338bb5920d92d4`; difieren los metadatos del commit. Los candidatos exploratorios conservan sus propios hashes; no se usa sólo el HEAD si el runner registra cambios locales. La cola final usa el `game.js` fijado en la tabla.

El [PR anterior de matrices](RENDIMIENTO_MATRIZ_CONTACTOS_2026-11-22.md) redujo la limpieza continua de arrays grandes y escasos. Dejó deliberadamente la inicialización y el crecimiento nativos, y no declaró resuelto el arranque. Tampoco se vuelven a contar las mejoras de SAP, contornos, apuntado, Ctrl, sensores, baterías, guardado o Producción 20.

## Reproducción y atribución del congelamiento

La [repetición sobre la referencia integrada](mediciones/startup-20261122/reference-cold-existing-runner.json.gz) usa el runner anterior, sin calentamiento, 2.000 piezas independientes, 120 Hz y cuatro frames. Ambas etiquetas apuntan a la misma referencia. Los máximos aparecen en el **segundo** frame: aproximadamente 6.717 y 6.122 ms. Es una reproducción del problema, no una comparación con el candidato.

El fixture mantiene 2.000 grupos dinámicos de un cubo, 2.006 cuerpos/formas contando el recinto, cero restricciones, sensores y motores. Al final del primer frame conserva 2.000 cuerpos despiertos, 8.000 contactos y 16.000 ecuaciones de fricción. Ese inventario corresponde al segundo subpaso; el primer subpaso tiene 4.140 contactos y 8.280 fricciones. No se confunden ambos instantes.

### Separación de fases

| Fase | Ruta inspeccionada | Observación y alcance |
| --- | --- | --- |
| Módulos y harness | `createGame`, VM y módulos estáticos | Separados de la creación de la escena y de los frames. DOM/GPU simulados. |
| Creación | `makeGroup`, `rigidColliderLayout`, `addRigidCollisionShapes`, `analyzeBlock`, `world.addBody` | La agrupación de inserciones de formas ya existe. No se optimiza ni se vuelve a contar aquí. |
| Formas, masa y AABB | Constructores Cannon, `updateBoundingRadius`, `updateMassProperties`, `computeAABB` | `updateMassProperties` ya calcula AABB durante creación; la primera AABB no pertenece necesariamente al primer paso. |
| SAP | `sortList`, `collisionPairs` | Primera ordenación y AABB dirty medidas dentro de física. Se conserva el filtro y orden de PR #30. |
| Matrices | `collisionMatrixTick`, `reset`, `set`, `get` | Los temporizadores nativos de Cannon omiten el tick de matriz; se instrumenta aparte. El pico se localiza en `set`. |
| Contactos y solver | Narrowphase, `makeContactConstraints`, wrapper del juego y `GSSolver` | Se conservan las ecuaciones y 24 iteraciones configuradas. No se reduce trabajo físico para conseguir el ahorro. |
| Correcciones del juego | `prepareMechanicalRest`, `settleSupportedGroups`, `stabilizeRotors` | Las rutas de mecanismos retornan pronto sin rotores; los apoyos de cubos sí procesan contactos reales. |
| Primera consulta | `updateTarget`, `rayGroupCandidates`, `partQueryIndex` | Los grupos de hasta ocho piezas no construyen el BVH de selección. La escena independiente usa grupos de una pieza. |
| Preparación y dibujo | `renderScene`, visibilidad, piezas y contornos | Tiempo de JavaScript y llamadas simuladas. No incluye ejecución real del driver o GPU. |
| Asignaciones y GC | Inspector de Node y `PerformanceObserver` | Capturas separadas, sin GC forzado. Los bytes muestreados y los deltas del proceso no son tamaños exactos de cachés. |

En el [diagnóstico de representación](mediciones/startup-20261122/reference-matrix-elements.json.gz), la primera consulta cuesta 9,281 ms y el primer render 24,486 ms; en el segundo frame, 5,030 y 5,724 ms. El avance físico de ese segundo frame cuesta 7.384,474 ms. No se atribuye ese pico al primer apuntado o al dibujo.

El perfil de [bloques](mediciones/startup-20261122/reference-blocks.json.gz) y el de [CPU](mediciones/startup-20261122/reference-cpu.json.gz) usan procesos nuevos independientes. La segunda captura no contiene wrappers internos de bloques. Sus cifras no se suman ni se mezclan con las mediciones principales.

| Evidencia de referencia | Resultado observado |
| --- | --- |
| Paso 3, `matrix.set` | 8.000 llamadas; **6.848,461 ms inclusivos**; 41 extensiones |
| Paso 3, longitud | 541.320 → 2.011.015; 1.469.695 posiciones adicionales |
| Paso 3, `makeContactConstraints` | 6.860,097 ms, incluyendo las escrituras de matriz y eventos |
| Paso 3, llamada individual a `set` más lenta | 213,615 ms |
| Paso 4, `matrix.set` | 8.000 llamadas; **3,059 ms**; ninguna extensión |
| Perfil CPU separado, tiempo propio muestreado de `matrix.set` | **7.957,730 ms** |
| Mismo perfil, tiempo propio de `n.solve` / recolector | 374,198 / 252,418 ms; no son el tiempo inclusivo total de física |

Los [bloques del candidato](mediciones/startup-20261122/optimized-blocks.json.gz) conservan exactamente **8.000 escrituras, 41 extensiones y 1.469.695 posiciones adicionales** en el paso 3. El tiempo inclusivo de `set` baja de 6.848,461 a **106,083 ms** y la llamada más lenta de 213,615 a 47,690 ms. No hay reducción de contactos ni de extensiones observables. El paso 4 conserva 8.000 escrituras sin crecimiento, 3,059→2,973 ms. El solver del paso 3 sube de 111,041 a 204,773 ms en esta captura; se conserva ese adverso instrumental y no se suman bloques inclusivos.

El [perfil CPU del candidato](mediciones/startup-20261122/optimized-cpu.json.gz), separado de los wrappers, registra `matrix.set` con **34,490 ms propios muestreados**, frente a 7.957,730 ms de referencia. `n.solve` conserva 359,317 ms propios frente a 374,198. Los seis ensayos de bloques/CPU/heap de ambas variantes producen el mismo estado final `09e4477f46646dcf2764ffa9b3b579a89a58a59a3d87a304bc0134ebb05f33e2`, ocho pasos y 1/15 s simulado, sin descarte. Son diagnósticos individuales: las tres repeticiones principales sin esos wrappers determinan el beneficio final.

### Secuencia que produce el coste frío

`World.addBody` sólo redimensiona la matriz actual. La otra empieza vacía. El primer `collisionMatrixTick` intercambia ambas y limpia ese array vacío; los contactos lo extienden mediante índices triangulares dispersos. En esta escena, el primer paso llega hasta longitud 541.320, exactamente el tamaño requerido por la pareja `(1040,0)`.

El segundo paso utiliza el array ya dimensionado a 2.011.015 por las altas. En el tercero vuelve el array menor: primero se limpia su prefijo y después los nuevos contactos lo hacen crecer en 41 saltos hasta la longitud completa. El paso siguiente ya escribe dentro de una capacidad lógica suficiente y no reproduce el pico.

La representación fría observada pasa de dictionary a fast-holey durante el reset del paso 3; ese reset cuesta **55,057 ms** en la captura de representación. Esta comprobación **descarta la limpieza como explicación de los varios segundos**. El bloque de escrituras posterior concentra el tiempo. Los perfiles calientes anteriores sólo observaron fast-holey: no habían demostrado el comportamiento de esta secuencia fría.

**Causa comprobada a nivel del juego:** crecimiento implícito repetido durante las escrituras de contactos de una matriz parcialmente inicializada. La preextensión del mismo array elimina ese régimen en el A/B exploratorio y en las tres repeticiones finales sin cambiar las operaciones físicas ni el estado final. **Inferencia pendiente a nivel de V8:** normalizaciones, conversiones internas o copias concretas podrían explicar el coste, pero las capturas presentes no identifican cada operación interna del motor. El informe no afirma una secuencia de normalizaciones no trazada.

## Cambio aplicado y contrato preservado

El cambio funcional está en `installTrackedCollisionMatrices`, después de calcular el índice nativo y antes del registro de entradas modificadas:

```js
if(index>=entries.length&&Number.isInteger(index)&&index<4294967295)
  entries.length=index+1;
```

Son una condición funcional y tres líneas explicativas en producción, además de la versión de carga. La asignación final sigue siendo `entries[index]=value?1:0`. No se reserva el máximo posible al crear el mundo, no se rellena el sufijo con ceros y no se sustituye el Array. Se establece únicamente la longitud que esa escritura iba a producir de todos modos.

| Operación o caso | Conservación |
| --- | --- |
| Índice existente | No se escribe `length`; sigue la escritura anterior. |
| Nuevo índice entero válido | Longitud final exactamente `index+1`, como el nativo. |
| Escritura falsa fuera de longitud | Crece y guarda cero explícito en el mismo índice. |
| Huecos entre prefijo e índice nuevo | Permanecen ausentes hasta el reset; leerlos sigue dando `undefined`. |
| Negativos y fracciones | Siguen siendo propiedades ordinarias; no fuerzan crecimiento. |
| `2**32-1` | No es índice de array; el guard impide intentar una longitud inválida. |
| Frontera y registro de PR #31 | `initializedLength`, `dirtyLimit` y `fullReset` no se adelantan por esta asignación. |
| Intercambio y eventos | Conserva las instancias, el array, fórmulas, orden, multiplicidad y lectura de contacto anterior. |
| Reducción y recrecimiento | `setNumObjects` y el siguiente reset mantienen el truncado y la inicialización pendiente. |

El estándar define la actualización de longitud a `index+1` para un índice nuevo; aumentar `length` crea huecos. El guard acepta sólo índices de array, cuyo máximo es `2**32-2`. Las propiedades fraccionarias, negativas y límites no indexados se contrastan con el oráculo nativo, sin normalizar la fórmula peculiar de Cannon.

El contrato sigue siendo el de arrays normales del mundo, modificados mediante los métodos instalados. No hay consumidores de producción que congelen el array, cambien descriptores, instalen setters numéricos en su prototipo o intercepten sus escrituras. Los Proxies de conteo sí observan una operación adicional sobre `length`; eso se registra como coste instrumental, no se oculta exigiendo sólo igualdad de escrituras numéricas.

### Complejidad, propiedad y memoria

No se incorpora ninguna estructura persistente. Cada llamada a `set` añade una lectura/comparación de longitud; cada extensión añade una asignación explícita de `length` y comprobaciones de índice. Las escrituras internas al tamaño actual siguen sin inicializar ni recorrer el array. El coste real de crecer depende del runtime y se mide, no se presupone constante.

Los propietarios, vida, invalidación y liberación permanecen como en PR #31: dos matrices propiedad del mundo, arrays conservados, registro de índices numéricos acotado y liberado al limpiar o entrar en respaldo. El sufijo nuevo sigue pendiente de inicialización y el siguiente reset paga ese trabajo. No se crea un índice nuevo de cuerpos ni una caché global.

La memoria lógica de las matrices sigue siendo O(N²). No se promete reducir su tamaño retenido. En el A/B exploratorio, RSS al terminar los cuatro frames es **651.194.368→331.345.920 bytes**, pero incluye heap, capacidad interna, compilación, harness y decisiones del recolector. No es una medida aislada del array ni una garantía de ahorro por escena.

Los perfiles de asignaciones [referencia](mediciones/startup-20261122/reference-heap.json.gz) y [candidato](mediciones/startup-20261122/optimized-heap.json.gz) atribuyen a `matrix.set` **1.165.488.312→55.517.408 bytes muestreados**. Son estimaciones acumuladas de asignación, no heap retenido ni bytes exactos de las matrices. El GC observado en esas capturas pasa de 265,197 ms/35 eventos a 72,366 ms/19 eventos. En las capturas CPU separadas, el observer registra 247,700→58,095 ms, mientras el muestreo propio del recolector da 252,418→59,441 ms: son observaciones distintas del mismo proceso, no magnitudes que deban sumarse.

### Coste total de operaciones de matriz

El [microbenchmark final](mediciones/startup-20261122/matrix-operations.json.gz) completa 42 configuraciones y **126 parejas AB/BA/AB**, con 22/106/506/1.006/1.506/2.006 cuerpos y siete patrones. Son operaciones sintéticas de matriz sin formas, solver ni tiempo simulado. Cada ronda mide intercambio, reset, escrituras, consultas y, en `churn`, altas/bajas y reindexación. El oráculo nativo se reejecuta fuera del cronómetro: valores, huecos, longitudes, índices y resultados coinciden. Se miden crecimiento y primera ronda antes de ocho rondas de calentamiento y 30 muestras; no se esconden dentro del calentamiento.

Medianas de las tres estadísticas por ejecución a **2.006 cuerpos**, milisegundos, referencia→candidato:

| Patrón | Pared caliente p50 | Pared p95 / p99 | CPU p50 | Primera ronda fría |
| --- | ---: | ---: | ---: | ---: |
| Escaso | 0,580164→0,595166 | 0,662616→0,695195 / 0,734995→0,829685 | 0,582→0,597 | 1,028→29,944 |
| Escrituras repetidas | 1,561004→1,552181 | 1,732640→1,676927 / 1,805619→1,690166 | 1,561→1,554 | 1,281→51,797 |
| Encendido/apagado | 0,994160→0,953409 | 1,103803→1,038446 / 1,123152→1,044385 | 0,996→0,955 | 2,162→29,606 |
| Denso | 96,260476→96,999388 | 99,817250→101,522023 / 100,633986→110,072002 | 96,172→96,798 | 175,916→595,917 |
| Altas/bajas | 0,647104→0,646994 | 0,871668→0,770848 / 0,943705→0,917566 | 0,649→0,649 | 16,504→15,746 |

El guard añade un coste pequeño en algunos patrones calientes: escaso p50 +0,015002 ms; denso +0,738912 ms. Los rangos de p50 son [0,568416;0,583589]→[0,575807;0,610739] ms para escaso y [95,385443;96,340073]→[93,359008;98,172967] para denso. Los patrones fríos de la tabla **empeoran sustancialmente** salvo altas/bajas. Su primera escritura en un array vacío no es la secuencia de contactos y reset parcial del tercer paso responsable del bloqueo; se preservan como un coste real de esta elección, sin prometer una mejora universal del crecimiento.

El patrón dormido mide aparte la preparación de ambas matrices a su longitud nativa completa: 132,215→9,430 ms de pared y 147,026→10,595 ms de CPU a 2.006 cuerpos; después, p50 de reset es 0,000611 ms en ambas variantes. El patrón sin uso también conserva 0,000611 ms. Esas cifras no convierten el coste de preparación en cero. La creación de 2.006 cuerpos y `addBody` sigue medida aparte, con medianas entre 32,896–63,968 ms de referencia y 32,325–55,249 ms del candidato según el patrón; su algoritmo no se modificó.

Los [conteos separados](mediciones/startup-20261122/matrix-counts.json.gz) verifican cuatro parejas en 506/2.006 cuerpos, escaso y altas/bajas, con Proxies; no se usan sus tiempos como benchmark. A 2.006/escaso, altas+ronda fría+dos rondas medidas hacen 6.015 `set` y conservan 16.040 lecturas/10.029 escrituras numéricas. Las lecturas de longitud suben 6.022→12.037, exactamente una adicional por `set`; las escrituras explícitas de longitud, 2.006→4.013. En altas/bajas se conservan 16.040 lecturas/26.058 escrituras numéricas; longitud pasa de 6.166→12.181 lecturas y de 2.054→2.056 escrituras. El calentamiento está excluido de estos contadores acumulados, pero incluido en el replay del oráculo. No aparece una estructura auxiliar nueva ni se elimina la inicialización pendiente.

### Reposo continuo: conservación de la mejora anterior

Los ensayos calientes de [60 Hz](mediciones/startup-20261122/settled-60.json.gz), [120 Hz](mediciones/startup-20261122/settled-120.json.gz) y [240 Hz](mediciones/startup-20261122/settled-240.json.gz) reutilizan el runner integrado: seis escalas, AB/BA/AB, 60 frames de calentamiento y 30 medidos, presupuesto total de 20 s por ejecución. **17 configuraciones y 51 parejas** completan las tres repeticiones y certifican estado final exacto. La última escala completa es 2.000 a 60/120 Hz y 1.500 a 240 Hz. No se atribuye a este PR una nueva mejora universal de simulación caliente.

Selección de medianas por ejecución, en ms, referencia→candidato; las 17 configuraciones completas y sus muestras están en los datos y [tablas detalladas](mediciones/startup-20261122/RESULTADOS.md):

| Piezas / Hz | Pared p50 | Pared p95 | Pared p99 | CPU p50 |
| --- | ---: | ---: | ---: | ---: |
| 16 / 60 | 0,255480→0,240478 | 0,334928→0,290442 | 0,373226→0,293397 | 0,257→0,242 |
| 2.000 / 60 | 10,098936→10,269359 | 11,649785→13,212010 | 12,146855→14,122556 | 10,103→10,274 |
| 1.000 / 120 | 7,971128→8,496199 | 8,885359→10,558831 | 9,323020→12,812205 | 7,975→8,877 |
| 2.000 / 120 | 14,664764→13,941830 | 18,201246→17,487287 | 19,929122→19,876177 | 14,719→13,951 |
| 1.000 / 240 | 11,865289→13,345603 | 13,439212→17,348113 | 13,718208→17,752976 | 12,143→13,414 |
| 1.500 / 240 | 17,586429→17,845088 | 21,283605→20,342190 | 23,513917→21,011357 | 17,747→17,937 |

Los adversos permanecen, incluidos 2.000/60 y 1.000/120–240. El rango de p50 a 2.000/60 es [9,432534;10,695794]→[9,720863;10,882502] ms; a 1.000/120, [7,638663;8,146689]→[8,083585;8,948062]. Se conservan además CPU p95/p99, setup y calentamiento en los originales. Todas las ventanas completas simulan aproximadamente 0,5 s, ejecutan 30/60/120 pasos y siete ciclos lógicos, sin descarte. El resto lógico final de 1/30 s es igual en ambas variantes; el acumulador físico es cero o `5.204170427930421e-18`. La aserción de duración admite `1e-8` s por acumulación flotante; pasos y estados A/B se comparan exactamente. Al inicio y final de la medición no hay cuerpos despiertos ni contactos, y permanecen todas las piezas y cuerpos.

**Ensayo incompleto conservado, 2.000/240:** la tercera repetición de referencia alcanza 20.011,830 ms después de 26/30 muestras; el presupuesto incluye creación y calentamiento. El último paso completo deja 344 pasos acumulados, 1,4333333333333296 s simulados y descarte cero. Hay dos parejas con ventanas temporales completas: sus rangos de p50 de pared son [23,049965;23,308488] ms de referencia y [21,723479;24,928135] ms del candidato. El runner compara y publica hashes de estado sólo al terminar las tres repeticiones; por ello **esas dos parejas no tienen certificación de estado completo** y no se cuentan entre las 51 anteriores. Sus tiempos, inventarios y muestras parciales se preservan, sin presentarlos como resultado validado de tres repeticiones.

## Primer A/B exploratorio, sin calentamiento

El [ensayo corregido](mediciones/startup-20261122/exploratory-prelength-corrected.json.gz) ejecuta cada variante en un proceso Node nuevo. Una pareja AB, 2.000 independientes, preferencias reales de 120 Hz antes de crear cuerpos, cuatro frames de `1/60`, sin consultas preparatorias, perfil ni GC forzado.

| Medida | Referencia → candidato |
| --- | ---: |
| Frame 1 | 558,469 → 373,095 ms |
| Frame 2 | **6.463,650 → 312,912 ms** |
| Frame 3 | 264,147 → 263,364 ms |
| Frame 4 | 236,602 → 265,692 ms |
| Ventana completa de cuatro frames | **7.527,236 → 1.219,043 ms de pared** |
| CPU del proceso en esa ventana | 8.322,553 → 1.796,672 ms |
| Pasos de juego / Cannon | 8 / 8 en ambas variantes |
| Tiempo simulado / descarte | 0,06666666666666667 s / 0 en ambas variantes |

La ventana incluye la instrumentación externa y los inventarios entre frames; por eso no es exactamente la suma de las cuatro filas. Estados completos, relojes e inventarios de cada frame son iguales. El cuarto frame exploratorio empeora; no se descarta. Creación y harness también presentan variación, aunque este cambio no modifica sus algoritmos: no se atribuye al producto toda diferencia de esas etapas.

La física sigue siendo síncrona y atómica. No se distribuye preparación entre frames, no se añade una espera para consultas y no se reduce el tiempo simulado. La latencia total de esta ventana baja junto con su frame más lento: **no se traslada el mismo bloqueo a una carga o consulta posterior**. La inicialización que sigue siendo necesaria permanece dentro de los pasos y del presupuesto medido.

## Método de medición final

[benchmark-startup.cjs](../tests/benchmark-startup.cjs) exige `--baseline-root` y el SHA completo esperado; comprueba checkout limpio, bytes del commit y archivos utilizados por cada worker. Cada brazo y repetición usa un proceso nuevo, ejecutado en serie. No se heredan VM, mundos, matrices ni cachés del brazo anterior. No se reinician cachés de archivos del sistema operativo ni la carga de la máquina: se registra esa limitación y se alterna AB/BA/AB.

Se separan módulos, harness, preferencias/limpieza, creación de escena, cada frame, consulta, preparación gráfica y captura final del estado. El primer snapshot completo se toma después de las ventanas frías, para que `saveLab` y sus serializadores no calienten índices. Los inventarios previos sólo leen propiedades/arrays. Relojes y bloques se copian al contexto anfitrión, conservando la corrección de retención de VM del PR #30.

`performance.now()` mide pared; `process.cpuUsage()` mide usuario+sistema del proceso y puede incluir otros hilos. Se informan ambos. Los tiempos de etapas están incluidos en el frame; no se suman al total otra vez. La preparación con stubs no mide Main de Chrome, latencia del driver, GPU, RAF ni FPS. A 240 Hz, cuatro pasos físicos comparten el presupuesto completo de 16,67 ms orientativo de un render a 60 FPS.

Los presupuestos se comprueban entre etapas y frames completos. No se corta un paso del solver para convertir una operación incompleta en muestra rápida. Se guarda la última escala completada y todo ensayo detenido. La latencia del subprocess incluye arranque de Node y serialización; se registra aparte de los tiempos del worker.

### Resultados fríos finales: cuerpos independientes

Los archivos [60 Hz](mediciones/startup-20261122/cold-60.json.gz), [120 Hz](mediciones/startup-20261122/cold-120.json.gz) y [240 Hz](mediciones/startup-20261122/cold-240.json.gz) contienen **54 parejas completas**, AB/BA/AB por configuración: seis escalas, cuatro frames por proceso, sin calentamiento y presupuesto de 20 s por ejecución. La última escala completa es 2.000 en las tres frecuencias. Entorno: Node v24.22.3, Linux x64, AMD EPYC 9V74, nueve CPU disponibles; cámara `[0,1.7,0]`, yaw/pitch cero, viewport 1280×720 simulado, sombras desactivadas. Son 432 frames completos y 1.008 pasos físicos entre ambas variantes, sin tiempo descartado.

Cada celda es **referencia→candidato**, en milisegundos; se presenta la mediana de las tres estadísticas por ejecución. Con sólo cuatro frames, p95 y p99 coinciden con el máximo según el estimador del runner: describen esa ventana, no una cola estadística estable.

| Piezas | Hz | Frame p50 | Frame máximo = p95 = p99 | Ventana de pared | CPU de la ventana |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 16 | 60 | 2,784→2,928 | 25,417→21,978 | 50,230→36,503 | 74,293→62,184 |
| 100 | 60 | 11,374→14,336 | 29,354→36,263 | 76,449→83,460 | 139,342→165,034 |
| 500 | 60 | 62,086→61,750 | 92,651→104,484 | 294,509→260,024 | 473,104→426,164 |
| 1.000 | 60 | 92,650→73,630 | 136,550→138,338 | 397,114→366,009 | 680,968→640,443 |
| 1.500 | 60 | 130,439→120,536 | 3.053,601→182,294 | 3.456,924→568,769 | 3.994,467→948,367 |
| 2.000 | 60 | 194,632→172,042 | 6.124,387→205,092 | 6.673,728→698,469 | 7.243,024→1.125,908 |
| 16 | 120 | 3,662→3,799 | 27,927→25,819 | 41,178→38,426 | 71,553→64,826 |
| 100 | 120 | 15,232→14,206 | 55,155→42,163 | 98,467→83,973 | 218,665→188,654 |
| 500 | 120 | 61,864→62,020 | 128,295→127,174 | 327,860→348,279 | 603,649→602,739 |
| 1.000 | 120 | 130,861→136,129 | 250,229→249,070 | 681,043→638,396 | 1.056,620→1.044,739 |
| 1.500 | 120 | 196,566→193,072 | 3.212,376→292,434 | 3.844,235→941,453 | 4.377,869→1.401,448 |
| 2.000 | 120 | 273,481→267,121 | 6.477,938→369,776 | 7.372,459→1.240,973 | 7.947,002→1.887,818 |
| 16 | 240 | 5,212→5,805 | 27,667→27,855 | 48,217→45,652 | 84,628→78,178 |
| 100 | 240 | 18,634→17,782 | 51,779→62,868 | 118,788→134,704 | 230,293→249,684 |
| 500 | 240 | 99,682→101,782 | 200,462→200,696 | 540,478→529,154 | 806,017→790,941 |
| 1.000 | 240 | 208,533→197,578 | 405,090→344,121 | 1.087,201→973,223 | 1.547,434→1.416,431 |
| 1.500 | 240 | 356,166→370,217 | 3.522,820→608,306 | 4.626,813→1.721,395 | 5.340,736→2.347,870 |
| 2.000 | 240 | 478,872→522,048 | 6.672,831→711,091 | 8.130,053→2.291,737 | 8.853,882→3.053,408 |

La ganancia comprobada se concentra en 1.500–2.000 cuerpos. Permanecen adversos: 100/60 empeora máximo, ventana y CPU; 100/240 también empeora máximo y ventana, y 500/120 aumenta la ventana. Los máximos de 500/60 y 1.000/60 suben aunque sus ventanas bajan. A 2.000/240 mejora el bloqueo extremo pero p50 de pared crece 478,872→522,048 ms. No se transforma cada diferencia pequeña en una mejora causal del juego.

| 2.000 piezas, Hz | Rango del máximo de pared A→B | Rango de ventana A→B | CPU por frame p50 A→B | CPU p95 = p99 A→B |
| ---: | --- | --- | ---: | ---: |
| 60 | [6.105,484;6.211,811]→[190,482;211,323] | [6.669,067;6.758,833]→[680,301;712,457] | 328,289→250,666 | 6.333,905→355,438 |
| 120 | [6.335,801;6.714,567]→[364,976;370,042] | [7.296,252;7.660,175]→[1.202,112;1.289,885] | 342,955→372,601 | 6.674,855→656,132 |
| 240 | [6.542,284;7.214,882]→[678,441;719,205] | [8.073,268;8.719,994]→[2.191,568;2.496,426] | 581,921→641,097 | 7.117,854→1.104,159 |

Los rangos son mínimo–máximo de tres repeticiones, no intervalos de confianza. Los datos conservan cada frame, percentiles de pared/CPU y etapas de todas las escalas. En las 54 parejas son exactos tanto el estado final como los inventarios y relojes de cada frame. Cada ejecución simula 1/15 s: 4, 8 o 16 pasos según 60/120/240 Hz, un ciclo lógico y descarte cero. El acumulador final es cero a 60/120 Hz y `5.204170427930421e-18` a 240 Hz, idéntico entre variantes; no es atraso de un paso. Las preferencias se seleccionaron antes de construir cuerpos.

Con 2.000 piezas quedan 2.000 grupos dinámicos, 2.006 cuerpos y formas, 2.000 despiertos, 8.000 contactos/ecuaciones de contacto, 16.000 de fricción y cero restricciones, sensores o motores. No se obtiene el ahorro durmiendo prematuramente la escena. A 120 Hz la creación cuesta 155,099→163,754 ms; primera consulta 5,161→4,630 ms; preparación del primer render 11,927→13,125 ms. El tiempo desde comienzo de escena hasta primer frame es 526,577→531,821 ms: el bloqueo corregido ocurre después. A 240 Hz el tercer paso cae en el primer frame y esa latencia baja de 6.836,056 a 879,003 ms. El tiempo completo del worker de cuatro frames, incluida creación y captura final, baja de 7.631,578 a 1.555,636 ms a 120 Hz. Las etapas no modificadas conservan su variación y se contabilizan.

### Arranque y asentamiento extendidos: 2.000 piezas, 120 Hz

El [control de 60 frames](mediciones/startup-20261122/cold-settle-120.json.gz) repite tres parejas en procesos fríos, AB/BA/AB, con presupuesto de 30 s. Completa 360 frames entre variantes, con el mismo estado final y los mismos inventarios/relojes de cada frame. Cada brazo ejecuta **120 pasos físicos, 15 ciclos lógicos y 0,9999999999999989 s simulados**, sin descarte ni acumulador pendiente. Termina con 2.006 cuerpos/formas, cero despiertos y cero contactos; conserva las 2.000 piezas.

| Medida | Mediana referencia→candidato (ms) |
| --- | ---: |
| Pared por frame p50 / p95 / p99 | 16,121→15,410 / 276,050→282,284 / 5.942,248→427,793 |
| CPU por frame p50 / p95 / p99 | 18,083→18,146 / 310,514→365,711 / 6.188,974→725,729 |
| Ventana completa de pared | **11.310,300→5.488,819** |
| CPU de la ventana | **12.240,651→6.386,471** |
| Worker completo, creación y captura incluidas | 11.590,545→5.740,842 |

Los máximos de pared por ejecución varían de [5.894,948;6.253,454] a [413,135;441,166] ms; las ventanas, de [11.206,892;11.339,466] a [5.352,491;5.890,698] ms. El p95 de pared y el p95 de CPU empeoran: el pico extremo disminuye sin eliminar el coste del asentamiento ordinario. Los percentiles combinan arranque y reposo de una ventana de un segundo simulado; no son una medida estacionaria. La reducción de la ventana larga descarta que el ahorro de los cuatro primeros frames sea sólo trabajo aplazado a los 56 siguientes.

### Controles fríos: soldados, articulaciones y fábrica

Los controles de [120 Hz](mediciones/startup-20261122/controls-120.json.gz) abarcan 100/500/2.000 piezas en cuatro familias; los de [60 Hz](mediciones/startup-20261122/controls-60.json.gz) y [240 Hz](mediciones/startup-20261122/controls-240.json.gz), 2.000 piezas en las mismas familias. Son **20 configuraciones, 60 parejas completas AB/BA/AB**, cuatro frames y presupuesto de 20 s, con estado final e inventarios/relojes por frame exactamente iguales. Todas alcanzan la última escala prevista. Cada brazo conserva 1/15 s simulado, 4/8/16 pasos, un ciclo lógico y descarte cero. Las preferencias preceden a la creación de articulaciones; los motores permanecen activos.

Resultados a 2.000 piezas, mediana de tres ejecuciones, milisegundos referencia→candidato:

| Familia | Hz | Máximo de frame | Ventana de pared | CPU de ventana |
| --- | ---: | ---: | ---: | ---: |
| Soldados | 60 | 24,072→21,839 | 46,086→42,794 | 66,486→61,923 |
| Soldados | 120 | 28,410→27,785 | 64,227→65,377 | 110,609→113,163 |
| Soldados | 240 | 36,706→39,170 | 84,776→93,012 | 171,728→187,992 |
| Pocos brazos articulados | 60 | 105,616→103,642 | 132,945→131,135 | 209,538→210,926 |
| Pocos brazos articulados | 120 | 111,445→131,008 | 148,177→169,032 | 229,983→253,078 |
| Pocos brazos articulados | 240 | 118,581→117,588 | 181,425→180,732 | 286,146→291,254 |
| Muchos mecanismos pequeños | 60 | 42,822→39,373 | 105,281→101,197 | 167,697→166,439 |
| Muchos mecanismos pequeños | 120 | 59,422→58,133 | 156,035→153,610 | 313,253→251,319 |
| Muchos mecanismos pequeños | 240 | 88,824→98,523 | 242,752→251,653 | 371,817→458,043 |
| Fábrica | 60 | 70,277→66,863 | 140,011→130,374 | 274,035→260,876 |
| Fábrica | 120 | 95,868→86,557 | 174,063→157,923 | 327,900→315,742 |
| Fábrica | 240 | 119,129→106,352 | 208,693→193,202 | 371,650→356,480 |

Inventario final a 2.000 piezas y 120 Hz, idéntico entre variantes. Contactos equivale aquí al número de ecuaciones de contacto; se muestran las demás ecuaciones por separado.

| Familia | Grupos / cuerpos / formas | Restricciones | Despiertos | Contactos / fricción / ecuaciones de restricción | Sensores / motores activos |
| --- | --- | ---: | ---: | --- | --- |
| Soldados | 4 / 10 / 10 | 0 | 4 | 16 / 32 / 0 | 0 / 0 |
| Pocos brazos | 20 / 26 / 62 | 32 | 16 | 0 / 0 / 96 | 0 / 16 |
| Muchos mecanismos | 129 / 135 / 136 | 64 | 129 | 8 / 16 / 384 | 0 / 64 |
| Fábrica | 114 / 108 / 180 | 0 | 98 | 110 / 220 / 0 | 0 / 12 |

Los brazos comienzan con 16 restricciones y terminan con 32 en ambas variantes; la fábrica incluye 12 grupos virtuales. No se sustituyen esos inventarios por los del escenario independiente. La ventana fría de fábrica conserva sus motores y estado, pero sus cuatro frames no demuestran por sí solos entregas sostenidas: la verificación de producción tiene su ensayo separado.

Hay resultados desfavorables que permanecen: pocos brazos/2.000/120 aumenta ventana, máximo y CPU; su rango de ventana es [147,116;156,699]→[157,035;172,325] ms. Soldados/2.000/240 pasa de [82,369;91,834] a [87,847;94,128] ms, y muchos mecanismos/240 de [235,254;263,242] a [234,928;317,523]. A 120 Hz, soldados/500 sube ventana 56,603→59,483 ms; pocos brazos/100, 67,704→68,996; muchos mecanismos/100, 70,735→72,065. Las otras escalas y sus percentiles/rangos completos se conservan en los JSON. Ningún control muestra el congelamiento de varios segundos de los independientes grandes.

A 2.000/120, la primera consulta de soldados cuesta 2,445→2,557 ms; la de brazos, 13,383→17,461; muchos mecanismos, 2,836→2,757; fábrica, 13,571→13,487. La creación de brazos también varía 109,408→124,218 ms y no se modificó. Estos controles separan la consulta fría del pico físico; no demuestran que todos los BVH o consultas de colocación sean baratos en cualquier chasis o cámara.

### Corrección del instrumento: `world.time`

El primer intento del nuevo runner falló en `Cannon time agrees`. El [artefacto fallido](mediciones/startup-20261122/exploratory-prelength.json.gz) permanece en la evidencia junto con la [corrección](mediciones/startup-20261122/instrument-correction.json.gz). El Cannon 0.6.2 incluido incrementa `world.time` en `internalStep(dt)` y de nuevo en `World.step(dt)` cuando se usa el paso explícito del juego. Tres llamadas a `step(1/120)` dejan ese contador en 0,05 s.

El instrumento esperaba erróneamente que ese contador fuera el tiempo físico transcurrido. Se corrigió la aserción **simétricamente para ambas variantes**, conservando el contador nativo y comprobando su incremento doble. El tiempo simulado se acredita con `simTime`, pasos del juego, `world.stepnumber` y `dt` seleccionado, más acumuladores y descarte. No se cambió el juego para corregir este reloj histórico ni se cuenta la corrección del benchmark como mejora de rendimiento.

La anomalía histórica de `moodClockRange` tampoco se usa como prueba de tiempo simulado. La igualdad de contadores físicos y el estado completo se verifican por separado.

### Corrección del instrumento: activación de brazos

El [primer control](mediciones/startup-20261122/exploratory-controls-arm-failure.json.gz) intentó activar manualmente articulaciones internas de brazos, operación que el juego rechaza. Se conserva el fallo como error del fixture utilizado por el runner, no como regresión del candidato, junto con sus nueve configuraciones/27 parejas terminadas como exploración. La corrección crea el mismo fixture sin activar joints directamente y llama a `startRobotArm` con sus poses y energía existentes, dentro de creación de escena y simétricamente en ambas fuentes. La [comprobación sin pasos](mediciones/startup-20261122/instrument-arm-start-check.json.gz) conserva energía y poses en 100/2.000 piezas y activa 12/16 motores en tres/cuatro brazos.

No cambia `game.js` ni el fixture compartido. Los cuatro ensayos de independientes anteriores identifican el runner `4f39e835035d4531468bd64256c8edbb8887c1f40a04916187ee70fab7912b71`; el runner corregido es `8965b491cd2f146928f06c74bbf8ca954c6659d720fe28e2dfa10e7afa062562`. El commit local de herramienta `92192345317b06bca0c31f1a5860ecc1783c31a1` y el publicado `6dfc50c62dcf83a0cb20fa586f11e82d94a89ee6` comparten exactamente el árbol `46fcc530109139d871dfba962e21984e56f60923`; el SHA de `game.js` sigue siendo `847e7b1f…`. Se archivan runner previo y parche y se repiten completos los controles afectados; el camino de independientes no se modifica.

## Conservación y verificaciones

Las [19 regresiones dirigidas](mediciones/startup-20261122/matrix-regressions.txt.gz) pasan: incluyen las tres añadidas para crecimiento lejano verdadero/falso después de un prefijo inicializado, huecos, truncado/recrecimiento, propiedades fraccionarias fuera de longitud y el límite no indexado. Se conserva el objeto del backing array y el historial de ambas matrices. El oráculo sigue siendo el prototipo nativo intacto de Cannon. La misma batería cubre impacto/despertar, agarre, sensores de contacto/peso, restauración, unión/separación y sus índices.

El [resumen de validación](mediciones/startup-20261122/validation-summary.json) fija fuentes y hashes de logs. Las cargas se ejecutaron en serie sobre las fuentes correspondientes:

| Verificación | Referencia `4fc563c` | Candidato final |
| --- | --- | --- |
| `node --test tests/*.test.cjs` | [1.258/1.258](mediciones/startup-20261122/tests-baseline.txt.gz) | [1.261/1.261](mediciones/startup-20261122/tests-final.txt.gz) |
| `node tests/benchmark-architecture-audit.cjs` | [21 casos](mediciones/startup-20261122/architecture-baseline.json.gz) | [21 casos idénticos](mediciones/startup-20261122/architecture-final.json.gz) |
| `node tests/benchmark-ground-contacts.cjs` | [36 casos](mediciones/startup-20261122/ground-baseline.json.gz) | [36 casos idénticos](mediciones/startup-20261122/ground-final.json.gz) |

Ambas suites tienen cero fallos, cancelaciones y omisiones. Los 21 resultados de arquitectura y los 36 de suelo se comparan como objetos completos, excluyendo **únicamente `sourceSha256`**, que debe identificar fuentes distintas; no se introduce tolerancia física. Arquitectura conserva resultados y contadores de apuntado, guía, sensores, contactos, baterías, render y guardados. En suelo se observan contactos en los 36 casos, todos terminan en reposo, la deriva final es cero y todas las velocidades finales son cero; materia y masa permanecen iguales. La penetración máxima registrada es `0.0010000000000000286` m en ambas fuentes.

La suite integrada cubre transporte de cargas, frenos, consumo, activaciones, límites de torque, guardados/campaña, pausa, menús y pestaña oculta, junto con los casos de matriz y sensores. Sus tiempos de ejecución, 57.790,475 ms y 59.006,799 ms, son duración de pruebas y no rendimiento de una partida. La igualdad funcional de producción y cámaras se verifica además con el A/B determinista descrito a continuación.

### Producción y cambios de cámara

Las [13 equivalencias funcionales](mediciones/startup-20261122/equivalence.json.gz) comparan el estado serializado completo del fixture **sin tolerancia**: guardado, producción y su ledger, cuerpos/poses/velocidades/fuerzas/torques/sueño, motores, cintas, contactos y relojes. Todas son exactamente iguales a `4fc563c` a su misma frecuencia. Los siguientes valores de referencia y candidato coinciden; se muestran los decimales guardados, sin convertir diferencias entre frecuencias en diferencias del PR.

| Escena | Hz | RPM | Entregas | Pasos físicos | Tiempo simulado (s) | Energía (J) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Producción 19 | 60 | 30 | 3 | 998 | 16.63333333333367 | 6.817645088763965 |
| Producción 19 | 120 | 30 | 3 | 1.990 | 16.583333333333034 | 6.944895769114267 |
| Producción 19 | 240 | 30 | 3 | 4.100 | 17.083333333332686 | 7.192279863772938 |
| Producción 20 | 60 | 30 | 6 | 2.404 | 40.066666666665675 | 26.802111115832393 |
| Producción 20 | 120 | 30 | 6 | 4.798 | 39.98333333333171 | 26.857198331867053 |
| Producción 20 | 240 | 30 | 6 | 9.584 | 39.93333333333815 | 26.89071834976957 |
| Producción 20, control 29 RPM | 60 | 29 | 6 | 2.486 | 41.433333333332264 | 26.974303756047398 |

Los siete pedidos terminan completos, sin fallo y con materia conservada; descarte cero. Cada final conserva tres piezas/grupos, 52 cuerpos/formas, una restricción con seis ecuaciones, dos cuerpos despiertos y el motor detenido tras completar. Los contactos finales son 0/2/4 según el caso, exactamente iguales entre variantes; no se exige igualdad de estados entre distintas frecuencias físicas.

Los otros seis casos ejecutan fábrica con cambios de cámara a 60/120/240 Hz. El control regular completa 180 frames y 180/360/720 pasos en aproximadamente tres segundos simulados, con nueve motores activos. El control de frames retrasados solicita 3,316666666666661 s y ejecuta 184/368/736 pasos, aproximadamente 3,066667 s: **descarta los mismos 0,25 s en ambas variantes**, conservando estado, energía y acumuladores. Se registra ese descarte deliberado de estrés; no se usa para justificar un ahorro de CPU ni se omite la producción fuera de cámara.

### Navegador

Durante este mismo trabajo, al validar el PR #31, Chromium falló **antes de cargar el juego** con `socket() failed: Operation not permitted`; el [log original](mediciones/contact-matrix-20261122/browser-probe.log.gz) permanece como evidencia. No se presenta como un nuevo intento del PR2. Se completan las mediciones de lógica/Cannon y asignaciones con Node; Main de Chrome, interacciones visuales, RAF, FPS y GPU siguen sin medir en este entorno. Los stubs gráficos no sustituyen esa validación.

La corrección no cambia IDs, masas, geometría, huecos materiales, conexiones, pares de SAP, contactos, restitución, solver, velocidades, energía, torque ni orden de ejecución. Las pruebas de esas rutas son necesarias porque el crecimiento ocurre dentro del procesamiento de contactos, aunque la modificación productiva sea pequeña.

## Pendientes que siguen separados

El pico de varios segundos y el coste ordinario de los primeros pasos no son equivalentes. Después de la corrección aún hay cientos de milisegundos por frame con miles de cuerpos despiertos y 24.000 ecuaciones. El solver, narrowphase, creación y otras fases conservan trabajo real; no se afirma que la escena arranque con respuesta de 60 FPS.

El primer BVH de selección de un grupo grande, la construcción de bounds locales y las consultas de colocación requieren condiciones frías propias. La demostración para independientes no resuelve automáticamente esos costes. Captura/hidratación de guardados, numerosos mecanismos activos y sombras siguen siendo problemas independientes cuya prioridad depende de mediciones específicas.

No se introduce un scheduler de preparación, física parcial, workers, nuevo motor, bundler ni formato de guardado. La disponibilidad de consultas y mecanismos conserva el mismo punto temporal. Los datos finales muestran tanto la reducción confirmada como los costes residuales y casos desfavorables.

## Reproducción y evidencia

El [README de mediciones](mediciones/startup-20261122/README.md) describe el orden serial y los instrumentos; [commands.json](mediciones/startup-20261122/commands.json) y [additional-commands.json](mediciones/startup-20261122/additional-commands.json) conservan los comandos exactos con `--baseline-root` explícito. El SHA de referencia es siempre `4fc563cc8d27e653129fc11a14524a7cfc626a5e`; los runners y fuentes efectivos quedan identificados en cada archivo, incluidos los instrumentos anteriores a las correcciones.

Las [tablas completas](mediciones/startup-20261122/RESULTADOS.md) y el [agregado](mediciones/startup-20261122/aggregate.json.gz) separan 296 parejas de tiempos ejecutadas, **294 certificadas y dos de una configuración incompleta sin certificación de estado**, 13 equivalencias funcionales y cuatro parejas de conteos. Los perfiles, las exploraciones y ambos fallos de instrumento permanecen aparte. El [manifiesto](mediciones/startup-20261122/manifest.json) y [verificar.py](mediciones/startup-20261122/verificar.py) permiten comprobar los bytes y hashes de los originales comprimidos; no se eliminan resultados desfavorables para producir las tablas.

## Fuentes primarias

- [Cannon 0.6.2 distribuido](../assets/js/cannon.min.js): `ArrayCollisionMatrix`, `World.addBody`, `collisionMatrixTick`, escrituras/lecturas de contactos, `GSSolver` y doble incremento de `world.time`. Es el oráculo ejecutable, sin modificación.
- [Juego](../assets/js/game.js) y [harness](../tests/game-harness.cjs): contrato de las matrices, orden de pasos, consultas y preparación gráfica; DOM/GPU simulados diferenciados de navegador.
- [ECMAScript: Array `[[DefineOwnProperty]]`](https://tc39.es/ecma262/#sec-array-exotic-objects-defineownproperty-p-desc) y [tipo Object/índices](https://tc39.es/ecma262/#sec-object-type): actualización automática de longitud y límite de índices de array.
- [MDN: Array.length](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/length): crecer introduce huecos y no valores explícitos; reducir trunca entradas.
- [V8: Fast properties](https://v8.dev/blog/fast-properties): representaciones fast/dictionary y arrays dispersos. Contexto del motor, no demostración de la secuencia interna de esta captura.
- [MDN: performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) y [Node: process.cpuUsage](https://nodejs.org/api/process.html#processcpuusagepreviousvalue): pared monotónica y CPU de proceso como magnitudes diferentes.
