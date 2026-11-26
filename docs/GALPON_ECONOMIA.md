# Economía del galpón

El primer pedido se cierra cuando doce cubos de materia extraída pasan por la línea, reciben enfriamiento activo y entran físicamente en la familia de recepción. Cuenta orígenes distintos. La continuación B requiere cuatro tandas de veinte rotores y una medición de actividad útil. La fuente puede seguir suministrando materia si hay un equipo, espacio y energía.

## Balance de materia

| Operación | Entrada | Salida y custodia |
| --- | --- | --- |
| Inicio | Concesión de escenario | 4 trabajadores de 1 u, o 1 en la variante individual. La instalación empieza con 180 000 J. |
| Extracción | Trabajo junto a la fuente y 2 J | Una carga inerte de 1 u con ID nuevo. La salida está limitada por espacio y una cadencia de 0,65 s. |
| Transporte | Una carga y su equipo | El mismo ID pasa del suelo a transporte y luego al acopio. Un primer tramo operativo admite descarga junto a la fuente. |
| Conversión | 1 carga en el acopio | Tras 0,8 s sale 1 cubo de 1 u con el ID de la carga. Al solicitar un compañero se reserva también una plaza. |
| Conformado | 1 cubo manipulable de 1 u | Tras 0,55 s sale 1 enganche de 1 u con idénticos origen y carga eléctrica. |
| Montaje de una recta | 18 cubos y 12 enganches de 1 u | El blueprint ensambla 30 IDs existentes e incorpora sus tres motores. Los apoyos del galpón permiten la versión sin patas. La variante con patas del banco agrega cuatro cubos. |
| Recepción | 1 cubo manipulable con paso automático comprobado | Su ID entra en una familia, con un solo crédito histórico por origen. Retirar y reintroducir conserva ese crédito. |

En el motor, `weight` registra la materia en unidades de cubo. Un cuerpo ordinario recibe masa dinámica `weight × 0,25` en Cannon. Un cubo de peso 1 y un enganche de peso 1 tienen por tanto la misma masa dinámica 0,25 antes de ensamblarse. El perfil geométrico del enganche sigue siendo el del juego.

Los ocho tramos incorporan 144 cubos y 96 enganches. El pedido necesita otros 12 cubos. Si se mantienen los trabajadores iniciales y se utiliza la receta sin patas, se extraen como mínimo 252 u. Los 96 enganches vienen de conformar 96 de los 252 cubos producidos.

El registro permite hasta cuatro cargas en la salida de la fuente y doce en el acopio. El adaptador físico puede esperar antes si otra carga ocupa la boca. Cada cámara posee una sola entrada hasta que el cuerpo de salida se materializa. Acabar el tiempo con la bandeja ocupada mantiene el trabajo pagado y su ID. El límite técnico de 2 000 piezas incluye los fragmentos. Las familias y las piezas incorporadas siguen contando.

El límite inicial es de doce trabajadores autónomos. Una familia que contenga cuatro compañeros conserva cuatro plazas, y sus miembros esperan mientras permanecen guardados. Unirse en un grupo físico conserva las plazas. Un integrante colocado en una máquina deja de trabajar de forma autónoma. Seis pirámides o doce triangulares de un trabajador suman una sola plaza y una unidad de capacidad laboral.

## Energía y temperatura

| Concepto | Cargo a la instalación |
| --- | --- |
| Extracción | 2 J por unidad |
| Conversión técnica | 5 J de trabajo y 15 J transferidos al cubo, que sale al 5 % |
| Conversión de trabajador | 5 J de trabajo y 225 J transferidos al compañero, que sale al 75 % |
| Conformado, división o recomposición | 4 J por operación |
| Montaje | 60 J por recta |
| Motores y tracción | Julios que solicita el modelo de transporte durante cada paso |
| Refrigeración activa | 4 W por unidad de materia durante el tiempo útil de refrigeración |
| Recuperación eléctrica en el enfriador y borne de la fuente | Incremento real de la carga, en julios |

La reserva eléctrica de la instalación y la carga personal son cuentas distintas. Cada compañero inicial trae una celda llena de 300 J como parte de la concesión de apertura. Los cubos producidos reciben su energía del depósito al iniciar la conversión. En el ejemplo de 252 productos, extracción, conversión, carga inicial, conformado y montaje suman 6 408 J. Motores, refrigeración y reposición de carga se añaden según el recorrido efectivo.

Dividir un cubo reparte también su capacidad. Una pirámide tiene 50 J y un triangular tiene 25 J de capacidad. Seis pirámides al 40 % almacenan 120 J en total, igual que el cubo original. Durante la recomposición, la carga de salida es la media ponderada por materia. El borne de la fuente paga la recarga de trabajadores cercanos hasta el 95 %. El descanso por sí solo conserva la carga en el galpón.

