# Q-bits · Manual del banco de pruebas

Disponible dentro del juego en **P → Manual** y desde **Guía paso a paso** en los controles del brazo.

Empieza con una máquina y un cubo. P muestra los ajustes mientras la simulación sigue en marcha. Los controles indicados son los predeterminados; si los cambiaste, revisa Configuración → Teclado.

**Clic secundario:** las listas de órdenes y de separación mantienen el mundo en marcha, con vuelo, movimiento y consumo de energía. El cursor queda libre para elegir una orden; abrir o cancelar «Separar…» conserva la actividad del montaje. **Esc** cierra primero la lista; otro **Esc** abre la pausa del juego. Perder el foco o cambiar de pestaña sigue pausando.

Para alimentar máquinas separadas desde un depósito grande, consulta [Cables y depósito de energía](CABLES_ENERGIA_QBITS.md): creación con Q → Equipo, tendido, extensión, inspección y recuperación del material.

## Colocar y conectar desde el banco rápido

1. Abre el catálogo con **Q** y elige un elemento. Aparece una vista previa sin físicas; todavía no se crea material.
2. Apunta al suelo o a una superficie horizontal cercana. **Azul** permite colocar; **rojo** indica espacio ocupado. El plano se mueve libremente y la rueda gira por caras en pasos de 90°. Mantén **Shift** para alinearlo a la cuadrícula de 9 cm del piso. **Shift + rueda** gira de forma continua en 360°. Al soltar Shift se conserva el ángulo y la posición vuelve a ser libre.
3. **Clic** confirma exactamente esa posición. **Esc o clic derecho** cancelan. Si no cabe, mueve la vista previa: el juego no buscará otro sitio por su cuenta.
4. Para prolongar una cinta, apunta cerca de su **flecha de salida y mantén Shift**. La vista previa alinea su entrada; confirma con clic manteniendo Shift. Las bases se unen físicamente y cada rodillo conserva su eje. Funciona con tramos rectos y ambas esquinas, sobre cintas niveladas.

Las repisas siguen colocándose en paredes. Depósitos, enfriadores y cuerpos sólidos van en el suelo. **Mesa de trabajo** prepara una vista previa para colocarla o reubicarla. Clic derecho sobre una pieza de la mesa abre sus opciones. **E** abre el taller. Para retirarla, haz clic derecho sobre una zona libre de la mesa y elige **Retirar mesa**. Los cables primero colocan sus cubos y después abren el tendido. **N, B y los botones Crear** usan también la colocación previa. Los planos de construcción siguen necesitando material existente.

### Construir sobre las caras de un montaje

1. Pulsa **N** para preparar un Q-bit y mantén **Ctrl** mientras apuntas a una cara cuadrada. El cubo azul semitransparente muestra dónde quedará soldado, incluso en una cara lateral o inferior de un montaje girado.
2. Haz **clic izquierdo** para trazar un cubo. Mantén el botón y mueve la mira para trazar una fila sobre ese plano. Suelta el botón y apunta a una cara de los propios cubos azules para añadir otra capa. Puedes soltar Ctrl entre pasadas.
3. Haz **clic derecho** para rellenar las posiciones azules. Los cubos se unen al montaje en una sola operación. **Esc** descarta el trazado. Si otra pieza ocupa el espacio antes de confirmar, aparta el obstáculo y reintenta.

Cada trazado pertenece a un montaje. Solo se puede usar donde esté habilitada la creación de cubos y cuenta para el límite de población de la sala.

**Manipulación:** rueda hacia abajo acerca y hacia arriba aleja. En **Configuración → Juego**, «Invertir rueda al acercar y alejar objetos» e «Invertir giro de las piezas» se guardan por separado. El segundo ajuste afecta tanto Shift + WASD como el giro de la vista previa. La velocidad de movimiento mantiene su ajuste independiente.

