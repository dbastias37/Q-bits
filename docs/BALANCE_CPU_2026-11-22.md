# Balance de rendimiento de Q-bits — 22 de noviembre de 2026

Desde el primer PR de esta serie se redujo trabajo repetido al construir, guardar, dibujar y simular escenas grandes. Una comparación directa entre el código anterior a la serie y el código final mide **entre 78 % y 81 % menos tiempo de CPU de proceso en tres escenas de piezas independientes en reposo**, manteniendo sus estados y tiempo simulado. También se corrigió un atasco de Producción 20 y se redujo una pausa extrema de arranque. Todavía quedan cargas costosas; este balance distingue lo resuelto de lo pendiente.

Las cifras proceden de comparaciones reproducibles con el juego y Cannon reales en Node, con DOM/GPU simulados. **No son FPS, porcentaje de utilización del PC ni medidas de GPU o del hilo principal de Chrome.** Los porcentajes acumulados se calculan comparando directamente ambos extremos; no sumando ganancias de PR anteriores.

## Comparación directa del período completo

Se comparó `1a0425a250b7911a8c230eb5d8534c54e3a03953`, referencia anterior al PR #26, con el código final medido `2c6d6ed5677bc4626d8e89ba9d80590031de9d0f`, publicado como [`7a851724`](https://github.com/dbastias37/Q-bits/commit/7a851724ce17a05f0315cd0e0d17b2892566859b) con el mismo árbol. La misma escena, cámara, frecuencia y runner ejecutaron tres pares AB/BA/AB: 60 frames de calentamiento y 30 medidos. Las tres configuraciones conservaron **estados finales completos idénticos, reposo y cero tiempo descartado**. Cada repetición midió medio segundo simulado: 60 pasos físicos a 120 Hz o 30 a 60 Hz.

| Escena en reposo | CPU de proceso antes → después, ms/frame | Reducción de ese coste | Pared p50 antes → después, ms/frame |
| --- | ---: | ---: | ---: |
| 500 piezas independientes, 120 Hz | **26,010 → 5,285** | **79,68 %** | 23,724 → 4,117 |
| 1.000 piezas independientes, 120 Hz | **42,528 → 8,027** | **81,13 %** | 39,636 → 6,992 |
| 2.000 piezas independientes, 60 Hz | **41,810 → 8,996** | **78,48 %** | 40,894 → 8,534 |

CPU es la **mediana entre las tres medias de CPU de proceso por frame**; la reducción se calcula como `100 × (1 − CPU_final / CPU_inicial)`. Pared usa la mediana de los p50 de cada repetición. Son ventanas de física, líquidos, selección y preparación gráfica del harness. La conclusión corresponde a estas escenas en reposo; no se extrapola a todas las máquinas activas, campañas o equipos. [Datos de 500/1.000 a 120 Hz](mediciones/presion-20261122/cumulative-500-1000-120.json.gz) y [2.000 a 60 Hz](mediciones/presion-20261122/cumulative-2000-60.json.gz).

## Qué mejora para quien juega