Tanto el cubo como el enganche recién emitidos tienen temperatura normalizada 1. El enfriamiento pasivo reduce 0,085 por segundo, por lo que una pieza alcanza el umbral manipulable 0,45 tras unos 6,47 s. En refrigeración activa se reduce 0,9 por segundo con energía disponible. La recepción exige temperatura manipulable, al menos 0,5 s de tratamiento activo pagado y el recorrido físico comprobado. El paso por el túnel usa la recuperación del enfriador y paga la reposición hasta el 50 % de carga. El umbral estabilizado 0,12 queda registrado para encargos posteriores. Guardar una pieza en familia conserva su temperatura y no genera tratamiento activo.

## Identidad, pruebas y continuidad

Cada registro vincula un ID actual, el origen inicial o extraído, su fracción geométrica, masa, plaza laboral, carga, temperatura y custodia. Una carga está en la fuente, en transporte, sobre la cinta, en el acopio o en una cámara. El cubo o enganche emergido está en la sala o integrado. Una recepción conserva el crédito aun cuando el cuerpo vuelva a salir de la familia. Dividir y recomponer mantienen el origen y la suma de fracciones geométricas.

`node --test tests/galpon-production.test.cjs tests/galpon-energy.test.cjs` ejecuta diez pruebas del registro y tres del juego con Cannon y DOM/GPU simulados. Cubren fuente bloqueada, capacidad de una sola unidad, transporte local, conversión interrumpida, conservación de carga y masa, financiación, custodia, recepción repetida, ocho recetas y doce créditos. Se midieron en los cuerpos físicos la capacidad fraccionada, el gasto de recarga y la carga al recomponer. El ensayo de las ocho recetas en ese archivo verifica contabilidad. La duración con desplazamiento y el coste de simulación pertenecen a la medición de la escena.

La cuota, los límites y las tarifas de A están en `assets/js/galpon-production.js`. Con cuatro trabajadores, la construcción de la línea duró 8 min 12 s en el ensayo Cannon a 240 Hz y 8 min 37 s en Chromium. [Hitos y mediciones de las cuatro partidas](mediciones/galpon-20261126/README.md).

## Continuación B: componentes, custodia y energía

B continúa el mismo registro de extracción, trabajadores, familias y energía. La fuente que emerge presenta el depósito existente de 180 000 J iniciales: su aparición no repone la reserva. La salida accesible mediante cables admite 240 W; cada celda de batería externa del galpón almacena hasta 900 J y se recarga a un máximo de 30 W cuando el mecanismo está apoyado. La adaptación conserva los julios de la pieza y cambia su capacidad, por lo que también cambia el porcentaje mostrado. La capacidad de 900 J no sustituye los 300 J de la celda ordinaria de un trabajador ni concede otros 900 J al adaptar un cubo.

**Resultado observado:** la continuación nativa desde A completó los ochenta rotores y los 60 s de actividad útil con **7892,14 J** en la fuente. Después recibió el rotor 81 en el mismo mundo y conservó **6048,50 J**. El [balance por tramos](mediciones/galpon-cadena-20261126/balance-observado.md) incluye montaje, intentos interrumpidos y recuperaciones; no presenta el linaje como una ejecución sin intervenciones. Las proyecciones de componentes que aparecen más abajo se conservan como antecedentes, separadas de este cierre medido.

| Construcción o proceso | Materia y coste |
| --- | --- |
| Brazo de referencia | 18 cubos y 8 enganches, 26 u en sus cuatro rotores y estructura. El montaje cobra 52 J. La preparación de la demostración carga los ocho enganches y el agarre hasta el 100 % con la misma reserva: hasta 2 565 J si esas nueve piezas llegan al 5 %. |
| Dos alimentadores | Cada recta conserva la receta de 18 cubos y 12 enganches: 60 u y 120 J de montaje entre ambas. |
| Dron mínimo | Tres cubos, un enganche y dos triangulares de 1/12 u. Para las palas se divide un cubo en seis pirámides y se subdivide una: quedan cinco pirámides de 1/6 u en inventario. El conjunto usa 4 1/6 u y la fabricación requiere cinco unidades enteras contando esos sobrantes. |
| Trayectoria y cableado | Inicio, destino y receptor son adaptaciones de cubos existentes; el receptor ocupa uno de los tres cubos del dron. Los cables conservan los IDs de sus materiales en custodia propia y permiten recuperarlos al retirar el tendido. |
| Láser | Un cubo estabilizado se reserva durante 1,2 s y 4 J de trabajo. Salen seis pirámides de base cuadrada de 1/6 u con sus seis fracciones del mismo origen. El cabezal también procede de un cubo. |
| Ensambladora | Un cubo y seis pirámides hermanas aportan 2 u. Tras 2 s y 12 J se emite un rotor de dos enganches articulados. Del trabajo pagado, 8 J corresponden al conformado de esos dos enganches y 4 J al ensamblaje. |
| Pedido | Cuatro tandas de veinte rotores requieren 160 u de producto; el registro acredita cada rotor después de comprobar su recepción física. Los productos recibidos se conservan como mecanismos dentro de familias de hasta 100 piezas. |

