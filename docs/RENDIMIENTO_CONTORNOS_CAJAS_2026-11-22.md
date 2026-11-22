# Contornos de cajas: CPU en escenas con muchos cuerpos

22 de noviembre de 2026 · Un bloque adicional del programa de rendimiento de Q-bits.

## Resultado y referencia

Se elimina la reconstrucción CPU del contorno de cada caja regular. En 500 piezas independientes, la operación aislada de contornos pasa de **15,990 a 1,477 ms de pared p50**; el trabajo parcial por fotograma con física real a 120 Hz pasa de **22,870 a 6,938 ms p50**. Las imágenes nuevas de cajas coinciden exactamente con la referencia CPU anterior. No se omiten simulación, producción ni piezas.

La mejora está demostrada para la preparación de contornos. **No se certifica una mejora global uniforme en todas las escalas**: el caso de 1500 cuerpos a 240 Hz presenta resultados de fotograma contradictorios y una mediana peor en dos series. Se conservan esos datos, se perfilan por separado y se distinguen de la ganancia local. No hay FPS, tiempo GPU ni trabajo completo del hilo principal del navegador medidos.

- Referencia local/remota comprobada: `b20cb02af270cdbf19a26b07dd22edb6b5ae02c1`, merge del PR #28. El checkout inicial estaba limpio.
- Rama: `perf/independent-bodies-20261122`.
- Commit local medido: `dcbf3f8ba9883d07dd867b7311c5f1ece439597d`.
- Commit de código publicado: `a327f7542ca5aa05460729a8f8747b4a7e9df048`.
- Ambos commits tienen el árbol **`d025ff2d9f827f22a84436e917c4c64bdc7a7443`**, verificado al publicar.
- SHA-256 de `game.js` anterior: `723a4b6c35369ec900744b17826c39aa7eb24bc678cb217568ae98594548e938`.
- SHA-256 de `game.js` medido: `db3f26eee06a5b7768cb27ef3dcb18be15dd1d46d32f92efc33201f6e129f4e7`.
- Versión de carga: `20261122-box-outlines-1`.

Se leyeron `AGENTS.md`, el estado, las auditorías de física/CPU, sus mediciones y las reglas de geometría y conexiones del documento maestro. Se conservan Cannon 0.6.2, JavaScript estático, WebGL 2 con respaldo WebGL 1 y el límite de **2000 piezas**. Los cinco problemas A–E de la auditoría CPU, el guardado del PR #27 y la corrección de Producción 20 del PR #28 permanecen integrados.

## Causa comprobada y cambio

`drawStructureOutlines` distingue dos rutas. Los conjuntos abiertos o mixtos ya usan `drawRigidOutline` con geometría persistente. Las cajas con `g.block` seguían llamando a `drawOutline`, que transformaba 24 extremos, proyectaba cada segmento mediante `wideLineTriangles`, fabricaba 72 vértices y los subía mediante `drawWorldTriangles`/`bufferData` en cada dibujo. Sucedía incluso con cuerpos dormidos y sin cambios de cámara. **Esta rama no estaba cubierta por la optimización previa de contornos rígidos**; no se vuelve a contabilizar aquella corrección.

El nuevo `boxOutlineGeometry` contiene las doce aristas de una caja unidad, con el formato persistente existente: extremos A/B y selección de extremo/lado por vértice. Un único buffer sirve para todas las cajas. El shader aplica las dimensiones antes de girar y trasladar los extremos, y calcula el grosor en pantalla con los uniforms actuales. `drawOutline` mantiene su descarte por esfera y envía pose, tamaño, color, alpha y grosor en cada llamada.

Se conserva el aumento de dimensiones de `0,0009`, el orden de aristas y triángulos, la mezcla, la profundidad, los colores de selección/cel/otros estilos, el ancho fijo de 1 en cajas no seleccionadas de estilos distintos de cel, la altura CSS, el FOV, la vista observadora y el descarte de un segmento completo si un extremo está detrás de `0,04` o proyecta menos de `0,01` píxeles CSS. La pose de ánimo continúa coincidiendo con la del sólido. Los contornos irregulares siguen enviando dimensiones `(1,1,1)`; una caja no se sustituye por los contornos interiores de sus piezas.

