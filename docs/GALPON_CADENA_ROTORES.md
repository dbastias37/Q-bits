# Galpón de prueba · Cadena de rotores

El bloque B continúa el mismo galpón del primer ciclo. Conserva trabajadores, ocho tramos, doce cubos recibidos, familias, piezas sueltas y reserva energética. La instalación permanece disponible después del pedido.

## Acceso a la rama de prueba

Rama: `prueba/galpon-primer-ciclo`. La campaña y el banco tienen sus modos y guardados separados. No hace falta reemplazar el guardado A para acceder a B.

1. Descarga el ZIP de esta rama y extráelo. En Windows, cierra la ventana del lanzador anterior y abre `Abrir-galpon.cmd` de la copia nueva. También puedes servir la carpeta con `python -m http.server 8000` y abrir `http://localhost:8000/#galpon`.
2. Elige **Continuar partida**. Si empiezas una partida nueva, completa primero la extracción, los ocho tramos y las doce recepciones descritas en [La primera línea](GALPON_PRIMER_CICLO.md).
3. Abre **P → Galpón → Continuar · brazo y energía**. El encabezado cambia a **GALPÓN / 02 · Cadena de rotores**.

Los guardados pertenecen a la dirección y puerto del navegador. Usa el mismo navegador y la misma dirección que empleaste al jugar A; el lanzador de Windows mantiene `http://127.0.0.1:18761`. La descarga de una versión nueva conserva el guardado al servirla bajo esa dirección. Elige **Continuar partida** para recuperar ese mundo.

## 1. Brazo: material, poses y energía

En **Plano de misión**, elige **Brazo** y pulsa **Preparar material del plano**. La fuente, el convertidor y el conformador fabrican los componentes con la economía del primer ciclo. **Montar con piezas disponibles** utiliza **18 cubos y 8 enganches**: los cuatro rotores se forman durante ese montaje. Los trabajadores y las piezas adaptadas quedan fuera de la selección automática de materiales.

El brazo de referencia queda sujeto a la bancada mediante el anclaje existente. Tomarlo con la mano libera esa sujeción. Sus cuatro motores usan **12 rpm y capacidad de 64 u**; los tres ejes articulados mantienen la reducción mecánica de 3:1 del brazo. El par se distribuye para respetar la potencia compartida de la fuente:

| Articulación | Par de referencia |
| --- | ---: |
| Base | 2 N·m |
| Hombro | 4 N·m |
| Codo | 3 N·m |
| Muñeca | 2 N·m |

El montaje carga sus reservas internas desde la cuenta energética de la instalación. La tableta indica los julios transferidos: no es una concesión adicional de energía.

Activa **Producir para la cadena**. Los siguientes cubos recorren los ocho tramos y quedan físicamente en la recepción. Espera a que la carga esté apoyada y accesible. Abre **Configurar brazo · A, B y repetición**:

1. Enseña **A · tomar** sobre el **anillo azul de la bandeja de recepción**, con **12 cm** de altura sobre la mira. Ese punto intermedio cubre la variación observada entre las caídas sucesivas y deja aproximadamente 3 cm sobre un cubo de 9 cm. Comprueba el fantasma y deja espacio a los lados de la pinza.
2. Enseña **B · soltar** sobre la mesa contigua. La referencia comprobada usa **25 cm** de altura, con espacio para el cubo de 9 cm y la separación de la pinza; el resultado sigue dependiendo del movimiento físico de la carga.
3. Activa **Repetir** y ejecuta el programa. El primer hito exige que el brazo tome la carga y que ésta se apoye realmente en la mesa.

Después aparece la fuente principal. La breve presentación se puede omitir con **Esc**, **Enter** o clic y respeta la preferencia de movimiento reducido del sistema. La reserva mostrada es la misma que pagaba los procesos de A.

Activa la fuente y desenrolla un cable desde cubos reales hasta el chasis del brazo. Cada unidad de cable permite **2 m de trazado**; el camino debe quedar libre de sólidos. Para la referencia se verificó un cable de **4 cubos** con un recorrido elevado alrededor de las bancadas. La fuente entrega **240 W compartidos** entre sus mecanismos y recargas; aumentar la capacidad de una batería no aumenta esa potencia.