La ensambladora gratuita es infraestructura identificada de la misión. No aporta piezas desarmables. Al procesar, la estación conserva las entradas reservadas y sus snapshots físicos. Una salida ocupada mantiene el trabajo pagado y espera; fallar al materializar la articulación devuelve el mismo proceso al estado listo. Cargar una partida reserva también los IDs futuros del láser antes de permitir otra asignación. Estos contratos se verifican en [el modelo de la cadena](../assets/js/galpon-chain.js) y [las pruebas de estaciones](../tests/galpon-chain-integration.test.cjs).

### Colas y almacenamiento

El láser mantiene una tanda industrial pendiente por origen. Su límite cuenta las pirámides actuales de la cadena aunque una haya caído fuera de la bandeja o las otras estén guardadas; contar sólo contactos no detectaría esa tanda incompleta. La siguiente división se permite cuando la ensambladora reserva las seis anteriores. Así pueden coexistir las seis que está transformando la ensambladora y una nueva tanda en el transporte, sin producir por adelantado los 480 fragmentos del pedido. Un proceso abortado devuelve sus mismas entradas y vuelve a bloquear cortes adicionales hasta consumir el excedente conservado.

La integración con Cannon comprueba cinco pirámides apoyadas en la entrada B y una caída fuera: otro cubo espera entero y no paga un corte. Recuperar los seis integrantes y reservarlos en la ensambladora libera la siguiente operación. También comprueba ochenta rotores físicos en dos familias: 160 IDs, 160 u y 80 articulaciones guardadas, con no más de doce cuerpos adicionales sobre la base de ese fixture. Esta última prueba prepara los insumos y su procedencia; verifica fabricación, recepción y almacenamiento, sin atribuirse los transportes anteriores.

En B, la recepción de la primera línea admite **una carga entre tránsito y espera**. El puesto se reserva al producir el cubo y se libera cuando el agarre lo retira físicamente. La prueba integrada detectó que una cola de cuatro podía apilar otra pieza sobre la toma del brazo; el regulador evita ese solapamiento sin cambiar la materia ni mover cargas por guion. A conserva su pedido de doce y su recepción en familias.

El dron comprueba en tierra el volumen del conjunto y de la carga en la aproximación y la suelta. Si falta producto o el destino está ocupado, mantiene el programa, permanece apoyado y apaga sus motores. Los servicios de recogida o entrega que comparten un puesto conservan su turno hasta el regreso y aterrizaje, lo que evita cruzar dos drones por el mismo acceso. Esta exclusión entre rutas no inmoviliza los demás objetos de la sala: una ocupación posterior al despegue sigue activando la protección por obstrucción. El recorrido medido hasta ochenta incluye ocupación real de mesa y frío y abastecimiento de ambas entradas; sus interrupciones y recuperaciones se describen por separado más abajo.

### Tratamiento térmico y carga del producto

El primer ciclo conserva su recuperación eléctrica hasta el 50 %. Al abrir B, los cubos de proceso se recuperan hasta el 10 %: un cubo nuevo pasa de los 15 J de conversión a 30 J almacenados. Si ya trae más energía, la conserva. Los motores reciben la fuente cableada y el dron utiliza su batería; cargar cada insumo hasta 150 J añadiría 19 200 J al pedido sin alimentar esos transportes.

Ambos enfriadores mantienen el modelo térmico. El segundo exige el umbral estabilizado 0,12 y al menos 0,5 s de tratamiento activo por integrante. Un cubo ya frío conserva su temperatura; ese tratamiento mínimo cuesta 2 J por unidad. Dividir, recomponer o guardar en familia mantiene el calor y la energía por origen. Seis pirámides pagan el enfriamiento de una unidad, mientras tres cubos dentro de una familia pagan el de tres.

