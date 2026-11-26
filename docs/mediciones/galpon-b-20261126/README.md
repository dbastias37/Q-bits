# Galpón B: revisión visual en Chromium

Capturas obtenidas el 26 de noviembre de 2026 con `tests/benchmark-galpon-chain-browser.cjs`, Chromium 131.0.6778.0 y WebGL 2 real. El renderer identificado por el navegador es ANGLE sobre Vulkan/SwiftShader. No se usa el stub de GPU del arnés de lógica.

La validación complementaria de [GLES](gles.jsonl) compiló los siete shaders, enlazó los programas y aprobó las comprobaciones de píxeles de foco y posprocesado. [Sus hashes](gles-sources.json) confirman que son idénticos a los del cierre de A; no se volvieron a ejecutar por las correcciones posteriores de lógica y texto. Esta prueba gráfica se distingue de las escenas y mediciones de la fábrica en Chromium.

```sh
QBITS_CHROMIUM=/tmp/galpon-chrome-runtime/chromium node tests/benchmark-galpon-chain-browser.cjs --output=/tmp/qbits-chain-browser-current
```

## Alcance

La preparación es una fixture B aislada. Cada extracción, conversión y conformado pasa por el modelo de producción y paga su coste. Las doce recepciones de A se acreditan mediante el modelo; esta revisión no reproduce la primera línea ni certifica el pedido completo de 80 rotores. La fixture coloca una carga de entrada antes del ensayo, y el brazo la toma, transporta y suelta con Cannon. No se desplaza esa carga durante la transferencia.

El montaje del brazo, la enseñanza de las posturas A/B, la configuración de motores y la activación de la secuencia usan controles DOM reales. Esta entrada de prueba utiliza A a 3 cm y B a 25 cm; se comprueba que la carga inicial no penetra la pinza. El brazo entrega una carga sobre la mesa y habilita la aparición de una sola fuente. La fuente muestra los mismos 176491 J restantes de la misión y conserva su límite de 240 W. El escenario después construye dos cintas con material pagado y coloca la ensambladora para revisar su presentación. Las cintas están detenidas en la captura general.

## Resultado observado

- Cero excepciones de página, cero errores de consola y `gl.getError() === 0`.
- Controles accesibles a 1280 × 800 y 960 × 640, sin desbordamiento horizontal de documento ni controles cortados horizontalmente. Se esperan dos fotogramas tras cambiar el tamaño y se verifican los cuatro bordes del panel dentro de la ventana. El panel tiene desplazamiento vertical.
- Posturas nativas A/B aceptadas y primera transferencia física brazo → mesa confirmada.
- Cuatro motores configurados a 12 rpm, par de 2/4/3/2 N·m para base/hombro/codo/muñeca y capacidad 64; repetición activada.
- Fuente única, inicialmente apagada, vinculada al saldo existente; no se crea una segunda reserva.
- Guardado final aceptado con 102 identidades registradas, 98 extracciones y 174955 J. El informe conserva el desglose de los 5045 J gastados, incluida la carga inicial real de las articulaciones.

`browser.json` contiene estados, límites de panel, versión y renderer. `fixture-snapshot.json` contiene el escenario revisado y su declaración de alcance.

La transferencia activa instrumentada ejecuta 625 subpasos atómicos de 1/120 s en 791,1 ms de CPU del navegador: 1,266 ms por llamada y 5,208 s simulados. Incluye Cannon con el refinamiento actual, lógica y actualización de estado; excluye el renderizado entre subpasos. La configuración de física del bucle automático era 240 Hz y se registra aparte como `configuredPhysicsHz`, sin confundirla con los subpasos explícitos de 120 Hz ni con la frecuencia de renderizado. No es una medición de FPS ni del coste de la fábrica completa.

## Capturas

| Archivo | Evidencia |
| --- | --- |
| `01-plano-b-pagado.png` | Material producido y estaciones del bloque B |
| `02-controles-b.png` | Controles del plano y montaje |
| `03-postura-pick.png` | Vista previa nativa de la postura A |
| `03-postura-place.png` | Vista previa nativa de la postura B |
| `04-brazo-configurado.png` | Secuencia repetida configurada |
| `05-brazo-mesa-real.png` | Carga entregada físicamente sobre la mesa |
| `06-fuente-misma-reserva.png` | Fuente presentada después de la entrega |
| `07-estaciones-cadena.png` | Mesas, dos cintas y ensambladora colocada |
| `08-controles-b-960.png` | Panel B a 960 × 640 |

