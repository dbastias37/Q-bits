# Evidencia de arranque de escenas — 22 de noviembre de 2026

Este paquete continúa el PR #31 sobre su integración en `main`. Conserva mediciones frías, controles calientes, perfiles separados y ensayos exploratorios, incluidos los fallos de instrumentos. Tablas completas: [RESULTADOS.md](RESULTADOS.md). Agregado verificable: [aggregate.json.gz](aggregate.json.gz). Comandos: [commands.json](commands.json) y [additional-commands.json](additional-commands.json).

**Todas las medidas son de Node con Cannon y el juego reales, y DOM/GPU simulados.** No certifican FPS, GPU, RAF ni respuesta Main de un navegador.

## Fuentes fijadas

| Fuente | Identidad |
| --- | --- |
| Referencia PR2, merge del PR #31 | `4fc563cc8d27e653129fc11a14524a7cfc626a5e` |
| Árbol de referencia | `09e6452b9524537ea0099fc30f4153cfc95c8c15` |
| `game.js` de referencia | `c77f65c197f80f340f7f390a8d72155601589fb500bbb1014c0cbee3a3b97b4c` |
| Commit local del código medido | `e362708c4c9472133771394fd048541992ac29ae` |
| Commit publicado del mismo código | `4d7c128517e4951ba7acb56562e378a7ecaff904` |
| Árbol del código medido | `71f18000064b816dc66b52424f338bb5920d92d4` |
| `game.js` final medido | `847e7b1f99778315678478b01b7a781ecd3c2e1f0deab595e16446ecb9c52fed` |
| Commit local del arreglo del instrumento de brazos | `92192345317b06bca0c31f1a5860ecc1783c31a1` |
| Commit publicado del mismo arreglo instrumental | `6dfc50c62dcf83a0cb20fa586f11e82d94a89ee6` |
| Árbol del arreglo instrumental | `46fcc530109139d871dfba962e21984e56f60923` |
| Runner frío inicial, antes del arreglo del control de brazos | `4f39e835035d4531468bd64256c8edbb8887c1f40a04916187ee70fab7912b71` |
| Runner con inicio legal de brazos | `8965b491cd2f146928f06c74bbf8ca954c6659d720fe28e2dfa10e7afa062562` |

Los pares local/publicado de la tabla tienen árboles idénticos. El arreglo instrumental conserva el mismo `game.js` final y sólo corrige el control de brazos del ensayo. Las ejecuciones pasan explícitamente la raíz y el SHA completo de referencia. El agregador rechaza tanto una referencia antigua como un `game.js` optimizado distinto del fijado, aunque varios inputs antiguos fueran coherentes entre sí. También fija los hashes conocidos del runner: las ventanas independientes anteriores al arreglo de brazos conservan su instrumento, mientras los controles con brazos activos exigen la invocación legal del controlador. Los experimentos conservan sus fuentes y hashes propios.

## Diseño frío y trabajo medido

`tests/benchmark-startup.cjs` crea **un proceso Node nuevo por brazo y repetición**, en orden AB/BA/AB y en serie. No reutiliza una VM o caché de un ensayo anterior, ni fuerza GC. El sistema operativo conserva sus cachés de archivos; arrancar otro proceso no reproduce una máquina recién encendida.

Cada proceso carga sus módulos, crea el harness, prepara preferencias y construye el fixture. Selecciona 60, 120 o 240 Hz **antes de crear cuerpos y articulaciones**, verifica el paso efectivo y mantiene la misma cámara `[0,1.7,0]`, yaw/pitch cero, viewport 1280×720, sombras y audio desactivados.

Antes del primer frame no se ejecuta `f.state()`, `saveLab`, selección, consulta espacial, renderizado ni calentamiento físico. El inventario sólo lee propiedades y arrays. Cada frame completo ejecuta:

```js
advanceSimulation(1 / 60);
updateBatteryLiquids(1 / 60);
updateTarget();
renderScene();
```

Los temporizadores externos separan esas cuatro operaciones; no reemplazan funciones internas ni activan perfiles/counters. El total de frame incluye su sobrecarga. La suma de fases no se añade de nuevo al total. La construcción de formas, AABB, índices y trabajo de solver se atribuye mediante perfiles separados.

La captura del estado completo se realiza **después** de los frames y mide su coste aparte. Se comparan estados finales exactamente, además de inventarios y relojes de cada frame. Se registran pasos del juego/Cannon, `simTime`, acumuladores y tiempo descartado. No se cuentan menos pasos ni se traslada una preparación a otro momento para afirmar una reducción del trabajo.

La latencia hasta el primer dibujo se registra desde la construcción de escena y desde la entrada del worker. La ventana de frames, el worker completo y el tiempo del subproceso se presentan separados: el último incluye lanzamiento de Node y serialización/IPC. Las ventanas largas permiten comprobar si un pico reaparece en frames posteriores y cómo llega la escena a reposo.

## Inputs y conservación