El retorno del dron acredita los orígenes transportados. Si otro mecanismo ya retiró o dividió la entrega, o si una estación la reservó, se comprueban los integrantes actuales de ese origen. El tratamiento pagado sigue siendo válido aunque la materia haya salido del enfriador antes del aterrizaje: el retorno consolida el hito térmico sin otra refrigeración ni cambios de posición. El registro rechaza un origen intervenido manualmente y conserva un único crédito por origen al guardar y cargar.

### Medición de componentes y presupuesto de referencia

Las aperturas completas desde cuatro trabajadores recibieron los doce cubos con ocho tramos a los 548 s de simulación a 60 Hz, 547 s a 120 Hz y 551 s a 240 Hz. Conservaron respectivamente **170 716,23 J**, **170 716,70 J** y **170 708,96 J**. La recuperación de un punto de retorno ocupado utiliza otra ruta de rodamiento comprobada; conserva el descanso, los cuerpos y la energía de los trabajadores. El [ensayo de recuperación](../tests/galpon-source-recovery.test.cjs) incluye el guardado observado que antes detenía la extracción a 120 Hz.

La recepción integrada y los ensayos físicos aislados de B registran los siguientes costes. La primera fila parte de la línea real de A y conserva sus familias; las pruebas aisladas preparan las colas de entrada y salida como fixtures.

| Medición | Resultado |
| --- | --- |
| Tres entregas del brazo cableado desde la recepción real de A, incluido el retorno final a descanso | 1 831,54 J: 1 827,40 J de motores y 4,14 J de pinza. Equivale a unos 610,51 J por transferencia. Los ejes usan 12 rpm y límites de 2/4/3/2 N·m; el pico medido es 90,06 W. El planificador considera las familias físicas presentes. |
| Brazo en espera durante 60 s | 0 J de la fuente y sin cambio de carga interna. Mantiene el programa con los cuatro motores apagados y los frenos mecánicos nativos; la siguiente carga reanuda la secuencia. |
| Dron con agarre inferior, recorrido de 1,2 m y carga de 1 u | 37,025 s y 63,967 J para recoger, entregar, regresar y aterrizar. |
| Misma referencia con agarre frontal | 37,992 s y 68,553 J. |
| Dron en el trazado del galpón, incluida separación de los rieles y retorno apoyado | Ciclos de 48,67 s, 48,73 s y 48,80 s. Tres ciclos consumen 200,79 J del dron, unos 66,93 J por ciclo. El dron que ya está apoyado en origen espera allí antes de su primera recogida. |
| Transporte nativo desde el frío a cada alimentador, medido por separado desde el mismo guardado | A recoge a los 8,02 s, suelta a los 23,47 s y vuelve apoyado a los 44,33 s. B recoge a los 9,07 s, suelta a los 22,07 s y vuelve a los 41,60 s. Estos recorridos conservan el producto ya fabricado; no prueban por sí solos el tráfico simultáneo. |

La recepción integrada utiliza [el controlador de la partida real](../tests/benchmark-galpon-chain.cjs); el resumen registra su medición de motores y pinza por separado. La espera se reproduce con [la prueba aislada del brazo](../tests/galpon-chain-arm.test.cjs), que utiliza otras poses y no aporta el coste proyectado de la recepción. Las [pruebas de logística](../tests/galpon-drone-logistics.test.cjs) y [del dron en el galpón](../tests/galpon-chain-drone.test.cjs) miden los vuelos; esta última utiliza material pagado, balizas, apoyos y recarga del escenario. El [resumen de balance](mediciones/galpon-cadena-20261126/economia.json) distingue los datos medidos de la siguiente proyección.

En la prueba del galpón, la fuente transfirió 91 J a la batería y pagó 6 J de frío; la batería terminó con 109,79 J menos. Sumar la recarga a esa disminución da los 200,79 J consumidos por el dron. La división entre carga embarcada y fuente cambia con el tiempo apoyado.

La proyección inicial presupuestó 160 transferencias del brazo a la mesa, 320 recorridos de drones repartidos entre los dos enlaces posteriores y 12 800 s de funcionamiento de diez cintas. Ese primer escenario suponía enlaces que podían trabajar en paralelo. Usó 75 J por vuelo, por encima de los 66,93 J medidos en el trayecto del galpón, y el coste de las tres transferencias integradas del brazo. Sus números se conservan como referencia de diseño; una ruta distinta debe sustituirlos por su gasto medido.

