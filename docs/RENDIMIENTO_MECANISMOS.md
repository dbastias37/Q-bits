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


## Extensión a todos los tipos y esquinas — segunda entrega del 16 de noviembre

Referencia de esta entrega: `3264913563a71763cf8e6f762f11e50e2668ebc7`, que ya incluye la primera optimización y el freno. Estos porcentajes no se suman a los de la tabla anterior.

Las consultas de colocación y de la mano utilizan primero cada cuerpo completo. Sus dimensiones rotadas y el alcance del giro se reutilizan; las cachés de orientación se limitan a 12 entradas por cuerpo. Solo al acercarse a un obstáculo se expanden las piezas candidatas. En un desplazamiento, se preparan una vez los intervalos SAT de cada pareja y las muestras siguientes solo desplazan esos intervalos. Se conservan el barrido contra paneles finos, el deslizamiento y la salida de un contacto existente. No se rellenan huecos ni se sustituyen las formas por un cubo grande.

El dibujo rígido ahora agrupa también T-bits triangulares/de base cuadrada y enganches, con un buffer por material. Las dos terminaciones del enganche, las normales y las coordenadas locales de textura se conservan. Las líneas de selección se agrupan manteniendo sus triángulos y orden. Baterías, líquido y marcas de agarre mantienen sus pases propios; los cuerpos coloreados y mobiliario conservan sus rutas existentes. Al desmontar o reconstruir se liberan los buffers. Los ejes siguen separando cuerpos que necesitan girar: agrupar un mecanismo no significa inmovilizar sus articulaciones.

**Sacudir:** sostener un conjunto conectado, mantener Shift y mover repetidamente el ratón de lado a lado o arriba/abajo. Se conservan umbral, espera inicial y protección contra vibraciones. Funciona tomando el chasis o un rodillo/punta. Recupera cada identidad, forma, peso, energía y adaptación; la pieza tomada queda en la mano. Retira primero anclajes de la mano, rotores, controladores y superficies de cinta. Las puntas recuperadas no vuelven a conectarse automáticamente. No se aplica a una selección de conjuntos independientes, ni a mobiliario o cargas que ya tienen sus propios controles.

**Esquinas:** se reprodujo penetración y vibración al empujar ambos modelos contra un panel: otros anclajes seguían tirando del material del chasis que sobresale de la banda. Ahora cada anclaje respeta el volumen físico completo del conjunto sostenido, consultando sus piezas exactas al acercarse. La creación rápida descarta posiciones ocupadas antes de reservar IDs/cuerpos y vuelve a validar la banda terminada. Un rechazo elimina todo el montaje temporal, incluidas superficies y controladores.

### Medición de esta entrega

`node tests/benchmark-all-elements.cjs`

Tres repeticiones alternadas, 120 subpasos de calentamiento y 30 cuadros medidos; cada cuadro contiene cuatro subpasos a 240 Hz, dibujo real y actualización de objetivo. Mismo código de escena, cámara y opciones. Las escenas de agarre se prueban elevadas, sin gravedad, para aislar el movimiento. Datos completos: [benchmarks/all-elements-20261116.json](benchmarks/all-elements-20261116.json).

| Escenario | Piezas | CPU antes → ahora, ms/cuadro | Llamadas de dibujo antes → ahora |
| --- | ---: | ---: | ---: |
| Dos rectas y esquina seleccionadas | 101 | 8,57 → 8,69 | 312 → 193 |
| Esquina en movimiento junto a dos rectas | 101 | 35,64 → 19,42 (−45,5 %) | 232 → 171 |
| Brazo sostenido y tres cintas | 127 | 22,58 → 16,30 (−27,8 %) | 257 → 219 |
| Tres conjuntos mixtos seleccionados | 192 | 11,12 → 10,23 | 583 → 211 |
| Esquina sostenida contra un panel | 41 | 81,54 → 54,54 (−33,1 %) | 111 → 70 |