Completa **tres transferencias con cable y repetición activa**. Parar el programa, quitar la repetición o perder el cable antes de terminar reinicia esta pequeña medición, sin devolver materia ni energía. Después de cumplirla, el hito queda registrado. Deja libre la descarga: el programa necesita espacio físico para la siguiente carga.

Al enseñar por primera vez A/B, el brazo conserva su postura física de reposo como posición inicial. Después de soltar vuelve a ella para despejar la caída del siguiente cubo. Puedes cambiarla con **Marcar posición inicial** si reorganizas el montaje: deja libre el volumen sobre la recepción.

Durante la espera sin carga, el brazo usa sus frenos mecánicos y apaga los motores. Al detectar un objeto recupera la postura A con movimiento y consumo reales antes de cerrar la pinza. Si retiras la carga durante esa aproximación, regresa al reposo; si la descarga está ocupada, espera hasta que quede libre.

Si un dron recoge en esa misma mesa, ambos programas se turnan. El brazo conserva el puesto mientras recoge, entrega y vuelve a su posición inicial. El dron espera apoyado hasta que ese retorno termina; desde que despega y hasta que vuelve a aterrizar, el siguiente ciclo del brazo espera con frenos y motores apagados. La comparación usa la pose B del brazo y la columna de recogida enseñada al QR. Un brazo y un dron que trabajan en puestos diferentes pueden moverse a la vez.

## 2. Dron y recorrido QR

Puedes diseñar tu propio dron con los mecanismos existentes. El plano de referencia emplea **3 cubos, 1 enganche y 2 triangulares de 1/12 u**. Su masa de material es **4⅙ u**. Obtenerlo desde cubos enteros requiere **5 u** y deja **⅚ u** de sobrantes reutilizables.

Las primeras palas se obtienen antes del láser industrial: divide un cubo en seis pirámides y subdivide una de ellas en dos triangulares mediante la reconfiguración del conformador. Conserva las otras cinco pirámides. El plano consume las dos palas y conserva los sobrantes, las identidades y los julios existentes.

La batería de referencia tiene **una celda de 900 J de capacidad**. Convertir un cubo en batería conserva la energía que ya tenía. Una batería casi vacía sigue casi vacía después de adaptarla.

Prepara dos cubos como **balizas QR** y otro como **receptor**. Las adaptaciones se hacen con cubos existentes en la zona del conformador. Pausa la conversión mientras preparas cubos sueltos en su entrada; así la orden automática no los introduce en otro proceso antes de aplicar la adaptación. Despeja el área entre piezas y vuelve a activar la producción al terminar. El receptor pertenece al dron; las balizas permanecen en el suelo. En los controles de trayectoria crea una ruta en la primera baliza, vincula la segunda y asigna explícitamente el receptor.

Orienta las caras QR hacia arriba para una ruta aérea. Enseña la recogida y la entrega desde el receptor. El fantasma representa el mismo dron; confirmar una pose no crea otro ni cambia la posición del real. La pinza puede ir debajo o delante: su cara activa sigue su orientación local.

La toma debe mostrar una validación azul. Un resultado rojo indica alcance, orientación, obstrucción, colisión o capacidad insuficiente. La descarga usa la proyección física de la carga; es una estimación, no una garantía de caída exacta. La ruta añade una elevación de aproximación y retirada para despejar la carga y las guardas del enfriador.

Para recoger cargas que llegan algo descentradas, apunta a un punto común de su bandeja y ajusta la separación con la rueda. Un cubo de 9 cm apoyado en la mesa permite, por ejemplo, enseñar la cara de la pinza a 11,5 cm sobre esa mesa y comprobar una distancia real de 2,5 cm hasta el cubo. El fantasma valida el volumen completo y el alcance físico vigente. La entrega conserva el descentrado con que se tomó cada carga; enseña la recogida del transporte siguiente teniendo en cuenta esa variación.

La secuencia es **recoger → transportar → soltar → regresar → aterrizar**. La comprobación previa incluye carga, ida, vuelta, agarre y margen de aterrizaje. Una batería insuficiente impide iniciar el viaje. Una baliza movida o un obstáculo nuevo obliga a revalidar la ruta.

