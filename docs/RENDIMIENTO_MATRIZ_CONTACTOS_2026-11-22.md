# Matriz de contactos: limpieza registrada con respaldo nativo

Fecha: 22 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

Informe preparado para publicación del primer PR de continuación del #30. El cambio reduce la limpieza repetida de matrices grandes con pocas escrituras, conservando el oráculo Cannon 0.6.2. En el perfil de 1.500 piezas/240 Hz, la media del bloque por fotograma sintético pasa de **5,007190 a 0,009595 ms**; el trabajo integrado parcial pasa de **26,529303 a 17,280597 ms p50**. No son FPS ni un ahorro uniforme de todos los escenarios.

La fuente final supera **1.258/1.258 pruebas** y conserva estados completos, contactos, entregas, energía y tiempo en los ensayos comparados. Permanecen controles pequeños y de alta densidad desfavorables, crecimiento frío costoso y una escala incompleta de 2.000/240. El código publicado tiene el mismo árbol que el probado; este informe no atribuye todavía publicación de PR ni integración en `main`.

## Alcance y causa comprobada

La referencia es `1465a6c12160432c5df52b35d782c2f2527720cf`, merge del PR #30. Ese bloque redujo visitas de SAP entre cuerpos pasivos, conservando las parejas admitidas y su orden. En el código distribuido, `World.collisionMatrixTick` intercambia las matrices actual y anterior y llama a `reset()` sobre la nueva actual. `ArrayCollisionMatrix.reset` escribe cero en cada posición hasta `matrix.length`, incluso cuando todas las entradas ya son cero y no existe ningún contacto.

El trabajo nativo de limpieza depende de la longitud del array, aproximadamente cuadrática en cuerpos, y no de las entradas modificadas. Una matriz cuya longitud nominal corresponde a 2.006 cuerpos contiene 2.011.015 posiciones. El método no usa la actividad, el sueño ni la cantidad de contactos para reducir ese recorrido. La causa del trabajo repetido se comprueba directamente en [el Cannon incluido](../assets/js/cannon.min.js); el diagnóstico fresco de esta entrega observa entre **2,125671 y 16,992066 ms por fotograma instrumentado** en seis mundos de la misma referencia, con 2.000 piezas, 2.006 cuerpos y cero despiertos/contactos. Las dos etiquetas del control apuntan explícitamente al mismo checkout `1465a6c`: no son un A/B del candidato. Se conserva [el diagnóstico completo](mediciones/contact-matrix-20261122/reference-diagnostic-2000-60.json.gz).

El [informe anterior de SAP](RENDIMIENTO_SAP_2026-11-22.md) registró unos 4,93 ms por fotograma sintético para ese bloque en 1.500 piezas a 240 Hz y regímenes de 2–16 ms por paso en 2.000 piezas a 60 Hz. Son antecedentes, no resultados nuevos. Los puntos observados entonces tenían arrays `fast-holey`; no se demostró una transición a `dictionary`, ni una causa interna concreta de V8 para la dispersión. Este PR reduce el recorrido identificado sin presentar esa hipótesis histórica como explicación confirmada.

El cambio se instala sobre las dos instancias pertenecientes al mundo del juego mediante `installTrackedCollisionMatrices`, en [game.js](../assets/js/game.js). Conserva el archivo distribuido de Cannon y su prototipo como oráculo ejecutable. No modifica SAP, narrowphase, solver, paso atómico, frecuencias, geometría, masas, energía, motores, sensores ni producción. Las optimizaciones anteriores de apuntado, Ctrl, sensores, baterías, guardado, Producción 20 y contornos se mantienen como antecedentes y no se contabilizan otra vez.

## Identidad de las fuentes y resultados

| Elemento | Identidad |
| --- | --- |
| Referencia `main` | `1465a6c12160432c5df52b35d782c2f2527720cf` |
| Árbol de referencia | `48be0131e9eb676bfa8c88db403b454f610789bb` |
| SHA-256 de `game.js` de referencia | `84bfc37c0661329ffa2cba69f22e50d2256e35944fad556778926a1fa632be0c` |
| Commit local del código medido | `5405c35c764ade4d6bea6788b8daa85d61a78962` |
| Árbol del código medido | `def1dc62430b726c9c522be2421739551f6c94a3` |
| Commit de código publicado | `b4b49949cef2e455e92949e1ad65d5d7b85656d9` |
| SHA-256 de `game.js` medido | `c77f65c197f80f340f7f390a8d72155601589fb500bbb1014c0cbee3a3b97b4c` |
| Versión de carga | `20261122-contact-matrix-1` |