| Familia de datos | Alcance |
| --- | --- |
| `cold-60`, `cold-120`, `cold-240` | Independientes, 16/100/500/1.000/1.500/2.000 piezas; cuatro frames fríos y tres pares por frecuencia. |
| `cold-settle-120` | 2.000 independientes, 60 frames y tres pares; seguimiento del trabajo posterior y llegada a reposo. |
| `controls-120` | Soldadas, pocos brazos articulados, numerosos mecanismos y fábrica; 100/500/2.000 piezas, brazos activos explícitamente. |
| `controls-60`, `controls-240` | Controles estructurales grandes a las otras frecuencias reales. |
| `matrix-operations`, `matrix-counts` | Operaciones y conteos separados para comprobar coste del guard y mantenimiento en frío/caliente. |
| `settled-60`, `settled-120`, `settled-240` | Controles calientes del runner integrado existente, con las seis escalas; no se mezclan con los procesos fríos. |
| `equivalence` | Producción 19/20, energía, entregas, cámaras y atrasos con la nueva referencia del PR2. |
| `reference-*`, `optimized-*` | Diagnósticos separados de funciones, pasos, matrices, CPU/heap sampling y GC. |
| `exploratory-*` | Candidatos previos y evidencia incompleta; no representan automáticamente la fuente final. |
| `instrument-*` | Correcciones del reloj y del inicio de brazos, prueba funcional y mapa de preservación del primer intento de controles. |

Los nombres de la tabla corresponden a archivos `.json.gz`. Los originales conservan muestras, hashes, configuración y fallos. Las observaciones desfavorables y las ejecuciones incompletas permanecen en la evidencia y en el agregado. Los conteos de arrays no cuentan internamente el trabajo de V8, Sets o GC; las mediciones temporales incluyen el mantenimiento real. Los perfiles CPU y heap son capturas distintas; no deben confundirse tiempos muestreados, tiempos inclusivos y bytes muestreados.

Las 39 configuraciones frías completaron 117 pares, las 42 configuraciones de operaciones completaron 126 pares y los cuatro controles de conteos completaron cuatro pares. Los controles calientes tienen 51 pares con equivalencia final certificada y dos pares ejecutados dentro de un caso incompleto: `settled-240`, independientes/2.000 piezas, conserva esos dos pares y la parada del tercer brazo de referencia por presupuesto de 20 s, después de 26 muestras medidas. El runner integrado sólo guarda `identicalFinalState` y `stateSha256` después de terminar las tres repeticiones; por eso los dos pares parciales no certifican estados finales equivalentes. Los totales principales son 294 pares certificados y dos ejecutados sin ese certificado. No se convierte el caso incompleto en una comparación de tres pares ni se eliminan sus resultados. `equivalence` contiene otras 13 comparaciones de estado completo, incluidas Producción 19/20 a las tres frecuencias y Producción 20 a 29 RPM/60 Hz.

Los datos JSON, logs y capturas `.cpuprofile`/`.heapprofile` se almacenan con su extensión original seguida de `.gz`, mediante gzip determinista (`mtime=0`). Los scripts, documentación, patches y los metadatos `commands.json`, `additional-commands.json` y `validation-summary.json` permanecen en texto. [manifest.json](manifest.json) registra nombre, función, bytes y SHA-256 almacenados y decodificados de cada archivo; distingue evidencia original de `aggregate.json.gz` y `RESULTADOS.md`, que se generan a partir de ella. Los logs vacíos, los fallos y los ensayos incompletos también se conservan. Las rutas de salida originales permanecen intactas en los comandos.

## Corrección del instrumento

Cannon 0.6.2 incrementa `world.time` tanto en `internalStep(dt)` como en `World.step(dt)`. El primer intento frío exigía erróneamente que ese contador igualara `simTime`; falló la comprobación después de ejecutar física. El intento completo se conserva en `exploratory-prelength`, sin transformarlo en un resultado válido.

El runner corregido conserva el contador nativo y comprueba su doble incremento esperado; usa `simTime` y los pasos exactos del juego/Cannon para acreditar tiempo físico. La corrección se aplica a las dos variantes y no modifica el juego. [instrument-correction.json.gz](instrument-correction.json.gz) registra el diagnóstico y la prueba nativa.

El archivo `benchmark-startup-before-clock-fix.cjs` conserva el instrumento previo, reconstruido y comprobado contra el SHA-256 original `6264fbd7b26e1d28e2c8d6f57cbc1b6914f21e6036b16d386bb528d1868465be` registrado en el intento fallido. `instrument-clock-fix.patch` muestra exactamente su transición al runner corregido. Es una fuente archivada para auditar el fallo; no se usa en las mediciones finales.

### Inicio de los brazos del control articulado

El primer control con `active-arms=true` falló al usar la activación directa de joints del fixture compartido. El juego exige que las articulaciones pertenecientes a un brazo se inicien por su controlador. El runner corregido crea el mismo fixture detenido y llama a `startRobotArm(arm)` dentro del tiempo de construcción de escena, con las poses y energía ya existentes. No cambia el juego, el fixture compartido, torque, masa, límites ni consumo.