Esta evidencia comprueba interacción y renderizado del tramo mostrado. La contabilidad completa, las tres transferencias cableadas, las recargas y la continuidad del pedido se verifican por separado en pruebas de lógica y física; sus resultados no deben inferirse de estas capturas.

## Regresiones físicas del brazo

`arm-regressions.tap` registra 91 pruebas aprobadas de brazo galpón, energía y cableado, banco, familias, unión a cinta y el ensayo aislado de enfriador descrito abajo, con Cannon real y DOM/GPU simulados. Incluye aparcamiento vacío durante 60 s sin consumo, otros 5 s esperando una descarga ocupada sin consumo, retirada de una entrada durante la recuperación, guardado de espera vacía y guardado con carga retenida. La pinza cargada paga 1,6 J durante 10 s de espera; sus motores quedan apagados. La misma carga y programa continúan después de recargar en una instancia nueva. Un cuerpo que se durmió durante esa espera se despierta al reanudar los motores.

La prueba de potencia concurrente carga una batería apoyada a 30 W antes de contabilizar un motor que pide aproximadamente 225 W. Esa demanda conjunta rebasa los 240 W y detiene el motor; sólo se descuentan los 15 J realmente transferidos a la batería en el intervalo de 0,5 s. Las reservas de recarga ya concedidas no desaparecen al evaluar los motores.

Dos pruebas guardan durante la aproximación desde reposo hasta A, antes de establecer un agarre. Al cargar se conservan identidades y saldos. Si la entrada sigue presente, la pinza toma el mismo cuerpo y acredita una sola entrega. Si se retira físicamente después de cargar, el brazo vuelve a reposo sin inventar un agarre ni un hito, y queda aparcado sin consumo.

El controlador del galpón coordina el progreso de los cuatro ejes dentro de sus rpm y torque existentes. La base directa llegaba antes que los ejes reducidos y trazaba una curva distinta de la comprobada por el planificador. La configuración de referencia utiliza 12 rpm y 2/4/3/2 N·m, la reducción 3:1 de los ejes de inclinación y la fuente de 240 W. El brazo espera en su postura de reposo enseñada y despeja la recepción antes de que llegue otra pieza. El refinamiento de Cannon usa como máximo 96 iteraciones sólo en brazos activos o sujetos a la bancada y despiertos a 60 y 120 Hz, dentro del presupuesto de 64 contactos y 256 ecuaciones; no aumenta fuerzas ni elimina colisiones. A 240 Hz se conserva el presupuesto ordinario.

El planificador incluye el cuerpo físico de las familias, además de piezas sueltas, cargas y estaciones. Una familia conserva su collider aunque sus piezas estén almacenadas y ausentes de la lista de grupos. La regresión específica rechaza una postura ocupada por ese cuerpo antes de encender los motores y permite la misma postura después de retirar el obstáculo.

## Brazo en la línea real de A

Los informes `arm-clean-entry-60.json`, `arm-clean-entry-120.json` y `arm-clean-entry-240.json` parten del mismo checkpoint de las doce recepciones reales de A, con sus ocho cintas, cuatro trabajadores y cuenta de energía conservada. El plano actual prepara y monta el brazo con material producido, enseña A sobre el anillo de la bandeja `(2,31; 0,575; 0)` a 12 cm y B sobre la mesa a 25 cm. Estos ensayos utilizan el perfil de referencia de 2/4/3/2 N·m desde la construcción; no parten de un brazo ya enseñado. La frecuencia indicada se aplica desde la entrada a B.

| Física en B | Centro X del primer cubo recibido | Primera entrega y fuente | Saldo exterior |
| --- | ---: | ---: | ---: |
| 60 Hz | 2,24965 m | 663 s de misión | 167155,31 J |
| 120 Hz | 2,37540 m | 662 s de misión | 167156,76 J |
| 240 Hz | 2,39086 m | 662 s de misión | 167156,77 J |

