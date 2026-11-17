# Servos Q-bits · pivote y bisagra

Estas articulaciones permiten construir extremidades con las piezas existentes. El **Servo pivote** usa una pirámide de base cuadrada y conecta la pieza móvil por su punta. El **Servo bisagra** une dos pirámides por sus puntas y abre lateralmente el ángulo entre ellas. Cada mitad lleva consigo los bloques soldados a su base.

| Articulación | Montaje | Uso inicial |
| --- | --- | --- |
| Servo pivote | Pirámide en el soporte; cara inferior de un cubo en su ápice | Cadera u orientación de una extremidad |
| Servo bisagra | Dos pirámides con las puntas enfrentadas | Rodilla, codo o apertura de una palanca |

Las puntas de la bisagra permanecen juntas durante el movimiento. Su eje no está en el centro de los cubos. Al detenerse, el bloqueo mecánico conserva el ángulo alcanzado. La articulación no fija toda la construcción al suelo: un conjunto libre todavía puede desplazarse o caer.

## Primera prueba desde el banco rápido

1. En el banco de pruebas, mantén **Q**, pulsa **Tab** y elige **Servo pivote** o **Servo bisagra**.
2. Suelta Q, apunta la vista previa a una superficie libre y confirma con **clic**. La copia aparece detenida. La rueda gira la vista previa; Esc cancela.
3. Haz **clic derecho sobre la articulación → Configurar servo**. También puedes seleccionarla y abrir **P → Mecanismos**.
4. Para una prueba corta, usa **Desde −20°**, **Hasta 20°**, **Velocidad 30 °/s** y **Movimiento: Ida y vuelta**.
5. Pulsa **Iniciar** y cierra P para reanudar la simulación. El panel pausa el juego; un servo iniciado no se verá moverse mientras siga abierto.
6. Vuelve al panel y pulsa **Detener y bloquear**. Conserva su postura actual. Despeja el recorrido antes de probar una apertura mayor.

El semicírculo muestra el recorrido configurado y la aguja muestra el ángulo actual. La vista previa del panel es una guía: no garantiza que los bloques añadidos tengan espacio para completar todo el recorrido.

## Construir un pivote con tus piezas

1. Prepara una **pirámide de base cuadrada**, un cuerpo de cubos y el cubo que iniciará el tramo móvil.
2. Haz clic derecho en la pirámide y elige **Preparar Servo pivote**.
3. Une su base cuadrada al cuerpo con **Shift**. Esa unión es rígida.
4. Toma el cubo del tramo móvil, mantén Shift y acerca su **cara inferior** a la punta de la pirámide. Confirma soltando cuando aparezca el encaje de servo.
5. Añade los demás cubos del tramo a caras libres del cubo móvil. Deja separación suficiente respecto del soporte.

La orientación de la pirámide determina el eje del pivote. Gira el montaje antes de unirlo al cuerpo si necesitas mover la extremidad en otro plano.

## Construir una bisagra

1. Prepara **dos pirámides de base cuadrada**. En una de ellas, clic derecho → **Preparar Servo bisagra**.
2. Conecta la base cuadrada de cada pirámide al tramo de cubos que le corresponde.
3. Sostén uno de los tramos, mantén **Shift** y acerca las puntas de ambas pirámides. El encaje alinea la articulación; suelta para conectar.
4. Comprueba el arco lateral y prueba primero un recorrido pequeño. Una pirámide acompaña al tramo superior y la otra mueve el inferior.

Para una pierna, el pivote conecta el cuerpo con el primer tramo; la bisagra conecta ese tramo con el que termina en el pie. Configura y prueba cada articulación antes de añadir más peso.

## Controles

| Control | Efecto |
| --- | --- |
| Desde / Hasta | Límites del recorrido, entre −90° y 90°. Desde debe ser menor que Hasta. |
| Velocidad | Entre 5 y 180 grados por segundo; la carga y la fuerza disponible pueden reducir la velocidad real. |
| Mantener posición | Va a la posición objetivo y queda bloqueado allí. |
| Mover una vez | Va una vez a la posición objetivo y queda bloqueado allí. |
| Ida y vuelta | Alterna entre ambos extremos hasta detenerlo o quedarse sin energía. |
| Posición objetivo | Ángulo dentro del recorrido para Mantener posición y Mover una vez. |
| Aplicar recorrido | Guarda los ajustes y detiene la articulación para configurarla. |
| Iniciar | Aplica los campos visibles y prepara el movimiento. Cierra P para verlo. |
| Detener y bloquear | Detiene el motor conservando el ángulo actual. |
| Invertir sentido | Cambia el extremo inicial de Ida y vuelta; en los modos de posición invierte el objetivo dentro de los límites. Vuelve a iniciar. |

En esta entrega, Mantener posición y Mover una vez terminan ambos con bloqueo mecánico; no mantienen un motor consumiendo continuamente para sostener la postura.

## Energía, fuerza y recuperación

Los servos usan la energía interna existente de sus piezas y pueden compartir una **batería externa activa conectada físicamente** al conjunto. Acopla la batería con Shift y actívala desde su menú. Estar apoyada cerca de la articulación no basta para alimentarla. El peso de los tramos y de la batería cuenta para la carga conectada.

Si no se mueve, cierra P y revisa el estado del servo: energía, carga y espacio para girar. Si se bloquea bajo esfuerzo, detén el servo, reduce el peso o acorta el tramo y prueba de nuevo. Los límites de torque y carga se muestran en el panel; añadir batería no aumenta automáticamente la fuerza máxima.

Los servos son articulaciones individuales. **Esta entrega no incluye coordinación automática de cuatro patas ni una orden de marcha para un cuadrúpedo.** Permite montar y probar una extremidad como base para esa coordinación posterior.
