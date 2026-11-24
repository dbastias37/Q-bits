# Agarre y giro del brazo — 24 de noviembre de 2026

Base: `3218e029b1c2f1512fc38bc43c5f4e8dbe3ff0d3`. Recursos: `20261124-arm-grab-1`.

## Fallo reproducido

Tomar el brazo original por una articulación pequeña o por la pinza podía lanzar el montaje incluso antes de pedir un giro. Se reproduce sin hélices ni vuelo. La misma ejecución sobre `99e4425` y `3218e029` produjo resultados idénticos: el defecto precede a la corrección de mecanismos en vuelo.

La mano aplicaba al cuerpo elegido un torque explícito calculado con la inercia de todo el brazo. En la pinza, la inercia agregada llegaba a ser unas 1.016 veces la propia en uno de los ejes. La respuesta se amplificaba antes de que las bisagras repartieran el esfuerzo. Al separarse los cuerpos, aumentaba de nuevo la inercia calculada y la divergencia empeoraba.

El [caso de referencia](baseline.json), tomando la pinza a 240 Hz, alcanzó 265,95 m/s, 4.886,58 rad/s y 1,03 m entre pivotes antes de completar el levantamiento. El probe interrumpe esa ejecución al detectar divergencia. Sustituir únicamente la inercia agregada por la propia evitaba la explosión, pero dejaba errores de orientación de decenas de grados; esa ablación no se adoptó como arreglo.

## Corrección

La orientación de un montaje articulado se resuelve dentro de la misma restricción temporal de la mano, junto con las bisagras. Se mantiene un único anclaje manual y se conservan cuerpos, masas, piezas, colisiones y frenos. El esfuerzo usa el presupuesto de agarre del cuerpo conductor, incluyendo sus modificadores de taller y su fracción de masa. El límite angular se convierte en impulso mediante el paso físico; la preferencia de velocidad de traslado no lo sobrescribe.

El objetivo angular avanza a la velocidad de giro configurada y queda a un máximo de 0,18 rad de la orientación real. También se comprueba en la posición final del anclaje: validar por separado una traslación y un giro no basta para garantizar que su combinación sea admisible. La comprobación incluye el volumen de los eslabones pasivos y el recorrido intermedio del giro.

El refinamiento existente de 96 iteraciones se aplica mientras hay orientación articulada activa y la escena no supera 64 contactos ni 256 ecuaciones. Fuera de ese presupuesto se conserva el solve ordinario de 24 iteraciones. Se restaura siempre el ajuste al terminar el solve. Los cubos sueltos, las estructuras rígidas y las familias conservan su control de orientación anterior.

La recuperación de límites evalúa cada cara de la sala por separado. Una pequeña penetración inicial permite movimiento o giro hacia dentro, sin profundizarla ni intercambiar una mejora en una pared por más penetración en otra. Esto evita que el primer paso rechazado del barrido deje el objeto atrapado contra el techo.

## Regresiones automatizadas

`node --test tests/*.test.cjs` aprobó **1.671/1.671** pruebas, cero fallos, cancelaciones u omisiones, en 58,46 segundos en este entorno. La salida completa de esta entrega se conserva en [tests-final.log.gz](tests-final.log.gz). Las 19 regresiones nuevas se distribuyen en 14 casos de agarre articulado y cinco de recuperación de límites.

- `tests/articulated-grab.test.cjs` usa la receta original, entrada real de ratón y teclado, y Cannon. Cubre base, articulación y pinza a 60/120/240 Hz; levantamiento sin giro; inversión de 180°; mesa; rueda; liberación y reagarre; conservación de cuerpos, masa e identidades; sala con contactos por encima del presupuesto; ajustes de velocidad y frecuencia; y giro más desplazamiento contra un panel fino.
- `tests/grip-boundary-recovery.test.cjs` comprueba techo, cuatro paredes, piso, esquina, traslación y giro, además del volumen completo de un brazo con cuatro ejes. Cuatro casos fallan contra la base; el control de límites desde dentro pasa en ambas versiones.

El caso del panel usa gravedad cero para aislar el movimiento horizontal y detectar un impulso residual al soltar; comprueba 480 objetivos completos seguros para cada velocidad de agarre. Los giros, la mesa, la caída y el reagarre de los otros casos y de la matriz independiente usan la gravedad normal.

Sintaxis, diff y validación de foco/posprocesado EGL/GLES también se comprueban. No se modifican shaders ni se mide rendimiento de GPU.

## Matriz física independiente

El [probe](probe.cjs) usa el juego y Cannon reales con DOM/GPU instrumentados. Ejecuta reposo, levantamiento de dos segundos, solicitud exacta de 180° durante cuatro segundos, sostén, caída al soltar, reagarre y segunda liberación. El [JSON completo](matrix.json) conserva el hash de `game.js`, los valores por fase y las unidades.

| Pieza tomada | Frecuencia física | Giro | Error al sostener 180° | Error al reagarrar |
| --- | ---: | --- | ---: | ---: |
| Base | 120 Hz | Inclinación | 0,00063° | 0,00064° |
| Articulación pequeña | 120 Hz | Inclinación | 0,00352° | 0,00433° |
| Pinza | 120 Hz | Inclinación | 0,00603° | 0,00642° |
| Base | 240 Hz | Inclinación | 0,00020° | 0,00022° |
| Articulación pequeña | 240 Hz | Inclinación | 0,00095° | 0,00115° |
| Pinza | 240 Hz | Inclinación | 0,00164° | 0,00173° |
| Pinza | 60 Hz | Inclinación | 0,02435° | 0,02402° |
| Pinza | 240 Hz | Giro horizontal | 0,00163° | 0,00162° |

Los ocho casos conservan exactamente masa e identidades, completan el giro y permiten volver a tomar el brazo. La altura máxima de cualquier pieza en esos ciclos es 2,208 m; no hay divergencia ni lanzamiento al techo. Los errores angulares de la tabla están en **grados**, y las frecuencias son de simulación física, no FPS medidos.

La [medición por fases de la pinza a 60 Hz](pinza-60hz-phases.json) registra una separación máxima entre pivotes de 8,80 mm durante el giro y 3,43 mm al sostener. El pico global de 33,49 mm corresponde al impacto después de soltar el brazo al piso; no persiste ni impide reagarrarlo. Estas tolerancias describen el solver físico, no un montaje rígido ideal.

## Reproducir

Desde la raíz del repositorio:

```sh
node --test tests/*.test.cjs
node docs/mediciones/agarre-brazo-20261124/probe.cjs current 4 240 pitch
node docs/mediciones/agarre-brazo-20261124/probe.cjs current 4 60 pitch
node docs/mediciones/agarre-brazo-20261124/probe.cjs 3218e029b1c2f1512fc38bc43c5f4e8dbe3ff0d3 4 240 pitch
python3 tests/validate-focus-gles.py
node --check assets/js/game.js
node --check assets/js/boot.js
git diff --check
```

Los argumentos del probe son revisión, índice del cuerpo tomado (`0` base, `1` articulación pequeña, `4` pinza), Hz físicos y eje (`pitch`, `yaw`, `roll`). El caso histórico informa `diverged: true` y se detiene de forma deliberada. No reemplaza archivos del checkout.

## Límite de la comprobación

Node/Cannon verifica la lógica, el giro y los contactos en escenas reproducibles. EGL/GLES verifica los shaders y fixtures existentes. Ninguna de estas comprobaciones constituye una partida visual en navegador, una medida de FPS ni una certificación de todas las construcciones posibles del jugador. Se conserva el alcance de los arreglos anteriores de vuelo y líneas QR.