La reducción de dibujo en los conjuntos mixtos es del 63,8 %. Sus tiempos de CPU y los de la escena seleccionada están dentro de la variación entre ejecuciones: no se atribuye una mejora general de CPU a esos casos. El contacto sostenido mejora y deja de vibrar en la prueba, pero sigue siendo costoso; no se afirma haber eliminado todos los cuellos de botella. En ese escenario, la penetración máxima medida durante el intervalo baja de 4,80 mm a 0,33 mm, dentro de la tolerancia de contacto de 0,35 mm de la mano.

Son mediciones Node/Cannon con DOM/GPU simulados, **no FPS del navegador**. Las piezas sueltas siguen siendo cuerpos individuales; permanecen los colliders exactos, sombras, transparencias, postprocesado y el límite de 256 piezas. Una escena con muchos cuerpos activos o contactos complejos puede seguir limitada por física o GPU.

### Verificación adicional

- 628 pruebas de la suite completa aprobadas, sin fallos ni omisiones; incluye rechazo por solapamiento exclusivo de la banda y retirada atómica de los montajes temporales.
- Comparación de intervalos contra SAT completo: 240 parejas y seis traslaciones cada una, cuatro formas, orientaciones variadas y paneles delgados.
- Ambas esquinas sostenidas contra paneles de 4 mm, colocación ocupada sin asignar identidades, rollback de bandas, cachés tras quitar/reconstruir/girar superficies, huecos y límites del mundo.
- Desarme de recta, ambas esquinas, brazo, rotor, sólidos mixtos y batería adaptada; sin pérdida de piezas/energía ni restricciones o buffers huérfanos. Se conservan los frenos de rotores apagados.
- 21 escenas GLES/Mesa, dos shaders y un programa, cero errores. La comparación mixta no cambia ningún píxel más de dos niveles de color; error medio por canal 0,0000011. Referencias de cubos, líneas, formas mixtas y capturas de esquina inspeccionadas.
- Una comparación adicional de transporte activo contra `3264913` conserva exactamente posiciones, orientaciones y energía finales. No se realizó una partida completa de navegador.

Siguiente comprobación: probar en el PC del jugador crear, sostener y sacudir una esquina junto a sus otras secciones. Si persiste la lentitud, medir el contacto sostenido y el tiempo real de GPU; la separación vuelve a activar cuerpos individuales por diseño.


## Colocación en estructuras grandes y agarre al suelo — tercera entrega del 16 de noviembre

Referencia: `050660fa24742779ea7407c3609f2b9daee3fd18`. Las secciones anteriores documentan entregas históricas; los porcentajes no se acumulan.

**Construcción física:** las regiones rectangulares completas de cubos contiguos comparten una caja de colisión exacta. Una placa de 192 cubos pasa de 192 colliders a uno; añadir un cubo encima requiere dos. Huecos, separaciones, pirámides, tetraedros, enganches y articulaciones mantienen sus volúmenes propios. Los sensores mantienen un collider independiente, enlazado por identidad, para que un cubo vecino no active la punta. Se conservan piezas, poses, masas, energía, adaptaciones, gráficos y desarme por sacudida. El guardado continúa almacenando piezas, y reconstruye los colliders al cargar.

Cannon 0.6 recalcula masa y volumen envolvente después de cada `addShape`. La construcción ahora incorpora todas las formas antes de recalcular una sola vez, también para T-bits y enganches que no se pueden fusionar. El cuerpo todavía no está incorporado al mundo durante esta preparación. Una prueba compara masa, inercia, AABB y radio con la inserción nativa de Cannon.

**Unión:** las 24 orientaciones de grilla se evalúan permutando las dimensiones existentes; los candidatos se ordenan y se comprueba el primero libre, conservando alternativas si está obstruido. La confirmación vuelve a comprobar toda la colocación. Las parejas de piezas se filtran por AABB antes de SAT, y las caras de unión se construyen solo cerca del contacto. Se conservan las caras compuestas de T-bits y el rechazo de uniones parciales o posiciones que quedaron ocupadas.

