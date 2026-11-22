# Producción 20: apoyo físico a 60, 120 y 240 Hz

Fecha: 22 de noviembre de 2026. Bloque posterior al PR #27, limitado al fallo de la estación de empaquetado a 60 Hz y 30 rpm.

## Resultado y referencia

La configuración original de Producción 20 vuelve a completar sus seis paquetes en las tres frecuencias reales. Se conservan las doce identidades, la masa total de seis unidades, las 30 rpm, el torque máximo de 0,4 N·m, el dosificador de 2,4 s, el trabajo de empaque de 0,7 s, la autonomía mínima de 15 s y el presupuesto de 30 J. El consumo del motor y de la línea sigue debitándose de las baterías reales.

La referencia es `main` en `41bc729c90dde1d1a205ebd1d4c2463b069d688c`, merge del PR #27. Se comprobó la rama, el remoto y la ausencia de cambios locales antes de crear `fix/production20-60hz-20261122`; se conservó un worktree independiente de referencia. Las cinco optimizaciones CPU y el guardado anteriores permanecen vigentes.

Código publicado: `f48cb4cb28c9be4a1404adeead44ef2b274f4d28`. El commit local usado por la medición principal es `777fa7d139015161deb56491b14848932814df73`; sus árboles coinciden exactamente: `0e92e7dc818940364de4bc6ed897593b753c9f26`. Los identificadores de commit difieren por la metadata de publicación mediante GitHub, no por archivos distintos.

| Fuente | SHA-256 |
| --- | --- |
| `game.js` de referencia | `19efe4aa93ceac0791968c5d4e85ea6f5a980cf65b0b3302f20a70933ffe6da0` |
| `game.js` corregido y validado | `723a4b6c35369ec900744b17826c39aa7eb24bc678cb217568ae98594548e938` |
| Cannon 0.6.2, conservado | `0e63a043c15379cdbf940ab364c239363fc4e2803013a4c98ee3788fd3aa27ab` |

La traza se tomó antes del commit local: su metadata indica correctamente `trackedChanges: true` sobre la referencia, y contiene el mismo hash corregido de `game.js`. La medición principal se tomó después del commit. Versión de carga: `20261122-production-contact-1`.

## Causa comprobada

Esta instalación guiada usa `productionForces`, no las cintas modulares ni los rodillos virtuales. El controlador aplica fuerzas a los cuerpos y comparte el límite `min(3.2, maxTorque/.045/on.length)`. No se modificó ese cálculo.

La reproducción de referencia a 60 Hz entregó dos paquetes y falló por presupuesto en 59,333333 s, con 30,004371 J. La traza identifica dos paquetes casi inmóviles sobre cuatro apoyos planos, conservando altura válida, motor activo y fuerza aplicada. Uno queda delante de la salida, impide emitir el siguiente paquete y detiene el flujo. El reposo contextual no actúa sobre estos paquetes sueltos; `SLEEPY` de Cannon no significa `SLEEPING`.

En el Cannon incluido, `createFrictionEquationsFromContact` asigna a **cada** punto el presupuesto completo `μmg` del cuerpo. `GSSolver.solve` compara directamente ese número contra el impulso de la ecuación. Son dos efectos distintos: multiplicidad de apoyos y conversión de fuerza a impulso. Q-bits ya trata esa distinción en otros controladores; esta entrega aplica una corrección propia a la estación empaquetadora.

La sonda de la traza se instala a la entrada del solver nativo, **después** del wrapper del juego. Por tanto, registra el límite efectivamente usado durante la resolución, no el valor restaurado después. Muestra del paquete de IDs 9 y 10, antes del paso que termina en 29 s, a 60 Hz:

| Magnitud | Referencia |
| --- | ---: |
| Masa del cuerpo | 0,25 kg |
| Coeficiente de fricción / gravedad | 0,38 / 9,8 m/s² |
| Fuerza longitudinal aplicada | 2,222222 N |
| Velocidad X | 0,0000971 m/s |
| Contactos de apoyo / ecuaciones tangenciales | 4 / 8 |
| Presupuesto físico `μmg·dt` | 0,0155167 N·s |
| Suma de límites X usada por el solver | 3,724 N·s |