| Concepto proyectado para 80 rotores | Julios |
| --- | ---: |
| 160 u: extracción, conversión, 30 J almacenados y dos tratamientos mínimos de frío | 6 560 |
| 80 cortes láser y 80 ensamblajes | 1 280 |
| 160 transferencias del brazo a 610,51 J | 97 682 |
| 320 recorridos de dron a 75 J | 24 000 |
| Treinta motores de cinta en vacío a 0,06 W durante 12 800 s | 23 040 |
| **Subtotal proyectado** | **152 562** |
| **Saldo disponible para capital, otros movimientos y variación respecto del ensayo de A a 60 Hz** | **18 154** |

El saldo restante debe pagar brazo, dron, alimentadores, balizas, cabezal, cables, extracción y transporte del material de construcción, carga que quede almacenada al terminar y tracción adicional de las cintas. Este presupuesto es una estimación a partir de componentes; la duración y el gasto de una ejecución completa de las ochenta entregas dependen de la instalación. Un segundo brazo requiere medir sus propias posturas, recorrido y apoyo: no se puede trasladar automáticamente el coste de la recepción a otro enlace. La referencia energética utiliza el dron para alimentar las cintas.

La [alternativa de brazo sobre torre](GALPON_BRAZO_PEDESTAL.md) conserva las bancadas originales y completa tres ciclos físicos del frío a B con retorno. Su soporte independiente utiliza 96 cubos y cuesta 2 112 J en el ensayo. El transporte consume 2 450,03 J a 60 Hz y 2 236,29 J a 120 Hz, además de 6 J de frío: **816,68 y 745,43 J por traslado completo**, respectivamente. Las colas son fixtures explícitas y B está detenido para aislar el brazo. No se probó la alternancia de esa torre entre las dos entradas.

Esta configuración demuestra una alternativa mecánica, pero su gasto no permite prometer ochenta rotores con la reserva existente. Reemplazar hipotéticamente los 160 vuelos del frío a las entradas, presupuestados a 75 J, por 160 ciclos de ese brazo añadiría unos **107–119 kJ**, antes del pedestal y del segundo brazo. Una menor duración podría ahorrar consumo de cintas, pero no justifica omitir esa diferencia. No hay una medición con otros límites de par, rpm o poses de la misma torre que resuelva el balance; la referencia presupuestada utiliza drones en ese enlace.

La instalación de tres drones ensayada comparte el puesto del frío. Su reserva física permanece hasta el retorno para evitar un choque entre la entrada y la salida, por lo que estos viajes se turnan. Con cuatro vuelos por rotor de 42–49 s, el pedido requiere aproximadamente 13 440–15 680 s sólo de ciclos de transporte. A 1,8 W de motores de cinta en vacío, el subtotal proyectado sube a **153 714–157 746 J** y deja **17 002–12 970 J** desde A antes de capital, tracción y variaciones. Son cálculos de sensibilidad a partir de componentes; no certifican la duración ni la energía final de las ochenta recepciones.

El extremo de 49 s añade 2 880 s y 5 184 J al primer escenario. En el arranque integrado de la flota ya se habían gastado unos 13 507 J desde A, incluidos instalación, movimientos previos y stock preparado. Esa sensibilidad anticipaba un margen estrecho. Los siguientes apartados la contrastan con los intervalos integrados, las cuatro tandas y la recepción posterior a la victoria, conservando también el coste de los intentos interrumpidos. Los ciclos medidos de los alimentadores son más cortos que 49 s; tampoco se presupone que toda la energía del stock preparado deba volver a pagarse.

### Intervalo integrado observado: recepciones 2 a 9

La continuación del guardado real de la fábrica, a 60 Hz y con la familia de A en su posición original, registró siete intervalos consecutivos entre los rotores 2 y 9. Sus insumos se fabricaron y transportaron mediante la instalación automática. El segundo rotor se recibió a los **1874,4 s**, con **153996,38 J**; el noveno, a los **3151,4 s**, con **141055,62 J**.

| Medición de esos siete intervalos | Resultado |
| --- | ---: |
| Tiempo de simulación | 1277,0 s |
| Débito de la fuente de toda la instalación | 12940,76 J |
| Media de tiempo por rotor | 182,43 s |
| Media de fuente por rotor | 1848,68 J |
| Intervalos de tiempo observados | 182–183 s |
| Débito de fuente por intervalo | 1844,85–1857,35 J |

Son lecturas de la reserva compartida, incluidas producción, motores, estaciones y recarga durante el intervalo. No se registró una lectura exacta de las tres baterías en ambos extremos de cada recepción; por eso estas cifras no se atribuyen al consumo aislado de los drones. El [registro de economía](mediciones/galpon-cadena-20261126/economia.json) conserva cada recibo e intervalo.