El commit local y el publicado tienen exactamente el árbol `def1dc62430b726c9c522be2421739551f6c94a3`; difieren los metadatos del commit. La documentación posterior no modifica el código medido. Los runners pasan explícitamente la referencia y comprueban commit/hashes; los [comandos](mediciones/contact-matrix-20261122/commands.json) y el [agregado](mediciones/contact-matrix-20261122/aggregate.json.gz) permiten contrastar fuentes y reconstruir las [tablas completas](mediciones/contact-matrix-20261122/RESULTADOS.md).

## Simulación continua: resultados y variación

Mediana de los estadísticos de tres pares AB/BA/AB; milisegundos por fotograma sintético parcial de Node. Las ventanas normales conservan exactamente estados y relojes, sin descarte.

| Piezas / Hz | Pared p50 A → B | Pared p95 A → B | Pared p99 A → B | CPU proceso media A → B |
| --- | ---: | ---: | ---: | ---: |
| 500 / 60 | 4,111662 → 3,171303 | 4,946876 → 3,606942 | 6,077650 → 3,785167 | 4,973833 → 4,013600 |
| 1.000 / 120 | 14,808558 → 8,297113 | 16,212347 → 13,379468 | 17,559226 → 13,932213 | 16,410233 → 11,036133 |
| 1.500 / 120 | 29,005094 → 10,908051 | 32,162104 → 12,216769 | 33,776959 → 17,995898 | 29,365667 → 11,561900 |
| 1.500 / 240 | 26,529303 → 17,280597 | 29,337764 → 18,400237 | 34,104421 → 19,470448 | 26,628000 → 17,450333 |
| 2.000 / 60 | 27,147965 → 9,808575 | 29,836056 → 11,750797 | 30,393216 → 13,300674 | 27,422767 → 10,661500 |
| 2.000 / 120 | 20,415678 → 15,379404 | 35,643882 → 19,723126 | 60,749292 → 22,344738 | 21,904733 → 16,137100 |

En 1.500/240 el rango p50 entre repeticiones es **24,151247–59,971558 → 16,608830–17,304234 ms**; en 2.000/60, **13,538259–27,201995 → 9,466525–10,533254 ms**. El candidato conserva un máximo de **62,020414 ms** en 2.000/60, frente a 31,936145 ms de referencia, aunque mejoren sus medianas p95/p99. No se recorta ese pico ni se atribuye a GC/JIT sin traza.

**2.000/240 no tiene comparación completa:** la referencia agotó 20 s al terminar 60 frames de calentamiento, con 20.013,341787 ms de caso, 240 pasos, aproximadamente 1 s simulado y descarte cero. Última escala completa: 1.500. Los 17 casos independientes completos mantienen cuerpos/formas, restricciones, actividad y estados. Los [datos a 60](mediciones/contact-matrix-20261122/settled-60.json.gz), [120](mediciones/contact-matrix-20261122/settled-120.json.gz) y [240 Hz](mediciones/contact-matrix-20261122/settled-240.json.gz) conservan cada muestra y la parada.

### Controles desfavorables

El control corto 16/120 empeora p50 **0,289150→0,412183**, p99 **0,599002→3,926257** y CPU **0,609967→0,864033 ms**. El [seguimiento largo](mediciones/contact-matrix-20261122/control-long-120.json.gz), 180+180 frames, también empeora p50 **0,221670→0,277042**, pero mejora p95 **0,497581→0,438142** y p99 **1,024886→0,482148**; CPU casi igual **0,496739→0,497222**. Su rango p50 es **0,215901–0,257454→0,213508–0,414528**. No elimina el resultado corto ni certifica ausencia de sobrecoste pequeño. En 100/120 las tres parejas empeoran p50; mediana **1,052548→1,077424 ms**.

Los [controles por estructura](mediciones/contact-matrix-20261122/controls-120.json.gz) conservan 12 estados exactos, pero no demuestran mejora general con pocos cuerpos. Soldados/2.000: p50 **3,905324→4,089639**; muchos mecanismos/500: **21,328504→21,763884**; fábrica/2.000: **15,627226→15,432657**, pero p99 **18,617488→37,802731** y CPU **19,264933→21,398433**. El fixture de mecanismos llega a 135 cuerpos, 64 restricciones y 64 motores activos; no son 2.000 mecanismos. Los soldados tienen 10 cuerpos; pocos brazos, 21–26; fábrica, 13–108. Esos controles siguen usando el reset pequeño nativo, con sobrecoste del wrapper y variación del entorno.

### Atribución separada del coste de matriz