El último valor es un **límite permitido**, no una fuerza ni un impulso efectivamente ejercido en cada paso. Convertido a fuerza equivalente a 60 Hz permite 223,44 N, suficiente para cancelar la tracción disponible. La traza muestra además vuelcos durante el avance previo; no faltaban materia, potencia ni tiempo simulado.

Después del cambio, un paquete de la misma masa, apoyado en cuatro puntos, recibe un límite X agregado de **0,0155167 N·s**, equivalente a **0,931 N**, y avanza aproximadamente a **0,25917 m/s** en esa muestra. La fuerza aplicada es 0,93250 N. No se trasladan posiciones ni se fuerzan velocidades para entregar productos.

### Hipótesis descartadas

- `tickProduction` se ejecuta después de `updateRotorPower` en cada paso físico; no pertenece al ciclo lento de lógica.
- El ledger exige los mismos IDs y recetas y no depende de `dt`.
- El paquete bloqueado conserva el intervalo de altura y los contactos de mesa admitidos.
- El bloqueo aparece con cuatro o cinco cuerpos de material, sin una acumulación masiva de cuerpos.
- Las baterías iniciales contienen 480 J; el fallo original corresponde al objetivo de 30 J.
- La ganancia longitudinal aislada no explica el equilibrio inmóvil sobre cuatro contactos.
- Los rodillos virtuales, los controladores de cintas modulares y el reposo de mecanismos no son la ruta de esta estación.

## Cambio aplicado y alcance

`setupProduction` conserva una referencia al cuerpo exacto de su mesa. `productionContactFriction` se ejecuta dentro del wrapper del solver cuando la narrowphase ya produjo los contactos y ecuaciones del paso actual.

El ajuste requiere una estación empaquetadora activa y con alimentación válida, material del lote actual y ausencia de agarre. Sólo admite pares contra su mesa cuyos contactos habilitados sean todos de apoyo superior. Las caras laterales, obstáculos, suelo, otros lotes y otros cuerpos conservan sus límites. Producción 19 retorna antes de construir mapas.

Para un cuerpo con `n` apoyos y dos tangentes por apoyo, cada límite original se multiplica por `dt/n`, conservando el material elegido por Cannon. Se mantiene el orden de ecuaciones y la resolución física atómica. El `finally` existente restaura ambos límites de cada ecuación, también si el solver falla, antes de que Cannon recicle sus objetos.

Las fórmulas de consumo, las capacidades, las condiciones de empaque/recepción, el reinicio, la generación finita de materia, los parámetros de motor y las frecuencias seleccionables permanecen iguales. La corrección cambia las trayectorias físicas de Producción 20; por eso no se exige igualdad de sus poses con un baseline que se atasca. Sí se exige conservación exacta de identidades, recetas y masa, y balance de energía con tolerancia de suma flotante de `1e-7 J`. Los relojes se comprueban con tolerancia de `1e-8 s`.

## Producción antes y después

Tres repeticiones comparables, orden AB/BA/AB. Las entregas, tiempos de lote y joules fueron deterministas: el mínimo y el máximo de las tres repeticiones coinciden. Los tiempos siguientes corresponden al paso terminal del lote.

| Frecuencia real | Entregas antes → después | Tiempo del lote antes → después | Energía antes → después |
| --- | --- | ---: | ---: |
| 60 Hz | 2/6, falla → 6/6, completa | 59,333333 → 40,066667 s | 30,004371 → 26,802111 J |
| 120 Hz | 6/6 → 6/6 | 40,816667 → 39,975000 s | 24,565440 → 26,857198 J |
| 240 Hz | 6/6 → 6/6 | 41,291667 → 39,933333 s | 25,910872 → 26,890718 J |

**El gasto sube respecto del baseline de 120 y 240 Hz.** Sigue dentro de los 30 J y coincide con el débito real; no se conserva una cifra artificialmente menor omitiendo trabajo. A 60 Hz el baseline y la corrección no completan la misma cantidad de productos, por lo que no se presenta su diferencia temporal como un porcentaje de optimización.