Desde el estado del noveno rotor, mantener esa media para los 71 restantes proyectaba **9799,34 J** al final, antes de capital o recuperación adicional. Era una proyección condicionada, no el saldo medido al completar el pedido. La ejecución se interrumpió después al detectar una obstrucción del dron entre la mesa y el segundo enfriador: a los **3314,4 s** conservaba **139935,86 J**, nueve recepciones y 60 s de actividad útil acreditada.

La recuperación nativa conservó el material y produjo el rotor 10. A los **3549,6 s** había **137458,19 J** y los tres drones habían regresado; el intervalo desde la pausa anterior debitó **2477,67 J** de toda la instalación, incluidos transporte, recargas y producción concurrente. No es un coste aislado de reenseñar la ruta.

El segundo intento recibió los rotores 11 a 17. Los seis intervalos comparables entre esos recibos promediaron **179,83 s** y **1839,10 J de fuente por rotor**. Se detuvo a los **4691,07 s**, con **126077,92 J** y 17 recibos, después de otra obstrucción señalada por la versión anterior del detector.

La recuperación siguiente incluyó una intervención manual declarada: la carga 569 se soltó y volvió a la primera cinta, reinició su historial y recorrió nuevamente los ocho tramos antes de recuperar su trazabilidad automática. Enderezar y recargar el mismo dron, con producción concurrente, debitó **573,11 J en 17,20 s**. El siguiente viaje coordinado debitó **84,42 J de fuente en 44,93 s**. Ambos tramos conservan los 17 recibos anteriores; no se presentan como producción ininterrumpida.

### Tres tandas completas observadas: 20, 40 y 60

La continuación de la instalación recuperada recibió sesenta rotores nuevos de forma acumulativa, con guardado y carga en una instancia nueva entre tandas. Los tramos automáticos de esta serie conservaron sus mecanismos y no necesitaron colocar cargas manualmente. La intervención anterior permanece registrada en el linaje y en su coste.

| Checkpoint validado | Tiempo total de simulación | Fuente restante | Recibos únicos | Actividad útil en ese checkpoint |
| --- | ---: | ---: | ---: | ---: |
| Primera tanda | 5227,67 s | 120138,36 J | 20 | 60 s |
| Segunda tanda | 8769,20 s | 83467,21 J | 40 | 60 s |
| Tercera tanda | 12311,67 s | 46773,95 J | 60 | 60 s |

La segunda tanda fabricó veinte rotores en **3540,00 s**, debitando **36667,68 J** desde su arranque restaurado; la tercera necesitó **3541,00 s** y **36689,80 J**. Estos totales incluyen producción, cintas, brazo, drones, estaciones, frío y recarga durante cada tramo. La fuente de cada arranque restaurado y los aproximadamente 3,46 J de cada transición de guardado y puesta en marcha figuran por separado en el informe.

Entre los recibos consecutivos de la tercera tanda hay diecinueve intervalos comparables: promedian **177,16 s** y **1834,72 J de fuente por rotor**. A diferencia del primer intento, los tramos de veinte incluyen exactamente **40 u extraídas y convertidas** cada uno; el primer intento había empezado con once cargas crudas ya pagadas en el acopio. Las mismas tres baterías externas terminan cada tanda cerca de la misma carga —dos a 900 J y la tercera a unos 848 J—, y su variación se conserva en el informe. No se suma la recarga otra vez al coste de fuente.

El checkpoint de sesenta conserva **540 orígenes y 540 u** en 558 registros actuales, incluidos los componentes, cables, sobrantes, trabajadores, productos e insumos en tránsito. Los sesenta recibos y sus dos integrantes por producto son únicos. El validador comprueba la misma materia por origen y la custodia física del guardado; el historial de recibos sigue siendo un prefijo de la misma partida iniciada en A.

### Cuarta tanda interrumpida: el gasto de espera se conserva

El arranque hacia ochenta se guardó a los **12313,20 s**, con **46770,49 J** y los mismos sesenta recibos. Durante los siguientes **1200,00 s** no se recibió otro rotor. La carga 902 quedó en la mesa y el agarre del dron no consiguió tomarla; al cierre los tres seguidores estaban apoyados y sus baterías tenían 900 J. El checkpoint de pausa registra **13513,20 s**, **43798,02 J**, sesenta recibos y **0 s de continuidad útil**. La espera sin entregas no mantuvo el crédito anterior de actividad.

| Gasto durante ese intento sin nuevos recibos | Julios |
| --- | ---: |
| Extracción | 2,00 |
| Conversión | 5,00 |
| Carga transferida | 204,74 |
| Refrigeración | 20,08 |
| Transporte y motores | 2740,64 |
| **Débito completo de la fuente** | **2972,47** |