También se benefician los consumidores existentes de `drawOutline`, como cargas y guías de caja. Los marcadores y las demás líneas dinámicas conservan su ruta. No se agrupan draw calls: se evita reconstruir y volver a subir la misma geometría.

### Propiedad, duración e invalidación

| Dato | Propietario y vida | Actualización / invalidación |
| --- | --- | --- |
| Buffer de caja unidad | Renderizador, uno por contexto | Inmutable. Se recrea con el contexto mediante el mecanismo de recarga existente |
| Pose, dimensiones y gesto visual | Llamada actual a `drawOutline` | Se leen y envían en cada dibujo; ningún resultado físico se cachea |
| Color, alpha, grosor, cámara y altura CSS | Uniforms del dibujo actual | Se actualizan en cada uso; cambian sin subir vértices |
| Grupos, adaptación, unión, separación, eliminación y restauración | Sistemas existentes | No crean ni invalidan buffers de caja; una escena nueva reutiliza la misma caja unidad |
| Contornos de grupos abiertos | Caché rígida preexistente | Conserva sus reglas de geometría, liberación y topología |

Antes y después el recorrido de grupos es lineal. Para cada caja visible se elimina el bucle CPU de extremos/proyección/triangulación y la asignación/subida dinámica; quedan uniforms y un draw. La expansión en pantalla pasa al shader. Esto reduce trabajo CPU y transferencia; **no demuestra menor trabajo GPU**, donde algunas aristas descartadas antes por CPU pueden llegar ahora al shader.

## Método reproducible

Equipo: Linux x64, **AMD EPYC 9V74 80-Core Processor**, nueve CPU disponibles para el proceso; **Node v24.22.3**. Un solo benchmark o perfil activo a la vez. Los tests y el replay GLES finalizaron antes de las mediciones principales.

Se reutilizan `benchmark-cpu-architecture.cjs`, `cpu-audit-fixtures.cjs` y `profile-cpu-architecture.cjs`. La extensión añade selección de familias, fases de asentamiento/reposo, metadatos del commit real, presupuesto de caso y operación aislada de contornos. No se crea un motor ni un runner paralelo de juego.

- Tres repeticiones principales en orden **AB / BA / AB**, mismas escenas, cámara y configuración. Se preservan muestras individuales y rangos, no sólo promedios.
- Preferencias reales de **60, 120 y 240 Hz antes de construir**; se comprueba `physicsDt` y el número efectivo de pasos.
- Cámara `[0,1.7,0]`, yaw/pitch `0`; viewport DOM simulado `1280×720`, estilo `clean`, sombras y audio desactivados. Las filas crecen desde `z=-5`; no todas las piezas de las escalas grandes quedan visibles. Los cuerpos fuera de cámara siguen simulándose.
- Reposo: 60 fotogramas de calentamiento y 30 muestras. Se exige que los independientes estén dormidos antes de medir. Asentamiento: ventana distinta desde el primer paso, sin calentamiento físico, que incluye contactos iniciales y JIT; no se presenta como reposo caliente.
- Por fotograma de la matriz: `advanceSimulation(1/60)`, líquidos, objetivo y `renderScene`. Son **trabajo parcial de juego y preparación gráfica en Node**, con Cannon real y DOM/GPU simulados, no todo el callback de navegador.
- Se registran pared con `performance.now()` y CPU de proceso usuario+sistema con `process.cpuUsage()` por separado. Esta última puede incluir hilos internos y superar la pared; no es utilización porcentual ni CPU exclusiva del hilo principal.
- Matrices y operación aislada: presupuesto de **20 s por caso**, incluidos preparación y calentamiento; se verifica entre operaciones síncronas. Se registra configuración detenida y última escala completa.
- Operación aislada de contornos: primer uso separado, 12 calentamientos y 30 muestras. Incluye `beginVisibilityFrame` y el recorrido completo de grupos. La creación inicial del buffer está en la preparación del renderizador, incluida en `setupMs`; no se oculta como una construcción gratuita durante la medición.
- Los contadores detallados se ejecutan aparte, sin tiempos principales. El profiler V8, sus asignaciones/GC y los temporizadores por bloque también tienen corridas propias; limita por separado las ventanas de calentamiento y captura a 20 s.

