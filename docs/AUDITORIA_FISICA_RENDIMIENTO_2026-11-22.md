# Auditoría de física y rendimiento de Q-bits — 22 de noviembre de 2026

## Decisiones y estado de esta entrega

Se corrigieron dos problemas nuevos de arquitectura: las cajas espaciales AABB
de Cannon y el trabajo geométrico innecesario de los enfriadores. También se
corrigieron causas funcionales del rebote perdido y el reconocimiento de un
caminante de cuatro apoyos con un servo auxiliar superior. Los otros ocho
hallazgos de rendimiento quedan pendientes, con evidencia y una propuesta acotada.

La simulación conserva cuerpos, masas, piezas, articulaciones y reglas del juego.
El enfriador conserva su recuperación de energía y ánimo, sus tiempos y capacidad.
Esta auditoría no propone cambiar de motor gráfico, reemplazar Cannon ni reducir
la frecuencia de la física como solución inmediata.

**Verificación final:** 1176/1176 pruebas aprobadas, cero fallos, cancelaciones,
omisiones o pendientes; duración de esta ejecución: 47,19 s. Se añadieron 45
regresiones sobre la referencia. La suite conserva campaña, guardado, máquinas,
sensores, energía y las frecuencias seleccionables. Son pruebas con DOM/GPU
simulados, no una partida visual ni una medición de FPS.

## Referencia y alcance de la evidencia

- Commit de referencia: `d79a1326e3ace210aad89ce45cb1817af60cf0ac`.
- `assets/js/game.js` original, SHA-256: `e41d68412429a05fe9f0219fedd4040a290e1466754a6d2e2f90ad03ce393ff3`.
- Las líneas aproximadas de la tabla corresponden a esa referencia; los nombres
  de función permiten localizar el código después de integrar los cambios.
- Se ejecutaron las funciones de producción y Cannon 0.6.2 real con el
  [harness del repositorio](../tests/game-harness.cjs), que simula DOM y GPU.
- Los conteos describen llamadas o candidatos examinados. Los tiempos del A/B
  describen exclusivamente CPU en `updateCooling`. Ninguno equivale a FPS reales.
- Las escenas son casos controlados y reproducibles; no son una captura de la
  partida concreta del jugador. Una ganancia depende de qué sistemas use su sala.

Se excluyen de esta lista las optimizaciones anteriores de suministro eléctrico,
rodillos virtuales, búsquedas SAT, contornos de selección en GPU, miniaturas, VAO y
reposo. Los problemas de baterías y sensores aquí descritos son rutas distintas.

## Diez hallazgos nuevos

