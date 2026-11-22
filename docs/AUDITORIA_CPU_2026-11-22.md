# Auditoría CPU de Q-bits: consultas, sensores y baterías — 22 de noviembre de 2026

Seguimiento: esta entrega se integró en `main` con el PR #26 (`0cb0780`). El bloque posterior de [guardado](AUDITORIA_GUARDADO_2026-11-22.md) reduce la validación repetida del registro anterior y las lecturas. Sus nuevas mediciones, coste frío y límites no sustituyen las cifras históricas de esta auditoría.

## Resultado y alcance

Se implementaron y midieron **cinco problemas distintos**, A–E del encargo: apuntado repetido, proyección Ctrl, descubrimiento de sensores inexistentes, recorridos de contactos por sensor y reconstrucción de geometría de baterías. A y B comparten una jerarquía local, pero tienen escenarios, conteos, tiempos y regresiones propios. No se vuelven a contabilizar las optimizaciones anteriores.

La referencia vigente fue `main` remoto **`1a0425a250b7911a8c230eb5d8534c54e3a03953`**; se volvió a consultar al cerrar el trabajo y seguía igual. Se trabajó en `perf/cpu-architecture-20261122`, con worktrees separados y sin reemplazar cambios ajenos. Se leyeron `AGENTS.md`, el estado, la auditoría de física, sus mediciones y las secciones de mecánicas del documento maestro. Se conservan JavaScript estático, Cannon 0.6.2, WebGL 2 con respaldo WebGL 1, formato de guardado y límite de **2000 piezas**.

La suite de referencia se ejecutó de nuevo: **1176/1176**, 49,39 s. La suite sobre las fuentes funcionales finales pasó **1207/1207**, 50,39 s: cero fallos, cancelaciones, omisiones o pendientes. Los tiempos de la suite no son un benchmark de rendimiento del juego. Después se verificó de nuevo el arranque al actualizar la versión de carga de scripts a `20261122-cpu-queries-1`.

**No hay FPS ni tiempos GPU medidos.** Chromium local no pudo arrancar por `socket() failed: Operation not permitted (1)`. El navegador remoto sí abrió el juego publicado, pero falló la inicialización de WebGL en `opening.js:158`, también tras un reintento. [Evidencia del límite](mediciones/cpu-20261122/limite-navegador.json). La validación gráfica disponible ejecuta GLES mediante Mesa; las mediciones temporales ejecutan Node con Cannon real y DOM/GPU simulados. No se presenta ninguna de ellas como una partida en Chrome.

## Identidad de las fuentes

| Archivo | SHA-256 antes | SHA-256 después |
| --- | --- | --- |
| `assets/js/game.js` | `d5b6af65ab6a413634e6cf70bc3ea88a16a0ab9cc81b4d5af2364045caf16159` | `19efe4aa93ceac0791968c5d4e85ea6f5a980cf65b0b3302f20a70933ffe6da0` |
| `assets/js/workshop.js` | `9d6985690f4a2ea47efb13978f4300edfc2546e03f8a173870b93f0c4e52481d` | `cc992783a31bb46b780603457f5b33e3c32c18a015924ebbbc01435f622efe24` |

Los archivos JSON guardan esos hashes; `interacciones.json` añade hashes de todos los módulos, del harness y de `index.html`. Las variantes cargan cada una su checkout completo: no mezclan `game.js` antiguo con módulos auxiliares nuevos. Los cambios funcionales finales están en `ff23c3d` y permanecen iguales en los commits posteriores de herramientas/documentación; el arranque versionado se encuentra en `a27815c`. El [manifiesto](mediciones/cpu-20261122/manifiesto.json) relaciona evidencia, comandos y archivos.

## Método de medición

Equipo de esta ejecución: Linux x64, Node **v24.22.3**, CPU expuesta **AMD EPYC 9V74 80-Core Processor**, `availableParallelism=9`. Es el entorno de pruebas, no el equipo del jugador. Las escenas, cámara, semilla, resolución del harness (1280 × 720), preferencias y duración simulada se mantienen iguales entre variantes. Sombras desactivadas en los tiempos principales; sus envíos se cuentan aparte.

- **Operaciones:** tres repeticiones en orden AB / BA / AB, una primera operación fría separada, ocho calentamientos y 24 muestras posteriores por variante. La construcción del índice de contactos se incluye: cada lote de lecturas sucede después de un `world.step` real nuevo. Las verificaciones de resultados y snapshots quedan fuera del intervalo cronometrado.
- **Matriz:** tres repeticiones alternadas, 12 fotogramas simulados de calentamiento y 18 medidos a 120 Hz, dos pasos físicos por cada avance de 1/60 s. Se ejecutan `advanceSimulation`, líquidos, objetivo y preparación gráfica. Es trabajo síncrono parcial equivalente al de un fotograma, **no un intervalo RAF**, y excluye el coste real de DOM, driver, presentación y GPU.
- **Interacciones:** tres repeticiones alternadas; picos de acciones separados de pasos físicos, ocho pasos previos y hasta 24 muestras finales por fase. El snapshot guardable completo y una proyección física/de controladores explícita se comparan sin redondeos.
- **Límites:** ocho segundos de pared por caso/variante de matriz e interacciones, comprobados entre operaciones atómicas. La guarda no interrumpe un paso de Cannon a mitad. Registra fase, pasos o última escala completada. Las muestras y contadores son acotados; no se registra por tick en consola.
- **Tiempo:** `performance.now()` mide pared transcurrida. `process.cpuUsage()` suma CPU de usuario y sistema del proceso, incluidos posibles hilos auxiliares de V8; puede superar el tiempo de pared. Ninguno es porcentaje de uso de CPU. La tabla muestra la mediana de las tres medias de CPU, el rango de esas medias y la mediana de los p50 de pared.
- **Percentiles:** cada JSON incluye p50, p95, p99 y muestras crudas. En la matriz de 18 muestras, p95 y p99 son ambos el máximo de cada corrida por la regla de rango más próximo; no constituyen una caracterización larga de la cola. La tabla presenta la mediana de esos percentiles entre corridas.
- **Instrumentación:** conteos detallados y perfiles se ejecutaron separados de los tiempos principales. Se usaron el harness y benchmark existentes, los temporizadores internos de Cannon y el panel de rendimiento existente como puntos de integración. No se añadió un perfilador permanente al juego.