Con 30 muestras, el p99 del estimador usado es el máximo y el p95 la segunda mayor muestra. Son colas exploratorias, no percentiles estables de una partida prolongada. Se añadió una comprobación larga del control pequeño por una discrepancia concreta de p99.

Los archivos completos, comandos, hashes y manifest están en [mediciones/contornos-cajas-20261122](mediciones/contornos-cajas-20261122/README.md). Los JSON comprimidos conservan todas las muestras y los inventarios/relojes, incluidas las corridas desfavorables.

## Operación aislada de contornos

Milisegundos por operación. Cada valor es la mediana de los tres p50 de pared o de las tres medias de CPU de proceso. No se mezclan contadores con estas mediciones.

| Piezas en escena | Pared p50, antes → después | CPU de proceso media, antes → después |
| ---: | ---: | ---: |
| 16 | 0,705 → 0,071 | 0,940 → 0,102 |
| 100 | 3,336 → 0,304 | 3,938 → 0,363 |
| 500 | 15,990 → 1,477 | 16,584 → 2,343 |
| 1000 | 18,806 → 2,003 | 20,171 → 3,392 |
| 1500 | 20,355 → 2,503 | 21,953 → 4,162 |
| 2000 | 20,027 → 2,891 | 20,880 → 5,770 |

### Conteos independientes

Una operación fría de contornos después de crear el renderizador. Los tres dibujos contados posteriores tienen los mismos conteos por operación. La subida única de inicialización se trata en memoria y preparación, no está incluida en estos contadores habilitados después del arranque.

| Piezas | Llamadas / cajas enviadas en ambas | Triangulaciones CPU | Subidas de buffer | Bytes dinámicos subidos | Vértices enviados |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 16 | 16 / 16 | 16 → 0 | 16 → 0 | 27648 → 0 | 1152 → 1152 |
| 100 | 100 / 100 | 100 → 0 | 100 → 0 | 172800 → 0 | 7200 → 7200 |
| 500 | 459 / 458 | 458 → 0 | 458 → 0 | 791424 → 0 | 32976 → 32976 |
| 1000 | 518 / 516 | 516 → 0 | 516 → 0 | 891648 → 0 | 37152 → 37152 |
| 1500 | 518 / 516 | 516 → 0 | 516 → 0 | 891648 → 0 | 37152 → 37152 |
| 2000 | 518 / 516 | 516 → 0 | 516 → 0 | 891648 → 0 | 37152 → 37152 |

En 500 piezas se llaman 459 contornos y se envían 458 cajas; el segundo descarte esférico rechaza una en ambas variantes. En 1000–2000 se envían 516. Esto explica por qué el coste gráfico no escala con todas las piezas del inventario. Ninguna de esas piezas deja de existir en la física.

## Fotogramas simulados en reposo

### 120 Hz

Mediana entre repeticiones; milisegundos. Se incluyen dos pasos físicos por fotograma.