| Situación | Antes → después | Qué se consiguió |
| --- | ---: | --- |
| Guía Ctrl con 64 piezas sostenidas y 940 lejanas | **173,736 → 0,254 ms** por consulta caliente, pared p50 | Se evita probar geometría que no está debajo del conjunto. [PR #26](https://github.com/dbastias37/Q-bits/pull/26), [medición](AUDITORIA_CPU_2026-11-22.md). |
| Guardado repetido de 2.000 piezas | **153,484 → 99,845 ms**, pared p50 | Menos validación repetida de la partida anterior. Sigue siendo un guardado síncrono grande. [PR #27](https://github.com/dbastias37/Q-bits/pull/27), [medición](AUDITORIA_GUARDADO_2026-11-22.md). |
| 500 piezas independientes en reposo, física a 120 Hz | **22,870 → 6,938 ms** por frame sintético parcial, pared p50 | Los contornos de cajas reutilizan su geometría. [PR #29](https://github.com/dbastias37/Q-bits/pull/29), [medición](RENDIMIENTO_CONTORNOS_CAJAS_2026-11-22.md). |
| Búsqueda de colisiones con 2.000 piezas dormidas | **2.011.015 → 0 visitas** al predicado por consulta | Se omiten parejas pasivas que Cannon rechazaría; se conservan clasificación, orden y límites espaciales. Es un conteo de trabajo, no un tiempo. [PR #30](https://github.com/dbastias37/Q-bits/pull/30), [medición](RENDIMIENTO_SAP_2026-11-22.md). |
| 2.000 piezas en reposo, física a 60 Hz | **27,148 → 9,809 ms** por frame sintético parcial, pared p50 | Las matrices grandes de contactos limpian sólo las posiciones necesarias. [PR #31](https://github.com/dbastias37/Q-bits/pull/31), [medición](RENDIMIENTO_MATRIZ_CONTACTOS_2026-11-22.md). |
| Arranque frío de 2.000 piezas, física a 120 Hz | **6.477,938 → 369,776 ms**, mediana del máximo entre los cuatro primeros frames | Se evita el crecimiento costoso de la matriz durante los primeros contactos. [PR #32](https://github.com/dbastias37/Q-bits/pull/32), [medición](RENDIMIENTO_ARRANQUE_2026-11-22.md). |

El seguimiento frío más largo del PR #32 ejecutó **60 frames, 120 pasos y un segundo simulado**. Su pared total bajó de **11.310,300 a 5.488,819 ms**, conservando estado final, piezas, reposo y cero tiempo descartado. La espera extrema no se trasladó a los siguientes 56 frames. El p95 de esa ventana, sin embargo, pasó de 276,050 a 282,284 ms: el asentamiento ordinario sigue siendo costoso. [Datos y límites](RENDIMIENTO_ARRANQUE_2026-11-22.md#arranque-y-asentamiento-extendidos-2000-piezas-120-hz).

## Producción 20: una corrección del juego

El [PR #28](https://github.com/dbastias37/Q-bits/pull/28) corrigió el apoyo de los paquetes. A **60 Hz y 30 rpm**, la configuración inicial pasó de entregar **2/6 y fallar por presupuesto** a entregar **6/6 en 40,066667 segundos y 26,802111 J**, dentro del presupuesto de 30 J. Se conservaron las piezas, masas, recetas, velocidad, torque y fórmulas de consumo. Producción 19 mantuvo estados completos iguales a su referencia. [Informe y evidencia](CORRECCION_PRODUCCION20_2026-11-22.md).

Este arreglo añade CPU: **0,1460 / 0,1312 / 0,3004 ms por frame sintético** en la ventana común medida a 60/120/240 Hz. A 120 y 240 Hz también aumenta el consumo del lote, que se debita íntegro y sigue dentro del límite. Se presenta como una corrección física, sin convertirla en una supuesta mejora de rendimiento o ahorro universal de energía.

## Último bloque · PR #33: comprobar apoyos sólo cuando existen

Este cambio se publica en el [PR #33](https://github.com/dbastias37/Q-bits/pull/33). La serie completa abarca **ocho PR: siete de rendimiento y una corrección física**. El PR enlazado registra el commit y la hora exactos de integración; los datos siguientes corresponden al código validado de esa entrega.

Este último cambio se concentra en `onCampaignPad`: cuando la lista seleccionada de botones de presión está vacía, devuelve el mismo resultado falso sin calcular los límites geométricos de cada grupo. Cuando sí existen, conserva la consulta de apoyo y sus límites. No guarda una respuesta entre frames. El coste de la primera consulta posterior que sí necesita geometría se mide aparte, para distinguir trabajo eliminado de preparación diferida. [Código publicado](https://github.com/dbastias37/Q-bits/commit/7a851724ce17a05f0315cd0e0d17b2892566859b).

La serie final en reposo con **1.000 piezas a 120 Hz** reduce el p50 de pared del frame parcial de **8,110 a 6,818 ms** y la CPU de proceso media de **8,812 a 7,742 ms**. Son medianas entre tres pares de repeticiones con estados completos iguales. El perfil separado de 2.000 piezas conserva 16.000 llamadas a `onCampaignPad` y ocho pasos físicos, pero elimina sus **16.000 consultas `bounds`**. [Ensayo de reposo](mediciones/presion-20261122/settled-120.json.gz), [perfil de referencia](mediciones/presion-20261122/reference-blocks.json.gz) y [perfil del candidato](mediciones/presion-20261122/optimized-blocks.json.gz).

El ensayo posterior confirmó un límite: en un conjunto soldado de **2.000 formas mixtas sin botones**, la primera consulta de límites geométricos pasa de **0,044 a 126,665 ms**. Antes esa preparación se había pagado durante el lote de ánimo; ahora se difiere hasta necesitarla. El total que incluye creación, ánimo y esa primera consulta baja de **279,458 a 235,961 ms**, pero no puede presentarse como una mejora de la respuesta de toda primera consulta. Los cubos regulares ya habían preparado sus límites al crearse; con botones presentes, su control de 2.000 piezas incluso empeora el total de **45,819 a 48,503 ms**. [Consulta posterior y conteos separados](mediciones/presion-20261122/RESULTADOS.md).

Este bloque usa como referencia `274a389b77d0f57c9f4c13d56c5caf86070b1b0d`, integración del PR #32. Las 18 configuraciones calientes completaron tres pares cada una, incluido el límite de 2.000 piezas a 240 Hz. Se verificaron también 117 pares fríos, 72 de consulta posterior y 13 equivalencias funcionales. [Informe del cambio](RENDIMIENTO_CONSULTAS_PRESION_2026-11-22.md) y [evidencia completa](mediciones/presion-20261122/README.md).

## Una serie de cambios revisables

La fecha usa **America/Santiago (UTC−03:00)**. El primer PR fue #26, abierto a las 11:37:55 e integrado a las 12:36:39 del 22 de noviembre. Hasta #32 se integraron siete PR: seis de rendimiento y la corrección física de Producción 20. Los horarios siguientes son los eventos de integración de GitHub.

| PR | Hora local | Alcance | Commit integrado |
| --- | --- | --- | --- |
| [#26](https://github.com/dbastias37/Q-bits/pull/26) | 12:36:39 | Apuntado, Ctrl, sensores, contactos para peso y baterías | `0cb0780` |
| [#27](https://github.com/dbastias37/Q-bits/pull/27) | 13:12:20 | Guardado y lecturas | `41bc729` |
| [#28](https://github.com/dbastias37/Q-bits/pull/28) | 14:09:33 | Corrección física de Producción 20 | `b20cb02` |
| [#29](https://github.com/dbastias37/Q-bits/pull/29) | 15:26:20 | Contornos compartidos de cajas | `a988610` |
| [#30](https://github.com/dbastias37/Q-bits/pull/30) | 16:52:06 | Parejas pasivas de SAP | `1465a6c` |
| [#31](https://github.com/dbastias37/Q-bits/pull/31) | 17:48:21 | Limpieza registrada de matrices | `4fc563c` |
| [#32](https://github.com/dbastias37/Q-bits/pull/32) | 18:31:49 | Crecimiento de matrices en el arranque | `274a389` |

La referencia inicial de esta serie es `1a0425a250b7911a8c230eb5d8534c54e3a03953`. Las mejoras anteriores de cintas, consultas eléctricas, interacción y colisiones ya formaban parte de ella y no se vuelven a contar como nuevas. Cada PR posterior usa como referencia la integración anterior; los informes documentan los hashes y las muestras.

## Qué se conservó y qué falta

La suite pasó de **1.176/1.176 antes de #26 a 1.269/1.269 en el código final**, con 93 regresiones nuevas en el período. El último cambio añadió ocho: su referencia pasó 1.261/1.261 y el candidato 1.269/1.269, sin fallos, cancelaciones ni omisiones. La validación final conserva además **21 controles de arquitectura y 36 casos de suelo** exactamente, excluyendo sólo el hash que identifica la fuente. Producción 19/20, consumo, entregas, cámaras y tiempo se comparan a preferencias reales de 60/120/240 Hz. Las mejoras mantienen Cannon, la arquitectura estática, el límite de 2.000 piezas y la simulación de mecanismos fuera de cámara. [Validación final](mediciones/presion-20261122/validation-summary.json).

Hay límites concretos que permanecen en la evidencia:

- **Primera consulta de grupos grandes:** en #26, construir el BVH para el primer rayo cercano de 1.000 piezas costó 11,514 ms, frente a 1,616 ms de la referencia. El último cambio también deja visible preparación diferida de límites en conjuntos mixtos. El trabajo de estas consultas frías sigue separado de las mejoras de reposo.
- **Guardado:** la primera escritura de 2.000 piezas sobre un slot vacío pasó de 97,393 a 116,650 ms por una validación adicional. La captura, hidratación y latencia real de Web Storage siguen pendientes.
- **Física y mecanismos:** los cambios de SAP y matrices tienen casos pequeños, densos y articulados desfavorables. La eliminación de la pausa extrema no elimina el solver, el asentamiento ni todos los recorridos de controladores.
- **Arranque residual:** los máximos de 2.000 piezas medidos en #32 quedaron entre unos 205 y 711 ms según la frecuencia. Su ensayo caliente de 2.000/240 fue incompleto por presupuesto y se conserva como tal; la serie del último bloque sí completó sus tres pares. Completar un benchmark no equivale a eliminar las pausas de arranque o certificar 60 FPS.
- **Navegador:** Chromium local falló al crear sockets y el navegador remoto anterior no pudo inicializar WebGL. GLES permitió comprobar imágenes, pero no sustituye jugar y medir en un navegador real.

Los informes de cada PR conservan los resultados desfavorables y las ejecuciones incompletas. Pared mide duración transcurrida; CPU de proceso mide trabajo de usuario+sistema y puede incluir hilos auxiliares. Un presupuesto de 16,67 ms pertenece al frame completo: a física de 240 Hz normalmente lo comparten cuatro pasos y el resto del juego.

Los [metadatos de GitHub](mediciones/presion-20261122/day-pr-metadata.json) conservan las fechas, referencias y commits usados para reconstruir la serie histórica. Los manifiestos de cada paquete permiten comprobar sus datos y regenerar las tablas sin volver a ejecutar rendimiento.