## Antes/después de las operaciones

| Operación | CPU proceso antes, ms | CPU después, ms | Rango antes, ms | Rango después, ms | Pared p50 antes → después, ms |
| --- | ---: | ---: | --- | --- | ---: |
| Apuntado: 8 piezas lejanas | 0,150 | 0,090 | 0,143–0,291 | 0,054–0,113 | 0,044 → 0,022 |
| A: updateTarget, 1000 lejanas | 3,348 | 0,344 | 2,998–3,736 | 0,313–0,395 | 1,575 → 0,133 |
| A: rayo, bloque cercano de 1000 | 1,231 | 0,368 | 1,186–1,250 | 0,325–0,371 | 0,536 → 0,162 |
| B: Ctrl, 64 sostenidas + 940 lejanas | 177,229 | 0,497 | 175,481–182,337 | 0,456–0,543 | 173,736 → 0,254 |
| B: Ctrl sobre soporte de 1000 | 211,116 | 6,773 | 209,877–218,862 | 6,522–7,980 | 209,634 → 4,479 |
| C: tick sin sensores, 8 piezas | 0,004 | 0,003 | 0,004–0,005 | 0,002–0,003 | 0,002 → 0,002 |
| C: tick sin sensores, 1000 piezas | 0,295 | 0,123 | 0,224–0,319 | 0,064–0,158 | 0,098 → 0,022 |
| C: dibujo sin sensores, 1000 piezas | 0,197 | 0,125 | 0,187–0,233 | 0,091–0,127 | 0,094 → 0,019 |
| D: 16 pesos / 512 contactos | 1,411 | 0,221 | 1,093–1,710 | 0,057–0,233 | 0,930 → 0,054 |
| D: 16 contactos sin índice previo | 0,137 | 0,026 | 0,029–0,150 | 0,025–0,027 | 0,025 → 0,022 |
| E: recarga de 32 packs llenos | 2,010 | 0,214 | 1,979–2,375 | 0,208–0,217 | 1,133 → 0,106 |
| E: tres pases de 32 packs | 3,131 | 1,721 | 2,929–3,255 | 1,676–1,794 | 2,420 → 1,387 |
| Control: moods de 8 piezas | 0,038 | 0,022 | 0,024–0,114 | 0,021–0,099 | 0,016 → 0,016 |
| Control: moods de 1000 piezas | 1,520 | 1,451 | 1,468–1,555 | 1,450–1,477 | 0,954 → 0,967 |
| Pendiente: segundo guardado de 1000 | 80,967 | 80,471 | 79,377–81,007 | 78,441–82,358 | 77,273 → 78,267 |
| Paso de fábrica de 500, 60 Hz | 4,880 | 4,607 | 4,812–4,887 | 4,220–5,098 | 3,041 → 3,009 |
| Paso de fábrica de 500, 120 Hz | 5,054 | 4,673 | 4,730–5,325 | 4,322–5,000 | 2,892 → 2,723 |
| Paso de fábrica de 500, 240 Hz | 4,861 | 4,323 | 4,779–4,994 | 4,243–4,348 | 2,719 → 2,542 |

Fuente: [operaciones.json](mediciones/cpu-20261122/operaciones.json). Todas las comparaciones de estado y de resultados de consultas/UI de estas 54 parejas coinciden. Las pequeñas diferencias en controles sin cambio específico, el guardado o el solver no se contabilizan como optimizaciones adicionales. No se suman porcentajes entre filas.

### A. Apuntado repetido de toda la escena

**Causa:** `updateTarget` llegaba a consultar `aimQubit` tres veces con el mismo rayo. Cada consulta transformaba todas las piezas y llamaba a `rayPart`, aunque ningún cuerpo estuviera al alcance. Reproducción: 1000 piezas repartidas en 100 cuerpos lejanos; 3000 pruebas exactas y 3000 poses por actualización.

**Cambio:** `rayGroupCandidates` rechaza primero cuerpos cuya esfera conservadora no cruza el segmento alcanzable. Para grupos de más de ocho piezas, `partQueryIndex` guarda un BVH de sólidos locales. El rayo se transforma al espacio del cuerpo; la pose del cuerpo se lee en cada consulta. El resultado exacto se comparte únicamente dentro del `try/finally` de una actualización síncrona del objetivo, con igual origen/dirección y alcance suficiente.

**Resultado:** 3000 `rayPart` → **0**; 3000 poses → **0**; quedan 100 descartes baratos por cuerpo, y ningún BVH se construye en esa escena. En el bloque cercano de 1000 piezas también cae el tiempo de consulta caliente. La consulta exacta, los sólidos de cinta, las cargas, paredes, oclusión y orden de empate se mantienen; el BVH nunca decide por sí solo la pieza seleccionada.

**Coste y riesgo:** el primer rayo sobre un bloque cercano de 1000 pasa de **1,616 a 11,514 ms de pared** y de **3,722 a 17,134 ms de CPU de proceso**, medianas de tres primeras llamadas. Construir el árbol es un pico real. Se reutiliza al trasladar o rotar, pero se paga de nuevo tras reconstruir el grupo. No se promete una mejora de la primera selección de todo bloque grande.

La consulta pasa de recorrer todas las piezas a recorrer cuerpos y nodos candidatos más geometría exacta pertinente. Sigue siendo O(N) en el peor caso. El constructor existente ordena en cada nivel: cota O(N log²N), memoria O(N); también se ordenan K candidatos por su posición original para conservar prioridades. No se atribuye a esta entrega la implementación previa de `collisionIndex`.

### B. Proyección de colocación con Ctrl

**Causa:** `landingProjection`, usada por `drawGuides`, cruzaba las nueve muestras de cada pieza sostenida con todas las piezas ajenas. En 64 sostenidas y 940 lejanas hacía **541440 `rayPart`**, aun sin soporte debajo.

