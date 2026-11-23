# Cubos de trayectoria

Implementación del banco de pruebas de Q-bits, 23 de noviembre de 2026.

Dos balizas físicas delimitan un recorrido. Comparten una cara de pixel art y una identidad de ruta. Un **receptor de trayectoria**, unido al chasis de un robot o dron, indica qué recorrido debe seguir. Los motores, los apoyos, las hélices y la batería existentes realizan el movimiento.

## Preparar las piezas

1. Pon un cubo normal sobre la mesa de trabajo y abre **Adaptaciones → Cubo de trayectoria**. Aplica el nivel disponible.
2. Prepara una segunda baliza de la misma manera. Coloca ambas en el piso, separadas y fuera del volumen por donde circulará el mecanismo.
3. Adapta otro cubo como **Receptor de trayectoria** y únelo al chasis con las uniones normales. En un vehículo terrestre, orienta su cara hacia el frente mecánico. En un dron, colócalo por debajo de las palas, sin obstruirlas.

| Nivel de baliza | Alcance del trazado | Mesa necesaria |
| --- | ---: | --- |
| I | 4 m | I |
| II | 12 m | II |
| III | 23 m | III |

La pareja usa el alcance del extremo de menor nivel. Se mide la longitud del trazado, incluidos sus desvíos y, en vuelo, los cambios de altura. El regreso de un bucle usa ese mismo trazado en sentido contrario. Los valores iniciales 4/12/23 m son parámetros de diseño que pueden ajustarse tras la prueba con jugador.

La adaptación conserva la identidad, masa, materia y carga del cubo. Los niveles usan la investigación existente de mesas II y III; no añaden nuevas compras a su economía. No se combina esta adaptación con sensores, pinzas, baterías externas, materia dividida u otras mejoras de esa misma pieza. Esos módulos pueden pertenecer a otras piezas del mecanismo.

**Cubo de trayectoria** prepara una baliza capaz de generar una cara nueva. **Receptor de trayectoria** prepara la pieza del vehículo que sigue una cara existente. Al cambiar la pieza objetivo del taller, una elección anterior de baliza o receptor se descarta: elige la adaptación de la nueva pieza antes de aplicarla.

Las balizas y los receptores mantienen el cuerpo, la cara y el contorno alineados con su posición física. Conservan su ánimo y energía, pero no hacen los balanceos ni los saltos visuales de entusiasmo o inquietud, incluso antes de enlazarlos. Al retirar la adaptación recuperan los gestos normales del cubo.

**Restaurar pieza** retira la adaptación y desvincula sus conexiones. Cambiar de nivel mantiene el enlace. Para cambiar una baliza enlazada a receptor, primero hay que desvincularla.

## Crear la pareja y dibujar

1. **Clic derecho en la primera baliza → Configurar recorrido → Generar cara nueva.** Se reserva una cara libre y ese cubo pasa a ser el inicio.
2. Pulsa **Elegir final** y haz clic en la segunda baliza. Las dos muestran la misma cara. Una baliza que ya tiene pareja no se incorpora a otra.
3. También puedes abrir la segunda baliza sin cara, pulsar **Vincular como fin** y elegir la baliza de inicio. Ambas formas requieren una elección explícita y conservan las otras parejas.
4. Pulsa **Trazar recorrido**. Cada clic en el piso añade un punto de apoyo; los codos se dibujan automáticamente. **Clic derecho** deshace el último punto elegido. **Enter**, o un clic en la baliza final, guarda; **Escape** cancela y conserva el trazado anterior.
5. En **Puntos del recorrido**, selecciona cada punto y ajusta la acción de llegada. Para vuelo también puedes editar su altura. Los cambios del formulario se aplican con **Guardar punto**. El panel distingue inicio y fin; los codos automáticos no se convierten en acciones o paradas duplicadas.