| Piezas | Pared p50 A → B | Pared p95 A → B | Pared p99 A → B | CPU de proceso media A → B |
| ---: | ---: | ---: | ---: | ---: |
| 16 | 0,887 → 0,262 | 1,273 → 0,497 | 1,504 → 4,472 | 1,595 → 1,031 |
| 100 | 4,212 → 1,112 | 5,094 → 1,780 | 5,971 → 1,891 | 4,524 → 1,551 |
| 500 | 22,870 → 6,938 | 25,437 → 8,500 | 28,141 → 9,565 | 24,808 → 8,391 |
| 1000 | 37,946 → 19,286 | 41,794 → 20,524 | 41,979 → 21,295 | 39,898 → 20,444 |
| 1500 | 55,342 → 24,160 | 60,323 → 29,879 | 62,333 → 39,982 | 56,152 → 24,502 |
| 2000 | 84,083 → 64,388 | 93,558 → 68,991 | 94,086 → 78,620 | 85,414 → 66,154 |

Rangos de p50 entre repeticiones:

| Piezas | Antes, mínimo–máximo | Después, mínimo–máximo |
| ---: | ---: | ---: |
| 16 | 0,820–3,842 | 0,246–0,422 |
| 100 | 4,199–4,414 | 1,087–1,114 |
| 500 | 22,774–22,946 | 6,851–7,072 |
| 1000 | 31,348–39,698 | 12,441–19,291 |
| 1500 | 54,398–55,438 | 22,122–35,774 |
| 2000 | 54,828–85,480 | 61,028–65,934 |

La mediana de p50, p95 y p99 cruza 16,67 ms por primera vez en 500 piezas antes y en 1000 después. En 1000 optimizadas las tres p95 superan el presupuesto. **Es un umbral de este trabajo parcial en Node**, no una promesa de 60 FPS. En 2000 una pareja optimizada es más lenta que su referencia y los rangos se solapan; no se afirma que todas las repeticiones mejoren. El caso más largo completo de esta matriz duró 17,349 s.

### 60 y 240 Hz

Un paso físico por fotograma a 60 Hz y cuatro a 240 Hz. Cada paso a 240 Hz no dispone de 16,67 ms completos: ese presupuesto debe cubrir el conjunto del fotograma.

| Hz | Piezas | Pared p50 A → B | Pared p95 A → B |
| ---: | ---: | ---: | ---: |
| 60 | 16 | 0,869 → 0,201 | 1,354 → 0,325 |
| 60 | 100 | 3,983 → 0,840 | 4,918 → 0,973 |
| 60 | 500 | 19,935 → 4,999 | 29,377 → 7,552 |
| 60 | 1000 | 29,333 → 11,017 | 32,917 → 12,200 |
| 60 | 1500 | 37,953 → 20,437 | 42,172 → 22,711 |
| 60 | 2000 | 50,162 → 22,029 | 55,765 → 30,583 |
| 240 | 16 | 0,990 → 0,361 | 1,418 → 0,572 |
| 240 | 100 | 4,708 → 1,733 | 5,542 → 2,029 |
| 240 | 500 | 27,004 → 12,733 | 30,505 → 15,732 |
| 240 | 1000 | 51,474 → 36,707 | 57,630 → 40,155 |
| 240 | 1500 | 61,725 → 69,321 | 72,295 → 73,705 |
| 240 | 2000 | Interrumpido durante calentamiento | Sin comparación completa |

A 60 Hz la primera escala cuya mediana p95 rebasa 16,67 ms pasa de 500 a 1500; a 240 Hz pasa de 500 a 1000. Los p99, rangos y muestras están conservados en los datos. A 240 Hz, 2000 piezas se detuvieron en la primera variante de referencia tras 30/60 fotogramas de calentamiento, a 20,089 s; habían ejecutado 120 pasos y 0,5 s simulados, sin descartes. **Última escala completa: 1500.** No se extrapola el rendimiento de la variante nueva a una comparación que no terminó.

### Dos discrepancias comprobadas por separado