En el origen, el programa espera apoyado si falta un producto o si la aproximación y la suelta enseñadas están ocupadas. Comprueba el volumen del dron y de la carga real disponible; el transporte siguiente debe retirar físicamente la entrega anterior. Durante esa espera los motores permanecen parados, se permite la recarga y el programa reanuda por sí mismo cuando hay carga, espacio y autonomía. Si el dron ya comienza apoyado sobre su punto de origen, no necesita un despegue de comprobación: conserva la evidencia de contacto antes de despertar el cuerpo. Al cargar un guardado anterior que indique despegue aunque siga apoyado en origen, vuelve a la espera sólo después de observar ese contacto real. Una obstrucción que aparece después de partir mantiene la parada de seguridad de la trayectoria.

Los recorridos que recogen o entregan en un mismo puesto —poses a 15 cm o menos— se turnan hasta completar el regreso y aterrizar. La ruta de vuelta también atraviesa ese puesto: liberar la reserva al tomar el cubo permitiría que otro dron llegara mientras el primero regresa. El que espera permanece apoyado, con los motores parados, y vuelve a comprobar producto, espacio y autonomía antes de salir. La coordinación se conserva al guardar mediante el estado del recorrido. Detener el programa, una obstrucción o la intervención manual libera esa intención de paso; las colisiones físicas siguen activas. Los puestos separados funcionan de forma independiente y cada dron comprueba su propio destino antes de competir por el compartido.

La parada de seguridad de una carga productiva o de su regreso reinicia la continuidad en el momento del corte. Se registra una vez: el dron detenido no impide indefinidamente que una instalación reparada vuelva a demostrar continuidad. Esperar en tierra por turno, producto, espacio o recarga no se considera ese corte.

Para la recarga, cablea la baliza de inicio y deja el dron apoyado cerca de ella. La referencia permite un acoplamiento a **65 cm** como máximo y una transferencia de hasta **30 W por celda**, descontada de la misma fuente. El dron usa energía embarcada mientras vuela. Un guardado durante la carga o después de soltar conserva el punto del recorrido y la pinza existente, sin repetir la toma.

## 3. Segundo enfriamiento y alimentación

Lleva tres cargas al segundo enfriador mediante el dron. Cada entrega cuenta después del contacto físico y del regreso con aterrizaje al origen. El segundo tratamiento requiere **0,5 s de trabajo activo** y alcanza el umbral **estabilizado**. Una pieza que ya está fría no se recalienta por guion. Los productos terminados quedan disponibles para una pinza normal.

En B, el primer enfriador recupera los cubos de proceso hasta **10 % de carga** cuando necesitan esa transferencia. Conserva cualquier carga superior que ya tengan. A mantiene su recuperación al 50 %. La energía de los cubos transportados se distingue de la batería del dron y de la fuente que alimenta las máquinas.

Construye **Entrada A** y **Entrada B** con los planos del galpón. Cada tramo mantiene la receta existente de **18 cubos y 12 enganches**. Conecta sus motores y activa el sentido hacia la ensambladora. Puedes fabricar brazos o drones adicionales con materia real; despeja el área del plano antes de montar otro.

Transporta cubos estabilizados desde el segundo enfriador hasta las cintas mediante brazos o drones. Las entradas aceptan también depósitos físicos con pinzas. Las cargas manipuladas a mano conservan ese historial y no satisfacen el traslado automático.

La referencia de producción usa dos drones para este enlace. La [alternativa de brazo sobre pedestal](GALPON_BRAZO_PEDESTAL.md) conserva las bancadas originales y completó tres ciclos físicos del frío a **Entrada B** a 60 y 120 Hz, con B detenida y el abastecimiento preparado como fixture. Demuestra ese transporte y su retorno; no acredita una alternancia autónoma entre las dos entradas ni ochenta productos con ese montaje. Su soporte requiere 96 cubos y el consumo medido fue de aproximadamente **745–817 J por ciclo**, además del enfriamiento. El [balance de esa alternativa](GALPON_ECONOMIA.md) se mantiene separado del presupuesto de los drones.

