# Q-bits · Manual del banco de pruebas

Disponible dentro del juego en **P → Manual** y desde **Guía paso a paso** en los controles del brazo.

Empieza con una máquina y un cubo. P abre este panel y pausa la simulación. «Volver a la sala» la reanuda. Los controles indicados son los predeterminados; si los cambiaste, revisa Configuración → Teclado.

Para alimentar máquinas separadas desde un depósito grande, consulta [Cables y depósito de energía](CABLES_ENERGIA_QBITS.md): creación con Q → Banco rápido, tendido, extensión, inspección y recuperación del material.

## Colocar y conectar desde el banco rápido

1. Mantén **Q → Tab → Banco rápido**, elige un elemento y suelta Q. Aparece una vista previa sin físicas; todavía no se crea material.
2. Apunta al suelo o a una superficie horizontal cercana. **Azul** permite colocar; **rojo** indica espacio ocupado. La rueda gira el objeto en pasos de 90°.
3. **Clic** confirma exactamente esa posición. **Esc o clic derecho** cancelan. Si no cabe, mueve la vista previa: el juego no buscará otro sitio por su cuenta.
4. Para prolongar una cinta, apunta cerca de su **flecha de salida y mantén Shift**. La vista previa alinea su entrada; confirma con clic manteniendo Shift. Las bases se unen físicamente y cada rodillo conserva su eje. Funciona con tramos rectos y ambas esquinas, sobre cintas niveladas.

Las repisas siguen colocándose en paredes. Depósitos, enfriadores y cuerpos sólidos van en el suelo. La tarjeta Mesa de trabajo abre el taller existente. Los cables primero colocan sus cubos y después abren el tendido. **N, B y los botones Crear** usan también la colocación previa. Los planos de construcción siguen necesitando material existente.

**Manipulación:** rueda hacia abajo acerca y hacia arriba aleja. En **Configuración → Juego**, «Invertir rueda al acercar y alejar objetos» e «Invertir giro de las piezas» se guardan por separado. El segundo ajuste afecta tanto Shift + WASD como el giro de la vista previa. La velocidad de movimiento mantiene su ajuste independiente.

Las estructuras se sujetan desde su centro para evitar giros provocados por tirar de un extremo. Su masa sigue siendo la suma de sus piezas; soltar elimina el giro residual de la mano. Las estructuras rígidas libres amortiguan más el giro y rebotan menos que los cubos sueltos. Los motores conservan su amortiguación calibrada, límites de carga y consumo.

## Elegir cómo desarmar

En **Configuración → Juego → Desarme de conjuntos**, elige una opción y pulsa **Guardar**:

- **Inmediato:** mantiene el desarme actual. Al agitar, conservas en la mano la pieza tomada.
- **Por etapas · banco de pruebas:** suelta y detiene el montaje; sus piezas salen de arriba hacia abajo hacia huecos libres del suelo. No necesitas volver a agitar. Si aparece «libera espacio», mueve los obstáculos: el proceso seguirá solo.

Activa el desarme tomando una estructura y haciendo **Shift + varias sacudidas**, o con **Alt → Desarmar todo** sobre el cuerpo seleccionado. Pausar detiene el proceso; salir a otro nivel y volver al banco conserva las piezas pendientes. El contador las muestra como «en desarme». Para repetir la comparación, vuelve a armar o crear el mismo montaje. La campaña y los puzles mantienen el desarme inmediato. Con muchos cubos separados el coste físico final sigue existiendo.

La selección se muestra **abajo a la derecha**, frente al contador de población de la izquierda. Conserva los controles de selección y las páginas cuando hay muchas estructuras.

## 1 · Mi primera entrega con el brazo

El brazo repite dos posturas que tú guardas: A para tomar y B para soltar. Unirlo a una cinta no le enseña esas posiciones.