| # | Estado | Problema y ubicación | Evidencia | Decisión o siguiente cambio |
| --- | --- | --- | --- | --- |
| 1 | **Corregido** | AABB nativas incoherentes con las transformaciones de colisión. `Body.computeAABB` y `ConvexPolyhedron.calculateWorldAABB` de Cannon. | El cuerpo componía rotaciones y offsets en un orden distinto de la narrowphase; el cálculo convexo usaba mínimos/máximos excluyentes. Pruebas contra vértices reales reproducen ambos defectos. Ahorro de CPU no medido. | Adaptador de compatibilidad puntual: misma geometría y transformaciones que los contactos. Regresiones de extremos, rotación local, offsets y contacto real. |
| 2 | **Corregido** | `updateCooling`, ~7680: cada enfriador transforma piezas lejanas. | Ocho enfriadores vacíos y 1000 piezas lejanas: **8000 `corners` por tick**. Con el descarte espacial final: **0** transformaciones de esas piezas. A/B de CPU: **23,6498 → 1,3957 ms** de mediana. | Descartar bounds XZ disjuntos antes de la prueba circular exacta. Mantener la ruta original de los rodillos virtuales. |
| 3 | Pendiente | `landingProjection`, ~4845; `drawGuides`, ~5720: proyección de caída con Ctrl. | 64 piezas tomadas, 940 lejanas y nada debajo: **541440 `rayPart`** por proyección, equivalentes a 64 × 9 × 940. | Filtrar candidatos por la columna XZ de caída y conservar rayos exactos, huecos, mesas y repisas. |
| 4 | Pendiente | `drawQubits`, ~5934: sombras enviadas por pieza. | Un bloque de 1000 cubos: **2 llamadas de dibujo** sin sombras frente a **1002** con sombras suaves o nítidas. Conteo de `submitDraw`, sin medición de GPU. | Agrupar o instanciar sombras compatibles; verificar silueta, altura, opacidad y mezcla mediante imágenes renderizadas. |
| 5 | Pendiente | `aimQubit`, ~1717; `updateTarget`, ~5634: consultas globales repetidas al apuntar. | 1000 piezas fuera del alcance de 2,7 m: **1000 `rayPart` por consulta**, **3000 por actualización completa** del objetivo. | Consulta espacial por rayo y alcance, con resultado compartido en la actualización. Conservar prioridades de oclusión. |
| 6 | Pendiente | `tickContactSensors`, ~10084; `drawWorkshop`, ~10103: descubrimiento de sensores. | 1000 piezas normales, sin sensores: **1000 `partState` por tick y otras 1000 por dibujo**. Sin adaptación, `workshop.js` crea estados predeterminados. | Ruta rápida para ausencia de metadata; después, registro de sensores con invalidación por adaptación, división, carga y eliminación. |
| 7 | Pendiente | `sensorWeight`, ~9967; `sensorContactActive`, ~9942: contacto recorrido de nuevo por lectura. | 128 cubos generan 512 contactos reales; **16 lecturas de peso examinan 8192 candidatos**. Las lecturas de contacto repiten la misma lista. | Índice de contactos y apoyos compartido por paso; mantener selección por shape y recuperación de pilas dormidas. |
| 8 | Pendiente | `sensorMotion`, ~10000: cada lectura recorre todos los cuerpos. | 16 lecturas con 134 cuerpos: **2144 candidatos**. La limitación existente a 30 Hz reduce la frecuencia, pero no el tamaño de cada búsqueda. | Consulta espacial conservadora, seguida por distancia exacta y movimiento lineal/angular. |
| 9 | Pendiente | `externalBatteryPackComponents`/`rechargeExternalBatteries`, ~5350–5373; `batteryVisualPacks`, ~5737. | 32 packs llenos de tres celdas: **64 pruebas de caras contiguas por tick**. Líquidos, dibujo opaco y transparente reconstruyen la topología **tres veces por pack/fotograma**. | Cachear composición y dimensiones locales por revisión de geometría. Mantener carga, activación y pose en vivo; estudiar salida temprana para packs llenos. |
| 10 | Pendiente | `saveCurrentGame`/`autosaveGame`, ~8784/8806; `save-games.js`: guardado síncrono repetido. | Guardar de nuevo 1000 piezas sin cambiar estado escribe **388295 bytes**, con dos `JSON.stringify`, tres `JSON.parse` y 1000 copias de estados de ánimo. | Evitar snapshots idénticos, preparar trabajo por bloques y evaluar escritura asíncrona con migración conservadora. Preservar validación y último guardado válido. |

Los conteos de referencia y sus escenarios están en
[auditoria-arquitectura-base-20261122.json](mediciones/auditoria-arquitectura-base-20261122.json).
Una cifra de candidatos no mide el coste exacto de cada candidato ni la duración
del fotograma. Sirve para localizar trabajo que crece con el tamaño de la fábrica.

### Complejidad y cautelas de los ocho pendientes

**Proyección y apuntado.** La proyección escala con piezas tomadas × puntos de
muestreo × piezas de escena; apuntar escala con piezas de escena y se repite.
Un índice espacial debe reducir candidatos antes de la geometría exacta. Usar
sólo una caja para dar el resultado final taparía huecos y cambiaría interacciones.

**Sombras.** Agrupar el sólido no agrupa automáticamente las sombras. La evidencia
muestra llamadas de dibujo adicionales, no saturación confirmada de GPU. La
mejora exige comprobar el resultado visual y las transparencias en navegador.

**Sensores sin adaptación.** La ruta rápida puede ser pequeña: omitir la creación
de defaults cuando la pieza carece de metadata de taller. Una metadata existente
debe seguir validándose; no basta con confiar en un campo aislado `sensor:true`.

**Sensores de peso y contacto.** El coste actual se repite por sensor × contactos.
Puede compartirse el grafo del paso, pero no conservar indefinidamente el peso:
una carga, un agarre o una separación puede cambiarlo sin alterar todos los nodos.
Las pruebas actuales separan las lecturas de la adaptación y los comandos.

**Sensores de movimiento.** Filtrar por centro de masa no es conservador para
un cuerpo largo que entra en el radio. El índice debe considerar su extensión,
velocidad angular y objetos fuera de cámara, igual que la consulta actual.

**Packs de batería.** La geometría local es reutilizable mientras no cambien las
piezas y conexiones. La energía y el estado encendido se leen en cada actualización.
Este cache es independiente del suministro a motores ya optimizado anteriormente.