`arm-integrated-three-wired.json` continúa un checkpoint legítimo de la primera entrega, ajusta ese mismo perfil mediante el panel y completa tres entregas cableadas nuevas junto a tres viajes QR. Las cargas llegan de la línea A y se transportan con los mecanismos: no se colocan productos en poses de fixture. Al final, a los 981,2 s, quedan 162952,85 J y el brazo sigue esperando en reposo. El informe conserva la instrumentación de potencia y el progreso de cada hito.

| Medición del brazo en tres ciclos completos | Resultado |
| --- | ---: |
| Energía de motores, incluidos los retornos a reposo | 1827,395 J |
| Energía de la pinza | 4,145 J |
| Total del brazo | 1831,540 J |
| Media por transferencia | 610,513 J |
| Mayor potencia conjunta de los motores | 90,065 W |
| Límite de la misma fuente | 240 W |

Estos valores pertenecen al recorrido con las ocho cintas y la familia física de A. El consumo de fabricación y recarga del dron, la extracción y las estaciones se contabiliza aparte. Las cifras menores de la fixture aislada no se usan para estimar la producción sostenida de esta instalación.

### Alternativa con pedestal: segundo enfriador → alimentador B

La [receta del brazo sobre pedestal](../../GALPON_BRAZO_PEDESTAL.md) conserva las posiciones originales del enfriador, las dos bancadas y la ensambladora. Una torre independiente de **96 cubos**, unidos mediante las operaciones normales en una retícula de 4 × 3 × 8, sostiene el brazo nativo de 18 cubos y 8 enganches. El soporte mide 72 cm de alto y cuesta **2112 J** de fabricación en el ensayo; brazo, cable y cargas se pagan aparte. El brazo se apoya sobre la torre sin soldarse a ella y adquiere su anclaje normal al iniciar.

`tests/galpon-chain-arm-pedestal.test.cjs` verifica tres recogidas, entregas y retornos completos a cada frecuencia, con contacto real de soporte y recepción sobre B, los mismos IDs y masas, carga interna conservada y débito de la misma fuente. Los cuatro ejes trabajan a 12 rpm y 4 N·m; al terminar, esperan con los motores apagados.

| Medición de tres ciclos completos | 60 Hz | 120 Hz |
| --- | ---: | ---: |
| Tiempo, incluidos los retornos | 53,80 s | 51,42 s |
| Energía de transporte del brazo y la pinza | 2450,03 J | 2236,29 J |
| Tratamiento del segundo frío | 6,00 J | 6,00 J |
| Mayor potencia conjunta de los motores | 163,76 W | 207,00 W |

El [registro por ciclo](../galpon-cadena-20261126/brazo-pedestal.json) conserva el detalle. La producción inicial, la colocación del equipo vacío y el abastecimiento y retiro entre ciclos son fixtures explícitas; el alimentador B permanece detenido. La prueba acredita el transporte físico con los soportes originales, no una sesión manual de construcción ni ochenta entregas autónomas. El mayor consumo de esta alternativa se mantiene separado de la proyección que utiliza drones.

El ensayo anterior `tests/galpon-chain-arm-cold-feed.test.cjs`, registrado en `arm-cold-feed.tap`, se conserva como regresión geométrica histórica con soportes desplazados; no es la receta de montaje vigente.

## Guardado de la instalación y bordes de objetivos

El checkpoint real `qbits-native-fleet-centered-pick/final.json`, a los 1702,067 s de misión, conservaba el brazo 279 y sus cuatro bisagras, pero una recarga perdía la primera unión 259–260 y luego descartaba su programa. El desfase observado era de 3,920 mm y 13,48° entre ejes, sin solapamiento. El restaurador ya reconciliaba ramas serializadas hasta 8 mm, pero su umbral angular anterior era de 11,48°. Ahora admite hasta 15° exclusivamente para esa reconciliación; la conexión nueva de piezas conserva sus límites estrictos.

`arm-parked-restore.json` registra la reproducción y la comprobación posterior. La misma partida recupera sus 34 articulaciones, el brazo en espera con repetición y las mismas poses, identidades y energía. Después de 60 s de Cannon vuelve a guardarse y recargarse sin advertencias. La deflexión máxima durante esa continuación fue de 6,287° y 1,979 mm. Los máximos de 232 contactos y 726 ecuaciones superan el presupuesto del refinamiento, por lo que ese mundo conserva el solver ordinario. `arm-parked-restore.tap` contiene 12 regresiones del brazo; la nueva fixture reducida conserva sólo las cinco poses observadas y obtiene la materia de producción pagada.