1. Crea el brazo. En la sala, mantén Q, pulsa Tab para entrar al catálogo rápido, elige Brazo Q-bits, suelta Q y haz clic. Aparece completo y detenido, con A preparada para un cubo en el suelo y B a un cuarto de vuelta.
2. Déjalo en el suelo, con espacio alrededor. Para aprender, usa el brazo recién creado y separado de otras máquinas. Su base se fija durante el movimiento; no necesitas unirla a una cinta. Su energía interna permite la primera prueba.
3. Prepara un cubo normal. Elígelo desde Q → Piezas, suelta Q y haz clic. Acércalo debajo de la cara naranja del extremo del brazo. Apóyalo en el suelo y suéltalo sin Shift, para que quede separado. C permite agacharte.
4. Abre el brazo. Clic derecho sobre una pieza del brazo → Configurar agarre y secuencia. En «Qué puede tomar», elige Cualquier sólido y pulsa Aplicar filtro y carga.
5. Comprueba el contacto. Pulsa Comprobar toma. La cara naranja debe quedar centrada y casi tocar la parte superior del cubo: máximo 1,8 cm. Si indica distancia, alineación o filtro, corrige eso y vuelve a comprobar.
6. Haz una entrega. Desmarca Repetir la secuencia y pulsa Iniciar secuencia. El panel se cierra: el brazo toma el cubo, gira a B y lo suelta. Con un brazo nuevo no hace falta enseñar A y B otra vez.
7. Comprueba el resultado. Abre P → Mecanismos. Debe mostrar «Ciclo completado» y una entrega. Sin Repetir queda en B. Usa Ir a A · sin tomar para volver; para varias entregas, activa Repetir antes de iniciar.

Si algo se atasca, abre el panel y pulsa Detener. Se libera el objeto y se frenan los ejes. Retira el obstáculo o corrige la causa antes de reiniciar.

## 2 · Llevar objetos desde una cinta

1. Detén ambas máquinas. Puedes apoyar el brazo en el suelo o en una estructura estable junto a la cinta. También puedes unir su base a una cara fija del chasis con Shift; deja libres la banda, los rodillos y las articulaciones.
2. Coloca un cubo sobre la banda detenida. El cubo debe quedar suelto, nunca unido al brazo o a la cinta.
3. Enseña A a esa altura. Abre el brazo, elige un paso de 5° y ajusta Base, Hombro, Codo y Muñeca. Cada giro cierra el panel: espera y vuelve con P. Mantén la cara naranja apuntando hacia el objeto. Comprueba la toma y pulsa Guardar A · tomar cuando esté al alcance.
4. Enseña B. Ajusta los ejes hasta dejar la pinza sobre el destino, con espacio libre para la carga durante todo el recorrido. Pulsa Guardar B · soltar.
5. Prueba el recorrido vacío. Usa Ir a A e Ir a B. Estos botones mueven los motores, no guardan posiciones ni toman objetos. Si el brazo choca, cambia A/B o la ubicación de las máquinas.
6. Prueba un cubo con la cinta detenida. Desmarca Repetir e inicia el brazo. Una vez lograda la entrega, activa Repetir e inicia también la cinta desde sus propios controles.

Unión y programación son cosas distintas. Un brazo puede estar bien unido y tener el agarre fuera de la trayectoria. La cara naranja debe pasar por encima de la carga. Si la cinta va demasiado rápido para tomarla, baja sus rpm o detén la cinta durante la prueba.

Las máquinas unidas comparten energía y carga conectada. El brazo inicial admite 64 u por rotor: brazo (26) + cinta recta (30) + esquina (41) suman 97 u antes de añadir batería y carga. Si aparece sobrecarga, separa las máquinas o ajusta explícitamente la capacidad de sus rotores en Mecanismos; aumentar la carga del agarre no cambia ese límite.

## 3 · Cintas y baterías

1. Crea una cinta desde Q → Tab. Déjala nivelada y apoyada. También puedes construirla con un plano en P → Mecanismos, acercando las piezas solicitadas e integrándolas con clic derecho.
2. Crea una Batería I, II o III desde el catálogo rápido. Estas copias de prueba aparecen cargadas y apagadas.
3. Toma la batería, acércala a una cara libre del chasis y suelta con Shift para unirla. Clic derecho sobre la batería → Activar batería. Estar cerca no basta para transmitir energía.
4. Clic derecho sobre la cinta → «Configurar cinta y extender…». Pulsa Iniciar tramo. Cada tramo tiene su propio control: encender la batería no inicia la banda.
5. Deja un cubo suelto sobre la banda y mantén libre la salida. Si la batería se agota, apágala y apóyala en el suelo para recargar.

En el taller también puedes fabricar baterías con uno, dos o tres cubos normales unidos en línea sobre la mesa. Las baterías fabricadas conservan los julios de esas piezas; no aparecen llenas por fabricarlas.

## 4 · Tomar, unir, separar y mover