El recorrido sigue la misma regla ortogonal que los cables: primero un eje del piso, después el otro y, en vuelo, la altura. Cada tramo es paralelo a un eje de la sala. Las posiciones de los apoyos y de las balizas se conservan; no se desplazan las piezas a otra cuadrícula. La vista previa, el mapa, el cálculo de alcance y el mecanismo usan ese mismo circuito, sin un atajo diagonal entre los puntos.

Los cambios de dirección requieren espacio físico. Un vehículo con ruedas reduce la marcha y se orienta en el codo mediante sus motores; el dron se estabiliza antes de cambiar de eje. El radio de giro, los apoyos y la inercia del montaje siguen contando: la línea indica el recorrido del chasis, no elimina su volumen ni las colisiones.

Los extremos siguen las balizas; los puntos intermedios quedan donde fueron trazados. El punto de llegada queda 35 cm delante de la cara lateral, o al costado de una cara superior, para evitar que el mecanismo tenga que ocupar el volumen sólido del cubo. Si el chasis es grande, deja espacio adicional y comprueba sus dimensiones.

El trazado admite hasta **48 puntos**, incluidos los extremos. Un nuevo trazado fuera de alcance se rechaza sin sustituir el anterior. Si mover una baliza deja una ruta existente fuera de alcance, esta queda detenida, se puede guardar y se puede reparar acercando el cubo, acortando la ruta o mejorando ambos extremos.

## Orientación y vuelo

| Orientación de las dos caras | Resultado |
| --- | --- |
| Hacia un lateral | Recorrido terrestre, proyectado sobre el piso |
| Hacia arriba | Recorrido aéreo, con altura por punto |
| Distintas, ocultas hacia abajo o demasiado inclinadas | Ruta detenida, con explicación en el panel |

La orientación necesita estabilizarse después de soltar las balizas. Los umbrales tienen histéresis para que una pequeña oscilación no cambie repetidamente de modo. Tomar, desplazar o girar una baliza detiene a su seguidor y vuelve a comprobar los extremos. No desplaza el robot junto con el cubo.

Las alturas de vuelo van de **0,15 a 3 m**, medidas desde la parte inferior del mecanismo hasta el piso, como en el controlador de vuelo existente. Una altura de piso se convierte inicialmente a 0,5 m al pasar a modo aéreo; las alturas aéreas ya editadas se conservan al alternar modos. La vista muestra el trayecto aéreo y su proyección tenue en el piso. Los haces sobre las balizas son geometría visual ligera.

| Acción | Comportamiento |
| --- | --- |
| Pasar | Continúa al siguiente punto. Un último punto aéreo de paso termina en vuelo estacionario. |
| Esperar | Se detiene en el punto durante el tiempo indicado, de 0 a 60 segundos. |
| Aterrizar | El dron desciende, comprueba contacto físico, espera y continúa si quedan puntos. En el último punto termina aterrizado. |
| Soltar carga | Frena o llega al punto, libera la pinza real del mecanismo una vez y continúa después de la espera indicada. Requiere una pinza. |

**Repetir · ida y vuelta** recorre los mismos puntos en orden inverso al llegar al extremo. No dibuja un atajo para cerrar el circuito ni teletransporta el mecanismo al inicio.

## Asignar y poner en marcha

Haz clic derecho en el receptor, abre su configuración y pulsa **Elegir ruta**. Selecciona cualquiera de las balizas de la pareja. El receptor adopta su cara. Coloca el chasis a menos de **60 cm** del inicio, detén cualquier programa manual y pulsa **Iniciar recorrido**.

El reconocimiento inicial admite vehículos con ruedas motorizadas a ambos lados de un chasis y la marcha física de cuatro apoyos existente. Las ruedas reciben órdenes diferenciales limitadas por sus RPM y torque configurados. Los cuadrúpedos acortan la zancada interior y mantienen las fases de sus articulaciones; giran en arco y necesitan espacio. Un dron usa sus hélices, batería y controlador físico de vuelo. El receptor por sí solo no aporta fuerza ni energía.