Este es el coste de todo el intento, incluida la actividad inicial antes de quedar en espera. No se atribuye íntegramente al reposo de los drones ni se divide por cero productos para inventar una cadencia. La recuperación posterior se registra como otro tramo y no descuenta este gasto anterior.

### Recuperación de la toma y nuevo arranque

Desde ese mismo guardado, la corrección de la referencia de pinza respecto de la orientación real permitió que el QR295 tomara la carga 902, la descargara y regresara. El ensayo no modificó las poses por código ni las configuraciones guardadas. El checkpoint definitivo de recuperación registra **13563,47 s**, **43515,90 J** y los mismos sesenta recibos. Desde la pausa transcurrieron **50,27 s** y se debitaron **282,12 J**: 64,69 J de recarga, 2,00 J de frío y 215,44 J de transporte. No hubo extracción ni fabricación de otro rotor en ese intervalo.

El total incluye cuatro segundos posteriores al regreso con recarga real del QR295 y trabajo concurrente del brazo y otro dron. Por eso no representa un consumo aislado de vuelo. Al cierre, las celdas 294 y 386 almacenaban 900 J cada una; la 397 tenía 883,54 J y su dron había vuelto a salir. La continuidad seguía en cero, a la espera de un rotor nuevo. No se suman esos saldos de batería de nuevo al débito de la fuente.

La siguiente restauración y puesta en marcha consumió otros **28,84 J en 1,53 s**, conservados como transición propia. Su checkpoint comienza a **13565,00 s**, con **43487,06 J**, sin cambios en el número de recibos.

### Pedido completo y continuación en el mismo mundo

La instalación recuperada recibió los veinte productos restantes sin intervención durante ese tramo. El [checkpoint de ochenta](mediciones/galpon-cadena-20261126/partida/batch_80.json) conserva el mismo linaje, los ochenta recibos únicos y los 60 s de actividad útil; tanto `completed` como `sustained` son verdaderos. El [checkpoint posterior](mediciones/galpon-cadena-20261126/partida/post_victory_81.json) conserva una recepción adicional y la misma instalación en funcionamiento.

| Estado guardado | Tiempo total de simulación | Fuente restante | Recibos físicos | Piezas de producto recibidas |
| --- | ---: | ---: | ---: | ---: |
| Pedido completo | 17029,00 s | 7892,14 J | 80 | 160 |
| Continuación después de la victoria | 17210,00 s | 6048,50 J | 81 | 162 |

Desde el nuevo arranque a sesenta, el tramo automático final duró **3464,00 s** y debitó **35594,92 J**. Sus diecinueve intervalos comparables entre recibos promediaron **181,00 s** y **1843,45 J de fuente por rotor**. Extrajo 39 u nuevas; la unidad restante del incremento de materia desde el checkpoint de sesenta ya se había pagado durante el intento interrumpido. Si se incluyen esa espera, la recuperación y ambas transiciones de restauración, la cuarta tanda completa consumió **38881,81 J en 4717,33 s**. Esta última cifra conserva todo el coste real entre sesenta y ochenta y no se presenta como un tramo automático ininterrumpido.

El pedido de ochenta termina con **580 orígenes, 580 u y 598 registros actuales**: cuatro unidades iniciales y 576 extraídas. Los 160 integrantes de los productos conservan sus identidades y articulaciones en dos familias de 100 y 60 piezas. La familia previa de A conserva sus doce cubos por separado. Las baterías externas guardan 900 J, 900 J y 848,26 J; esos saldos no se añaden de nuevo al gasto ni al saldo de la fuente.

El débito acumulado de la fuente al completar ochenta es **172107,86 J**, incluidos A, el capital, todos los transportes, las recargas, los intentos interrumpidos y las recuperaciones del linaje elegido:

| Categoría contable desde la apertura hasta ochenta | Julios |
| --- | ---: |
| Extracción | 1152,00 |
| Conversión | 2880,00 |
| Conformado | 1164,00 |
| Carga transferida | 34712,99 |
| Refrigeración | 4946,86 |
| Transporte y motores | 125900,00 |
| Montaje | 1008,00 |
| Reconfiguración | 344,00 |
| **Débito total exacto, redondeado al final** | **172107,86** |

La suma de las filas redondeadas puede diferir un céntimo del total; el informe conserva todos los decimales. Los 180000 J de la cuenta inicial menos ese débito dejan **7892,14 J**. Los 1200 J personales de los cuatro trabajadores eran parte de la concesión original y permanecen separados de esa cuenta. La referencia con drones hacia ambos alimentadores cumple el pedido dentro de su presupuesto; este resultado no amplía el alcance energético de la alternativa ensayada con pedestal.