| Perfil integrado | Media inclusiva de matriz A → B | Rango de las medias A → B |
| --- | ---: | ---: |
| 2.000 / 60 Hz | 2,193505 → 0,003358 ms/frame | 2,139628–8,065979 → 0,003085–0,003903 |
| 1.500 / 240 Hz | 5,007190 → 0,009595 ms/frame | 4,833066–5,034909 → 0,006659–0,010271 |

Ambos [diagnósticos](mediciones/contact-matrix-20261122/diagnostic-2000-60.json.gz), incluido el de [240 Hz](mediciones/contact-matrix-20261122/diagnostic-1500-240.json.gz), mantienen estados iniciales/calientes/finales, pasos de juego/Cannon y longitudes de las dos matrices. En la referencia 3 de 2.000/60, p95 de matriz alcanza **23,670088 ms**. No se inspeccionó representación V8 en estos ensayos. Los temporizadores son inclusivos y se ejecutaron fuera de las medidas principales; matriz y SAP ya están contenidos en `world.step`.

## Operaciones de matriz, conteos y coste frío

El [microbenchmark final](mediciones/contact-matrix-20261122/matrix-operations.json.gz) incluye consultas, escrituras, registro y limpieza dentro de cada ronda; `churn` añade retiradas, altas y resize. Escalas de 22, 106, 506, 1.006, 1.506 y 2.006 **cuerpos**, sin formas ni pasos físicos. `dormant` significa matrices previamente usadas y ahora vacías; no es una prueba de sueño físico. Medianas entre tres repeticiones, ms/ronda:

| Caso / cuerpos | Pared p50 A → B | Pared p95 A → B | CPU proceso media A → B |
| --- | ---: | ---: | ---: |
| dormant / 2.006 | 16,054824 → 0,000601 | 16,847843 → 0,000982 | 15,738033 → 0,002267 |
| sparse / 2.006 | 15,528419 → 0,590339 | 16,923876 → 0,649067 | 15,927700 → 0,637867 |
| repeated / 2.006 | 16,268696 → 1,551469 | 16,991782 → 1,646922 | 15,972200 → 1,554367 |
| dense / 2.006 | 93,667731 → 94,118563 | 106,753206 → 99,450519 | 94,880200 → 94,644300 |
| churn / 506 | 0,085287 → 0,160629 | 0,108661 → 0,225846 | 0,196000 → 0,331433 |
| churn / 2.006 | 1,113018 → 0,638371 | 1,223693 → 0,722186 | 1,158633 → 0,783433 |

La ruta densa final evita la penalización extrema del candidato inicial, pero empeora p50 en las tres parejas de 2.006 cuerpos. En 506 cuerpos densos, p50 **6,061195→6,147003** y p95 **7,044549→9,440507** tampoco mejoran. Se conservan esos costes y los controles pequeños adversos; el beneficio escaso no implica mejora de todo régimen.

Los [conteos calientes separados](mediciones/contact-matrix-20261122/matrix-warm-counts.json.gz) muestran, para dos rondas sparse/2.006, escrituras numéricas **4.026.045→8.024** y lecturas **8.020→12.030**, con las mismas 8.020 consultas y 4.010 llamadas a `set`. Cada reset pasa de recorrer 2.011.017/2.011.018 posiciones a escribir 2.007: 2.005 entradas registradas y dos nuevas posiciones del sufijo. En repeated conserva 16.040 `set`, escribe **4.038.075→20.054** veces y lee **8.020→24.060**. En churn conserva 32 resize; las escrituras pasan a 24.053 porque debe inicializar de nuevo el sufijo truncado y recreado. No se omite ese mantenimiento.

Los [conteos sin calentamiento](mediciones/contact-matrix-20261122/matrix-counts.json.gz) conservan los dos primeros resets grandes completos, con igual número de escrituras. En dormant/2.006, el priming escribe **6.033.047→4.022.033** veces, y sólo después cada reset caliente pasa de 2.011.015 escrituras a cero. El resize conserva 2.006 escrituras a `length`, pero añade lecturas de longitud **0→6.018**. El [conteo denso](mediciones/contact-matrix-20261122/matrix-dense-counts.json.gz) completa 22/506 cuerpos; no extrapola sus Proxies al coste de una carga densa mayor.

La inicialización fría sigue siendo costosa. En dormant/2.006, crecimiento pared **33,145145→33,468658 ms**, CPU **46,469→52,902**; priming pared **142,412144→165,560742**, CPU **144,452→168,114**. El priming optimizado varía **141,638977–229,369586 ms**. Sparse/2.006 registra crecimiento **33,158196→97,343973**, mientras churn/2.006 registra **109,007175→34,252962**. Son una observación por repetición, no un diagnóstico causal de GC/JIT. Cada repetición recrea mundo y matrices; los costes de crecimiento, priming y primera ronda están separados del tramo caliente. Este PR no certifica una mejora del arranque completo.