Las estructuras se sujetan desde su centro para evitar giros provocados por tirar de un extremo. Su masa sigue siendo la suma de sus piezas; soltar elimina el giro residual de la mano. Las estructuras rígidas libres amortiguan más el giro y rebotan menos que los cubos sueltos. Los motores conservan su amortiguación calibrada, límites de carga y consumo.

Los brazos articulados pueden tomarse también desde la pinza o cualquiera de sus tramos. **Shift + WASD** orienta el montaje completo y mantiene sus ejes unidos, por ejemplo para acceder a la cara inferior al instalar hélices. El giro necesita espacio alrededor: si toca una superficie, aparta el montaje y continúa. Las pequeñas penetraciones contra techo o paredes permiten retirar el objeto hacia el interior de la sala.

## Agrupar en familias

Selecciona varias piezas y abre **clic secundario → Agrupar en familia…**. Escribe un nombre y elige un color, incluido negro. Cada familia guarda hasta **100 piezas base**, muestra **×N** y puede contener módulos completos: un rotor de dos enganches sigue contando como dos piezas. La animación reúne el material en el contenedor.

Para llevar una familia en el banco, **mantén clic izquierdo** sobre ella y **suelta el botón** para dejarla, como un cubo normal. **Rueda** acerca o aleja la mano, **Shift + WASD** gira y **Ctrl** muestra su proyección de caída. **Clic secundario → Tomar familia** la mantiene sostenida hasta el siguiente clic. En campaña se usa el mismo control de las piezas normales: clic para tomar y otro clic para soltar. El nombre, la cantidad y la acción actual aparecen en el indicador inferior.

Desde su menú secundario puedes **Nombrar familia y elegir color…**, retirar un elemento, **Retirar hasta 10 elementos**, **Desagrupar familia** o unirla con otra compatible. **Hasta 10 elementos** puede incluir módulos de varias piezas; **Dividir en familias de hasta 10** reparte por cantidad de piezas base.

Para usar una vista previa, elige **Colocar familia · guía azul** o una opción de retirada. Apunta la guía al suelo: **azul** permite colocar y **rojo** indica un obstáculo. **Rueda** gira, **Shift** alinea a la cuadrícula, **clic/E/Enter** confirma y **Escape o clic secundario** cancela conservando el inventario. **Shift + varias sacudidas**, al sostener la familia o usar su guía de colocación, suelta el contenedor y divide en lotes de hasta diez piezas cuando los módulos caben; no corta módulos indivisibles para completar un lote. La capacidad manual sigue contando todo el peso.

La familia usa un cuerpo físico y una forma de colisión. Mientras la llevas, se añade solo el anclaje temporal de la mano y su unión física; el contenido permanece guardado como datos, sin activar sus piezas individuales.

El banco guarda familias, contenido, nombres, colores y posiciones. La campaña guarda el punto de control del nivel, no la escena física en curso. La [guía de familias](FAMILIAS_QBITS.md) detalla conservación, baterías, módulos y recuperación ante falta de espacio.

## Elegir cómo desarmar

**Alt → Desarmar en familias** recupera el montaje en contenedores por tipo. La selección y el menú secundario ofrecen también **Desarmar y agrupar por tipo**. Para dejar los componentes separados, elige **Desarmar en piezas sueltas**.

En **Configuración → Juego → Desarme de conjuntos**, elige una opción y pulsa **Guardar**:

- **Inmediato:** mantiene el desarme actual. Al agitar, conservas en la mano la pieza tomada.
- **Por etapas · banco de pruebas:** suelta y detiene el montaje; sus piezas salen de arriba hacia abajo hacia huecos libres del suelo. No necesitas volver a agitar. Si aparece «libera espacio», mueve los obstáculos: el proceso seguirá solo.

Activa el desarme en piezas sueltas tomando una estructura y haciendo **Shift + varias sacudidas**, o con **Alt → Desarmar en piezas sueltas** sobre el cuerpo seleccionado. Pausar detiene el proceso; salir a otro nivel y volver al banco conserva las piezas pendientes. El contador las muestra como «en desarme». Para repetir la comparación, vuelve a armar o crear el mismo montaje. La campaña y los puzles mantienen el desarme inmediato. Con muchos cubos separados el coste físico final sigue existiendo.