**Cambio:** se calcula una columna conservadora que cubre los puntos de muestreo y los 30 m originales de caída. Se descartan cuerpos, se consulta el BVH local del soporte cuando corresponde y se rechazan AABB mundiales antes del rayo exacto. Muebles, cargas y segmentos de repisas mantienen sus formas y orientaciones verdaderas.

**Resultado:** 541440 → **0** pruebas exactas; 1004 → **64** poses, pertenecientes a las piezas sostenidas. El desplazamiento resultante sigue siendo exactamente `-0.8200000000000001` en la reproducción. El ensayo adicional sobre un soporte cercano de 1000 conserva la altura y reduce la proyección caliente de 211,116 a 6,773 ms de CPU. Su primera proyección, incluyendo construcción, pasa de **212,563 a 19,963 ms de pared**: todavía puede exceder por sí sola un presupuesto de 16,67 ms.

El trabajo exacto depende ahora de los K obstáculos de la columna, en vez de todas las N piezas; se conserva el peor caso si todos son candidatos. Las regresiones diferenciales incluyen piso, mesas rotadas, huecos de conjuntos soldados, cargas, exclusiones de lo sostenido y geometrías mixtas rotadas. Se usan las funciones exhaustivas de la referencia como oráculo.

### C. Descubrir sensores cuando no existen

**Causa:** `tickContactSensors` y `drawWorkshop` llamaban a `partState` para cada pieza ordinaria; esa API prepara estados de taller aptos para edición y crea defaults o copias. Se reproducen **1000 consultas por tick y otras 1000 por dibujo**, con cero sensores.

**Cambio:** `QBitsWorkshop.hasSensor` valida metadata real sin fabricar estados de editor. Las dos rutas frecuentes rechazan inline `!part.mood.workshop` antes de llamar siquiera al predicado. Otras comprobaciones de presencia de sensor también usan la validación liviana.

**Resultado:** cero `partState` y cero llamadas al predicado en esas dos rutas para las 1000 piezas ordinarias. El tick reduce CPU de proceso de 0,295 a 0,123 ms; el dibujo, de 0,197 a 0,125 ms. Sus p50 de pared pasan de 0,098 a 0,022 y de 0,094 a 0,019 ms, respectivamente. El control de ocho piezas también se conserva.

**Decisión:** se mantiene un recorrido O(N) barato. No se introduce un registro persistente: el catálogo y otras rutas asignan metadata después de crear el grupo, y se admiten ediciones en vivo de esa metadata. Un registro sin una API universal de mutación podría omitir un sensor recién adaptado. La ruta nueva lo observa inmediatamente, sin esperar al siguiente paso ni invalidación. Las regresiones cubren metadata inválida y cambios inmediatos; la suite conserva adaptación, unión, separación, restauración y cambios de escena.

### D. Contactos y relaciones de apoyo por sensor

**Causa:** cada `sensorWeight` reconstruía las relaciones de apoyo recorriendo todos los contactos. Dieciséis lecturas sobre 512 contactos reales examinan **8192 candidatos**.

**Cambio:** `sensorContactsForBody` comparte la pertenencia ordenada de contactos por cuerpo mediante el índice que también usan las cintas. Cada lectura de peso recorre las aristas de los cuerpos de apoyo alcanzados. No se guardan peso, normal, shape seleccionado, pose, sueño ni resultado del sensor. Se conserva el recorrido exacto de pilas dormidas, que puede necesitar comprobaciones geométricas al no existir contactos nuevos.

**Resultado:** **512 candidatos para construir una vez + 64 consultados**, incluyendo el mantenimiento en la medición temporal; CPU de proceso 1,411 → 0,221 ms por 16 lecturas, con dispersión publicada en la tabla. Las dieciséis lecturas de contacto siguientes reutilizan el índice y consultan otros 64 candidatos.

**Corrección basada en medición:** una primera variante construía el mapa también para lecturas exclusivamente de contacto. Empeoró de **0,029875 a 0,085250 ms** por lote en el ensayo exploratorio. Se retiró esa construcción: `sensorContactActive` conserva su recorrido lineal barato cuando no existe un índice de peso/cinta ya pagado. No se afirma que ese escenario independiente pase de 8192 a 64. Los lotes de hasta 32 contactos mantienen también la ruta lineal. La caída temporal de contacto sin índice previo en la tabla final no se atribuye a un algoritmo nuevo: la referencia tiene gran dispersión (0,029–0,150 ms de CPU entre medias de corridas).

**Validez precisa:** la caché guarda la identidad y longitud del array y `world.stepnumber`. Se invalida en la entrada del adaptador del solver, después de que la narrowphase haya reutilizado/poblado contactos, y de nuevo al volver de `world.step`. Las lecturas posteriores a estabilización y potencia comparten la pertenencia vigente. Cambios de topología y ambas limpiezas de escena la liberan. No puede conservar contactos pooled durante varios pasos. Las regresiones comprueban masas vivas, selección por shape, normales, cargas añadidas/retiradas, pilas dormidas y lotes consecutivos.

La construcción es O(C); una lectura visita sus contactos y apoyos pertinentes. No se memoiza el peso acumulado entre sensores ni se promete O(1) para una pila grande.

### E. Geometría de baterías

**Causa:** `externalBatteryPackComponents` repetía adyacencia exacta; `rechargeExternalBatteries` comprobaba apoyo incluso con el pack lleno; líquidos, sólidos y transparencias reconstruían pertenencia y dimensiones locales varias veces por fotograma.

**Cambio:** `externalBatteryGeometry` pertenece al grupo rígido y conserva celdas, componentes físicos y descriptores visuales locales separados. Un barrido barato valida referencias, pack ID, metadata y coordenadas locales. La recarga sale antes de construir componentes y comprobar apoyo si todas las celdas están llenas; todavía valida las celdas mediante `externalBatteryGeometry`. La composición física y la agrupación visual mantienen sus criterios diferentes y su orden original.

