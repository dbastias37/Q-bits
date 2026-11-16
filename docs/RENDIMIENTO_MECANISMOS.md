# Rendimiento de mecanismos y freno de reposo

Entrega del 16 de noviembre de 2026, contra la versión `bc1324b`.

## Diagnóstico y cambio

Dos cintas rectas y una esquina contienen 101 piezas (65 cubos y 36 enganches), repartidas en 12 cuerpos rígidos y nueve ejes. La agrupación física del chasis ya existía. El cuello de botella observado era una comprobación exhaustiva entre todas las piezas de ambos lados de cada eje, repetida a 240 Hz incluso cuando Cannon había puesto toda la instalación en reposo. Además, cada selección reconstruía muchos vectores temporales al proyectar sus líneas.

Ahora las consultas de choque empiezan por el volumen del cuerpo completo y después por los volúmenes de las piezas candidatas. Solo las parejas que pueden tocarse llegan al cálculo geométrico exacto. Las posiciones transformadas se reutilizan mientras el cuerpo permanezca igual. Las operaciones del editor reconstruyen los cuerpos al cambiar su geometría; las cachés no se serializan.

Un eje apagado que ya fue comprobado y cuyos dos cuerpos siguen dormidos conserva ese resultado. Un impacto, una traslación, una rotación, una reconstrucción o el arranque reactiva la comprobación. Se mantienen los pasos físicos de 240 Hz, las iteraciones del solucionador, todos los colliders, las superficies visibles y las piezas recuperables. El chasis y los rodillos continúan separados porque deben poder girar entre sí. Las líneas de selección conservan exactamente sus triángulos Float32 con menos objetos temporales.

## Rotores apagados

Apagado significa **eje frenado**. Una ecuación angular pasiva integrada en la articulación conserva el ángulo actual, se libera al encender y vuelve a tomar la postura al detenerse. No consume batería, no representa torque del motor y no ancla el montaje al suelo: el conjunto sigue pudiendo moverse, caer y transportarse. Esto también se aplica al corte por falta de energía y a los rodillos de las cintas.

El brazo conserva sus frenos de postura y su secuencia. No se crean restricciones adicionales en la lista del mundo por cada encendido/apagado. La reconstrucción y el guardado recuperan la postura real del mecanismo detenido.

## Medición reproducible

`node tests/benchmark-mechanism-units.cjs`

Referencia: commit `bc1324b11b7cc1327261581034dcf1af9ac93372`. Semilla, cámara y preferencias iguales; todas las piezas seleccionadas. Tres repeticiones alternando el orden, 240 subpasos de calentamiento y 30 cuadros medidos. Cada cuadro ejecuta cuatro subpasos reales de Cannon, render de producción y actualización de interfaz. Se toma la mediana del tiempo de CPU del proceso.

| Escenario | Piezas / cuerpos / ejes | Antes, ms CPU/cuadro | Ahora, ms CPU/cuadro | Reducción |
| --- | --- | --- | --- | --- |
| Dos rectas y esquina detenidas | 101 / 12 / 9 | 40,94 | 8,78 | 78,5 % |
| Las mismas con baterías y cargas en marcha | 107 / 15 / 9 | 53,22 | 19,62 | 63,1 % |
| Ocho rectas detenidas, todas seleccionadas | 240 / 32 / 24 | 94,01 | 18,55 | 80,3 % |

En marcha, posiciones, orientaciones y energía finales coincidieron exactamente entre versiones. En reposo se espera una diferencia de orientación por el nuevo freno solicitado: antes los rodillos podían girar al caer o rozar el piso.

El entorno usa DOM/GPU simulados. Estos valores **no son FPS**, no representan el equipo del jugador y no cuantifican el costo real de fragmentos, transparencias o postprocesado en su GPU. El límite de materia de la sala sigue siendo 256; esta medición no demuestra capacidad ilimitada ni rendimiento con miles de piezas.

## Verificación

- 610 pruebas de la suite completa aprobadas, más una prueba adicional de equivalencia exacta de las líneas: 611 comprobaciones distintas. Carga de recursos verificada nuevamente después del cambio de versión de caché.
- Muestreo determinista de 240 posiciones/orientaciones, formas mixtas, huecos y bordes: la consulta rápida coincide con la prueba precisa de referencia.
- Reposo/reactivación por impulso y movimiento; freno ante torque sostenido y carga física; tres ciclos de encendido/parada sin acumular restricciones.
- Regresiones existentes de transporte en ambos sentidos, esquinas, carga, corte de batería, ejes cargados, chasis con cuatro ruedas, brazo, guardado, repisas y campaña aprobadas.
- 19 escenas del render real reproducidas en GLES/Mesa; dos shaders y un programa sin errores GL. Capturas de brazo y esquina inspeccionadas. Esto no equivale a una partida en navegador.

Siguiente verificación útil: repetir la instalación del jugador en su PC, probar las cintas apagadas, activas y al moverlas, con las mismas preferencias gráficas. Si persiste un cuello de botella, separar tiempo de CPU y GPU antes de ampliar la arquitectura o el límite de piezas.