Ancla el láser a la salida compatible de una cinta recta detenida. El cabezal procede de **un cubo del stock**, que permanece como material del cabezal. Al desanclarlo se recupera el mismo cubo. El corte consume **4 J en 1,2 s** y transforma un cubo en **seis pirámides de base cuadrada**, cada una con 1/6 u del mismo origen. Estas piezas son distintas de los triangulares de las hélices.

El cortador produce bajo demanda. Si las salidas están ocupadas, conserva la entrada o el trabajo reservado y espera. No prepara las 480 pirámides del pedido por adelantado.

## 4. Ensambladora y pedido

**Colocar ensambladora** abre un plano sobre el suelo. La rueda gira la estación y clic confirma. **Mover la misma ensambladora** y **Retirar ensambladora vacía** conservan una única identidad. La estación no puede desmontarse para producir materia.

Las dos entradas quedan delante y la recepción detrás. Los extremos de las cintas deben coincidir con los puertos en posición, altura y dirección. La entrada A conectada suministra energía a la estación. Las bandejas pasivas reciben el impulso de la cinta; no aplican una fuerza oculta a las piezas.

| Entrada o salida | Material |
| --- | --- |
| A | Un cubo estabilizado: 1 u |
| B | Las seis pirámides completas de otro origen: 1 u |
| Salida | Dos enganches articulados mediante un rotor normal: 2 u |

La fabricación cobra **12 J en 2 s**. Conserva ambos orígenes, las cargas y el tratamiento térmico. La reserva de entradas, el trabajo pagado y las identidades de salida se guardan. Una salida bloqueada no consume de nuevo ni expulsa el producto a través de otros cuerpos.

Retira insumos y productos y termina los trabajos pendientes antes de mover o quitar la ensambladora. Las piezas fabricadas mantienen selección, articulación, configuración, agrupación y desarme normales.

Pulsa **Iniciar pedido · 4 tandas de 20** cuando los hitos iniciales y las conexiones estén preparados. Sólo cuentan rotores fabricados después de abrir el pedido y recibidos físicamente una vez. La recepción agrupa los productos en familias con sus articulaciones originales.

Además de **80 rotores**, el objetivo pide **60 s de actividad útil continua** con entregas nuevas. Los motores vacíos no suman. El transporte efectivo, los procesos, el regreso de un ciclo de carga y las recargas reales sí pueden hacerlo. Una espera normal de un ciclo conserva la medición sin sumar segundos; un bloqueo, corte de energía o intervención en una carga reinicia esa medición y conserva lo entregado.

Las oportunidades opcionales aparecen cuando son pertinentes: **regresar con al menos 20 % de batería embarcada** y **recibir tres rotores seguidos sin bloqueos ni cortes**. La primera mide los julios al aterrizar, antes de sumar la nueva recarga. La segunda sólo cuenta productos nuevos recibidos; una espera normal conserva la serie y una interrupción reinicia la serie todavía incompleta. Los logros conseguidos se guardan. No conceden materia, energía ni acceso necesario para terminar el pedido.

## Recuperación y guardado

**Esc → Guardar partida** y el autoguardado conservan procesos, cables, familias, agarres y recorridos. La pausa real y la pestaña oculta detienen la simulación; los ajustes de mecanismos en la tableta mantienen el mundo en marcha. Las vistas de enseñanza de poses pausan el mundo mientras colocas el fantasma.

Si recuperas manualmente una carga, reintrodúcela en la boca de la primera cinta para que haga un recorrido completo y recupere un historial automático válido. Si está dividida, recompón el cubo con todos los fragmentos del mismo origen en el conformador. Las familias conservan el historial de cada integrante; agrupar no limpia una intervención ni enfría gratis.

No se puede generar material por Q, clic central, Banco rápido, selección de guardados, duplicación o importación en este galpón. La creación comprueba su procedencia además de las restricciones de interfaz. Se conservan los controles normales de manipulación, incluidos **Shift+Q/E/R**.

## Verificación y límites de la evidencia