La selección se muestra **abajo a la derecha**, frente al contador de población de la izquierda. Conserva los controles de selección y las páginas cuando hay muchas estructuras.

## 1 · Mi primera entrega con el brazo

El brazo repite dos posturas que tú guardas: A para tomar y B para soltar. Unirlo a una cinta no le enseña esas posiciones.

1. Crea el brazo. En la sala, abre Q → Máquinas, elige Brazo Q-bits y confirma con clic. Aparece completo y detenido, con A preparada para un cubo en el suelo y B a un cuarto de vuelta.
2. Déjalo en el suelo, con espacio alrededor. Para aprender, usa el brazo recién creado y separado de otras máquinas. Su base se fija durante el movimiento; no necesitas unirla a una cinta. Su energía interna permite la primera prueba.
3. Prepara un cubo normal. Elígelo desde Q → Piezas, confirma con clic. Acércalo debajo de la cara naranja del extremo del brazo. Apóyalo en el suelo y suéltalo sin Shift, para que quede separado. C permite agacharte.
4. Abre el brazo. Clic derecho sobre una pieza del brazo → Configurar agarre y secuencia. En «Qué puede tomar», elige Cualquier sólido y pulsa Aplicar filtro, carga y alcance.
5. Comprueba el contacto. Pulsa Comprobar toma. Centra la cara naranja sobre el cubo. Puedes ajustar el alcance de toma entre 1,8 y 5 cm. Si indica distancia, alineación o filtro, corrige eso y vuelve a comprobar.
6. Haz una entrega. Desmarca Repetir la secuencia y pulsa Iniciar secuencia. El brazo toma el cubo, gira a B y lo suelta. Con un brazo nuevo no hace falta enseñar A y B otra vez.
7. Comprueba el resultado. Abre P → Mecanismos. Debe mostrar «Ciclo completado» y una entrega. Sin Repetir queda en B. Usa Ir a A · sin tomar para volver; para varias entregas, activa Repetir antes de iniciar.

Si algo se atasca, abre el panel y pulsa Detener. Se libera el objeto y se frenan los ejes. Retira el obstáculo o corrige la causa antes de reiniciar.

## 2 · Llevar objetos desde una cinta

1. Detén ambas máquinas. Puedes apoyar el brazo en el suelo o en una estructura estable junto a la cinta. También puedes unir su base a una cara fija del chasis con Shift; deja libres la banda, los rodillos y las articulaciones.
2. Coloca un cubo sobre la banda detenida. El cubo debe quedar suelto, nunca unido al brazo o a la cinta.
3. Enseña A a esa altura. En P → Mecanismos → Brazo Q-bits, pulsa Marcar A · tomar y apunta a la cara superior del objeto. Ajusta la altura con la rueda y haz clic cuando el blueprint esté azul.
4. Enseña B. Pulsa Marcar B · soltar y apunta a la superficie de entrega. Ajusta la altura según el tamaño de la carga y haz clic cuando la vista previa esté azul.
5. Prueba el recorrido vacío. Usa Ir a A e Ir a B. Estos botones mueven los motores, no guardan posiciones ni toman objetos. Si el brazo choca, cambia A/B o la ubicación de las máquinas.
6. Prueba un cubo con la cinta detenida. Desmarca Repetir e inicia el brazo. Una vez lograda la entrega, activa Repetir e inicia también la cinta desde sus propios controles.

Unión y programación son cosas distintas. Un brazo puede estar bien unido y tener el agarre fuera de la trayectoria. La cara naranja debe pasar por encima de la carga. Si la cinta va demasiado rápido para tomarla, baja sus rpm o detén la cinta durante la prueba.