**Resultado en 32 packs de tres celdas:** recarga llena, **64 pruebas de caras + 32 `corners` → 0 + 0**. Tres pases gráficos calientes, **288 `corners` → 0**, conservando **224 envíos de dibujo**. El primer pase de líquidos todavía calcula 96 celdas; los otros dos reutilizan lo construido. La recarga parcial caliente conserva las 32 comprobaciones de suelo necesarias, pero no repite las 64 adyacencias.

Carga, capacidad, activación, consumo y pose mundial se leen en vivo. Se generan wrappers mundiales nuevos; líquido y energía siguen avanzando. Una batería agotada/desactivada o una conexión retirada afecta inmediatamente al suministro existente. No se contabiliza de nuevo la caché eléctrica de entregas anteriores.

La validación cuesta O(N) por grupo/pase; no se oculta ese mantenimiento. La composición puede seguir siendo cuadrática al reconstruirse. Los tests incluyen packs no rectangulares, huecos, local edits, activación/carga, eliminación, unión, separación y partidas restauradas.

## Propiedad, duración e invalidación de cachés

| Caché | Propietario y duración | Pose | Topología / adaptación / eliminación / restauración | Energía |
| --- | --- | --- | --- | --- |
| `partQueryCache` | Grupo consultado, más de 8 piezas; vida del grupo | Rayo/columna transformados en cada uso; trasladar o rotar no reconstruye | Las operaciones actuales sustituyen grupo/array de piezas; `removeGroup` elimina explícitamente el campo. Limpiar/restaurar escena retira los grupos. | No participa |
| `targetAimCache` | Sólo una llamada síncrona de `updateTarget` | Origen, dirección y alcance compatibles; `finally` siempre lo libera | No sobrevive a otra interacción ni fotograma | No participa |
| `sensorContactsCache` | Lote de contactos vigente, compartible con cintas | Normales, shapes, pose, peso y sueño leídos en cada consulta | Invalidación en frontera narrowphase/solver, tras `world.step`, topología y limpieza; referencia/longitud/paso protegen consultas directas | No participa |
| `batteryGeometryCache` | Grupo con celdas externas | Pose mundial viva; compara offset/quaternion local para reutilizar | Compara piezas, pack ID y metadata; cambios en vivo reconstruyen; retiro borra el campo | Saldo, activación y capacidad siempre vivos |

El contrato de A/B depende de que los sólidos locales del grupo sean inmutables durante su vida, como sucede en las rutas actuales de edición. Una futura operación que modifique `offset`, `q` o shape **in situ** debe invalidar ese índice o reconstruir el grupo; queda señalado para evitar invalidaciones implícitas futuras. E incluye comprobación explícita de coordenadas porque ya admite ese tipo de cambios.

## Memoria y asignaciones

Se informa memoria añadida como estructura retenida exacta, sin inventar un tamaño de objeto V8. Los deltas de heap tras GC forzado incluyen JIT, harness y perfilador; no permiten aislar bytes de cada caché.

| Escena | Objetos nuevos retenidos por BVH | Nodos / arrays hoja | Referencias propias + externas | Números |
| --- | ---: | --- | ---: | ---: |
| 8 piezas | 0 | 0 / 0 | 0 | 0 |
| 100 piezas consultadas | 410 | 31 / 16 | 510 | 886 |
| 1000 piezas consultadas | 3894 | 255 / 128 | 4894 | 8530 |
| 2000 piezas consultadas | 7790 | 511 / 256 | 9790 | 17066 |

Los 1000 objetos pieza y el array original ya existían; el índice añade referencias, no copias de sus grafos. Al retirar el grupo, quedan cero objetos accesibles por su campo de caché, incluso reteniendo deliberadamente el grupo en el ensayo. Esto comprueba la liberación del ownership, no que una recolección ocurra en ese instante. [Inventario reproducible](mediciones/cpu-20261122/memoria-consultas.json).

- **Sensores:** C no añade memoria persistente. D, con 512 contactos, retiene un mapa de 129 listas con 1024 referencias a contactos, más claves de cuerpo y un registro pequeño. Si la cinta ya lo construyó, se comparte. No acumula pasos anteriores; lo verifican las nuevas regresiones.
- **Baterías:** para los 32 packs/96 celdas, con ambas cachés física y visual ya construidas después de la recarga parcial del benchmark, 416 objetos propios, incluidos 192 arrays; 832 slots de referencia (448 a objetos ya existentes) y 960 slots numéricos. Después de eliminar la escena quedan cero propietarios de caché. [Conteos](mediciones/cpu-20261122/baterias-despues.json).
- **Temporales:** A/B aún generan candidatos y poses pertinentes; E aún genera wrappers de pose/carga. No se declara eliminación total de asignaciones. Las reconstrucciones frías también asignan arrays temporales.

El perfil V8 separado de 80 rondas de apuntado + tick/dibujo de sensores ausentes + moods, tras calentamiento equivalente, estima por muestreo **225,6 → 38,0 MB asignados**. Es una estimación de asignaciones acumuladas, no memoria retenida ni bytes exactos. El observador de GC registró **13 → 2 eventos menores**, 2,517 → 0,522 ms totales; la muestra de CPU también identifica GC. Es una corrida diagnóstica, no una promesa sobre todas las escenas. Los `.cpuprofile` y `.heapprofile` conservan las pilas completas.

El muestreo de CPU atribuyó aproximadamente 53,803 ms propios a `rayPart` en la referencia y cero en la escena optimizada lejana. `updateMoods` y `clamp` siguen entre las funciones costosas. Las entradas `post` pertenecen al Inspector, no al juego. Los perfiles de Node son importables para inspección, pero no son capturas del hilo Main de Chrome.

## Separación de física y sistemas

El diagnóstico de fábrica de 500 piezas usa temporizadores nativos de Cannon y wrappers acotados de los bloques existentes. Registra broadphase, narrowphase, ecuaciones, solver e integración, además de controladores, energía, sensores, enfriadores, moods, consultas y preparación gráfica. [Perfil y tres pares de instrumentación](mediciones/cpu-20261122/perfil-node.json).