La evidencia distingue el modelo de contabilidad, los cuerpos y contactos de Cannon, el render y la interacción en navegador. Véanse [balance y contratos económicos](GALPON_ECONOMIA.md) y [capturas e interacción real en Chromium](mediciones/galpon-b-20261126/README.md).

La prueba aislada de 80 rotores verifica articulación, recepción, crédito único, 160 identidades en dos familias y guardado. Sus entradas se preparan como fixtures explícitas; por sí sola no acredita una partida completa desde los cuatro trabajadores ni todos los transportes entre máquinas. Los benchmarks de recorrido completo se documentan por separado con sus hitos observados.

### Referencia de las tres rutas centradas

El helper `tests/benchmark-galpon-feed-drones.cjs` construye y configura dos drones adicionales con producción, reconfiguración, plano, mano, cables y enseñanza nativos. El dron anterior lleva los productos de la mesa al segundo enfriador. Los dos nuevos retiran las cargas de éste y las depositan sobre las entradas. Durante el montaje, los dos cubos iniciales de los puestos secundarios del enfriador salen mediante viajes físicos; no se recolocan cargas para preparar las poses.

La lección de las tres primeras entregas conserva el origen de mesa en **X = 3,60 m** y su baliza final en **X = 4,48 m**, para enseñar tres depósitos separados en el enfriador. La referencia continua usa el origen **X = 4,00 m** y la baliza final **X = 4,20 m**, una vez que los transportes siguientes han retirado los dos productos secundarios. Primero se enseña la entrega central sobre la muestra real; después se trasladan el dron vacío y sus balizas mediante la mano y se vuelven a confirmar las poses. Ese orden mantiene el trazado básico dentro de sus 4 m. Las flotas ya guardadas conservan sus posiciones y poses al reanudar.

La instalación medida usa estas referencias horizontales, en metros del mundo:

| Referencia de enseñanza | X | Z |
| --- | ---: | ---: |
| Toma común sobre la mesa de transferencia | 3,0715 | −0,2626 |
| Centro de la pinza al soltar en el segundo enfriador | 4,1000 | 0,5000 |
| Toma común de los dos drones sobre ese enfriador | 4,1000 | 0,5000 |
| Origen del dron de mesa | 4,0000 | −0,2500 |
| Baliza inicial del dron de mesa | 4,0000 | −0,6000 |
| Baliza final del dron de mesa | 4,2000 | 0,1000 |
| Origen del dron de Entrada A | 3,8200 | 0,4500 |
| Origen del dron de Entrada B | 4,8500 | 0,4500 |

Las entregas a las cintas se enseñan a partir de su puerto real de entrada, avanzando 8 cm en su dirección. La altura se toma de las superficies y del producto presente mediante el fantasma. La pose de suelta conserva la desviación física de la carga respecto de la pinza; el centro común del enfriador permite recoger los siguientes productos con esa variación. Las longitudes guardadas fueron **3,9142 m**, **3,9606 m** y **3,6897 m**, respectivamente, dentro del alcance de 4 m del nivel básico. El origen de mesa deja margen lateral para subir junto al tablero; acercar su baliza final permite conservar ese alcance. Al volver a abrir una flota configurada, el helper conserva las poses; sólo una solicitud explícita de recalibración las vuelve a enseñar.

La referencia enseñada corresponde a la **cara activa de la pinza**. Si el chasis gira durante el trabajo, el controlador deriva la traslación necesaria para mantener esa cara en su punto enseñado, usando la orientación física actual. Los codos adyacentes y la columna de aproximación reciben la misma corrección en cada eje; se conservan los segmentos cardinales, las acciones y sus índices al guardar. La autonomía, el alcance del recorrido y los volúmenes de recogida, entrega y paso se comprueban con esos objetivos reales. No se fija el giro por código ni se amplía el alcance de la pinza. Un agarre frontal cuya cara ya no enfrenta la carga sigue rechazando la toma; una aproximación que necesite otro codo debe volver a enseñarse.