## Contrato nativo que se conserva

Esta sección procede de la inspección del archivo 0.6.2 ejecutado por el juego, contrastado con los métodos nativos. No presupone el comportamiento de versiones posteriores de Cannon.

| Operación | Resultado observable del código distribuido |
| --- | --- |
| `get(a,b)` | Ordena `i >= j` y lee `matrix[(i*(i+1)>>1)+j-1]`. Puede devolver `undefined`, cero o uno. |
| `set(a,b,value)` | Usa esa misma dirección y escribe `value ? 1 : 0`. Una escritura puede extender la longitud del array. |
| `reset()` | Escribe cero en los índices enteros de cero a `length-1`. Convierte huecos en entradas propias; no borra propiedades negativas o fraccionarias. |
| `setNumObjects(n)` | Asigna `matrix.length = n*(n-1)>>1`. Crecer introduce huecos; reducir elimina las entradas truncadas. |
| `collisionMatrixTick()` | Intercambia las instancias actual/anterior y limpia la nueva actual. |
| `addBody` | Asigna el índice del nuevo cuerpo al final y redimensiona sólo la matriz actual. |
| `removeBody` | Retira el cuerpo, reindexa los restantes y redimensiona sólo la actual. No remapea las entradas conservadas ni limpia la anterior. |

La fórmula de dirección difiere de la fórmula de longitud. Con tres cuerpos, el resize deja longitud tres, pero escribir la pareja de índices `(2,1)` ocupa el índice tres y extiende la longitud a cuatro. Se conserva esa peculiaridad; corregirla en este PR alteraría el oráculo. Tampoco se transforma anticipadamente una lectura `undefined` en cero: crecer no equivale a resetear.

Los cuerpos del mundo tienen índices enteros válidos. Se preservan además las propiedades no indexadas que permite escribir la API nativa: la pareja `(0,0)` usa la propiedad `"-1"` y un índice fraccionario puede producir una propiedad como `"2.5"`. Ninguna se registra para limpieza porque el reset nativo tampoco las visita.

### Contacto actual, anterior y eventos

En `World.internalStep`, Cannon escribe la matriz actual y después consulta la anterior para decidir si emite `collide`. La distribución incluida no utiliza `beginContact`, `endContact` ni `OverlapKeeper`. Para una pareja nueva puede emitir varios eventos, uno por cada ecuación de contacto y por cada cuerpo, manteniendo el orden de esas ecuaciones. El cambio no deduplica esos eventos.

La persistencia, separación y contacto posterior dependen de conservar ambas matrices y el instante del intercambio. Las parejas dormidas pueden dejar de generar contactos y, al despertar, volver a producir eventos conforme al comportamiento original. Tampoco se corrige el historial que resulta de reindexar cuerpos después de una retirada: se reproduce exactamente el resultado nativo.

El consumidor de `collide` identificado en el juego es `onSpeechCollision`, instalado por `registerSpeechGroup`; mantiene sus propios umbrales y cooldown. Los sensores de contacto/peso, las cintas y los apoyos mecánicos consultan `world.contacts`, no estas matrices. Sus resultados siguen requiriendo pruebas de conservación porque comparten el mismo paso físico. Las rutas de retirada, soldadura, separación y restauración siguen usando las operaciones nativas del mundo.

## Algoritmo aplicado

Cada matriz conserva su array original y datos privados de seguimiento: un `Set` de índices modificados, la longitud del prefijo inicializado y el estado que exige un reset completo. La instalación ocurre inmediatamente después de construir el mundo, cuando ambas matrices están vacías y antes de añadir cuerpos. `get()` y `World.collisionMatrixTick()` permanecen nativos; los métodos se sustituyen sólo en esas dos instancias.

### Escrituras y selección de ruta

`set` mantiene la fórmula y la conversión de verdad nativas. En la ruta de seguimiento registra un índice únicamente cuando se va a escribir uno, el índice es un elemento válido de array y el valor anterior no era ya uno. Varias ecuaciones de la misma pareja no aumentan el registro. El Set conserva una sola entrada incluso en la secuencia `true → false → true`.

La ruta de seguimiento utiliza un límite `max(32, min(4096, length >>> 7))`, recalculado después de reset o resize. Si una inserción supera ese límite, limpia el registro y marca la matriz para reset completo. Las escrituras restantes de ese intervalo dejan de consultar y alimentar el Set. La activación del respaldo ocurre durante la escritura que supera el límite, por lo que puede existir transitoriamente una entrada más que el límite.