El brazo mide como carga el objeto que sostiene. El menor límite entre pinza y ejes determina el máximo configurado. Una unidad equivale al peso de un Q-bit estándar. El peso de los eslabones y del objeto exige torque durante el movimiento, y el brazo y la cinta pueden compartir batería.

## 3 · Cintas y baterías

1. Crea una cinta desde Q → Máquinas. Déjala nivelada y apoyada. También puedes construirla con un plano en P → Mecanismos, acercando las piezas solicitadas e integrándolas con clic derecho.
2. Crea una Batería I, II o III desde el catálogo rápido. Estas copias de prueba aparecen cargadas y apagadas.
3. Toma la batería, acércala a una cara libre del chasis y suelta con Shift para unirla. Clic derecho sobre la batería → Activar batería. Estar cerca no basta para transmitir energía.
4. Clic derecho sobre la cinta → «Configurar cinta y extender…». Pulsa Iniciar marcha de la línea para arrancar los tramos unidos al mismo chasis. Clic derecho en un tramo permite detenerlo o invertir solo ese tramo.
5. Deja un cubo suelto sobre la banda y mantén libre la salida. Si la batería se agota, apágala y apóyala en el suelo para recargar.

En el taller también puedes fabricar baterías con uno, dos o tres cubos normales unidos en línea sobre la mesa. Las baterías fabricadas conservan los julios de esas piezas; no aparecen llenas por fabricarlas.

## 4 · Tomar, unir, separar y mover

- Crear: abre Q, elige una categoría y un objeto y confirma con clic. Esc cancela la creación pendiente.
- Tomar: en el banco, un clic breve deja la pieza seleccionada. Mantén el clic sobre ella para moverla, aunque ya esté seleccionada; suelta el botón para dejarla. También puedes mantener desde el primer clic. Si tomas un miembro de una selección múltiple, se mueve el equipo completo. Clic en un espacio vacío o G deselecciona. La rueda acerca o aleja; C te agacha.
- Unir: sostén la pieza, acerca caras compatibles y suelta con Shift cuando veas el encaje. Shift + WASD gira la pieza sostenida.
- **Editar una parte del montaje.** Haz clic en el conjunto y suelta el botón. Mantén Ctrl y pasa la mira por las piezas que quieres marcar en azul. Puedes soltar Ctrl para cambiar el ángulo y seguir marcando después. Clic derecho abre **Separar piezas marcadas**, **Eliminar piezas marcadas** y **Limpiar marcas**. Al separar, las piezas contiguas conservan sus uniones y solo la parte extraída queda seleccionada. Si está al alcance de la mano y dentro del límite de carga, queda en tu mano hasta el siguiente clic. Si marcaste islas sueltas, puedes retirarlas juntas. Ctrl + clic sobre un rotor sigue eligiendo ese rotor.
- Separar: Alt apuntando a una pieza abre las opciones. Shift + varias sacudidas desarma una estructura sostenida. Se conservan sus piezas.
- Dar un destino: selecciona el equipo; clic derecho en el suelo → Ir a este punto. R detiene esa orden. Un objeto con una ruta activa no queda disponible para la pinza hasta detenerlo.

## 5 · Rotores, taller y sensor

Rotor: dos enganches unidos forman un eje. Fija una mitad al soporte y la otra a la pieza que girará. En P → Mecanismos revisa rpm, sentido, torque y capacidad. En un brazo, usa los controles del brazo para mover sus ejes.

Qué significa cada ajuste: rpm controla velocidad; torque limita fuerza de giro; capacidad limita la carga. En un brazo se aplica al objeto sostenido. Los rotores ordinarios cuentan el peso de la red conectada.

Taller: deja la pieza sobre la mesa, suéltala, apunta a la mesa y pulsa E. Lee el efecto y el coste de la mejora antes de aplicarla. La investigación disponible se conserva en el navegador.