La primera recalibración central, todavía con el origen del dron de mesa en X = 3,60 m, comenzó en la instalación válida a **1701,8000 s** y terminó a **1752,9333 s**. Consumió **51,1333 s** de simulación y **672,4131 J** de la fuente: 10 J de conversión, 95,5889 J de recarga, 38,1689 J de enfriamiento y 528,6553 J contabilizados como transporte. Durante ese intervalo siguieron trabajando el brazo y la línea; este total mide toda esa intervención en el mundo activo, no un coste de previsualización ni una fase autónoma. Las tres baterías tenían 900 J antes y después. No se añadieron recursos al recalibrar.

Después de cargar ese mismo estado con la corrección de arranque, el primer relevo autónomo duró **91,0667 s**, hasta el tiempo absoluto **1844,0000 s**: un dron retiró el cubo 324 del enfriador y el de mesa tomó, entregó y regresó con el 440. Los otros esperaron apoyados. La reserva pasó de 155170,7789 a **154782,2015 J**, con el brazo y la producción concurrentes. Guardar y cargar el resultado conservó los tres seguidores en tierra, el brazo y las 34 articulaciones del mundo, sin advertencias. Es evidencia de lógica y cuerpos Cannon a 60 Hz; no certifica por sí sola los ochenta productos ni la experiencia visual en navegador.

Tras nueve rotores, la validación conservadora del giro de la hélice detuvo una subida junto al tablero. La recuperación partió del mundo guardado a **3314,4000 s**, con los nueve productos y sus cargas presentes. La mano trasladó únicamente el dron vacío y sus dos balizas a las referencias actuales; el fantasma volvió a enseñar la toma y la entrega centrales sobre la muestra existente. Terminó a **3323,6000 s**: **9,2000 s** y **17,2584 J** de la fuente, sin añadir material ni carga. El mismo cable de 10 m quedó conectado con un trazado de 8,3743 m. Los tres regresos físicos siguientes terminaron a **3549,6000 s**, con **10 rotores**, 24 entregas QR acreditadas y 137458,1856 J en la fuente. El yaw observado del dron pasó de 7,7015° a 9,7107° durante esos viajes. El guardado final conservó el avance y volvió a cargar sin advertencias. Esta medida certifica esos recorridos y orientaciones observados; no sustituye una validación geométrica de todas las orientaciones posibles.

La [corrección posterior del detector de hélices](mediciones/galpon-b-20261126/propeller-clearance/README.md) comprueba el sólido real contra el mismo cilindro de giro. Conserva radio, espesor y fuerzas; elimina los falsos positivos de las cajas envolventes de mesas o paredes alejadas y mantiene las obstrucciones físicas verdaderas, incluidos los cuerpos de las familias.

El ensayo que aún ejecutaba el detector anterior se detuvo después de **17 rotores**, a **4691,0667 s**. Se conservaron el dron caído y la carga 569. La recuperación soltó ésta con su pinza y la llevó por mano a la primera cinta; el dron vacío se enderezó con los controles de caras, volvió a su origen por mano, se recargó desde la baliza cableada y confirmó sus poses sobre el cubo 576 existente. Esta intervención terminó a **4708,2667 s**, tras **17,2000 s** y **573,1136 J** de la fuente. El total incluye el trabajo concurrente del brazo y la línea. La carga 569 recorrió después los ocho tramos y recuperó su historial automático mediante los contactos normales.

La reproducción de ese estado encontró además un choque físico distinto: la pieza **262 del brazo** entraba en el disco de la hélice del QR295 mientras éste regresaba por la mesa y el brazo hacía otra entrega. La coordinación local descrita arriba eliminó esa carrera. Desde el estado de recuperación, la primera recogida, entrega y vuelta sanas terminaron a **4753,2000 s**. El brazo estuvo frenado durante **43,3833 s** y empezó el siguiente ciclo después del aterrizaje. Ese tramo consumió **44,9333 s** y **84,4171 J** de la fuente; la batería del dron pasó de 900 a **836,6831 J** y todavía debía recargarse. El mismo guardado volvió a cargar sin advertencias, con el brazo, los tres seguidores y los 17 recibos. Los [datos de recuperación y diagnóstico](mediciones/galpon-b-20261126/logistics-recovery-17.json) separan la intervención manual de este ciclo automático.