Por paso instrumentado de esa fábrica, medianas de las tres corridas, versión nueva: broadphase **0,2290 ms**, narrowphase **0,3507 ms**, creación de ecuaciones **0,0189 ms**, solver **0,5736 ms**, integración **0,0202 ms**. Son tiempos de pared diagnósticos. El adaptador de solver también hace trabajo del juego; los bloques inclusivos pueden anidarse y **no deben sumarse** para inventar un total ni una utilización de CPU.

En la versión nueva, 24 pasos y 12 preparaciones gráficas sin wrappers dieron 119,591 / 111,445 / 111,388 ms de pared; con wrappers y perfil Cannon, 137,735 / 114,490 / 126,219 ms. El estado permanece idéntico. En la referencia el orden/JIT y el ruido invierten algunos resultados; no se descuenta un porcentaje universal de instrumentación. Los tiempos principales no llevan esos wrappers ni contadores. La serialización se mide como operación separada; no se simula latencia de disco/Web Storage.

## Escalas y presupuesto de 16,67 ms

Familias: `welded`, hasta cuatro cuerpos con muchas piezas; `independent`, un cuerpo por pieza; `few-articulated`, hasta cuatro brazos y 16 articulaciones con lastre en chasis; `many-mechanisms`, hasta 64 rotores físicos pequeños activos; `factory`, hasta cuatro cintas con suministro real, cargas y motores activos. Desde 256 piezas, `many-mechanisms` aumenta principalmente lastre, no el número de articulaciones. En 16 piezas, `few-articulated` es un control sin brazo. Los seis cuerpos estáticos del entorno se incluyen en el número de cuerpos físicos.

| Familia | Piezas | Cuerpos / formas / restricciones | Despiertos / contactos / motores activos | CPU proceso antes → después, ms | Pared p50 antes → después, ms | Pared p95/p99 después, ms |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| welded | 16 | 10 / 10 / 0 | 0 / 0 / 0 | 1,028 → 0,923 | 0,393 → 0,583 | 1,172 |
| welded | 100 | 10 / 14 / 0 | 0 / 0 / 0 | 2,208 → 1,714 | 1,039 → 0,464 | 1,291 |
| welded | 500 | 10 / 14 / 0 | 0 / 0 / 0 | 4,655 → 2,837 | 2,541 → 1,476 | 2,506 |
| welded | 1000 | 10 / 14 / 0 | 0 / 0 / 0 | 7,052 → 4,704 | 4,301 → 2,570 | 5,323 |
| welded | 1500 | 10 / 14 / 0 | 0 / 0 / 0 | 7,749 → 5,222 | 5,820 → 3,331 | 4,195 |
| welded | 2000 | 10 / 10 / 0 | 0 / 0 / 0 | 8,553 → 4,733 | 7,641 → 4,029 | 4,826 |
| independent | 16 | 22 / 22 / 0 | 0 / 0 / 0 | 2,098 → 1,747 | 1,031 → 1,031 | 2,372 |
| independent | 100 | 106 / 106 / 0 | 0 / 0 / 0 | 9,109 → 9,091 | 4,620 → 4,875 | 12,973 |
| independent | 500 | 506 / 506 / 0 | 0 / 0 / 0 | 42,457 → 40,859 | 24,464 → 24,706 | 63,287 |
| independent | 1000 | 1006 / 1006 / 0 | 0 / 0 / 0 | 77,418 → 75,366 | 41,703 → 40,436 | 124,791 |
| independent | 1500 | 1506 / 1506 / 0 | 0 / 0 / 0 | 102,568 → 106,423 | 58,186 → 57,187 | 179,413 |
| independent | 2000 | Interrumpida | Última completa: 1500 | — | — | — |
| few-articulated | 16 | 7 / 8 / 0 | 0 / 0 / 0 | 1,212 → 1,356 | 0,410 → 0,403 | 0,667 |
| few-articulated | 100 | 21 / 45 / 12 | 15 / 12 / 0 | 6,041 → 5,191 | 3,512 → 3,230 | 4,548 |
| few-articulated | 500 | 26 / 62 / 16 | 20 / 44 / 0 | 11,620 → 9,729 | 6,336 → 5,646 | 7,174 |
| few-articulated | 1000 | 26 / 62 / 16 | 16 / 0 / 0 | 12,695 → 9,987 | 7,921 → 6,309 | 8,470 |
| few-articulated | 1500 | 26 / 62 / 16 | 16 / 0 / 0 | 13,865 → 10,807 | 9,917 → 7,402 | 10,190 |
| few-articulated | 2000 | 26 / 62 / 16 | 16 / 0 / 0 | 15,581 → 10,890 | 11,729 → 8,292 | 9,482 |
| many-mechanisms | 16 | 15 / 15 / 4 | 8 / 16 / 4 | 3,832 → 3,431 | 2,111 → 1,901 | 2,554 |
| many-mechanisms | 100 | 57 / 58 / 25 | 50 / 100 / 25 | 13,533 → 12,891 | 7,893 → 7,961 | 10,873 |
| many-mechanisms | 500 | 135 / 136 / 64 | 128 / 256 / 64 | 31,570 → 31,336 | 22,073 → 22,191 | 28,488 |
| many-mechanisms | 1000 | 135 / 136 / 64 | 128 / 256 / 64 | 31,995 → 31,948 | 24,161 → 23,225 | 31,429 |
| many-mechanisms | 1500 | 135 / 136 / 64 | 128 / 256 / 64 | 34,567 → 33,943 | 26,496 → 24,742 | 31,237 |
| many-mechanisms | 2000 | 135 / 136 / 64 | 128 / 256 / 64 | 36,999 → 33,535 | 26,993 → 24,668 | 36,626 |
| factory | 100 | 13 / 67 / 0 | 3 / 12 / 9 | 5,930 → 4,679 | 3,474 → 2,962 | 4,269 |
| factory | 500 | 33 / 105 / 0 | 23 / 78 / 12 | 10,415 → 10,248 | 6,769 → 5,742 | 7,606 |
| factory | 1000 | 58 / 130 / 0 | 48 / 180 / 12 | 16,047 → 13,100 | 10,768 → 8,695 | 10,427 |
| factory | 1500 | 83 / 155 / 0 | 73 / 276 / 12 | 19,898 → 16,340 | 14,394 → 11,692 | 13,781 |
| factory | 2000 | 108 / 180 / 0 | 98 / 360 / 12 | 25,188 → 20,825 | 18,654 → 15,434 | 18,807 |