La operación posterior recibió el producto `rotor:162`, el número 81 de la misma secuencia, en **181,00 s** adicionales y con un débito de **1843,64 J**. El guardado final conserva 582 orígenes, 582 u y 600 registros; las familias de productos pasan a 100 y 62 piezas. Las tres baterías externas terminan con 900 J, 900 J y 848,42 J. El contador del HUD permanece en su objetivo de 80, mientras el registro durable contiene los **81 recibos únicos**. No se reinició la misión ni se repuso la fuente.

El [log original cerrado](mediciones/galpon-cadena-20261126/partida/run_to_80_yaw.log) se copió después de terminar la recepción adicional, junto con su [resumen del ensayo](mediciones/galpon-cadena-20261126/partida/run_to_80_yaw_benchmark.json). La entrada posterior a la victoria utiliza otro formato de evento; el tramo 80→81 se calcula a partir de los dos checkpoints exactos. No se fabricó una línea `rotor recibido 81` ni una media entre múltiples recibos que el log no contiene. Esta evidencia ejecuta lógica y Cannon con DOM/GPU instrumentados; la comprobación gráfica en Chromium se documenta aparte.

### Balance reproducible por intento y tanda

El [agregador de balance](../tests/aggregate-galpon-chain-balance.cjs) lee guardados y logs sin ejecutar la simulación. El [manifiesto de esta secuencia](mediciones/galpon-cadena-20261126/balance-manifiesto.json) conserva los hashes, el A de origen y cada intento y recuperación. Su [informe observado](mediciones/galpon-cadena-20261126/balance-observado.md) y [datos exactos](mediciones/galpon-cadena-20261126/balance-observado.json) validan **20 checkpoints y 19 tramos**, confirman los hitos 20, 40, 60 y 80 y conservan 81 como un checkpoint posterior separado. Las copias relativas de guardados y logs están incluidas en `partida/`. Las [instrucciones de actualización](mediciones/galpon-cadena-20261126/balance.md) permiten extender la misma secuencia sin mezclar ramas de diagnóstico.

El linaje de la corrida es `createdAt = 1795673510034`: parte del A a 60 Hz con **170716,231376 J**. Una apertura anterior de 170718,81 J pertenece a otra partida y no se usa como saldo inicial de esta continuación. El informe valida la custodia física del guardado, la masa por origen, la permanencia de recibos y el cierre de las ocho categorías de gasto con la fuente. También informa la carga de baterías externas por separado. Los 1200 J personales de los cuatro trabajadores pertenecen a la concesión inicial; no se añaden otra vez al depósito de 180000 J ni se confunden con la capacidad de las baterías adaptadas.

Los campos `forming` y `assembly` pueden reclasificarse al confirmar o revertir la materialización de la ensambladora: 8 J pasan al conformado de los dos enganches sin otro débito. Por eso el agregador comprueba el crecimiento de su suma y conserva ambas columnas; exigir que cada una creciera por separado rechazaría una transacción válida. Un hash y una contabilidad consistente fijan los archivos y su coherencia, pero la procedencia física requiere además los scripts y registros del ensayo.

### Cuotas y continuidad

La lección del brazo requiere una demostración real y después tres entregas con el mismo brazo conectado, en marcha y con repetición activada. Detenerlo o desconectarlo antes de completar las tres reinicia esa pequeña cuota. El dron debe completar tres recogidas, entregas al segundo enfriador y retornos observados. Cada origen sólo cuenta una vez para esos hitos.

El pedido final pide **60 s de actividad continua útil**. El contador acumula trabajo real, transporte con carga, retorno de un ciclo automático comprobado y recarga con julios transferidos. Una espera controlada de un ciclo en curso conserva el progreso hasta 180 s y no suma tiempo. Debe haber al menos un rotor nuevo recibido dentro de los últimos **240 s**: cada rotor usa dos unidades que pasan por dos enlaces posteriores al brazo, por lo que cuatro vuelos en serie a unos 49 s requieren unos 196 s. La ventana deja 44 s para diferencias de ruta, recarga y estaciones; una instalación con enlaces paralelos puede ser más rápida.

Una falta efectiva de insumos, corte, bloqueo, detención o intervención manual de la carga reinicia la medición de continuidad. Conserva las entregas válidas, la materia y todo gasto anterior. Construir o mover una familia de rotores ya acreditados no invalida por sí mismo esa medición. El historial manual acompaña al origen a través de divisiones y familias; reintroducir el cubo recuperado por la primera entrada permite comprobar un nuevo recorrido. La victoria exige las ochenta recepciones y la continuidad, y mantiene la instalación disponible después.