La [verificación focal de logística](mediciones/galpon-b-20261126/logistics-coordination-focus.tap) aprobó **49 pruebas**. Incluye tres seguidores que comparten el frío, espera del brazo durante el regreso QR, independencia de otro puesto, guardado con ambos programas y frenado pasivo. Dos obstáculos físicos introducidos como fixtures durante carga y regreso comprobaron el corte único de continuidad, sin avanzar el reloj ni gastar energía adicional en ese evento. Esas pruebas de aislamiento se distinguen del linaje nativo anterior.

### Montaje limpio desde la fábrica preparada

Una invocación nueva del helper continuó desde el guardado nativo **08 · Pedido abierto**, sin recuperar capital de los intentos fallidos de instalación. Construyó los dos drones restantes, sus adaptaciones y cables con stock producido, retiró por vuelo las dos cargas secundarias y enseñó las rutas centrales mediante el fantasma. La flota quedó configurada a **1539,2667 s**, con **156889,5292 J** y un rotor ya recibido por el transporte de las cargas iniciales. A **1658,2667 s** había **dos rotores**, **60 s de actividad útil** y **155231,6194 J**. El estado de entrada estaba a **1074,4667 s** y **160891,1326 J**; estos saldos incluyen todo el montaje y el trabajo concurrente.

Se conservan el [resultado, comando y hashes](mediciones/galpon-b-20261126/logistics-clean-install.json), el [guardado de entrada](mediciones/galpon-b-20261126/native-install/08-pedido-abierto.json), la [flota configurada](mediciones/galpon-b-20261126/native-install/08-flota-configurada.json) y el [guardado con dos recibos](mediciones/galpon-b-20261126/native-install/11-pedido-parcial-2.json). Esta prueba acotada de montaje es independiente de la recuperación del linaje largo. Se ejecutó antes de la corrección posterior del giro acumulado; las pruebas de ese cambio se identifican debajo. No se volvió a ejecutar la instalación para sustituir su gasto o sus resultados.

```sh
node tests/benchmark-galpon-chain.cjs --checkpoint=docs/mediciones/galpon-b-20261126/native-install/08-pedido-abierto.json --until=complete --target=2 --output=/tmp/qbits-clean-install
```

### Recuperación del punto de herramienta tras sesenta productos

Después de sesenta recepciones, el linaje largo quedó esperando con el cubo **902** sobre la mesa. El chasis había acumulado **66,9171°** de giro horizontal; seguir la antigua coordenada de su centro desplazaba la cara de la pinza **13,137 mm en X y 19,883 mm en Z**. El centro de masa serializado coincidía exactamente con el restaurado. El [diagnóstico geométrico](mediciones/galpon-b-20261126/yaw/README.md) separa ese desplazamiento de la orientación del cuadrado de contacto: conservar el punto de cara enseñado y el giro real permite detectar esa carga en las 360 orientaciones virtuales examinadas, sin ensanchar la cara ni añadir rayos. El resultado de ese barrido corresponde a esa pinza inferior y esa carga.

La recuperación continuó el **guardado fallido íntegro**, a **13513,2000 s** y **43798,0227 J**; conservó también el gasto de la espera anterior de 1200 s. No hubo mano, nueva enseñanza ni modificación de poses, carga, materia o energía. Con el objetivo de traslación corregido, el dron tomó realmente 902, la soltó sobre el segundo frío y volvió apoyado a **13559,4667 s**, tras **46,2667 s** y **86,8696 J** de la fuente. Su batería había consumido **64,6870 J** y se recargó desde el borne existente durante los cuatro segundos siguientes, mientras el brazo retomaba su trabajo.

El guardado preparado para continuar quedó a **13563,4667 s**, con **43515,8995 J**, los **60 productos**, tres seguidores y el brazo. El dron de mesa volvió a tener **900 J** en su batería y el dron de Entrada B ya iniciaba el siguiente traslado. El saldo total desde el fallo fue **50,2667 s y 282,1231 J**, incluyendo recarga y motores concurrentes. El mismo guardado cargó sin advertencias. Los [datos y hashes de recuperación](mediciones/galpon-b-20261126/logistics-yaw-recovery-60.json) conservan los tres saldos y sus partidas de gasto.