- Crear: mantén Q, elige, suelta Q y haz clic. Tab cambia entre piezas y catálogo rápido mientras Q está abierto. Esc cancela la creación pendiente.
- Tomar: clic sobre una pieza, con la mano libre y sin una selección previa. Otro clic la suelta. La rueda acerca o aleja; C te agacha.
- Unir: sostén la pieza, acerca caras compatibles y suelta con Shift cuando veas el encaje. Shift + WASD gira la pieza sostenida.
- Separar: Alt apuntando a una pieza abre las opciones. Shift + varias sacudidas desarma una estructura sostenida. Se conservan sus piezas.
- Dar un destino: selecciona el equipo; clic derecho en el suelo → Ir a este punto. R detiene esa orden. Un objeto con una ruta activa no queda disponible para la pinza hasta detenerlo.

## 5 · Rotores, taller y sensor

Rotor: dos enganches unidos forman un eje. Fija una mitad al soporte y la otra a la pieza que girará. En P → Mecanismos revisa rpm, sentido, torque y capacidad. En un brazo, usa los controles del brazo para mover sus ejes.

Qué significa cada ajuste: rpm controla velocidad; torque limita fuerza de giro; capacidad limita el peso de toda la red conectada. El límite de carga del agarre solo se aplica al objeto que toma.

Taller: deja la pieza sobre la mesa, suéltala, apunta a la mesa y pulsa E. Lee el efecto y el coste de la mejora antes de aplicarla. La investigación disponible se conserva en el navegador.

Sensor de contacto: crea uno desde el catálogo rápido o prepara una pieza en el taller. Clic derecho sobre él → Sensor · conectar punta… → elige un rotor. Al tocar una pared con la punta activa, invierte ese rotor si está encendido y a menos de 3 m. No es un detector de cajas ni un botón para arrancar el brazo. Sepáralo de la pared antes de otro contacto.

## Servos · primera extremidad

1. Mantén **Q → Tab → Banco rápido** y elige **Servo pivote** o **Servo bisagra**. Suelta Q y confirma la vista previa con clic.
2. Clic derecho en la articulación → **Configurar servo**, o selecciónala y abre **P → Mecanismos**.
3. Empieza con **−20° a 20°**, **30 °/s** e **Ida y vuelta**. Pulsa Iniciar y cierra P para ver el movimiento. Detener y bloquear conserva el ángulo alcanzado.
4. Para una sola postura, elige Mantener posición o Mover una vez y una posición objetivo dentro del recorrido. Ambos llegan y quedan bloqueados mecánicamente. El rango total disponible es **−90° a 90°**, con velocidad entre **5 y 180 °/s**.

**Construcción manual:** clic derecho sobre una pirámide de base cuadrada → Preparar Servo pivote; suelda su base al cuerpo con Shift y conecta la cara inferior de un cubo a su ápice con Shift. Para una bisagra, prepara una pirámide como Servo bisagra y enfrenta su punta a la de otra pirámide con Shift; sus bases reciben los tramos rígidos. Las puntas permanecen unidas al doblarse.

La energía interna permite probarlo; una batería externa activa, conectada al conjunto, comparte su reserva. Comprueba energía, peso y espacio si se bloquea. Para mover todas las patas, conecta sus servos al mismo cuerpo y abre **Marcha del conjunto**. Elige el inicio mínimo/máximo de cada articulación y pulsa **Iniciar marcha del conjunto**; cierra P. Se preparan y repiten con un ritmo común. **Detener conjunto** bloquea todas juntas. Un fallo de energía, separación o bloqueo persistente detiene el conjunto. El equilibrio depende del montaje y de sus recorridos. Consulta [Servos Q-bits](SERVOS_QBITS.md) para el montaje y los controles completos.

## 6 · Planos, guardado y repisas

Catálogo rápido (Q → Tab): crea copias completas para experimentar en el banco. Respeta el límite de piezas de la sala.

Blueprint o plano: es una guía de construcción. Acerca los tipos de piezas que pide; clic derecho → Integrar cercanos. Solo funciona al completarlo.

Guardar: detén el mecanismo y suelta su carga. En Formas guardadas se distinguen Formas y Mecanismos. Un brazo guardado conserva sus conexiones, filtros y posturas. Exporta tus plantillas para tener una copia.

Repisa: almacena el objeto real. Al recuperarlo, los controles quedan detenidos. Revisa el espacio y la posición del objeto antes de reiniciar una secuencia.

## 7 · Si algo no funciona