`optional-durable-gates.tap` contiene 49 pruebas de modelo, actividad, energía y guardado. Dos escenarios reciben físicamente el tercer rotor al mismo tiempo que un corte o bloqueo: el producto se archiva, pero la racha opcional vuelve a cero antes de poder fijar el logro. Otro ensayo real de borne comienza con una condición de borde explícita de 179,9/900 J; transfiere 0,5 J de la fuente y guarda antes de la siguiente observación lógica. Al cargar conserva esos 0,5 J como recarga posterior al regreso, de modo que los 180,4 J almacenados no se convierten en una falsa reserva de llegada del 20 %. El dato es metadato de observación, no una segunda batería ni una recarga adicional; su ID, unicidad y capacidad se validan.

La suite global anterior a estas últimas correcciones aprobó 1839/1839 pruebas en 131,69 s, sin fallos ni omisiones (`global-before-final-recovery.tap`). Los focales posteriores se documentan arriba; ese log global no se presenta como una ejecución de los cambios que vinieron después.

Tras cerrar la restauración, los dos bordes opcionales y el arranque arbitrado de la flota, otra ejecución global aprobó **1846/1846** pruebas en **158,17 s**, sin fallos ni omisiones (`global-before-flight-query-reuse.tap`). Corresponde al comportamiento anterior a la optimización posterior de consultas repetidas de vuelo; su equivalencia se comprueba por separado.

## Captura de la flota real restaurada

La [revisión de la partida real](real-fleet/README.md) conserva cuatro capturas, su checkpoint reproducible y el informe Chromium. Muestra el mundo a los **1844 s**, con **154782,20 J**, **un rotor de ochenta**, el brazo en espera y **tres drones en ground**. No se preparan piezas ni poses de fixture. Se verificaron los textos del pedido y del opcional, el contraste del HUD y la tableta a dos tamaños; cero advertencias de carga ni errores JavaScript/WebGL. La imagen se distingue expresamente de una demostración del pedido completo.

## Volumen real de giro de las hélices

La tanda nativa se detuvo después de nueve rotores por una obstrucción falsa. A los 3316,667 s, el eje del dron estaba en `(3,597709; 0,480726; −0,246920)` con 7,70147° de giro horizontal. La mesa terminaba en `x=3,42`: quedaban **177,709 mm** de separación real, más que el radio protegido de **130,279 mm**. Transformar toda la mesa a una caja alineada con la hélice reducía artificialmente esa separación a 128,790 mm. La misma aproximación podía hacer que paredes lejanas bloquearan otras orientaciones.

El detector conserva el radio, la franja axial **[1; 47] mm**, las fuerzas y las reglas de inclinación. Ahora la caja sólo descarta candidatos: recorta el sólido convexo real por los dos planos axiales, proyecta los vértices resultantes y comprueba la distancia del eje a su envolvente convexa. Se incluyen las intersecciones de aristas, los casos degenerados y el interior del polígono, de modo que una pieza que cruza el disco sigue bloqueándolo aunque ningún vértice original esté dentro. Para las cajas, una esfera que contiene todo el volumen de giro descarta primero las OBB lejanas. Ese descarte nunca concede una obstrucción ni reduce el volumen protegido. Las familias archivadas participan mediante su shell físico, sin desplegar piezas.

La carpeta [propeller-clearance](propeller-clearance/README.md) conserva el guardado original, el fallo medido, los barridos y la continuación. El barrido de sólo lectura usa **72 orientaciones × 121 alturas** en cada una de dos columnas del mundo real: la aproximación anterior bloqueaba 55 orientaciones en el origen inicial y 40 en `x=4`; el volumen exacto encuentra cero obstrucciones en ambas. No se movieron cuerpos para obtener ese resultado. La continuación con Cannon parte del guardado que fallaba, arranca el mismo receptor y avanza 120 s: completa una toma, entrega y retorno, conserva los tres seguidores y no registra cortes por obstrucción. Esto acredita la corrección de ese fallo, no ochenta recibos.