**Guardado.** El caso sin cambios demuestra una escritura evitable, pero durante
la simulación los estados de ánimo y la energía sí cambian. Un indicador de cambios
necesita representar todas las mutaciones pertinentes. La eventual migración a
IndexedDB requiere conservar las partidas anteriores y una recuperación segura.

## Correcciones físicas: contacto, rebote y reposo

### AABB coherentes con los sólidos

El adaptador calcula `worldQuaternion = bodyQuaternion * shapeQuaternion` y rota
el offset local exclusivamente por la orientación del cuerpo, igual que la
obtención nativa de contactos. Cada vértice convexo contribuye tanto al mínimo
como al máximo del AABB; el primer vértice ya no puede quedar fuera de un extremo.

Esto corrige candidatos omitidos o admitidos incorrectamente antes del contacto.
No modifica el sólido, su masa ni el material. Las regresiones cubren cuerpos
compuestos rotados, offsets locales, orden de vértices y un contacto real que
la selección espacial debe conservar. No se atribuye un porcentaje de CPU a este
cambio sin una medición representativa del conjunto de la simulación.

En la matriz de 36 combinaciones de rotación y offset, las 36 cajas anteriores
excluían algún vértice real; con la corrección ninguna lo excluye y los extremos
coinciden con los vértices. Una pareja de prueba físicamente superpuesta pasa de
cero contactos a ocho contactos nativos. Es una corrección de exactitud, sin
un porcentaje de aceleración atribuido.

### Preservación del impacto y del material

La corrección geométrica del piso se aplica una vez al conjunto después de las
articulaciones. Conserva la velocidad descendente para que Cannon resuelva el
impacto siguiente; antes, una corrección de posición podía borrar esa velocidad.
Se elimina también el límite oculto de restitución de 0,025 ligado al número de piezas.
Los contactos muy lentos de reposo conservan su tratamiento inelástico.
Desde 1 m, un rotor a 120 Hz llega ahora con aproximadamente 4,38 m/s al primer
contacto; el código anterior anulaba esa velocidad. La restitución predeterminada del laboratorio
sigue en 0,12 y permanece el límite de velocidad existente de 6 m/s: un mecanismo
no debe rebotar como una pelota si su material y sus articulaciones disipan energía.

La corrección comprueba que exista el plano horizontal real, que sea estático
y que las máscaras y respuestas de colisión permitan el contacto. Respeta la
altura y el offset del plano. Formas desactivadas y cuerpos sin formas no crean
apoyo invisible; un piso inclinado sigue resolviéndose con la geometría nativa.

### Matriz de 36 caídas: aprobada

Se probaron rotor, pivote, bisagra y brazo, a 60, 120 y 240 Hz, desde alturas de
1, 2 y 5 m: **4 mecanismos × 3 frecuencias × 3 alturas = 36 casos**.
Cada caso simuló cuatro segundos; el último segundo se usó para medir reposo.

- Los 36 casos produjeron contacto y conservaron piezas, masas y tipos de cuerpo.
- Ninguno llegó al primer contacto con velocidad artificialmente casi nula.
- Los 36 terminaron en reposo, con velocidades lineales y angulares en cero.
- La deriva de posición observada durante el último segundo fue cero.
- La penetración máxima fue aproximadamente **1 mm**, el margen de corrección.
- El primer reposo más tardío apareció a los **2,7167 segundos** desde el inicio.

Esta matriz mide mecanismos sobre el piso horizontal de laboratorio. No demuestra
estabilidad de toda geometría posible ni rendimiento de una fábrica completa.
La fuente integrada medida tiene SHA-256
`d5b6af65ab6a413634e6cf70bc3ea88a16a0ab9cc81b4d5af2364045caf16159`.
Resultados por mecanismo, frecuencia y altura:
[contactos-suelo-20261122.json](mediciones/contactos-suelo-20261122.json).

### Dos mecanismos que se tocan

La regresión de dos brazos usa empuje físico y el controlador real de la mano,
registra contactos entre ambos y luego los suelta. Después de tres segundos de
asentamiento, la deriva máxima del segundo siguiente baja de 8,61 mm a cero en
esa reproducción. Siguen siendo cuerpos dinámicos y los motores siguen apagados.

Este resultado no implica reposo universal. Puede quedar velocidad residual
interna en un eslabón despierto aunque las poses del par permanezcan estables;
el reposo contextual todavía no agrupa islas de mecanismos independientes.
Mesas, apoyos móviles y pendientes conservan el reposo ordinario de Cannon.
Una superficie sin fricción sigue permitiendo deslizamiento.

## Enfriadores: cambio acotado y medición A/B