**Sensor configurable.** Elige un sensor en Banco rápido o adáptalo en el taller. Clic derecho → Configurar sensor. Selecciona contacto, movimiento, láser o peso, elige el mecanismo y la acción. El alcance del láser y del movimiento se ajusta entre 25 cm y 2 m. Mantén Alt para ver el haz. El enlace admite hasta 3 m. Para que una pieza en movimiento arranque un móvil, selecciona Movimiento cercano, el conjunto o el mecanismo del móvil e Iniciar. Para controlar un eje individual, elige Rotor.

## Servos · primera extremidad

1. Abre **Q → Máquinas** y elige **Servo pivote** o **Servo bisagra**. Confirma la vista previa con clic.
2. Clic derecho en la articulación → **Configurar servo**, o selecciónala y abre **P → Mecanismos**.
3. Empieza con **−20° a 20°**, **30 °/s** e **Ida y vuelta**. Pulsa Iniciar para ver el movimiento. Detener y bloquear conserva el ángulo alcanzado.
4. Para una sola postura, elige Mantener posición o Mover una vez y una posición objetivo dentro del recorrido. Ambos llegan y quedan bloqueados mecánicamente. El rango total disponible es **−90° a 90°**, con velocidad entre **5 y 180 °/s**.

**Construcción manual:** clic derecho sobre una pirámide de base cuadrada → Preparar Servo pivote; suelda su base al cuerpo con Shift y conecta la cara inferior de un cubo a su ápice con Shift. Para una bisagra, prepara una pirámide como Servo bisagra y enfrenta su punta a la de otra pirámide con Shift; sus bases reciben los tramos rígidos. Las puntas permanecen unidas al doblarse.

La energía interna permite probarlo; una batería externa activa, conectada al conjunto, comparte su reserva. Comprueba energía, peso y espacio si se bloquea. Para mover todas las patas, conecta sus servos al mismo cuerpo y abre **Marcha del conjunto**. Elige el inicio mínimo/máximo de cada articulación y pulsa **Iniciar marcha del conjunto**; cierra P. Se preparan y repiten con un ritmo común. **Detener conjunto** bloquea todas juntas. Un fallo de energía, separación o bloqueo persistente detiene el conjunto. El equilibrio depende del montaje y de sus recorridos. Consulta [Servos Q-bits](SERVOS_QBITS.md) para el montaje y los controles completos.

## 6 · Planos, guardado y repisas

Catálogo rápido (Q → Máquinas): crea copias completas para experimentar en el banco. Respeta el límite de piezas de la sala.

Blueprint o plano: es una guía de construcción. Acerca los tipos de piezas que pide; clic derecho → Integrar cercanos. Solo funciona al completarlo.

Guardar: detén el mecanismo y suelta su carga. En Formas guardadas se distinguen Formas y Mecanismos. Un brazo guardado conserva sus conexiones, filtros y posturas. Exporta tus plantillas para tener una copia.

Repisa: almacena el objeto real. Al recuperarlo, los controles quedan detenidos. Revisa el espacio y la posición del objeto antes de reiniciar una secuencia.

## 7 · Si algo no funciona

- No se mueve: lee el estado del mecanismo y comprueba la energía, el límite de carga y el espacio para moverse.
- Espera sin tomar: usa Comprobar toma; revisa que el cubo esté suelto, centrado bajo la cara naranja y dentro del alcance configurado. Detén sus rutas y suéltalo de tu mano.
- Toma otro objeto: selecciona una pieza específica o un filtro de tipo/color y pulsa Aplicar filtro, carga y alcance.
- Choca durante el giro: Detener, despejar el recorrido, ajustar A/B y probar el movimiento vacío.
- No vuelve a A: una sola entrega termina en B. Usa Ir a A o activa Repetir para el siguiente ciclo.
- La unión dejó todo sin funcionar: comprueba si el montaje estorba el recorrido o si otro rotor alcanzó su límite de carga conectada.

## Hélices · primer dron