Los focales suman **94 pruebas distintas**: hélice y geometría 32/32, QR/guardado/potencia 34/34, geometría y familias 37/37, con solapamiento de las pruebas geométricas. Incluyen penetraciones reales de 10 µm, barras inclinadas, tetraedros, pirámides, acopladores, sensores y el shell de una familia. Son pruebas de lógica y Cannon con GPU/DOM simulados.

En el checkpoint real de 3549,6 s, con 156 cuerpos, 110 grupos, dos familias y tres hélices, nueve pares alternados de 1050 consultas de sólo lectura dieron una mediana de **0,15047 → 0,01443 ms por consulta**. El estado físico y las tres respuestas eran idénticos. Es el coste de `propellerObstruction` dentro del arnés nativo; no mide FPS, renderizado ni todo el paso de Cannon.

## Fantasma del dron y enseñanza nativa

La [revisión visual de enseñanza](drone-teaching/README.md) restaura la partida real de **3549,6 s**, con **10 / 80 recibos** y **137458,185596 J**. Cinco capturas muestran los controles del receptor, la toma azul sobre el cubo 521 a 2,5 cm, una toma roja a 8,5 cm frente a un alcance de 5 cm, la entrega azul con caída estimada y la ayuda de B a 960 × 640. La cámara y el reloj de inspección son instrumentados; la selección, detención, rueda, confirmación y cancelación usan controles nativos. No se crean piezas ni se mueven cuerpos para preparar las vistas.

Las ocho comprobaciones conservan exactamente poses y masas de 156 cuerpos, identidades y carga de 406 piezas activas, familias, cargos, registros de producción y saldo exterior. Al liberar el bloqueo de reloj del ensayo durante ocho fotogramas, la pausa nativa de enseñanza mantiene el mismo estado. Se confirman toma y entrega, y se rechaza y cancela la pose roja. No hay advertencias de restauración ni errores JavaScript/WebGL; las 11 regresiones de logística pasan después del ajuste visual.

La captura inicial reveló una instrucción de «tomar selección» durante la enseñanza y escaso contraste sobre la mesa. Ahora la vista previa muestra la acción de guardar, la rueda y cancelar en una placa legible; los rechazos conservan su motivo y la entrega indica que la caída es estimada. Es un cambio de presentación, sin alterar físicas ni validaciones. La revisión confirma las nuevas líneas de receta de B y de primera línea recuperada. No se presenta como vuelo ejecutado en Chromium ni como una sesión manual completa.

## Global anterior al ajuste de giro

La [suite global de cierre](global-close/README.md), lanzada después de los 49 focales finales de coordinación e interrupciones, aprobó **1863/1863 pruebas** en **182,05 s**, sin fallos, cancelaciones ni omisiones. Se ejecutaron 215 archivos con el reportero TAP explícito. El runtime, las definiciones de prueba y el arnés conservan hashes idénticos antes/después; los únicos cambios entre los manifiestos son dos helpers de benchmarks que esta suite no importa. El informe conserva esa distinción, la salida completa y 348 hashes individuales. No se repitió GLES porque los ajustes de cierre no cambian shaders.

## Giro acumulado y objetivo de la pinza

El [diagnóstico geométrico de la toma](yaw/README.md) conserva la partida real detenida después de sesenta recibos y una sonda de sólo lectura. El centro restaurado coincide exactamente con el serializado, pero el giro acumulado de 66,917° desplaza la cara de la pinza unos 23,8 mm respecto a la enseñanza cuando se mantiene fijo el objetivo del centro. La consulta original no alcanza el cubo con ninguno de sus nueve rayos; conservar la cara enseñada con la orientación real obtiene tres impactos, sin modificar alcance ni colisiones. El barrido de 360 orientaciones y el estado físico intacto están registrados. Es un diagnóstico anterior al vuelo corregido, no una entrega adicional ni la prueba de ochenta recibos.

La corrección deriva el objetivo de vuelo a partir de la cara activa enseñada y de la orientación física actual. Conserva los puntos guardados y los índices del recorrido; los codos y las columnas de aproximación se corrigen juntos y vuelven a comprobarse contra alcance, espacio y obstáculos. No aplica un giro artificial al cuerpo ni amplía la pinza. Una orientación frontal incompatible sigue rechazándose.