Producción 19 conserva exactamente los hashes de estado completo en todas las parejas: cuerpos, poses, velocidades, motores, energía, ledger, guardado y relojes. Entrega tres unidades con 6,817645 / 6,944896 / 7,192280 J a 60/120/240 Hz. No se utilizó la alternativa de bajar a 29 rpm.

### Tiempo simulado y pasos efectivos

Las preferencias se seleccionan **antes de crear articulaciones**. El benchmark avanza fotogramas regulares de `1/60 s`, que ejecutan uno, dos o cuatro pasos físicos. La cámara cambia cada segundo; la producción continúa.

| Hz | Pasos del scheduler y Cannon, antes → después | Tiempo simulado al final del fotograma, antes → después | Tiempo descartado |
| --- | ---: | ---: | ---: |
| 60 | 3560 → 2404 | 59,333333 → 40,066667 s | 0 → 0 s |
| 120 | 4898 → 4798 | 40,816667 → 39,983333 s | 0 → 0 s |
| 240 | 9912 → 9584 | 41,300000 → 39,933333 s | 0 → 0 s |

El final de un lote puede caer antes del último paso del mismo fotograma. La traza captura entonces el débito exacto antes de que el rotor apagado recupere energía. La medición principal informa por separado el final de fotograma y no confunde esa recuperación con consumo omitido.

El reloj `world.time` de este Cannon suma `dt` tanto en `internalStep` como en `step(dt)`. Se conserva ese comportamiento del motor; la verificación usa el paso seleccionado, `world.stepnumber`, `simTime`, `s.time` y los acumuladores. No se interpreta ese campo duplicado como doble avance físico.

## Coste de CPU y tiempo de pared

Equipo de referencia: Linux x64, Node **v24.22.3**, CPU reportada **AMD EPYC 9V74 80-Core Processor**, nueve procesadores disponibles para el entorno. DOM/GPU simulados de 1280×720, sombras apagadas, cámara y preferencias idénticas. No se ejecutaron otros tests ni perfiles durante las mediciones principales.

Se excluyen de los percentiles los primeros 300 fotogramas simulados de cada recorrido como calentamiento, sin reiniciar el estado. Hay 36 recorridos principales: dos niveles × tres frecuencias × tres repeticiones × dos variantes. La instrumentación detallada vive en otros doce recorridos, con una pareja por escenario.

Cada muestra principal incluye `advanceSimulation` y, uno de cada seis fotogramas, `updateTarget` y `drawQubits` con GPU simulada. `process.cpuUsage` mide CPU del proceso; `performance.now` mide tiempo transcurrido. No son porcentaje de utilización ni trabajo completo del hilo principal de Chrome.

La ventana común de **5–15 s simulados** compara la misma duración de actividad, antes de que termine alguno de los recorridos. Los valores son medianas de las tres medias; los rangos son mínimo–máximo entre repeticiones.

| Escena / Hz | CPU antes, ms/fotograma simulado | CPU después, ms/fotograma simulado | Diferencia de medianas |
| --- | --- | --- | ---: |
| Producción 20 / 60 | 0,6163 [0,6091–0,7018] | 0,7623 [0,6912–1,0186] | +0,1460 ms |
| Producción 20 / 120 | 1,0034 [0,9922–1,0813] | 1,1346 [1,1122–1,1633] | +0,1312 ms |
| Producción 20 / 240 | 1,8171 [1,7581–1,9184] | 2,1175 [2,0312–2,1293] | +0,3004 ms |
| Control Producción 19 / 60 | 0,6100 [0,6023–0,7509] | 0,6446 [0,6354–0,7838] | +0,0346 ms |
| Control Producción 19 / 120 | 1,0785 [1,0647–1,1161] | 1,1179 [1,0484–1,1268] | +0,0394 ms |
| Control Producción 19 / 240 | 1,6955 [1,6771–1,8743] | 1,6879 [1,6864–1,7317] | −0,0075 ms |

El ajuste incorpora trabajo y modifica los contactos físicos. Los rangos del control muestran variación temporal aun con estado final idéntico. Este bloque corrige la validez del transporte; sus resultados no se contabilizan como una nueva reducción general de CPU.

