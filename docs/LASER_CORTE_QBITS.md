# Láser de corte adaptable

Implementado el 26 de noviembre de 2026. Primera pieza industrial, independiente de la futura ensambladora. Disponible en el banco y el editor de escenas; no altera los recursos ni los desbloqueos de campaña.

## Probarlo

1. En el editor, F8 → Mecanismos → **Láser de corte · cubo adaptable**. En el banco, Q → Equipo/Banco rápido → **Láser de corte**. Apunta el fantasma azul y coloca con clic. La rueda cambia su orientación.
2. También puedes usar clic derecho sobre un cubo normal → **Adaptar como láser de corte**. Adapta la cara señalada, sin crear otro cubo ni cambiar su ID, masa o carga.
3. Coloca un cubo suelto frente al cabezal naranja, a menos de 50 cm, con espacio a ambos lados y detrás para las salidas. El emisor y la materia pueden apoyarse directamente en el suelo.
4. Clic derecho en el emisor → **Iniciar láser**. Tras cuatro segundos continuos de corte aparecen seis pirámides físicas. Sigue esperando otro cubo.
5. Para obtener triangulares, cambia **Corte** a **pirámide → 2 triangulares** y vuelve a iniciar. En ese modo el cabezal se sitúa más bajo en su cara para alcanzar las pirámides apoyadas en el suelo.

El menú permite elegir cualquiera de las seis caras, alternar alcance 25/50/100 cm, detener, reiniciar, tomar, guardar y retirar la adaptación conservando el cubo. Cambiar un ajuste detiene el corte. R sobre el emisor seleccionado reinicia el proceso; no rebobina ni duplica la materia ya cortada. El cubo conserva sus controles de agarre y giro normales.

## Energía, espacio y recuperación

- Consume 2 W durante 4 s: 8 J por transformación. Usa su reserva interna o una batería/depósito encendido conectado mediante la red existente.
- El haz se detiene en el primer sólido. No atraviesa otra pieza para cortar una situada detrás.
- Solo procesa una pieza suelta de la forma elegida, sin adaptaciones ni tareas activas. No corta el propio emisor, conjuntos soldados, baterías, agarres, piezas transportadas por la mano/pinza ni materia de pedidos.
- «Salida ocupada» conserva el original y el avance, sin gastar más energía hasta que exista espacio. No hay bandeja invisible ni materia en tránsito fuera del guardado.
- La materia original permanece física durante el proceso. Solo se sustituye al completar el tiempo y comprobar de nuevo el haz, el límite de piezas y todas las salidas. Dos emisores no pueden consumir el mismo original dos veces.
- Tomar el emisor detiene el proceso. Perder el objetivo reinicia el avance. Agotar energía exige volver a iniciar; pausa y pestaña oculta suspenden el tiempo.
- La división conserva masa, origen, estado y julios. `cutEnergyScale` reparte también la capacidad interna entre los descendientes, manteniendo el porcentaje de carga sin multiplicar la reserva. Recomponer mediante el modelo de materia suma esa capacidad.

## Persistencia y rendimiento

`mood.cutter` almacena versión, cara, alcance y forma de entrada. Escenas, familias y banco conservan esos datos; los mecanismos guardados incluyen la adaptación en su receta y los blueprints requieren material existente. Al cargar, todos los cortadores están apagados y el avance se reinicia con el original intacto; la energía ya gastada no se devuelve. La exportación de escena identifica `cutter` en su inventario.

Solo los emisores iniciados comprueban objetivos. Detección y comprobación de espacio se limitan a 30 Hz, con una validación adicional antes de transformar; el gasto sigue el paso físico. El cabezal usa tres cajas sobre el cuerpo existente y no añade articulaciones. La adaptación no habilita generación de piezas en campaña.

## Verificación reproducible

- `node --test tests/laser-cutter.test.cjs`: 14 pruebas, incluyendo Cannon, paso físico completo, conservación, bloqueo y recuperación, dos emisores, energía externa, guardado y colocación 3D del editor.
- `node --test tests/*.test.cjs`: regresión general.
- `QBITS_CAPTURE_SCRIPT=capture-cutter-frame.cjs python3 tests/validate-robot-arm-gles.py /tmp/qbits-cutter-gles`: captura y reproducción de los dibujos reales del juego (apagado, activo, salida y fantasma azul).
- `python3 tests/validate-focus-gles.py`: shaders, foco y posprocesado.

Estas comprobaciones validan física, lógica y píxeles GLES; no certifican una partida manual en el navegador ni FPS en el equipo del jugador. La máquina de dos entradas y una salida queda fuera de este bloque.