La [recuperación física](logistics-yaw-recovery-60.json) parte del checkpoint detenido con sesenta recibos: recoge la carga 902, la entrega, regresa y recarga en el borne. Termina a los **13563,466667 s**, con **43515,899529 J**, tras **50,266667 s** y **282,123126 J** de gasto concurrente. No cambia las poses enseñadas, no recoloca la carga y conserva los sesenta productos. Los [48 focales](logistics-yaw-focus.tap) incluyen vuelo real, regreso, restauración con carga, volumen del dron y rechazo de una orientación frontal incompatible.

## Global final posterior al ajuste de giro

La [global final](global-final/README.md) aprobó **1868/1868 pruebas** en **183,885 s**, sin fallos ni omisiones. Incluye los tres casos nuevos de giro acumulado, orientación frontal incompatible y volumen completo de recogida, además de las dos regresiones de [reutilización de equipos](reutilizacion.md). Se ejecutaron 216 archivos después del cierre de esos focales. Los **349 hashes son idénticos antes y después**, incluidos runtime, definiciones de prueba, arnés y helpers; no cambió ninguna fuente durante el pase. El TAP completo, los manifiestos y sus agregados se conservan por separado del pase de 1863 anterior.

## Pedido nativo completo y revisión final

La misma partida originada con cuatro trabajadores cerró **80 recepciones y 60 s de actividad útil** a los **17029 s**, con **7892,139659 J** de la fuente. Continuó en el mismo mundo y recibió el producto **81** a los **17210 s**, con **6048,501579 J**. El intervalo adicional fue de **181 s y 1843,638081 J**. La vista del pedido permanece en 80/80; el registro de productos conserva las 81 recepciones únicas.

El [balance de la partida nativa](../galpon-cadena-20261126/README.md) conserva montaje, tandas, pausas y recuperaciones. Incluye el gasto de 1200 s sin otra entrega y la reintroducción de una carga recuperada mediante el recorrido completo de las ocho cintas. La última tanda corregida produjo veinte recibos sin otra intervención en las cargas; el desarrollo completo no se presenta como una corrida ininterrumpida. Su pico fue de **157 cuerpos activos**, y los checkpoints de 80 y 81 conservaron **150**.

La [revisión final en Chromium](real-order/README.md) abre una copia exacta del guardado de ochenta, con el mismo runtime de la global final. Conserva sus **598 identidades**, saldo, diez cintas, brazo y tres seguidores, sin advertencias. Cuatro capturas muestran el mundo y la tableta a 1440 × 900 y 960 × 640, sin recorte horizontal de controles ni desbordamiento horizontal. No hubo errores JavaScript, de consola ni GL. La captura está detenida en ese instante; no se atribuye por sí sola el recorrido que produjo el guardado.

Quedaron comprobados el objetivo «Pedido completado · 80 rotores y continuidad demostrada», la reserva restante y el mensaje «Equipo de extracción recuperado · 4 en turno». La receta superior conserva los ocho tramos de la primera línea y remite al material de cada plano. La enseñanza del dron y su validación azul/roja mantienen la revisión específica anterior.

Después de las capturas se midieron dos bloques consecutivos de **120 y 600 pasos nativos de 1/120 s**, sin sobrescribir el guardado: **6,868 y 2,624 ms transcurridos por paso**. Se midieron aparte doce frames completos de SwiftShader tras dos de calentamiento en cada bloque, a 1280 × 800: medianas de **1,9 y 1,5 ms**, con el máximo de **189,5 ms** del primer grupo conservado en los datos. No es un contador exclusivo de CPU ni una predicción de FPS de una GPU de escritorio.

El [perfil del arnés](../galpon-cadena-20261126/perfil-arnes.md) mantiene separada la equivalencia de `nativeContext` y la reutilización de consultas de vuelo. Las capturas de uno y diez recibos y las fixtures aisladas de ochenta conservan sus alcances propios. La comodidad de una partida manual y la apertura del lanzador desde el Explorador de Windows requieren el equipo del jugador; no quedan presentadas como pruebas realizadas en este entorno.