Percentiles de pared del recorrido completo después del calentamiento, expresados como mediana de cada percentil entre las tres repeticiones:

| Hz | Antes p50 / p95 / p99, ms | Después p50 / p95 / p99, ms |
| --- | --- | --- |
| 60 | 0,5167 / 1,0155 / 1,5093 | 0,4325 / 0,8837 / 1,4306 |
| 120 | 0,7088 / 1,2314 / 1,8400 | 0,8066 / 1,2813 / 1,6190 |
| 240 | 1,3927 / 2,0224 / 2,5370 | 1,5400 / 2,1508 / 2,7375 |

El recorrido completo de 60 Hz tiene cargas diferentes: el baseline permanece atascado y entrega menos. La ventana común anterior evita atribuir una ganancia global a esa diferencia. Los JSON conservan también percentiles de CPU, todas las muestras y las sumas de proceso/tiempo de pared.

Esta escena pequeña no establece el límite de construcciones grandes ni certifica 60 FPS. La referencia de gran escala continúa en [AUDITORIA_CPU_2026-11-22.md](AUDITORIA_CPU_2026-11-22.md): el trabajo parcial de 500 cuerpos independientes ya incumple 16,67 ms en el entorno medido. No se repite ni se redefine esa escala en este arreglo.

## Conteos, memoria y ciclo de vida

La traza mide el inventario después de cada paso. En Producción 20 a 60 Hz, el pico pasa de 5 a 4 cuerpos de material simultáneos porque mejora el flujo. Las doce identidades siguen presentes exactamente una vez entre reserva, cuerpos, cámara y entregas.

| Pico a 60 Hz | Antes | Después |
| --- | ---: | ---: |
| Piezas físicas presentes | 10 | 9 |
| Cuerpos físicos, incluidos estáticos de la sala | 57 | 56 |
| Formas físicas | 57 | 56 |
| Cuerpos despiertos | 6 | 5 |
| Contactos / ecuaciones de contacto | 19 / 19 | 16 / 16 |
| Ecuaciones de fricción | 38 | 32 |
| Restricciones / ecuaciones de restricción | 1 / 6 | 1 / 6 |
| Sensores / motores activos | 0 / 1 | 0 / 1 |

Los apoyos corregidos llegan a cuatro cuerpos y 32 ecuaciones tangenciales en los tres Hz. Las visitas a ecuaciones ajustadas son 44.352 / 88.704 / 177.504 en los recorridos completos respectivos. Estas cifras pertenecen a la traza instrumentada y no contaminan los tiempos principales.

Memoria añadida al juego: una referencia al cuerpo de la mesa en el estado de la estación. Cada llamada activa construye un mapa de cuerpos y, cuando hay apoyos válidos, otro de límites por ecuación; en estos ensayos tuvieron como máximo 4 y 32 entradas. El mecanismo existente de restauración añade hasta 32 tuplas temporales. También existe el array temporal de descubrimiento del lote y una función local. No se retienen contactos ni historial entre pasos.

La complejidad adicional es lineal en grupos, contactos y ecuaciones actuales, con dos pasadas sobre las ecuaciones de fricción. Los datos pertenecen a la llamada al solver, son válidos después de narrowphase y expiran al terminar la llamada. Cada paso reconstruye su presupuesto con los cuerpos y contactos actuales, por lo que eliminación, agarre, unión, reset y cambio de escena no reutilizan un índice anterior. La referencia de mesa pertenece a la escena actual.

No se midieron bytes exactos de V8, asignaciones ni GC en este bloque; se informan objetos/entradas observados. Las trazas de la herramienta están acotadas a 256 snapshots y los arrays temporales de medición a 3600 fotogramas por recorrido. No se incorporan al juego.

## Validación integrada