1. **Control de 16 piezas a 120 Hz.** La ventana original mostró p99 mediano 1,504 → 4,472 ms, aunque p50/p95 mejoraron. Se repitió con 180 fotogramas de calentamiento y 180 muestras por repetición: los p99 de las tres parejas bajaron 1,945 → 0,752; 1,447 → 0,623; 1,513 → 0,619 ms. Se conserva la primera serie; no se atribuye su pico a GC sin una traza específica.
2. **1500 cuerpos a 240 Hz.** La matriz original da p50 mediano 61,725 → 69,321 ms. En un proceso nuevo, con la misma escena, 60 calentamientos, 30 muestras y tres parejas, da 57,740 → 69,064 ms. Los pares aislados son 57,740 → 40,403; 56,641 → 71,124; 91,290 → 69,064 ms. Hay regímenes de coste distintos; la repetición no demuestra ausencia de regresión global. Se conserva explícitamente como límite de la conclusión y se añade un perfil diagnóstico de esta escala.

## Asentamiento y otras familias

El archivo `matrix-settling-120.json.gz` separa 16/500/1500/2000 independientes desde el primer paso. Conserva inventario de contacto inicial, muestras, CPU, tiempo y estado completo; no mezcla esa ventana con la de cuerpos dormidos. Los escenarios de control usan 100/500/2000 piezas en cuatro familias: pocas estructuras soldadas, hasta cuatro brazos con chasis grandes, muchos rotores pequeños y fábrica activa con cintas/cargas/baterías. La cantidad de restricciones, formas, motores y cuerpos está registrada para cada caso. Todas las parejas completadas coinciden exactamente en estado.


Asentamiento a 120 Hz, tres parejas por escala (ms por fotograma):

| Piezas | Pared p50 A → B | Pared p95 A → B | CPU media A → B |
| ---: | ---: | ---: | ---: |
| 16 | 2,015 → 1,489 | 7,142 → 3,569 | 4,337 → 3,419 |
| 500 | 58,552 → 42,887 | 116,722 → 76,183 | 64,830 → 49,166 |
| 1500 | 167,660 → 149,070 | 257,315 → 254,236 | 253,586 → 238,766 |
| 2000 | 238,653 → 241,181 | 372,234 → 306,805 | 453,320 → 419,394 |

Controles a 120 Hz, 12 calentamientos y 18 muestras; estas ventanas pueden incluir asentamiento (ms):

| Familia | Piezas | Pared p50 A → B | CPU media A → B |
| --- | ---: | ---: | ---: |
| Soldados | 100 | 0,765 → 0,542 | 2,118 → 1,871 |
| Soldados | 500 | 1,364 → 1,325 | 2,771 → 2,924 |
| Soldados | 2000 | 4,341 → 4,207 | 5,478 → 5,167 |
| Pocos brazos | 100 | 3,422 → 3,164 | 6,180 → 5,383 |
| Pocos brazos | 500 | 5,566 → 5,674 | 9,783 → 9,939 |
| Pocos brazos | 2000 | 9,051 → 8,646 | 12,764 → 11,877 |
| Muchos rotores | 100 | 8,291 → 8,003 | 12,835 → 12,864 |
| Muchos rotores | 500 | 21,559 → 21,923 | 33,320 → 31,715 |
| Muchos rotores | 2000 | 25,606 → 24,910 | 33,215 → 32,520 |
| Fábrica activa | 100 | 2,883 → 2,828 | 4,372 → 4,462 |
| Fábrica activa | 500 | 6,097 → 5,721 | 10,107 → 10,407 |
| Fábrica activa | 2000 | 15,380 → 15,654 | 21,066 → 21,575 |

Los pocos brazos/500, muchos rotores/500, fábrica/2000 y el asentamiento de 2000 tienen variaciones desfavorables en alguno de sus agregados. No se esconden ni se presentan como mejoras de esos subsistemas. Los datos mantienen sus percentiles, rangos, inventarios de cuerpos/formas/restricciones/contactos/motores y resultados por repetición.

No se declara resuelto el coste de muchas articulaciones, del solver ni del primer BVH por mejorar el dibujo de cajas. La física, los controladores, el guardado y la producción conservan sus algoritmos en este bloque.

## Perfil, asignaciones y memoria