La [verificación focal del objetivo de herramienta](mediciones/galpon-b-20261126/logistics-yaw-focus.tap) aprobó **48/48 pruebas** de QR, coordinación, energía y vuelo. Incluye la reproducción del fallo de toma a 66,917°, toma y entrega físicas con guardado durante la carga, regreso, rechazo del agarre frontal incompatible y un obstáculo dentro del volumen corregido del dron. Los cuerpos girados y obstáculos de estas regresiones son fixtures declaradas; la recuperación de 902 descrita arriba no los usa.

### Cierre del linaje nativo: ochenta productos y una recepción posterior

El linaje iniciado con **cuatro trabajadores**, las ocho cintas de A y la reserva original completó el pedido mediante producción, brazo, los tres drones, enfriamiento, alimentadores, corte y ensamblado físicos. El [guardado de ochenta productos](mediciones/galpon-cadena-20261126/partida/batch_80.json) conserva **80 identidades de producto recibidas**, el pedido cumplido y **60 s de actividad útil**. El tiempo de partida y el saldo incluyen la construcción, los procesos, las esperas y todas las recuperaciones descritas arriba.

| Estado guardado | Tiempo simulado acumulado | Recibos físicos | Saldo de la fuente |
| --- | ---: | ---: | ---: |
| Pedido completado | 17029,0000 s — 4 h 43 min 49 s | 80 | 7892,1397 J |
| Mismo mundo después de la victoria | 17210,0000 s — 4 h 46 min 50 s | 81 | 6048,5016 J |

La instalación continuó después de cumplir el pedido. En los **181 s** siguientes produjo y recibió un rotor adicional, con un débito real de **1843,6381 J** de la fuente. El [guardado posterior a la victoria](mediciones/galpon-cadena-20261126/partida/post_victory_81.json) conserva los tres seguidores, el brazo, la condición de victoria y la actividad útil cumplida; registra **81 productos**. La vista del pedido permanece en **80/80**. Los registros de materia pasan de **598 y 580 u** a **600 y 582 u**, incluidos los nuevos insumos producidos y pagados durante ese intervalo. El [manifiesto y balance del linaje](mediciones/galpon-cadena-20261126/README.md) conservan los guardados, sus hashes y el gasto por tramo.

Este resultado mantiene las identidades, materia y cuenta energética del mismo mundo a través de los guardados y reparaciones documentados. No se presenta como una única ejecución ininterrumpida de la versión final. La configuración de referencia utiliza drones entre el segundo frío y ambas entradas; el alcance limitado de la alternativa de brazo hacia B se mantiene como se describe en la sección 3. La prueba larga ejecuta Cannon a **60 Hz con DOM y GPU instrumentados**; las comprobaciones visuales en Chromium se documentan por separado.

La [suite global de cierre](mediciones/galpon-b-20261126/global-final/README.md) aprobó **1868/1868 pruebas** de **216 archivos**, sin fallos, cancelaciones u omisiones. Los **349 hashes** de código y archivos de prueba coincidieron antes y después del pase. Incluye el objetivo de herramienta con giro acumulado, guardado durante la carga, coordinación de puestos, energía, obstáculos y reutilización de la ensambladora y de los rotores fabricados.

## Decisiones vigentes

- La fuente comparte la cuenta energética de A. La capacidad de las baterías, su carga y la potencia instantánea se comprueban por separado; ni fabricar ni restaurar una batería añade energía.
- La referencia utiliza el brazo existente y drones con pinza independiente. El diseño libre conserva las comprobaciones de carga, espacio, alcance y autonomía de los mecanismos normales.
- Un puesto compartido permanece reservado hasta el aterrizaje del dron o el retorno inicial del brazo que lo utiliza. La espera usa apoyo o frenos reales. Los puestos distintos pueden funcionar en paralelo.
- El pedido cuenta recepciones físicas nuevas. Sus ochenta productos y la ventana de actividad útil se verifican por separado, y una interrupción no devuelve recursos ni borra productos recibidos.
- Las mediciones de lógica, Cannon y Chromium se mantienen separadas. Los tiempos de los subpasos y el render del entorno de prueba no se presentan como FPS del equipo del jugador.