Arrays menores de 32.768 posiciones mantienen el reset nativo: en el control pequeño, registrar contactos escasos podía costar más que barrer el array. El intervalo inicial también comienza con reset completo. Al crecer desde una escena pequeña se mantiene esa decisión hasta ejecutar el siguiente reset; no se omite la inicialización pendiente.

Los umbrales proceden de contrastes medidos. El [Set sin respaldo](mediciones/contact-matrix-20261122/exploratory-set-only.json.gz) empeoró dense/2.006 de **101,596269 a 567,560714 ms p50**. El [respaldo inicial 1/32](mediciones/contact-matrix-20261122/exploratory-bounded-set.json.gz) lo acotó a **93,429088→96,201477**, pero sparse/106 empeoró **0,026810→0,049294**, mientras sparse/506 mejoró **1,086197→0,146408**. Ese contraste motivó la ruta nativa menor de 32.768 y un registro más corto, 1/128, para el candidato final. No establece un óptimo universal. Los hashes y patches de esos candidatos permanecen separados: sus ventanas de 4+10 rondas no se mezclan con las 8+30 finales.

### Limpieza y crecimiento

Si está marcado el reset completo, se llama al método nativo guardado. En caso contrario se escriben ceros sólo en los índices registrados que aún estén dentro de la longitud actual y en el sufijo que creció después de la última inicialización. Al terminar se vacía el Set, se actualiza la longitud inicializada y se elige la ruta del siguiente intervalo según el tamaño actual.

`setNumObjects` sigue llamando al resize original. Después reduce la frontera inicializada cuando corresponde y recalcula el límite auxiliar. Si el array entra en la ruta pequeña, elimina el registro y exige un reset completo. Ese flag no se retira antes de ejecutar la limpieza completa, de modo que perder el registro no pierde ninguna limpieza pendiente.

Hay dos motivos independientes para escribir ceros: borrar contactos registrados y convertir en ceros los huecos que el nativo visitaría durante reset. Conservar el segundo trabajo es necesario para igualar el array observable. El crecimiento frío no se presenta como gratuito: se siguen inicializando las posiciones nuevas cuando corresponde.

### Invariantes de conservación

1. Después de reset, el prefijo inicializado contiene ceros. Cada escritura posterior de uno queda registrada o sucede con el flag de reset completo activo.
2. Un resize que reduce el array también reduce la frontera inicializada. Si después vuelve a crecer, los huecos nuevos se mantienen hasta reset y entonces se rellenan.
3. Un índice registrado que quedó fuera de la longitud actual se omite. Volver a escribirlo durante limpieza extendería erróneamente un array truncado.
4. Si se descarta el registro por densidad o por tamaño pequeño, el siguiente reset es completo. Sólo después puede reactivarse el seguimiento.
5. Los datos privados pertenecen a cada instancia de matriz. El intercambio nativo transporta conjuntamente array e historial de limpieza; no mezcla la matriz actual con la anterior.

No se usa una caché de estado de cuerpos, contactos o eventos. Cambiar la topología no requiere remapear el Set: éste contiene direcciones numéricas del array, exactamente las mismas que necesita limpiar el método original.

## Complejidad y mantenimiento

Sea `L` la longitud actual del array, `Q` la cantidad de consultas, `W` la cantidad de llamadas a `set` del intervalo, `U` la cantidad de índices distintos registrados y `G` la longitud del sufijo aún no inicializado. `L` depende aproximadamente del cuadrado del número de cuerpos, no del número de piezas soldadas dentro de cada cuerpo.

| Operación o régimen | Trabajo relevante |
| --- | --- |
| `get` | Lectura nativa constante; no consulta el Set. |
| Escritura con seguimiento | Dirección y escritura nativas, una lectura adicional cuando corresponde y posible inserción en Set. Coste esperado amortizado constante por llamada en el runtime usado. |
| Reset grande y escaso | O(U + G); con capacidad estable y ninguna entrada registrada, no recorre el array. |
| Intervalo grande y escaso completo | O(Q + W + U + G), incluyendo registro, consultas y limpieza. |
| Reset pequeño o denso | O(L), mediante el método nativo. El intervalo denso conserva además el trabajo limitado de registro anterior al respaldo. |
| Resize | Coste nativo de asignación/truncado de longitud, más actualización escalar de frontera/límite y posible vaciado del Set. No se presume que el trabajo interno del runtime sea constante. |
| Primera inicialización o crecimiento | Continúa visitando las posiciones que aún no se inicializaron. Puede ser O(L); no se elimina la memoria ni el trabajo frío cuadráticos del array. |

Estas cotas describen la matriz, no el paso físico completo. La complejidad y el coste de contactos, restricciones, solver, cuerpos, preparación gráfica y producción permanecen separados. Un respaldo denso conserva un pequeño sobrecoste de decisión/registro; su aceptación depende de las mediciones totales, no sólo del número de ceros evitados.