El muestreo de CPU y de heap utiliza el Inspector de **Node/V8**, en instancias separadas y equivalentes; no es Chrome DevTools ejecutando el juego. Las fases instrumentadas son otra corrida con tres pares OFF/ON, ON/OFF, OFF/ON por variante y estados completos idénticos. Los tiempos inclusivos están anidados: **no se suman**.

En 500 independientes a 120 Hz, medianas de los bloques instrumentados por fotograma: contornos **16,783 → 1,754 ms**; preparación gráfica `renderScene` **18,712 → 3,466 ms**; `world.step` **3,500 → 3,140 ms**. La reducción de reconstrucciones está confirmada por contadores; la variación de física no se atribuye a una optimización de Cannon, cuyo código no cambió.

El coste de instrumentar es visible: el trabajo de pared medio por fotograma pasa de una mediana OFF 23,449 a ON 25,606 ms antes, y de OFF 7,270 a ON 9,050 ms después. Por eso esos timers no sustituyen las cifras principales.

Durante las ventanas CPU muestreadas de 30 fotogramas: **278 eventos GC / 37,148 ms** antes y **50 / 10,983 ms** después; máximos 1,660 y 0,487 ms. Se excluyen las recolecciones explícitas fuera de la ventana. Las estimaciones de asignación se conservan por función en los heap profiles, incluidos objetos recogidos cuando V8 lo permite; no son un conteo exacto de bytes ni una medición del navegador. El harness expone constructores de arrays tipados a su contexto VM y simula WebGL, de modo que su coste de conversión/asignación tampoco debe extrapolarse directamente a Chrome.

El cambio de heap después de GC fue +11.516.368 y +1.756.824 bytes en las capturas de 500 piezas. Incluye JIT, harness, cachés existentes y muestreador; **no se presenta como tamaño de la caché nueva ni como memoria liberada garantizada**.


### Diagnóstico adicional de 1500 / 240 Hz

Se ejecutó el mismo profiler existente sobre la discrepancia, después de terminar los ensayos principales. Con 60 calentamientos y 30 fotogramas, los contornos mantienen la reducción en las tres corridas; el régimen lento aparece dentro de `world.step`. Valores instrumentados inclusivos por fotograma:

| Variante / repetición | Contornos | `world.step` | Broadphase nativa | Resto de `world.step` fuera de sus fases nativas |
| --- | ---: | ---: | ---: | ---: |
| Antes 1 | 20,348 | 25,076 | 17,151 | 6,732 |
| Antes 2 | 20,297 | 24,950 | 16,970 | 6,799 |
| Antes 3 | 19,720 | 25,879 | 17,477 | 6,797 |
| Después 1 | 2,058 | 28,793 | 19,950 | 7,421 |
| Después 2 | 2,217 | 56,509 | 16,725 | 38,108 |
| Después 3 | 1,966 | 53,982 | 16,580 | 36,086 |

La última columna es la diferencia entre `world.step` y sus fases nativas separadas; no suma los timers de funciones de juego anidadas. Incluye trabajo que Cannon no asigna a esos timers y el pequeño coste de instrumentarlos. No identifica por sí sola una función culpable. En las capturas CPU separadas aparece `World.collisionMatrixTick → ArrayCollisionMatrix.reset`, además de SAP y ánimo. La matriz triangular y la representación/ejecución de sus arrays quedan como candidatos del siguiente bloque: **no se atribuye el salto a GC, al shader o a una causa V8 concreta sin una prueba adicional**.

La corrida OFF del diagnóstico también conserva ambos regímenes: la variante nueva mide medias de pared 42,162 / 47,542 / 72,602 ms por fotograma. El objetivo de esta comprobación es localizar el coste y acotar la afirmación; no reemplaza las dos series principales desfavorables con una corrida favorable. La mejora aceptada de este PR es la eliminación comprobada de trabajo de contornos, con equivalencia de comportamiento y visual. Sigue abierta la capacidad global a alta frecuencia.

### Memoria propia de la mejora