Un mecanismo y una ruta admiten un seguidor activo cada uno. El controlador comprueba un volumen próximo antes de avanzar; ante una obstrucción o falta de progreso, se detiene y explica el motivo. Despeja el paso o modifica el trazado y vuelve a iniciar. Esta entrega no calcula desvíos automáticos ni coordina tráfico entre varios vehículos.

**Detener recorrido** frena ruedas o patas. Un dron que ya está en el aire mantiene la altura con su controlador físico y sigue consumiendo batería. Desde los controles normales del dron puedes ordenar el aterrizaje o apagarlo. La falta de energía y los límites físicos existentes siguen aplicándose. Un ajuste manual del motor o del vuelo termina la navegación automática de ese mecanismo.

## Identidad, guardado y coste

El catálogo contiene **144 caras**: los 24 originales de las referencias y cinco variantes de cada uno. Cada cara es exactamente **10 × 10 cuadros**, incluido un borde negro de un cuadro; el interior es de 8 × 8. La carcasa clara que separa el diseño del cuerpo está fuera de esa cuadrícula.

La cara identifica visualmente a la pareja; la asociación usa IDs internos persistentes. No hay lectura de cámara, reconocimiento de imágenes, QR comercial ni generación de imágenes durante la partida. Dos rutas existentes no reciben la misma cara. **Cambiar cara**, o **Cambiar cara de la pareja**, selecciona otra libre y actualiza juntos los dos extremos y sus receptores. Al desvincular una ruta, su dibujo vuelve al catálogo disponible; el contador de identidades no retrocede.

El panel muestra **Caras libres: N de 144**. Cada inicio reserva una, tenga o no un fin; los receptores y los fines vinculados comparten esa reserva. Se pueden crear las 144 identidades distintas. Cuando se agotan, generar otra queda bloqueado con una explicación, pero **Vincular como fin** sigue disponible. Desvincular un recorrido libera su cara; los demás enlaces conservan su identidad.

Las balizas dormidas no consultan su posición en cada paso. Se observan al registrarlas, al despertarlas o al invalidar su enlace. El seguimiento activo se limita a 20 Hz y utiliza los pasos físicos normales del juego. La representación usa un atlas compartido de 256 × 256, una superficie por cara y geometría de rutas reutilizada; no crea un objeto por píxel ni luces dinámicas por baliza. Esto no constituye una medición de FPS ni una promesa de coste cero.

El banco guarda las caras, parejas, niveles, puntos, alturas, acciones y repetición. Las familias conservan las piezas como inventario inactivo; una baliza guardada hace que su ruta espere hasta que vuelva a colocarse. Al cargar una partida, la navegación queda pausada: ruedas y patas se detienen; un dron guardado en vuelo mantiene altura con energía real. Para volver a comenzar un recorrido terminado o pausado hay que preparar el mecanismo cerca del inicio.

Los recorridos guardados antes de esta corrección conservan sus puntos y acciones. Al cargarlos se añaden los codos. Si la longitud completa supera el alcance —por ejemplo, dos tramos de 3 m suman 6 m—, la ruta queda detenida y editable para acortarla o mejorar la pareja. Los codos se calculan cuando cambia el recorrido y se reutilizan en el dibujo y la guía.

Como las demás adaptaciones vinculadas a identidades, se deben retirar antes de duplicar piezas o guardar una plantilla de mecanismo. Guardar la escena completa sí conserva los enlaces.

## Verificación y límites

Las pruebas automatizadas ejecutan el código real del juego y Cannon con DOM simulado. Comprueban emparejamiento, conservación de materia y energía, dibujo cancelable, orientación, guardado, inventario, seguimiento de carros y cuadrúpedos, vuelo, entrega de carga y pausas.

La [evidencia gráfica y física](mediciones/trayectorias-20261123/README.md) distingue la compilación y lectura de píxeles mediante EGL/GLES de una partida en navegador. El entorno de ejecución bloqueó Chromium al crear su socket; no se presenta esa prueba como realizada. Queda la comprobación de ergonomía y legibilidad con escenas y mecanismos del jugador.