Fuente completa, incluidas ecuaciones de contacto/fricción/restricción, sensores, acumuladores y muestras: [escalas.json](mediciones/cpu-20261122/escalas.json). Las 28 escalas completadas coinciden exactamente entre variantes en las tres repeticiones. Todas ejecutan 36 pasos medidos, 0,3 s simulados y cero tiempo descartado. La escala independiente de 2000 se interrumpió en el calentamiento de la referencia, tras 11 fotogramas de los 12 previstos y al superar el presupuesto de ocho segundos incluyendo creación; la última escala con comparación completa fue 1500. No hay un resultado nuevo de 2000 independientes que pueda presentarse como mejora.

**Primer incumplimiento observado en el trabajo parcial de Node:** 500 independientes (p50 24,706 ms), 500 piezas con 64 motores físicos activos (p50 22,191 ms). La fábrica de 2000 llega a p50 15,434 ms y p95/p99 18,807 ms; ya incumple la cola de 16,67 ms. Los cuatro cuerpos soldados de 2000 quedan en p50 4,029 ms, y cuatro brazos con lastre en 8,292 ms, sin certificar FPS de navegador. La diferencia entre piezas, cuerpos y articulaciones es decisiva.

El calentamiento más medición de esta matriz suma 0,5 s simulados: no sustituye ensayos largos de reposo. Estos se validaron por separado con caídas, la suite de reposo y dos brazos asentados. Los pequeños controles muestran variación de décimas de milisegundo; no hay una penalización estructural de BVH para grupos de hasta ocho piezas ni de índice de sensores para lotes pequeños.

## Frecuencias, cámara, producción y tiempo descartado

Se selecciona `applyPreferences({physicsHz})` **antes** de construir articulaciones y se comprueba `getPhysicsStep()`. Los valores efectivos son 1/60, 1/120 y 1/240. A renderizado de 60 Hz, 240 Hz requiere normalmente cuatro pasos: el presupuesto de 16,67 ms debe cubrir esos cuatro pasos y el resto del fotograma. CPU y GPU pueden solaparse; no se suman como etapas necesariamente secuenciales.

Se alterna la cámara cada segundo. Se compara el snapshot completo guardable, poses, velocidades, fuerzas, masas, energía y moods, controladores, sensores, tiempo y, en campaña, ledger, buffers, paquetes, receptor, consumo, resultado y progreso. **No se elimina ningún campo de esa proyección ni se usa tolerancia entre variantes.** Se compara el estado final en equivalencia y checkpoints en interacciones; no se afirma comparar cada tick ni serializar todas las estructuras internas de Cannon.

| Escenario | Hz | Pasos | Tiempo simulado, s | Descartado, s | Entregas | Energía, J | Resultado idéntico |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| factory-camera | 60 | 180 | 3,000 | 0,000 | — | — | Fábrica continúa al girar cámara |
| factory-delayed-frames | 60 | 184 | 3,067 | 0,250 | — | — | Fábrica continúa al girar cámara |
| production-19 | 60 | 998 | 16,633 | 0,000 | 3 | 6,818 | Completo |
| production-20 | 60 | 3560 | 59,333 | 0,000 | 2 | 30,004 | Presupuesto superado, ya en baseline |
| production-20-rpm29 | 60 | 2561 | 42,683 | 0,000 | 6 | 25,037 | Completo |
| factory-camera | 120 | 360 | 3,000 | 0,000 | — | — | Fábrica continúa al girar cámara |
| factory-delayed-frames | 120 | 368 | 3,067 | 0,250 | — | — | Fábrica continúa al girar cámara |
| production-19 | 120 | 1990 | 16,583 | 0,000 | 3 | 6,945 | Completo |
| production-20 | 120 | 4898 | 40,817 | 0,000 | 6 | 24,565 | Completo |
| factory-camera | 240 | 720 | 3,000 | 0,000 | — | — | Fábrica continúa al girar cámara |
| factory-delayed-frames | 240 | 736 | 3,067 | 0,250 | — | — | Fábrica continúa al girar cámara |
| production-19 | 240 | 4100 | 17,083 | 0,000 | 3 | 7,192 | Completo |
| production-20 | 240 | 9912 | 41,300 | 0,000 | 6 | 25,911 | Completo |

[Resultados completos](mediciones/cpu-20261122/equivalencia.json). Las 13 parejas coinciden. En los escenarios normales no se descarta tiempo. Los dos fotogramas sintéticos lentos de 0,10 y 0,25 s producen exactamente los **0,25 s descartados existentes** en ambas versiones, y el mismo residuo de acumuladores; no se convierte ese descarte en una ganancia.

El nivel 20 inicial a **60 Hz/30 rpm** ya fracasa por presupuesto en la referencia: dos entregas, 59,333 s y 30,004371 J. Se conserva y se informa. Se añade, sin sustituir el caso fallido, un caso **60 Hz/29 rpm** que completa seis entregas con 25,037273 J. A 120 y 240 Hz, la configuración inicial completa seis entregas. La sensibilidad del nivel 20 a la frecuencia/ajuste es un pendiente funcional previo, no una regresión ni una optimización de esta entrega.

## Interacciones e integración

[interacciones.json](mediciones/cpu-20261122/interacciones.json) contiene nueve ejecuciones A/B completas, tres por escenario, y 30 checkpoints comparados exactamente:

- **64 piezas tomadas y 1000 lejanas:** agarre real, movimiento de cámara/objetivo de mano, desplazamiento físico y liberación; conserva cuerpos, restricciones, IDs y masa. El p50 de los pasos de movimiento queda 4,727 → 4,838 ms de pared: no se reclama una aceleración del controlador de agarre.
- **Dos placas de 64 y 1000 lejanas:** consulta fría previa, agarre, `findSnap`, soldadura, separación, consulta posterior y física. Conserva energía, IDs, masa y reloj durante la edición; libera los índices de grupos retirados. La separación sigue teniendo un pico (p50 24,956 ms nuevo), que no se presenta como una optimización específica de este bloque.
- **Dos brazos en contacto:** fuerzas opuestas y mano real; siete contactos cruzados en la ventana de agarre, máximo uno por paso. Tras soltar, deriva cero durante el segundo final. La tolerancia existente de 0,5 mm sirve únicamente para afirmar reposo, nunca para relajar la igualdad A/B.

La suite añade 31 regresiones: 13 espaciales, 3 de descubrimiento de sensores, 7 de contactos y 8 de baterías. Conserva impactos, reposo, unión, transporte, frenos, consumo, sensores, campaña, banco, guardados, pausa, menús, pestaña oculta y desacoplamiento de ciclos. No se desactivan máquinas fuera de cámara ni se cambia frecuencia o producción para abaratar las muestras.

`benchmark-ground-contacts.cjs` vuelve a completar **36/36** combinaciones de mecanismo/altura/frecuencia: todos conservan materia y masa, producen impacto y reposan antes de 2,717 s. Penetración máxima 1 mm; velocidad final y deriva del último segundo, cero. [Datos](mediciones/cpu-20261122/contactos-suelo.json).

El cambio de preparación visual de baterías pasó `validate-battery-gles.py`: **25 capturas idénticas byte por byte** frente a la referencia, dos shaders, un programa y cero errores GPU/atributos. Incluye carga parcial, inclinación, oclusión y oleaje. [Comparación con hashes](mediciones/cpu-20261122/comparacion-grafica.json), [validación](mediciones/cpu-20261122/validacion-grafica.json). El backend fue OpenGL ES 3.2 Mesa 25.0.7 / llvmpipe LLVM 19.1.7; no es hardware GPU del jugador.

## Hipótesis adicionales, descartes y pendientes

**Experimento nuevo descartado:** durante el perfil apareció `updateMoods → gameBatteryCapacity → workshop.batteryCapacity`, con 1000 construcciones lógicas de defaults por tick ordinario. Una salida rápida para capacidad estándar eliminó esas llamadas, pero la medición no demostró ganancia: **1,575625 → 1,607958 ms de CPU de proceso** en 1000 piezas. Se revirtió `3f4e73d` mediante `ff23c3d`. No se atribuye el resultado a escape analysis de V8 sin evidencia; una asignación escrita en el código no equivale necesariamente a presión de heap real. [Experimento y hashes, fuente `dc265dc`](mediciones/cpu-20261122/experimento-capacidad-retirado.json).

El índice exclusivo de contacto también se corrigió tras su regresión temporal; [evidencia exploratoria, fuente `be099b8`](mediciones/cpu-20261122/experimento-contactos-retirado.json). Se rechaza asimismo un registro de sensores que no observe mutaciones existentes, un resultado de peso persistente, o cachear saldo/activación de baterías. No se introducen workers: no existe aquí un beneficio medido que compense copia, transferencia, sincronización y respuestas obsoletas; la resolución física permanece atómica.

| Prioridad | Pendiente | Evidencia y siguiente comprobación | Riesgo |
| --- | --- | --- | --- |
| Alta, corrección funcional | Producción 20 a 60 Hz | Falla en baseline y final con 30 rpm; comparar transporte y consumo por frecuencia antes de retocar reglas | Alto: entrega, energía y compatibilidad física |
| Alta, picos | Guardado síncrono del banco | Segundo guardado de 1000: 80,967 → 80,471 ms CPU, sin mejora. 2 stringify, 3 parse, 1000 copias de mood y 388295 bytes escritos al Map del ensayo | Alto: snapshot vivo, recuperación y último guardado válido |
| Alta, fluidez | Muchos cuerpos/articulaciones y primer BVH | Matriz rebasa presupuesto desde 500 independientes/64 motores; primera consulta cercana cuesta 11,514 ms de pared | Alto: conservar orden y resolución física; medir reparto del coste de construcción |
| Alta para investigar, sin ganancia GPU demostrada | Sombras por pieza | 1000 cubos: 2 envíos sin sombras, 1002 con suaves/nítidas. Perfil real y comparación de mezcla/silueta antes de agrupar | Medio: equivalencia gráfica WebGL 1/2 |
| Media | Sensores de movimiento | 16 lecturas × 134 cuerpos = 2144 candidatos; AABB, velocidad angular y cuerpos fuera de cámara deben conservarse | Medio: mantenimiento del índice y falsos negativos |
| Media, hipótesis nueva | Asignaciones por articulación | `updateRotorMotors` prepara `beforeStep` antes de salir por motor apagado: array, dos registros y cuatro clones lógicos por articulación. Medir con impactos antes de reutilizar | Alto si cambia la instantánea previa o el orden de corrección |
| Media | Interfaz idéntica / más registros de componentes | El perfil muestra `updateAlphaHUD`; no se midió aún una alternativa. `drawWorkshop` conserva barrido barato para metadata viva | Falta demostración temporal; no reescribir por estilo |

Sombras, movimiento y guardado se **reconfirmaron**, pero ya figuraban en la auditoría anterior: no se cuentan como hallazgos nuevos ni como mejoras entregadas. El patrón de defaults durante recuperación de ánimo y las asignaciones por articulación surgieron al perfilar/leer otras rutas; se distinguen los conteos lógicos de los costes demostrados.

El guardado ahora se cronometró con un **Map que conserva el guardado anterior**: incluye su lectura/validación además del snapshot nuevo. Las primeras cifras exploratorias de unos 47 ms usaban el storage vacío predeterminado y no son comparables directamente. Aun el Map no mide latencia real de Web Storage. Un dirty flag de topología sería incorrecto: sin cambiar piezas varían energía, moods, pose, sensores, fases, rutas y reloj. Comparar JSON al final tampoco elimina el coste ya pagado al generarlo. La exportación explícita de catálogos es otra ruta, no medida por ese tiempo.