## Propietario, duración, invalidación, liberación y memoria

| Estructura | Propietario y duración | Invalidación y liberación |
| --- | --- | --- |
| Array nativo de cada matriz | Instancia de `ArrayCollisionMatrix`; conservado durante los intercambios | Resize nativo trunca o crece; no se reemplaza el array. Conserva memoria O(L). |
| Set de índices | Uno por matriz; números sin referencias a cuerpos | Se vacía al resetear, al pasar a respaldo denso y al redimensionar por debajo del umbral pequeño. |
| Frontera inicializada | Número por matriz, válido mientras se respetan los métodos instalados | Se fija a la longitud tras reset y se reduce tras truncar. El crecimiento conserva la frontera anterior. |
| Límite y flag de limpieza completa | Escalares por matriz | Se recalculan o cambian en reset/resize y al superar densidad. No contienen historia de contactos. |
| Métodos y referencias nativas guardadas | Cierres de las dos instancias | Su vida es la de la instancia. Al liberar el mundo quedan disponibles para GC si no existe otra referencia externa. |

El registro conserva como máximo 4.096 entradas entre llamadas y puede alcanzar **4.097 transitoriamente** al activar el respaldo; con dos matrices, una cota conservadora conjunta es 8.194 entradas numéricas, más los objetos Set, cierres y escalares. Esta cota cuenta entradas, no bytes: la capacidad interna, cabeceras, carga de la tabla y política de GC dependen del motor. `clear()` elimina la pertenencia lógica; no se promete devolución inmediata de memoria al sistema operativo ni un tamaño fijo por entrada.

Las matrices nativas continúan almacenadas. El cambio **no reduce su memoria O(N²)**. En dormant/2.006, el priming observa aproximadamente **41,27 MB de delta de heap en ambas variantes**; durante crecimiento, las repeticiones varían alrededor de 21,59–24,66 MB nativo y 21,63–26,38 MB optimizado. Estos deltas de heap/RSS incluyen cuerpos, harness, compilación y GC; no son una medida aislada del Set ni su memoria retenida. Las muestras de crecimiento, priming y mantenimiento se conservan en el microbenchmark y el agregado. No hubo GC forzado ni perfil de asignaciones del navegador.

Al retirar cuerpos, la actual recibe el resize nativo; la anterior puede conservar su tamaño e índices registrados hasta que le corresponda el siguiente reset. Si la simulación está pausada, esos datos pueden persistir durante la pausa. No retienen cuerpos retirados porque sólo contienen índices numéricos. Se conserva el mismo ciclo de intercambio que gobierna los arrays anteriores.

El contrato de instalación requiere matrices vacías y mutaciones mediante `set`, `reset` y `setNumObjects`. No hay consumidores de producción que escriban directamente `matrix.matrix`, sustituyan su array o instalen el tracker sobre contactos ya acumulados. Las herramientas que envuelven el array con Proxies preservan sus operaciones y se usan sólo para conteos separados. Soportar mutaciones arbitrarias externas requeriría otro contrato y no forma parte de este cambio.

## Alternativas evaluadas y descartadas

- **Set sin respaldo de densidad.** Reduce la limpieza de escenas escasas, pero registrar todas las parejas densas puede costar mucho más que el array original. Sus resultados preliminares desfavorables se conservan en la evidencia; motivan limitar el registro y volver al reset nativo.
- **Seguimiento en todas las escenas pequeñas.** El control pequeño mostró coste de registro superior al recorrido nativo. La ruta pequeña conserva el método original de reset; no se elimina ese control del conjunto final.
- **Diccionario o Map como sustituto de la matriz.** Cambiaría las lecturas de huecos, el backing array y su resize. No se implementa ni se presenta como comparación de rendimiento medida.
- **Array tipado lleno de ceros.** Su longitud y valores iniciales no reproducen directamente los huecos/`undefined` y la extensión implícita del Array nativo. Exigiría una adaptación de mayor alcance.
- **Normalizar la fórmula triangular o remapear por ID.** Alteraría el comportamiento nativo de direcciones y de retirada/reindexación de cuerpos. Es otra corrección, fuera del alcance de conservar el oráculo.
- **Limpiar únicamente índices positivos registrados sin frontera.** Dejaría huecos donde el reset nativo produce ceros después de crecer. Se descarta por semántica, no por una afirmación de tiempos.
- **Desactivar eventos, reducir pasos o omitir cuerpos dormidos del mundo.** Cambiaría las mecánicas o el tiempo simulado. El ahorro se obtiene dentro del mantenimiento de matrices, conservando el procesamiento físico atómico.