- **1223/1223 pruebas aprobadas**, cero fallos, cancelaciones u omisiones; 54,283 s de pared de la ejecución de la suite. Este tiempo de suite no es una medida de rendimiento del juego.
- Diez regresiones nuevas: seis combinaciones nivel/frecuencia, salida bloqueada con pausa/pestaña oculta y recuperación, paquete plano con cuatro cargas, alcance de contactos y ciclo de vida/restauración excepcional.
- La regresión de Producción 20 a 60 Hz falla sobre la referencia por presupuesto y pasa con el cambio.
- 18 parejas principales y seis parejas con instrumentación. Producción 19 conserva nueve comparaciones principales y tres instrumentadas con estado completo exactamente igual.
- Las 36 caídas de rotor, pivote, bisagra y brazo conservan **exactamente** los resultados de la auditoría anterior: impactos, reposo antes de 2,717 s, penetración máxima de 1 mm, deriva y velocidades finales cero, identidades y masa.
- `benchmark-architecture-audit.cjs` produjo 21 informes exactamente iguales a la referencia vigente `41bc729`, conservando apuntado, Ctrl, sensores, baterías y guardado. Frente a la auditoría CPU anterior al PR #27, el guardado repetido ya usa dos parseos en vez de tres; esa mejora pertenece al bloque de guardado, no a esta corrección.
- Se comprueban el torque original, freno/bloqueo por obstáculo, entrega de cargas, energía, pausa, cámara, reinicio, guardados y demás mecanismos mediante la suite y los fixtures descritos.

El renderizador y los shaders permanecen iguales. La validación usa Cannon real en Node con DOM/GPU simulados. La limitación de navegador/WebGL registrada en la auditoría anterior sigue abierta: **FPS, GPU, Chrome Main y asignaciones del navegador no medidos**. La calibración jugable por parte del usuario sigue siendo una tarea distinta de esta cobertura lógica/física.

## Reproducción y evidencia

Desde el checkout del cambio:

```bash
git worktree add --detach ../qbits-production-baseline 41bc729c90dde1d1a205ebd1d4c2463b069d688c
node --test tests/*.test.cjs
node tests/benchmark-production-frequency.cjs --baseline-root=../qbits-production-baseline --mode=trace --output=/tmp/produccion-traza.json
node tests/benchmark-production-frequency.cjs --baseline-root=../qbits-production-baseline --mode=timing --repetitions=3 --output=/tmp/produccion-tiempos.json
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
```

Ejecutar los comandos de medición de forma secuencial, sin otros tests/perfiles simultáneos. Cada recorrido está limitado a 60 s simulados y 60 s de pared; todos completaron su condición terminal sin alcanzar el límite de pared. La duración hasta fallo del baseline de 60 Hz queda explícita.

La evidencia está en [mediciones/produccion20-20261122](mediciones/produccion20-20261122/README.md): resumen legible en JSON, muestras/trazas completas comprimidas sin pérdida, logs, suite, contactos de suelo, auditoría de operaciones y manifiesto SHA-256. La compresión sólo cambia el almacenamiento del informe, no la medición.

## Fuentes primarias y decisiones

- [Cannon Narrowphase](https://schteppe.github.io/cannon.js/docs/files/src_world_Narrowphase.js.html), construcción de fricción por contacto, y [GSSolver](https://schteppe.github.io/cannon.js/docs/files/src_solver_GSSolver.js.html), límite de impulso. La página publicada se etiqueta 0.6.1; se verificaron esos comportamientos en el archivo **0.6.2 incluido y hasheado**, que es la referencia ejecutada.
- [Node `process.cpuUsage`](https://nodejs.org/api/process.html#processcpuusagepreviousvalue): CPU de usuario/sistema del proceso, separada del tiempo transcurrido.
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/): revisión del trabajo real de navegador, que sigue pendiente en un equipo con WebGL disponible.
- [MDN Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing): el umbral de 50 ms no basta para detectar todos los incumplimientos de 16,67 ms. No se recogieron entradas LoAF ni se usaron para afirmar fluidez.

## Continuación

El próximo bloque es el coste de **muchos cuerpos independientes y numerosas articulaciones**, separando broadphase/contactos/solver/controladores y conservación del tiempo. Después quedan el pico frío del BVH, sombras, sensores de movimiento y el coste síncrono de capturar/validar/hidratar guardados grandes. La evaluación en navegador/WebGL permanece necesaria para relacionar los tiempos parciales de Node con el presupuesto total de fotograma.