El descarte compara los bounds XZ del grupo con un cuadrado de radio 0,316 m.
Sólo los candidatos supervivientes ejecutan la prueba circular original de
0,315 m sobre sus vértices. El milímetro adicional es margen de descarte;
no amplía el área final de admisión.

Los rodillos virtuales mantienen la ruta original: `poses()` puede sincronizar
su cuerpo después de que `bounds()` leyera una pose anterior. El orden de ingreso,
prioridad de ocupantes, capacidad, recuperación de energía y ánimo, activación y
temporizadores del enfriador permanecen sujetos a las reglas originales.

**Escenario del A/B final:** 1008 piezas totales, ocho enfriadores, tres corridas
por variante y 30 pasos por corrida después de 12 pasos de calentamiento.
Se usó CPU de proceso de Node, con fuentes congeladas y la guarda virtual final.

| Medida de `updateCooling` | Original | Descarte espacial final |
| --- | ---: | ---: |
| Mediana CPU por llamada | 23,6498 ms | 1,3957 ms |
| Mínimo de las tres corridas | 23,5064 ms | 0,4786 ms |
| Máximo de las tres corridas | 23,8785 ms | 2,8897 ms |
| Transformaciones `corners` de las 1000 piezas lejanas por tick | 8000 | 0 |

La reducción de la mediana fue **94,10 % para este subsistema y escenario**.
La dispersión entre corridas es visible; no se extrapola a un porcentaje de mejora
del juego entero ni a los FPS del navegador. La variante medida sólo incorpora
este cambio de enfriadores sobre la referencia, no todos los cambios físicos.

El A/B comparó **81 estados completos equivalentes**: el escenario de rendimiento
y 80 pasos con cambios de posición, rotación, altura, límite circular y activación.
Las cinco regresiones específicas cubren además ocupantes previos, capacidad,
rodillos virtuales desincronizados y exclusiones de objetos tomados o trabajando.
Los tests verifican comportamiento y trabajo geométrico, sin umbrales de tiempo.

Los resultados y hashes completos están en
[enfriadores-20261122.json](mediciones/enfriadores-20261122.json).
SHA-256 de la variante aislada:
`8f4ef6ac6212ee6a97fbcc2495754adefd84f9193f13cd69ecd82d7da1f31e8b`.

## Caminantes: reconocimiento y coordinación de apoyos

Está corregido el reconocimiento de cuatro apoyos inferiores cuando el chasis
tiene un servo auxiliar superior. El auxiliar permanece en el reloj compartido,
con su configuración y consumo; no se elimina para forzar una topología de cuatro
articulaciones. La interfaz distingue marcha reconocida y oscilación general.

En el caminante con rodillas, la fase constante de 90° podía situar la diagonal
de retorno por debajo de la que debía soportar el chasis. El controlador reducía
el agarre de esas patas de retorno mientras todavía sostenían el mecanismo.
Cambiar sólo el reloj de marcha empeoró la reproducción y se descartó.

`walkingKneePhases` calcula un desfase al arrancar a partir de las referencias
de los servos, los recorridos configurados y los brazos de palanca verticales
del centro de apoyo real. La reconstrucción es temporal: no mueve los cuerpos.
La consulta de la suela usa sus vértices inferiores y un hull en coordenadas
relativas; el redondeo de esos puntos temporales a 1 nm evita que un giro de 90°
cambie el orden de esquinas casi coincidentes. No cambia la geometría física.

El ajuste tiene un alcance explícito: cuatro caderas y cuatro rodillas de bisagra,
ejes horizontales aproximadamente paralelos, suelas neutrales a menos de 2 mm de
desnivel y semirrecorridos de hasta 30°. La elevación lineal prevista debe quedar
entre 9 mm y el menor valor entre 18 mm y el 5 % de la longitud vertical de la pata.
Si no se cumple alguna condición, se conservan las fases anteriores. Cuatro patas
sin rodillas conservan sus fases originales; los auxiliares permanecen controlados.
El cálculo ocurre al iniciar, sin añadir búsquedas de vértices por tick.

La revisión independiente de 60 configuraciones y 2880 reconstrucciones verificó
que no se mutan poses, velocidades, identidades ni masa. El error máximo de fase
por giro/traslación fue 1,58 × 10⁻⁷ grados; incluyó pies rectangulares y en L,
conexiones en ambos órdenes y el rechazo de una pata de longitud diferente.
Las regresiones dinámicas exigen avance por contacto, agarre de la diagonal
cargada, error angular acotado, consumo/control colectivo y conservación.

El ajuste mejora la coordinación dentro de esa clase de geometrías. No garantiza
que todas las patas de retorno despeguen del suelo ni introduce equilibrio,
navegación o una solución universal para cualquier cuadrúpedo construido.