## Medición y comprobaciones de conservación

Entorno: Node **v24.22.3**, Linux x64, AMD EPYC 9V74 80-Core Processor, 9 CPU disponibles. DOM/GPU simulados a 1.280×720, cámara `[0,1.7,0]`, yaw/pitch cero, sombras/audio desactivados. El frame parcial ejecuta `advanceSimulation(1/60)`, líquidos, objetivo y preparación de `renderScene`. Se seleccionan preferencias reales **60/120/240 Hz antes de crear articulaciones**, comprobando el paso efectivo y sus contadores.

Las cargas se ejecutaron en serie, tres repeticiones **AB/BA/AB**: independientes 16/100/500/1.000/1.500/2.000 piezas con 60+30 frames; controles soldados, pocos brazos articulados, muchos mecanismos y fábrica a 100/500/2.000 con 12+30; control largo 16/120 con 180+180. El microbenchmark usa 8+30 rondas. Los 25 pares de conteos y seis de diagnóstico quedan fuera de los tiempos principales. La evidencia principal contiene **216 pares completos de rendimiento y 13 equivalencias deterministas**; conserva una configuración independiente incompleta. Los 42 pares exploratorios y tres pares entre referencias se identifican aparte.

Cada caso tiene presupuesto de 20 s comprobado entre operaciones atómicas; los diagnósticos usan 30 s por fase. No se corta un paso físico. Los estadísticos son medianas entre repeticiones, con rangos y diferencias pareadas disponibles; con 30 muestras, p99 es el máximo y p95 la segunda mayor. No son intervalos de confianza. Los 90 pares integrados completos suman 6.300 frames, 13.320 pasos y 105 s simulados, con descarte cero en sus ventanas. Se guardan también acumuladores, atraso, tiempo solicitado/ejecutado/descartado y las muestras frías.

Los [comandos y reproducción](mediciones/contact-matrix-20261122/README.md) fijan explícitamente `--baseline-root` y el commit `1465a6c`; el [manifest](mediciones/contact-matrix-20261122/manifest.json) conserva SHA-256 de bytes originales y comprimidos, de los datos y herramientas de resumen; cada input registra además los hashes de los runners. Los informes copian relojes y bloques del profiler al contexto anfitrión para no retener mundos de la VM. No se usa `moodClockRange` como prueba del tiempo físico; se comprueban sus relojes y contadores propios. Esta conservación del instrumento no se contabiliza como optimización nueva del juego.

El microbenchmark de matrices mide operaciones sintéticas sobre mundos/cuerpos de Cannon, sin formas ni narrowphase; sus escalas son cuerpos, no piezas. La simulación integrada registra además piezas, cuerpos, formas, restricciones, cuerpos despiertos, contactos, ecuaciones, sensores y motores. Los conteos detallados y perfiles se ejecutan fuera de las ventanas principales. Los accesos contados por Proxy son accesos al array, no un recuento de todo el trabajo interno de Set o V8; los tiempos incluyen el mantenimiento completo.

`performance.now()` mide pared transcurrida. `process.cpuUsage()` mide CPU de usuario y sistema del proceso y puede incluir trabajo en otros hilos. Ninguna magnitud es porcentaje de utilización ni FPS de navegador. El presupuesto orientativo de 16,67 ms pertenece al fotograma completo: a 240 Hz, aproximadamente cuatro pasos físicos comparten ese presupuesto. No se suman tiempos inclusivos ni porcentajes de subsistemas para prometer un ahorro global.

La [validación sobre ambas fuentes](mediciones/contact-matrix-20261122/validation-summary.json) ejecutó `node --test tests/*.test.cjs`, `node tests/benchmark-architecture-audit.cjs` y `node tests/benchmark-ground-contacts.cjs`: **1.242/1.242→1.258/1.258 pruebas**, cero fallos/omitidas/canceladas, **21 informes de arquitectura y 36 casos de suelo iguales salvo SHA de fuente**. Las 16 regresiones añadidas comparan con el prototipo nativo: huecos, verdad/falso, escrituras repetidas, crecimiento implícito, truncado/recrecimiento, claves negativas/fraccionarias, densidad, intercambio, eventos, retirada/reindexación, impacto/agarre/restauración, sensores con cargas dormidas y soldadura/separación. Los riesgos de la ruta grande se ejercitan con más de 300 cuerpos, además del control pequeño. Las comparaciones nuevas de estado no añaden tolerancias numéricas.