1. En **Q → Máquinas**, elige **Dron de prueba**. Confirma con clic. Aparece una hélice con batería I cargada y apagada.
2. Haz clic derecho en la batería y enciéndela. Después haz clic derecho en el enganche y abre **Vuelo**.
3. Deja **altura 0,5 m** y **velocidad 0**. Pulsa **Despegar** y observa la altura en directo desde P.
4. Para desplazarte, mira hacia el destino, abre Vuelo, pulsa **Avanzar hacia donde miro**, elige velocidad **0,3 m/s** y aplica. Velocidad 0 frena y mantiene posición.
5. Usa **Aterrizar** antes de agotar la batería. El descenso necesita energía. **Apagar motores** corta la sustentación y el conjunto cae si está en el aire. Una vez apoyado, apaga la batería para recargar.

**Trayectoria.** Haz clic derecho en el enganche y elige **Crear trayectoria**. Sus puntos se miden desde el despegue, en los ejes de la sala. Elige la altura y la acción, y haz clic en el plano o introduce X y Z. Puedes pasar, esperar en vuelo o aterrizar y esperar antes del siguiente despegue. **Una vez** termina en tierra. **En bucle** vuelve al primer punto hasta pulsar **Aterrizar** o agotar la batería. Los drones visibles se pueden seleccionar en vuelo. En **P → Mecanismos → Drones de la sala** puedes recuperar el control incluso si pierdes el dron de vista.

**Montaje manual.** Necesitas **1 enganche + 2 T-bits triangulares**. Sostén un triangular, mantén Shift y acerca su punta a la punta superior del enganche. El encaje orienta la pala: suelta cuando aparezca «Pala alineada». Repite en el lado libre con el segundo triangular. No se consumen créditos adicionales. El plano de Hélice usa tus piezas existentes; Banco rápido crea copias de prueba.

Une las caras cuadradas del enganche al chasis o a la batería. Las dos palas deben quedar arriba y libres. Deja al menos unos **27 cm entre ejes** para estas palas; un obstáculo dentro del disco de giro detiene el motor. No montes las palas sobre un enganche que ya forme parte de un rotor articulado.

Puedes conectar **1, 2, 3 o 4 hélices** al mismo conjunto. Una quinta impide el despegue hasta retirarla. Las baterías I, II y III comparten energía y potencia a través de las uniones físicas. Todo el peso cuenta: enganches, palas, chasis, baterías, sensores, manos, brazos y carga sostenida. Más hélices aumentan el empuje disponible, pero pesan y consumen; más batería también pesa. La altura y el esfuerzo reducen el margen de carga y autonomía. Los valores de carga máxima, watts y autonomía son estimaciones actuales, no garantías para cualquier construcción.

Los triangulares obtenidos al dividir un Q-bit estándar pesan 1/12 u cada uno. Las piezas creadas directamente desde Q usan el peso seleccionado en P → Piezas. Por eso dos hélices geométricamente iguales pueden levantar cargas distintas. La hélice rápida usa triangulares de 1/12 u.

**Sensor.** Cada cubo sensor estándar aporta 1 u. Adaptar un cubo que ya está en el chasis conserva su peso. El umbral de detección de peso solo determina cuándo se activa. Coloca el sensor bajo el plano de las palas. Une un sensor al chasis y elige «Dron acoplado» en el panel. Puede despegar, apagar los motores o invertir el avance cuando se cumple la condición elegida.

**Mano y brazo.** El cubo de agarre conserva su menú, filtros, límite de carga y consumo. Su objeto sostenido se suma al peso del dron. Los rotores y brazos pueden formar parte del montaje, pero necesitan energía suficiente y un montaje libre: una base fija o una cinta anclada impide despegar. No todos los conjuntos pesados podrán volar con cuatro hélices.

**Guardar y desarmar.** Guardar mecanismo, el banco y las repisas conservan geometría y ajustes. El banco y las repisas conservan las identidades y la energía real; una copia de plantilla aparece con baterías vacías. Los motores no se reanudan al recuperar. Aterriza y detén las hélices antes de guardar en la repisa. Separar una pala o sacudir desarma con las mismas reglas de materia y energía que las otras piezas.