**Reposo:** el corrector del eje ya no desplaza un soporte que tuvo masa inversa cero en el solucionador. Ese desplazamiento posterior a los contactos era una causa de deslizamiento sin fricción. Los eventos reales de despertar se propagan por el mecanismo para que un impacto o arranque pueda moverlo completo. El brazo detenido utiliza el freno pasivo de cada bisagra; se elimina el bloqueo redundante de seis ejes que competía con la misma articulación. No se aumenta la fricción global, no se cambia el ajuste del jugador y no se anclan al piso los mecanismos libres.

### Medición reproducible

```sh
node tests/benchmark-large-assemblies.cjs 050660fa24742779ea7407c3609f2b9daee3fd18 docs/benchmarks/large-assemblies-20261116.json
```

Siete repeticiones alternadas, con calentamiento de ambas versiones. Medianas de CPU del proceso Node; la consulta previa se repite veinte veces por muestra. Datos completos: [benchmarks/large-assemblies-20261116.json](benchmarks/large-assemblies-20261116.json).

| Operación | Antes, ms CPU | Ahora, ms CPU | Reducción |
| --- | ---: | ---: | ---: |
| Confirmar un cubo sobre 192 cubos | 36,04 | 4,61 | 87,2 % |
| Confirmar un cubo sobre 192 piezas mixtas | 25,15 | 8,31 | 66,9 % |
| Buscar encaje de dos placas de 96 cubos | 11,58 | 1,35 | 88,3 % |
| Confirmar la unión de esas placas | 74,26 | 6,81 | 90,8 % |
| Brazo en reposo, cuatro subpasos por cuadro simulado | 2,95 | 0,81 | 72,6 % |

La consulta previa de una sola pieza permanece aproximadamente en 1,3–1,6 ms; no se atribuye una mejora a ese caso. La creación de 192 cubos baja de 39,22 a 7,74 ms y la de 192 piezas mixtas de 39,64 a 11,67 ms. Los tiempos incluyen trabajo de CPU y pueden variar entre ejecuciones; no son latencia de pantalla ni FPS.

Después de tres segundos de asentamiento, el brazo anterior aún desplazaba una de sus partes 8,61 mm durante los siguientes diez segundos y solo dormía uno de sus cinco cuerpos. El corregido mantiene los cinco cuerpos dormidos y registra cero desplazamiento durante ese intervalo. Un impulso vuelve a despertar el conjunto; las ruedas siguen impulsando el chasis. Una placa con fricción normal se detiene y queda estable; con fricción cero sigue deslizándose, como corresponde.

### Verificación y límites

- 639 pruebas completas aprobadas, sin fallos ni omisiones: campaña, sensores, rotores, transporte por ambas esquinas, brazo, desarme, guardado y repisas.
- Regresiones nuevas: placa de 192 piezas con pesos y giros distintos; hueco atravesable; piezas desalineadas; sensor dentro de un sólido compacto; extracción de una pieza intermedia; unión 96+96; candidato que queda bloqueado antes de soltar; reposo e impulso del brazo.
- 21 escenas reproducidas en GLES/Mesa; dos shaders y un programa compilados, cero errores. No se modifica código de dibujo, texturas, luces, resolución ni frecuencia física.
- Las formas de contacto equivalentes pueden producir una trayectoria de asentamiento ligeramente distinta en Cannon: no se afirma igualdad exacta de trayectorias con la versión anterior. Sí se comprueban geometría, conservación y comportamiento funcional.
- No se realizó una partida completa en navegador ni se midió el PC del jugador. Muchas piezas sueltas, contactos sostenidos complejos y el costo real de GPU pueden seguir produciendo bajones. El límite de 256 piezas se mantiene; no se promete ausencia de caídas en cualquier escena.