Las [13 equivalencias de juego](mediciones/contact-matrix-20261122/equivalence.json.gz) conservan exactamente estado y resumen. Fábricas con cambios de cámara completan 180 frames/3 s y 180/360/720 pasos a 60/120/240 Hz; sus variantes con atraso deliberado ejecutan 184/368/736 pasos, unos 3,066667 s, y descartan exactamente **0,25 s en ambas fuentes**, conservando acumuladores. La suite completa conserva las regresiones anteriores de transporte, frenos, consumo, activaciones, pausa, guardados y campaña; no se presume validación visual del navegador.

| Producción / Hz | Entregas A = B | Tiempo simulado final A = B (s) | Pasos A = B | Energía A = B (J) |
| --- | ---: | ---: | ---: | ---: |
| 19 / 60 | 3 | 16,63333333333367 | 998 | 6,817645088763965 |
| 19 / 120 | 3 | 16,583333333333034 | 1.990 | 6,944895769114267 |
| 19 / 240 | 3 | 17,083333333332686 | 4.100 | 7,192279863772938 |
| 20 / 60 | 6 | 40,066666666665675 | 2.404 | 26,802111115832393 |
| 20 / 120 | 6 | 39,98333333333171 | 4.798 | 26,857198331867053 |
| 20 / 240 | 6 | 39,93333333333815 | 9.584 | 26,89071834976957 |

Todas terminan correctamente y sin descarte. El control adicional Producción 20/29 rpm/60 Hz conserva seis entregas, **41,433333333332264 s** y **26,974303756047398 J**. El tiempo de 20/120 se toma al final del frame que ejecuta dos subpasos; no debe confundirse con el subpaso de finalización histórico 39,975 s. Ambas fuentes se observan en el mismo instante.

Se intentó ejecutar `tests/benchmark-cpu-browser.cjs` con Playwright y `/usr/bin/chromium`, escena de control de 16 piezas, 120 Hz y timeout externo de 55 s. Terminó antes de abrir el juego con `socket() failed: Operation not permitted`. El [log completo](mediciones/contact-matrix-20261122/browser-probe.log.gz) y el [comando](mediciones/contact-matrix-20261122/additional-commands.json) se conservan. **Main, RAF, FPS, GPU, asignaciones de navegador e interacciones visuales no se midieron.** Las verificaciones de esta entrega usan Node con lógica/Cannon reales y DOM/GPU simulados.

## Límites y siguiente bloque

La mejora observada se concentra en limpiar matrices grandes con pocas escrituras reales. Las rutas pequeña y densa conservan el recorrido completo y parte del sobrecoste de decidir la ruta. Su resultado global debe juzgarse con los ensayos integrados, incluidos los desfavorables.

Este PR no atribuye el congelamiento inicial de aproximadamente 6,5 segundos a la matriz ni a una construcción fría de BVH. El siguiente PR debe comenzar desde el `main` resultante de esta integración y medir de nuevo creación, formas, AABB, primeros pasos, contactos/solver, primera consulta y primer dibujo, con asignaciones/GC cuando puedan observarse. Cualquier cambio del pico provocado por este primer bloque debe incorporarse al nuevo diagnóstico.

Tampoco se declara resuelto el coste de numerosos mecanismos activos, sombras, sensores de movimiento o captura/hidratación de guardados grandes. Son pendientes separados cuya importancia requiere mediciones propias. La conservación de tiempo simulado, producción útil, energía y eventos es criterio de aceptación, incluso fuera de cámara.

## Fuentes primarias

- [Cannon 0.6.2 incluido en el repositorio](../assets/js/cannon.min.js): fuente normativa ejecutada para `ArrayCollisionMatrix`, `World.collisionMatrixTick`, adición/retirada y eventos. Se inspeccionaron sus métodos reales y se utiliza su prototipo intacto como oráculo.
- [Código del juego](../assets/js/game.js): `installTrackedCollisionMatrices`, `registerSpeechGroup`, `onSpeechCollision`, consumidores de `world.contacts` y puntos de creación/retirada. Los hashes de esta entrega identifican la fuente concreta.
- [Cannon: ArrayCollisionMatrix](https://schteppe.github.io/cannon.js/docs/files/src_collision_ArrayCollisionMatrix.js.html) y [World](https://schteppe.github.io/cannon.js/docs/files/src_world_World.js.html): documentación oficial que se etiqueta **0.6.1**. Se contrastaron las fórmulas, limpieza, intercambio y orden de eventos con el **0.6.2 distribuido**; no sustituye a éste como referencia de la prueba.
- [MDN: performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now): reloj monotónico para intervalos de tiempo, distinto de utilización de CPU.
- [Node: process.cpuUsage](https://nodejs.org/api/process.html#processcpuusagepreviousvalue): CPU de proceso de usuario/sistema, expresada en microsegundos; puede superar la pared si intervienen varios núcleos.