La comprobación funcional de 100 y 2.000 piezas, sobre ambas fuentes, inició respectivamente 3 brazos/12 motores y 4 brazos/16 motores. Ejecutó cero pasos físicos y conservó energía y poses exactas; los datos están en [instrument-arm-start-check.json.gz](instrument-arm-start-check.json.gz). `benchmark-startup-before-arm-fix.cjs` conserva exactamente el runner anterior con SHA `4f39e835…`; `instrument-arm-start-fix.patch` muestra la corrección. Las mediciones independientes y los controles ajenos a brazos anteriores se conservan con su hash original; los controles activos de brazos se repiten con la ruta legal en ambas variantes.

El primer intento permanece íntegro en [exploratory-controls-arm-failure.json.gz](exploratory-controls-arm-failure.json.gz), su log y stderr: incluye el fallo de activación de brazos y nueve configuraciones que sí finalizaron. [instrument-arm-failure-artifacts.json.gz](instrument-arm-failure-artifacts.json.gz) registra los renombres exactos antes de repetir `controls-120`. Ese mapa no declara un commit de medida propio: el agregador verifica la existencia de sus destinos y la fuente del JSON preservado. El fallo de reloj y el fallo de inicio de brazos se etiquetan por separado como defectos del instrumento; ninguno se presenta como una regresión del juego.

## Interpretación de tiempos y límites

`performance.now()` mide pared transcurrida. `process.cpuUsage()` mide CPU de proceso usuario+sistema, no utilización porcentual ni CPU exclusiva de un hilo. Los deltas de memoria incluyen VM, compilación, harness y GC; no son tamaños exactos de cachés ni conteos exhaustivos de asignaciones.

Las tablas usan la mediana entre repeticiones de sus estadísticos, con rangos y diferencias pareadas. **En una ventana de cuatro frames, p95 y p99 son su máximo**; esa ventana caracteriza los primeros frames de arranque, no la cola de una partida larga. Cada repetición recrea el proceso y la escena. Los resultados de perfiles instrumentados permanecen separados de las mediciones principales.

Los presupuestos se comprueban entre etapas y frames completos. No se interrumpe un paso físico; una operación síncrona puede exceder el presupuesto antes de devolver control. El registro identifica la última escala completa, la etapa donde se detuvo y los pasos ejecutados. Un ensayo incompleto no se convierte en una comparación válida.

## Reproducción y agregación

```bash
git worktree add --detach ../qbits-startup-baseline 4fc563cc8d27e653129fc11a14524a7cfc626a5e
node tests/benchmark-startup.cjs --baseline-root=../qbits-startup-baseline --baseline-commit=4fc563cc8d27e653129fc11a14524a7cfc626a5e --families=independent --scales=16,100,500,1000,1500,2000 --hz=120 --frames=4 --repetitions=3 --case-budget-ms=20000 --output=/tmp/cold-120.json
```

Repetir con las otras preferencias reales y las configuraciones completas de los registros de comandos. Todas las cargas se ejecutan en serie. `commands.json` conserva sus 23 registros, incluidas las invocaciones fallidas; `additional-commands.json` identifica por separado los comandos adicionales o reconstruidos. [validation-summary.json](validation-summary.json) recoge las verificaciones integradas, cuyas fuentes y salidas completas permanecen en el paquete. Los tiempos de suite no se presentan como rendimiento del juego.

| Validación | Referencia PR2 | Fuente final | Comparación |
| --- | ---: | ---: | --- |
| Suite de lógica/Cannon | 1.258/1.258 | 1.261/1.261 | Cero fallos, cancelaciones u omisiones. |
| Auditoría de arquitectura | 21 casos | 21 casos | Salida exactamente igual, excluyendo sólo `sourceSha256`. |
| Contactos con suelo | 36 casos | 36 casos | Salida exactamente igual, excluyendo sólo `sourceSha256`. |

Las verificaciones sobre las fuentes correspondientes son:

```bash
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
```

Para agregar datos existentes sin ejecutar física:

```bash
python3 docs/mediciones/startup-20261122/verificar.py
python3 docs/mediciones/startup-20261122/resumir.py --require-all
```

El agregador acepta JSON o `.json.gz`, genera `aggregate.json` sin comprimir y `RESULTADOS.md`, valida las fuentes y exige coincidencia de bytes si están ambas representaciones de un input. El verificador comprueba el manifiesto, su cobertura completa del directorio y la regeneración exacta de ambos resultados en memoria. Si existe además el `aggregate.json` regenerado, exige que coincida con el `.gz` publicado. Estos comandos no ejecutan física, benchmarks ni perfiles. Sin `--require-all`, el agregador permite revisar una entrega en curso e identifica inputs todavía ausentes; nunca debe ejecutarse sobre archivos que otro proceso esté escribiendo.