- No se mueve: cierra el panel. Si sigue detenido, lee el estado del mecanismo y comprueba energía y carga conectada.
- Espera sin tomar: usa Comprobar toma; revisa que el cubo esté suelto, centrado bajo la cara naranja y casi tocándola. Detén sus rutas y suéltalo de tu mano.
- Toma otro objeto: selecciona una pieza específica o un filtro de tipo/color y pulsa Aplicar filtro y carga.
- Choca durante el giro: Detener, despejar el recorrido, ajustar A/B y probar el movimiento vacío.
- No vuelve a A: una sola entrega termina en B. Usa Ir a A o activa Repetir para el siguiente ciclo.
- La unión dejó todo sin funcionar: revisa la carga conectada de los rotores. Unir otra máquina también añade su peso.

## Hélices · primer dron

1. Mantén **Q**, pulsa **Tab** y elige **Dron de prueba**. Suelta Q y haz clic. Aparece una hélice con batería I cargada y apagada.
2. Haz clic derecho en la batería y enciéndela. Después haz clic derecho en el enganche y abre **Vuelo**.
3. Deja **altura 0,5 m** y **velocidad 0**. Pulsa **Despegar** y vuelve a la sala: P mantiene la simulación pausada mientras lees los controles.
4. Para desplazarte, mira hacia el destino, abre Vuelo, pulsa **Avanzar hacia donde miro**, elige velocidad **0,3 m/s** y aplica. Velocidad 0 frena y mantiene posición.
5. Usa **Aterrizar** antes de agotar la batería. El descenso necesita energía. **Apagar motores** corta la sustentación y el conjunto cae si está en el aire. Una vez apoyado, apaga la batería para recargar.

**Montaje manual.** Necesitas **1 enganche + 2 T-bits triangulares**. Sostén un triangular, mantén Shift y acerca su punta a la punta superior del enganche. El encaje orienta la pala: suelta cuando aparezca «Pala alineada». Repite en el lado libre con el segundo triangular. No se consumen créditos adicionales. El plano de Hélice usa tus piezas existentes; Banco rápido crea copias de prueba.

Une las caras cuadradas del enganche al chasis o a la batería. Las dos palas deben quedar arriba y libres. Deja al menos unos **27 cm entre ejes** para estas palas; un obstáculo dentro del disco de giro detiene el motor. No montes las palas sobre un enganche que ya forme parte de un rotor articulado.

Puedes conectar **1, 2, 3 o 4 hélices** al mismo conjunto. Una quinta impide el despegue hasta retirarla. Las baterías I, II y III comparten energía y potencia a través de las uniones físicas. Todo el peso cuenta: enganches, palas, chasis, baterías, sensores, manos, brazos y carga sostenida. Más hélices aumentan el empuje disponible, pero pesan y consumen; más batería también pesa. La altura y el esfuerzo reducen el margen de carga y autonomía. Los valores de carga máxima, watts y autonomía son estimaciones actuales, no garantías para cualquier construcción.

Los triangulares obtenidos al dividir un Q-bit estándar pesan 1/12 u cada uno. Las piezas creadas directamente desde Q usan el peso seleccionado en P → Piezas. Por eso dos hélices geométricamente iguales pueden levantar cargas distintas. La hélice rápida usa triangulares de 1/12 u.

**Sensor.** Prepara un sensor en el taller o usa Banco rápido. Únelo físicamente al dron y orienta su cara activa hacia la pared. Al tocarla, invierte el avance una sola vez; debe separarse para volver a activarse. No hace falta enlazarlo a un rotor para controlar el vuelo. El sensor detecta contacto, no obstáculos a distancia.

**Mano y brazo.** El cubo de agarre conserva su menú, filtros, límite de carga y consumo. Su objeto sostenido se suma al peso del dron. Los rotores y brazos pueden formar parte del montaje, pero necesitan energía suficiente y un montaje libre: una base fija o una cinta anclada impide despegar. No todos los conjuntos pesados podrán volar con cuatro hélices.

**Guardar y desarmar.** Guardar mecanismo, el banco y las repisas conservan geometría y ajustes. El banco y las repisas conservan las identidades y la energía real; una copia de plantilla aparece con baterías vacías. Los motores no se reanudan al recuperar. Aterriza y detén las hélices antes de guardar en la repisa. Separar una pala o sacudir desarma con las mismas reglas de materia y energía que las otras piezas.