- Buffer compartido: **72 × 9 × 4 = 2592 bytes** de datos de vértices por renderizador, no por caja.
- Sustituye un `edgeGeometry` de 576 bytes que se construía sin consumidores: incremento neto de datos GPU **2016 bytes**.
- Cuando existen VAOs, se añade la entrada/VAO del buffer nuevo a la infraestructura de bindings existente. Su memoria de driver no se mide aquí.
- El array de preparación de 2592 bytes queda sin referencias después de `bufferData`; no se conserva un historial ni una tabla por cuerpo. Se mantiene el `edgeData` previo.
- Eliminar, unir, separar y cambiar escenas no acumula buffers de caja. Las regresiones comprueban que sigue utilizándose la misma geometría sin subidas adicionales.

## Validación integrada

**1228/1228 pruebas Node aprobadas**, cero fallos, cancelaciones u omisiones. Cinco regresiones nuevas cubren buffer compartido, las doce aristas exteriores, tamaños/pose/estilos, conjuntos abiertos con huecos, gestos de ánimo sin despertar cuerpos ni tocar energía, descarte y altura CSS. Se actualizó la referencia de una prueba antigua de contornos mixtos para conservar la expansión CPU anterior: consultar las nuevas subidas dinámicas ya no era un oráculo válido para las cajas.

- **21/21 escenarios de arquitectura** con resultados y contadores idénticos a `b20cb02`.
- **36/36 caídas** con resultados exactos: materia/masa conservadas, contactos presentes, reposo antes de 2,717 s, penetración máxima 1 mm, velocidad final y deriva final cero.
- **13 escenarios de equivalencia** con estados físicos, energía, guardado y relojes exactos a 60/120/240 Hz: cámara con fábrica funcionando, fotogramas retrasados y Producción 19/20, incluida la comprobación de 29 rpm a 60 Hz.
- Producción 19 entrega tres y Producción 20 seis en ambas variantes. Los consumos y estados terminales coinciden. La observación de Producción 20/120 ocurre al final de un fotograma: 39,983333 s frente a 39,975 s de la traza del paso terminal anterior; es una resolución de observación distinta, no un cambio de entrega.
- En las ventanas regulares se ejecutan todos los pasos y no se descarta tiempo. Los escenarios deliberadamente retrasados conservan exactamente **0,25 s descartados en ambas variantes** por los límites preexistentes; no se oculta ese descarte ni se reduce para fabricar una ganancia.
- El resto de pausa, menús, pestaña oculta, guardados, campaña, sensores, energía, frenos, uniones, agarre y cargas sigue cubierto por la suite integrada. No se modificaron sus rutas.

Los runners principales verifican **142 parejas completas**: 99 de matrices, 18 de contornos, seis de conteos, seis de comprobaciones adicionales y 13 de equivalencia. Las matrices principales completan 33 configuraciones, 5076 fotogramas medidos y 10.872 pasos físicos contando ambas variantes. Los perfiles y los benchmarks de arquitectura/suelo se informan aparte para no sumar categorías distintas como si fueran pruebas unitarias.

### Gráficos

Replay de los shaders y comandos reales: **112 capturas por ruta**, WebGL 1 sin VAO y WebGL 2 con VAO, **224 en total**, dos shaders/un programa por replay y cero errores GPU/atributos. Mesa OpenGL ES 3.2, llvmpipe LLVM 19.1.7. No es una sesión de navegador.

Los siete casos nuevos de cajas (21 capturas por ruta: referencia CPU, nueva y reutilizada) producen **cero píxeles distintos y error medio cero** frente a la referencia: cubo cel, bloque rectangular rotado clean, selección movida/coloreada, ánimo excited/restless, observador/FOV/CSS/foco/jitter y plano cercano. Reutilizar el buffer conserva los píxeles exactos. Los casos previos de geometría mixta/rodillos y las tolerancias estrictas existentes también pasan. `validate-focus-gles.py` compila/enlaza los shaders y aprueba sus fixtures de foco/postprocesado.