### Mediciones finales de marcha

Cada caso selecciona `physicsHz` mediante las preferencias antes de construir
las articulaciones y comprueba `getPhysicsStep()`. Incluye así la recalibración
de restricciones. Tras 0,2 s de asentamiento se simulan diez segundos de marcha.
El deslizamiento es la velocidad tangencial media en los contactos reales de
las patas designadas como cargadas, observada entre los segundos 2 y 10.

| Montaje | Frecuencia elegida | Avance en 10 s | Error angular máximo | Deslizamiento medio del apoyo |
| --- | ---: | ---: | ---: | ---: |
| Cuatro caderas + cuatro rodillas, ±20° | 60 Hz | 1,0004 m | 7,744° | 0,00539 m/s |
| Mismo montaje | 120 Hz | 1,0350 m | 5,556° | 0,00380 m/s |
| Mismo montaje | 240 Hz | 1,0476 m | 4,973° | 0,00295 m/s |
| Espinillas 9 cm más largas | 120 Hz | 1,0425 m | 5,400° | 0,00325 m/s |
| Recorrido de ±15° | 120 Hz | 1,0161 m | 5,920° | 0,00557 m/s |
| Ocho articulaciones + auxiliar superior | 120 Hz | 1,0448 m | 5,503° | 0,00374 m/s |

Las veinte regresiones de reconocimiento y marcha pasan sobre la fuente
integrada. Método, contacto efectivo, configuración y hashes:
[caminantes-20261122.json](mediciones/caminantes-20261122.json).
Se excluyen de la comparación los ensayos exploratorios que cambiaban sólo `dt`
y mantenían la calibración predeterminada de 240 Hz. Esta tabla sí corresponde
a la frecuencia elegida por el jugador; no es un A/B de CPU.

## Siguiente intervención recomendada

Priorizar las consultas espaciales de apuntado y proyección: tienen un crecimiento
directamente medido y afectan a operaciones frecuentes del jugador. Empezar por
el descarte de candidatos, compartiendo índices donde las reglas lo permitan;
mantener los tests exactos para decidir el contacto y la selección final.

Como alternativa de menor alcance, la ruta rápida para piezas sin sensores puede
evitar trabajo constante sin introducir un cache persistente. Las sombras y el
guardado necesitan además verificaciones visuales o de recuperación de partidas.

El warm starting del solver queda como investigación de mayor riesgo: Cannon
reinicia los impulsos acumulados por paso. La persistencia de contactos podría
mejorar convergencia, pero aquí no tiene ganancia medida ni parche aprobado.

## Reproducción desde la raíz del repositorio

```bash
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
node --test tests/cooling-spatial-culling.test.cjs
node --test tests/cannon-geometry-compatibility.test.cjs tests/mechanical-floor-impact.test.cjs
node --test tests/servo-walker-recognition.test.cjs
node --test tests/servo-walker-tracking.test.cjs
```

Los dos scripts `benchmark` anteriores emiten JSON a stdout, sin escribir archivos
por defecto. Se puede contrastar la fuente original con el mismo harness:

```bash
git show d79a1326e3ace210aad89ce45cb1817af60cf0ac:assets/js/game.js > /tmp/qbits-architecture-base.js
QBITS_GAME_SOURCE=/tmp/qbits-architecture-base.js node tests/benchmark-architecture-audit.cjs
QBITS_GAME_SOURCE=/tmp/qbits-architecture-base.js node tests/benchmark-ground-contacts.cjs
```

Los hashes del JSON identifican la fuente exacta. Conviene ejecutar las mediciones
de tiempo sin otros benchmarks concurrentes; los contadores y regresiones no
dependen de que una máquina alcance un determinado número de milisegundos.

## Fuentes primarias y relación con las decisiones

- [Código de Q-bits](../assets/js/game.js) y [Cannon vendorizado](../assets/js/cannon.min.js): comportamiento auditado; el commit de referencia permite reconstruir los defectos iniciales.
- [Box2D: Dynamic Tree](https://box2d.org/documentation/group__tree.html) y [Collision](https://box2d.org/documentation/md_collision.html): índices AABB para seleccionar candidatos en rayos y consultas de región. Se usa el patrón algorítmico; no se propone sustituir la física 3D por Box2D.
- [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices): agrupación de llamadas de dibujo; respalda estudiar el envío de sombras después de medir sus llamadas reales.
- [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API): almacenamiento síncrono y coste potencial de bloquear el hilo de ejecución.
- [MDN: IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API): operaciones asíncronas sobre datos estructurados; alternativa para evaluar con migración y validación de partidas.