Las mejoras continuas son C, D y E, además de A cuando el objetivo se actualiza. B reduce exclusivamente el trabajo de la guía al construir/colocar. La soldadura, separación, controlador de mano y guardado conservan sus algoritmos; los ensayos correspondientes verifican compatibilidad y exponen sus picos restantes.

## Reproducción

Desde el checkout con esta entrega, crear una sola vez una referencia separada (si ya existe, reutilizarla):

```bash
git worktree add --detach ../qbits-baseline 1a0425a250b7911a8c230eb5d8534c54e3a03953
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
QBITS_REFERENCE_ROOT=../qbits-baseline node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
node --expose-gc tests/benchmark-cpu-architecture.cjs --mode=operations --output=/tmp/qbits-operaciones.json
node tests/benchmark-cpu-architecture.cjs --mode=matrix --output=/tmp/qbits-escalas.json
node tests/benchmark-cpu-architecture.cjs --mode=equivalence --output=/tmp/qbits-equivalencia.json
node tests/benchmark-cpu-interactions.cjs --output=/tmp/qbits-interacciones.json
node --expose-gc tests/profile-cpu-architecture.cjs --output=/tmp/qbits-perfil-node.json
node tests/benchmark-query-memory.cjs --output=/tmp/qbits-memoria-consultas.json
node tests/benchmark-battery-geometry.cjs
QBITS_REFERENCE_ROOT=../qbits-baseline node tests/benchmark-battery-geometry.cjs
node tests/benchmark-mood-defaults.cjs
python3 tests/validate-battery-gles.py /tmp/qbits-baterias-despues
```

Ejecutar los benchmarks temporales **uno a uno**, sin suite, contadores ni perfiladores simultáneos. Los escenarios y repeticiones vienen en los scripts; los defaults anteriores son los medidos. Para otro checkout de referencia usar `--baseline-root=/ruta`; el benchmark de operaciones e interacciones también admite `--optimized-root=/ruta`. Ejecutar la validación GLES desde el worktree de referencia para obtener `/tmp/qbits-baterias-antes` y comparar sus 25 PNG con los nuevos. Los hashes publicados permiten verificar las capturas sin atribuirles FPS.

En una estación con Chromium/WebGL y Playwright ya instalados, está preparado `tests/benchmark-cpu-browser.cjs`, con modos `frames`, `profile` y `visual`, contextos limpios, RAF, metadatos del renderer y DevTools CPU/heap. **No fue validado de extremo a extremo aquí** debido a los bloqueos descritos. No es dependencia del juego ni exige bundler:

```bash
QBITS_PLAYWRIGHT=/ruta/a/playwright QBITS_CHROMIUM=/ruta/a/chromium node tests/benchmark-cpu-browser.cjs --mode=frames --headed=true --output=/tmp/qbits-browser.json
```

Para el siguiente perfil real, conservar resolución, cámara y preferencias entre variantes; usar Main/Bottom-up para distinguir script, estilo/layout y GC, y Memory para asignaciones/retención. El runner comprueba `PerformanceObserver.supportedEntryTypes` antes de considerar LoAF. El umbral de LoAF es 50 ms: su ausencia no prueba cumplir 16,67 ms. El panel existente de Q-bits conserva sus contadores acotados y queries GPU; no se sumará tiempo GPU con CPU como si no pudieran solaparse.

## Historial original y publicación para revisión

La rama de revisión publicada conserva los archivos validados byte por byte. El entorno no tenía credenciales para `git push`, por lo que la publicación usa commits de revisión creados mediante la conexión de GitHub. Se incluye [qbits-cpu-history-20261122.bundle](mediciones/qbits-cpu-history-20261122.bundle), verificado por Git, para conservar también los IDs originales de los commits locales mencionados en los experimentos y en este informe. Requiere la referencia `1a0425a`, ya presente en el repositorio; no contiene credenciales.

Para recuperar ese historial sin reemplazar la rama de trabajo:

```bash
git bundle verify docs/mediciones/qbits-cpu-history-20261122.bundle
git fetch docs/mediciones/qbits-cpu-history-20261122.bundle perf/cpu-architecture-20261122:refs/heads/qbits-audit-historial-local
```

El bundle termina en `1aff3db`, con las cinco mejoras, herramientas, documentación y transcripciones; las notas posteriores de publicación no cambian el código funcional medido. Los hashes de contenido del manifiesto permiten contrastar las fuentes sin depender de la identidad del commit de publicación.

## Fuentes primarias consultadas

- [Chrome DevTools: Performance](https://developer.chrome.com/docs/devtools/performance/reference): actividad del hilo principal, pilas, perfiles y coste de las opciones de instrumentación.
- [Chrome DevTools: Memory](https://developer.chrome.com/docs/devtools/memory): diferencia entre snapshot, instrumentación y muestreo de asignaciones; el muestreo es aproximado.
- [MDN: `performance.now`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now): reloj monotónico de alta resolución, no porcentaje de utilización.
- [MDN: Long animation frames](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing) y [tipos soportados](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/supportedEntryTypes_static): compatibilidad y umbral de 50 ms.
- [Node: `process.cpuUsage`](https://nodejs.org/api/process.html#processcpuusagepreviousvalue) e [Inspector](https://nodejs.org/api/inspector.html): CPU de proceso y perfiles V8 mediante sesión en proceso, sin abrir un puerto.
- [Cannon: `World.js`](https://schteppe.github.io/cannon.js/docs/files/src_world_World.js.html): contactos, pooling, stepnumber y fases. Esa documentación se identifica como 0.6.1; se contrastó el orden contra **el `cannon.min.js` 0.6.2 efectivamente incluido**, que es la fuente normativa de la prueba.
- [Box2D: Dynamic Tree](https://box2d.org/documentation/group__tree.html): separación entre consulta conservadora de proxies/AABB y prueba geométrica exacta. Se aplica el patrón al BVH local existente; no se incorpora Box2D ni un árbol dinámico mundial.