Chromium se intentó nuevamente mediante el benchmark existente y volvió a abortar con `socket() failed: Operation not permitted (1)`. Se conserva el log. FPS, duración RAF, Main de Chrome, GPU y asignaciones del navegador siguen **no medidos**.

## Pendientes, por impacto y riesgo

| Prioridad | Hallazgo / siguiente trabajo | Estado y riesgo |
| --- | --- | --- |
| Alta | SAP y trabajo de `World` con muchos cuerpos dormidos | `needBroadphaseCollision` precede al corte espacial: parejas pasivo–pasivo no alcanzan el break. Candidato confirmado por código; conservar exactamente orden y pares al optimizar. Perfilar también el reset de matriz triangular |
| Alta | Muchos cuerpos a 240 Hz y numerosas articulaciones | Sigue fuera del presupuesto; no certificar mejora global en 1500/240 con estos resultados. Separar broadphase, matriz, contactos, solver y controladores. Riesgo físico alto si se cambia el orden |
| Media | Ánimo sin pulsadores y asignaciones de posiciones | `onCampaignPad` calcula bounds antes de descubrir una lista vacía; `moodLastPosition` clona un vector por grupo/paso. Hipótesis de ahorro pendiente de comparación propia; no omitir ánimo, recarga o tareas dormidas |
| Media | Pico frío del BVH, sombras y sensores de movimiento | Costes previos siguen pendientes; no se atribuye una mejora de GPU por reutilizar este buffer |
| Media | Capturar/validar/hidratar guardados grandes | La mejora del PR #27 está conservada; las fases síncronas restantes requieren su propio bloque |
| Necesaria para capacidad real | Partida y perfiles Chrome con WebGL | Medir trabajo completo del hilo principal, RAF y GPU en la estación del jugador |

No se vuelve a intervenir la capacidad/defaults de ánimo descartada por la auditoría anterior. No se introducen workers, instancing, cambios de solver o exclusión de máquinas por cámara: ninguno tiene una ganancia demostrada en este bloque. La resolución física permanece atómica.

La mejora de contornos es **continua mientras se dibujan cajas**, durante producción y construcción, no sólo al seleccionar. Fuera de cámara no añade una mejora directa de simulación. La guía o selección que usa cajas también elimina sus reconstrucciones. Guardar mantiene su coste y contenido actuales.

## Fuentes primarias y aplicación

- [MDN: `bufferData`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData): `STATIC_DRAW` corresponde a datos especificados una vez y reutilizados; aquí la geometría local es inmutable y los uniforms permanecen vivos.
- [MDN: buenas prácticas WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices): reutilizar layouts/VAOs estáticos evita revalidar atributos. Se usa la infraestructura existente; no se promete menos draw calls.
- [Chrome DevTools: Performance](https://developer.chrome.com/docs/devtools/performance/) y [Memory](https://developer.chrome.com/docs/devtools/memory-problems/): separar actividad principal, muestreo, retención y GC. La ejecución real de Chrome quedó bloqueada, identificada como pendiente.
- [Node: `process.cpuUsage`](https://nodejs.org/api/process.html#processcpuusagepreviousvalue): tiempo usuario/sistema del proceso, distinto de pared y de porcentaje de CPU.
- [Cannon: SAPBroadphase](https://schteppe.github.io/cannon.js/docs/files/src_collision_SAPBroadphase.js.html): fuente oficial para el orden de filtros/corte. La página se etiqueta 0.6.1; el diagnóstico se contrastó con la implementación **0.6.2 incluida**. Se documenta como siguiente problema, no como cambio entregado.
- [Unity: reducir trabajo de render en CPU o GPU](https://docs.unity.com/en-us/engine/6000.6/manual/analysis/graphics-performance-profiling/optimizing-graphics-performance): separar el recurso que limita el rendimiento y medirlo. Se aplica ese criterio, conservando el motor estático propio de Q-bits.
