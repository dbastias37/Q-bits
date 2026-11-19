# Q-bits — punto de continuación

Actualizado: 19 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

## Última entrega · recuperación y marcha

R o clic derecho → Reiniciar conjunto recupera la postura de arranque y vuelve a ejecutar la última orden de la máquina. Un recorrido vuelve al punto de partida y conserva su destino. El reinicio comprueba el espacio y conserva la carga de las baterías. Un cuadrúpedo antiguo puede reconstruir su apoyo con las referencias de sus articulaciones.

Los cuadrúpedos alternan el apoyo entre diagonales. La fricción del pie apoyado tiene en cuenta el peso del chasis. En el banco, la capacidad inicial pasa de 32 a 256 u por eje y la máxima de 2000 a 16 000 u. Los rotores admiten hasta 360 rpm y los servos hasta 540 °/s. Los planos anteriores reciben el aumento de capacidad y torque al importarlos.

La tableta gira de forma continua al moverla por la pantalla. El cuerpo de vidrio, el marco y los controles comparten perspectiva y mantienen su proporción.

## Entrega anterior · tableta del banco de pruebas

M3 despliega o guarda la tableta. P y Q abren los controles y el catálogo en la misma interfaz. La rueda sobre el selector recorre cuatro secciones. Shift + rueda alterna entre Banco y Mesa a menos de 3,5 m del borde de una mesa desplegada. Al alejarse se recupera el banco. WASD, la simulación y las máquinas siguen activos. El botón ⇄ y Configuración → Juego permiten personalizar la mano y el tamaño.

El cuerpo 3D utiliza el tablero biselado de SciFi Desk y se dibuja en WebGL. La cara interactiva comparte su proyección. En Configuración → Juego se eligen los acabados Cristal e Industrial y la posición en ambos ejes. Arrastrar Q-bits en la cabecera guarda la nueva ubicación. La selección del catálogo prepara el mismo plano que el botón de creación. La campaña conserva su rueda y sus condiciones de desbloqueo.

## Entrega anterior · mesa desplegable y colocación de planos

El clic derecho sobre la pieza muestra sus opciones y E abre el taller. El tablero libre ofrece retirar la mesa. Q → Equipo → Mesa de trabajo permite colocarla o reubicarla. Al volver de campaña o del puzle se recuperan su posición y orientación o su estado retirado.

Los planos de construcción y las copias del banco rápido se previsualizan antes de confirmar. En el piso, Shift muestra y activa una cuadrícula de 9 cm. La rueda normal cambia de cara y Shift + rueda permite elegir el ángulo en 360°. La reconstrucción de la escena conserva el ángulo exacto de los planos. La prolongación automática de una cinta desde su panel sigue usando la salida del tramo receptor.

## Entrega anterior · autonomía y vuelo con trayectorias

Las reservas internas, externas y estacionarias almacenan cinco veces más energía que en la entrega anterior. Una celda externa del banco almacena 1800 J y sigue recargándose en 90 segundos en el suelo. Una hélice aporta hasta 135 N y una celda hasta 65 W. En la prueba con Cannon, una celda y una hélice sostienen a 0,8 m un montaje de 30 piezas que incluye un sensor de peso. Su umbral no modifica la masa.

El enganche abre **Crear trayectoria**. Cada punto guarda posición relativa al despegue, altura y acción. El jugador puede programar una pasada o un bucle, esperar en vuelo, aterrizar, esperar y despegar. Los planos y el laboratorio conservan la programación. La lista de drones en P y la selección a distancia permiten interrumpir el recorrido y aterrizar.

## Entrega anterior · sensores para conjuntos de rotores

El destino del sensor puede ser un rotor individual, un conjunto creado en P o una instancia de un mecanismo guardado en la sala. La detección de movimiento puede iniciar los cuatro ejes de un móvil en el mismo paso, conservando el sentido configurado en cada rueda. El enlace identifica las piezas de esa copia y admite detección si alguno de sus ejes está dentro de 3 m. Si el conjunto pierde un miembro, el enlace se descarta y puede elegirse nuevamente en el panel. Las copias construidas desde planos anteriores reciben su identidad al colocarlas.

## Entrega anterior · motores, sensores y autonomía

P mantiene la física del banco y la campaña en marcha. El brazo muestra el giro real del eje, admite ajustes con el motor detenido y utiliza las rpm elegidas durante el recorrido. En una prueba de giro de 90° de la base con Cannon, 24 y 72 rpm de consigna alcanzaron picos de 24,2 y 43,9 rpm respectivamente.

El sensor del taller y del banco rápido conserva el modo de contacto. P → Mecanismos permite elegir movimiento con umbral en cm/s, láser direccional o peso en unidades. Alt muestra el haz hasta el primer obstáculo. La señal inicia o detiene el mecanismo enlazado y admite inversión cuando tiene sentido de marcha. Las baterías internas, las externas y el depósito almacenan tres veces más julios con el mismo porcentaje de carga. Los motores conservan su potencia.

Al soldar tramos de cinta, el tramo que llega adopta el flujo del receptor en la unión, incluso si su eje local apunta al revés. Iniciar marcha acciona todos los tramos del mismo chasis. Desde el clic derecho se puede detener o invertir únicamente el tramo seleccionado.

## Entrega anterior · fricción y reposo en el piso

Un cuerpo liberado por la pinza conservaba el material de arrastre cooperativo. Con un impulso inicial de 0,15 m/s sobre el piso del banco y la fricción en 0,38, se desplazaba unos 39,8 cm en tres segundos. Ahora usa la fricción del piso en reposo y al restaurar el banco. El material de arrastre se aplica al mover la carga en equipo. En la misma prueba a 60, 120 y 240 pasos/s, el desplazamiento fue inferior a 0,3 mm y el cuerpo entró en reposo. Los montajes articulados detenidos también admiten amortiguación cuando todo el conjunto está quieto sobre un apoyo horizontal. En apoyos anchos sobre el piso, el umbral de reposo admite oscilaciones angulares diminutas entre contactos. Se probó un brazo apagado tras un pequeño empujón lateral y una cinta con patas que seguía derivando a 60 pasos/s. Mediciones de la simulación con Cannon.

## Entrega anterior · fluidez al girar la cámara

El limitador de FPS conserva el tiempo sobrante entre refrescos. Con un monitor simulado de 144 Hz y un límite de 60 FPS, la cadencia pasa de 48 a 60 imágenes por segundo. El giro mantiene la sensibilidad configurada. Prueba automática con varias frecuencias y pausa larga. Pendiente medir la cadencia real en el equipo del jugador.

## Entrega anterior · recorrido del brazo y apoyos del banco — 18 de noviembre de 2026

P → Mecanismos → Brazo Q-bits incorpora una posición inicial opcional. La mira elige el punto, la rueda ajusta la altura vertical y el clic guarda. Se puede probar y quitar. La secuencia la visita una vez antes de A. El banco, las plantillas y las repisas conservan la postura con el resto del programa.

El brazo comprueba sus eslabones y la carga entre la postura actual y el destino. Puede separar el giro de la base, levantar el hombro para cruzar o tomar el otro sentido de giro. Ante un atasco vuelve a calcular una vez desde la postura real. Si el espacio, el torque o la energía son insuficientes, el panel indica el motivo. Los motores siguen ejecutando el movimiento con las restricciones físicas.

Al trasladar un brazo frenado, una ancla de mano mueve el conjunto. Las correcciones contra el piso se aplican al conjunto conectado. Una soldadura comprueba los enganches existentes antes de reconstruir la base, conservando sus identidades aun con un pequeño desfase del solver. En el banco se amortiguan los contactos lentos sobre apoyos horizontales. Las piezas sueltas giran alrededor del centro al entrar en rotación y el eje de inclinación conserva la orientación del momento del agarre.

Verificación del bloque: **926 pruebas Node** con Cannon real y DOM/GPU simulados. Incluyen una entrega por encima de un obstáculo de 10 cm, giro en vacío por el lado opuesto, paso cerrado, guardado de posición inicial, montaje en mesa y reposo sobre piso y superficie elevada. **76 capturas GLES** con cero errores de GPU. Shader de foco aprobado. Chromium local quedó bloqueado al crear un socket. Pendiente comprobar en el navegador del jugador su mesa y línea de producción concretas.

## Entrega anterior · programación del brazo en el banco — 18 de noviembre de 2026

Los ejes del brazo aplican su capacidad al objeto de su propia pinza. El brazo de un montaje de 780 u puede iniciar vacío con 0 u de carga. El límite combinado es el menor entre la pinza y los ejes. P → Mecanismos → Brazo Q-bits muestra peso sostenido, cantidad de piezas y el límite, con controles para rpm, torque y capacidad por eje. El peso de los eslabones y el objeto siguen influyendo en esfuerzo y consumo. El alcance configurable es de 1,8 a 5 cm, con 5 cm por defecto también para guardados anteriores.

Marcar A y B abre un blueprint de la pinza y los eslabones calculado desde las bisagras del montaje. Se ajusta la altura con la rueda y se guarda con clic si la postura es alcanzable y está libre. La escena permanece quieta durante la selección y el panel permite ensayar el trayecto vacío con los motores reales. Los ángulos guardados y los ajustes de rotor se recuperan por el flujo existente. La luz de la base y el estado del panel distinguen encendido (verde), espera (verde con pulso lento) y bloqueo (rojo).

Verificación: **919 pruebas Node aprobadas** con Cannon real y DOM/GPU simulados. Incluyen arranque vacío de un montaje de 780 u, bloqueo de un objeto de 3 u con un hombro de 2 u, liberación si aumenta el peso sostenido y cálculo de carga para brazo y cinta soldados. Verifican también el alcance, el rechazo de posturas imposibles u ocupadas y el ciclo físico completo tras guardar A y B con clic. **75 escenas GLES** sin errores, incluidas la vista previa y los tres estados de la luz. Shader de foco aprobado. Chromium local no arrancó por una restricción de sockets. Queda pendiente contrastar la comodidad del panel y del mouse en el navegador del jugador y ensayar el recorrido con su línea concreta.

## Entrega anterior: selección de conjuntos grandes y rodillos virtuales — 17 de noviembre de 2026

Los módulos estándar de cinta conservan sus piezas, motores, peso y energía como datos, pero sus tres rodillos salen del mundo físico: no crean cuerpos ni bisagras independientes. El chasis recibe la masa exactamente una vez y tres envolventes de colisión fijas; la banda sigue transportando cargas mediante contacto y fuerza limitada. El giro, el contorno y la sombra de los rodillos son visuales, con velocidad y aceleración derivadas del motor. Se conserva el consumo por cada motor, el trabajo de tracción, la batería externa y las paradas por sobrecarga, agotamiento o pérdida de apoyo. Las adaptaciones incompatibles recuperan la articulación real. No se aplica esta conversión a brazos, servos o rotores sueltos.

Seleccionar una cinta encendida mantiene la producción. Intentar agarrar, unir o separar su red avisa que primero debe apagarse o desconectarse. Clic derecho o Alt → **Separar módulo completo** extrae un tramo con sus motores, rodillos y patas originales; los otros tramos siguen armados. El desarme completo conserva los modos inmediato y gradual. Se preservan identidades y energía en banco, planos, exportaciones y repisas; al recuperar una máquina sigue detenida. Las patas también identifican su propio controlador en un chasis compartido.

La detección preliminar usa cajas en lugar de grandes esferas alrededor de cintas alargadas. Las consultas de agarre comparten colisionadores compactos y jerarquías espaciales, con límites rotados exactos y comprobación detallada cerca de obstáculos. La cinta completa necesita una sola ancla de mano. Los contornos reutilizan buffers y se omiten del dibujo caras interiores coincidentes, sin retirar material. Al unir, la geometría de cada módulo se valida primero con sus propias piezas; las propiedades físicas del chasis se recalculan juntas. En una costura válida se compara el material original de las piezas que van a soldarse, conservando las envolventes completas frente a obstáculos externos. Esto permite prolongaciones invertidas y montaje de un brazo sobre la cinta.

Verificación: **915/915 pruebas Node aprobadas**, sin fallos ni omisiones, con concurrencia 2. Incluye montaje y prolongación invertida, brazo unido a cinta, obstáculos externos en la envolvente de un rodillo, huecos de esquinas, agarre y rotación de conjuntos grandes, masa/inercia, energía, controladores, guardados, extracción por módulo y ambos modos de desarme. Sintaxis y diff correctos. **71 capturas GLES** aprobadas, dos shaders/un programa y cero errores GPU; incluyen contornos cacheados, animación de rodillos, sombras, culling, geometría compacta y recuperación de piezas. `validate-focus-gles.py` también aprobado. No se certifica una partida visual completa de navegador.

Guía de uso: [CINTAS_QBITS.md](CINTAS_QBITS.md). Arquitectura y reproducción: [RENDIMIENTO_CINTAS.md](RENDIMIENTO_CINTAS.md). Las mediciones son CPU con Cannon real y DOM/GPU simulados; no son FPS ni una partida de navegador.

[Medición final reproducible](benchmarks/selection-conveyors-20261117.json), contra `21825fb`: escena de 500 piezas (472 en la cinta agarrada), simulación del agarre **135,29 → 5,84 ms/paso** y del giro **280,79 → 6,75 ms/paso**; con 2.000 piezas, **1.373,48 → 13,85 ms/paso** y **2.006,14 → 27,51 ms/paso**. En este último montaje hay 189 rodillos virtuales, un chasis físico, una ancla de mano y masa total 500, conservando las 2.000 identidades. La mayor unión medida aún costó **152,17 ms**; la medición excluye crear el módulo entrante y dibujar el fotograma siguiente. El reposo de la escena de 500 piezas pasó de 1,72 a 3,14 ms: no todas las fases mejoran. No presentar estos resultados como FPS ni como ausencia total de pausas.

Siguiente paso: comprobar en el PC del jugador su montaje original, selección encendida, traslado apagado, unión y separación por módulo. Comparar el panel Num8 con el mismo ajuste de pasos; la medición de referencia de esta entrega usa 60 pasos/s. Una unión de miles de piezas todavía puede producir una pausa puntual; no se garantiza ausencia de tirones en cualquier montaje ni equipo.

## Entrega anterior: miniaturas agrupadas y desarme configurable — 17 de noviembre de 2026

Continúa sobre la rama del PR #22 (`16d3370`), conservando índices, contactos y selector 240/120/60. Las miniaturas de repisas usan buffers por apariencia, reutilizados mientras el primer elemento de la celda no cambie. Una miniatura de 2.000 cubos requiere una llamada de dibujo en vez de 2.000; se mantienen sus 24.000 triángulos y su apariencia. Retirar, sustituir o eliminar contenido libera los buffers. El HUD de selección se traslada abajo a la derecha, con miniaturas del tamaño aproximado del contador de población, paginación y textos que se abren hacia arriba.

Configuración → Juego → **Desarme de conjuntos**: **Inmediato** (predeterminado) y **Por etapas · banco de pruebas**. Guardar aplica; descartar conserva el ajuste y restaurar vuelve a inmediato. Shift + agitar usa el modo elegido; Alt → Desarmar todo también lo respeta. La campaña y los puzles conservan su comportamiento inmediato.

Por etapas: detiene y retira las articulaciones del conjunto afectado, conserva las piezas como datos y las ordena de arriba hacia abajo. Hasta 16 piezas se desplazan visualmente a huecos libres del suelo; crea como máximo cuatro cuerpos por fotograma con un presupuesto cooperativo de 2 ms, independiente de los pasos de física. Revalida cada destino antes de activar colisiones, sin velocidad de expulsión. Si no encuentra espacio, espera sin perder material. La animación no tiene colisiones durante el traslado. El resto de la fábrica sigue su simulación normal. Al guardar el banco conserva piezas pendientes, identidades, masa y energía; al volver reinicia únicamente el trayecto visual pendiente. Pausa/ocultación suspenden el proceso. Las piezas pendientes cuentan en el límite de 2.000 y se indican en el contador. A/B de culling espera a que termine el desarme.

Verificación: suite completa **860/860 pruebas Node**, sin omisiones; **38 escenas GLES** sin errores, incluida equivalencia de píxeles de miniaturas mixtas en limpio/PSX y fases del desarme. Pruebas de límites, colisiones en destino, pausa, guardar/volver, preferencias y retiro de buffers. Chromium no inicia en este entorno: pendiente comprobar visualmente la posición/comodidad del HUD en el navegador del jugador. No se certifican FPS ni el máximo de cuerpos físicos que soporta su equipo.

[Microprueba reproducible](benchmarks/previews-disassembly-20261117.json): 80/500/2.000 piezas, con Cannon real y DOM/GL simulados. Excluye el coste de avanzar la física. La liberación se reparte en un máximo de cuatro cuerpos por llamada; para 2.000 piezas la ejecución de referencia tardó unos 29 s simulados a 60 fotogramas/s. No reduce el coste final de simular 2.000 cuerpos. La preparación de geometría y consultas individuales aún pueden superar el presupuesto; este es cooperativo, no un límite de latencia garantizado. El total de trabajo del desarme gradual puede ser mayor que el inmediato por las comprobaciones de colocación. Reproducir: `node tests/benchmark-preview-disassembly.cjs`.

El PR #22 quedó integrado en `21825fb`. Continúa pendiente comparar ambos modos en el PC del jugador y confirmar la comodidad del HUD en escritorio/móvil; las mejoras posteriores de cintas se describen arriba.

## Entrega anterior: consultas mecánicas y pasos configurables — 17 de noviembre de 2026

Índice persistente de pertenencia de piezas, rotores y conexiones; se invalida al crear, retirar, unir o separar grupos y articulaciones. Las posiciones y la energía siguen leyéndose en vivo. Se conserva el orden de recorrido previo para no cambiar la distribución de energía. Brazos y cintas resuelven sus articulaciones por índice.

Las cintas consultan los contactos de su propio cuerpo. El índice se comparte dentro de la fase de simulación y se renueva al entrar al solver, después de la nueva detección de colisiones: Cannon reutiliza su array de contactos, así que su identidad o longitud no son una señal suficiente de validez.

Configuración → Rendimiento → **Pasos de simulación por segundo**: 240 predeterminado, 120 y 60 para probar. Aplicación únicamente al guardar, descarte sin efecto y restauración a 240. El ajuste es independiente de la calidad gráfica y se muestra en el panel de rendimiento. Mantiene la escala de tiempo; recalibra las ecuaciones explícitas de articulaciones, frenos y pinzas existentes y futuras. Cambiar de frecuencia no revierte colisiones anteriores ni garantiza estabilidad para todos los montajes; si aparecen temblores o atravesamientos, volver a 240.

Verificación: **848/848 pruebas Node aprobadas**, cero fallos u omisiones; shaders y fixtures GLES aprobados. Incluye invalidación tras soldar/separar/borrar, posiciones vivas, reutilización del array de contactos, guardar/descartar/restaurar frecuencias y un motor simple en las tres frecuencias. No se certifica aquí una partida visual en navegador ni todos los mecanismos a 60/120.

[Comparación CPU reproducible](benchmarks/runtime-lookups-20261117.json) contra `458b786`: 256 piezas/20 rotores activos y cuatro cintas alimentadas/150 piezas, a 240 pasos. Estados finales exactamente iguales en posiciones, velocidades, energía y controladores. Medianas de CPU por paso: 4,478 → 4,365 ms y 3,454 → 3,310 ms (aprox. 2,5 % y 4,2 %); tres repeticiones, mejora pequeña con variación entre muestras. Son tiempos de simulación con DOM/GPU simulados, no FPS, límite de capacidad ni garantía de mejora en PC. Reproducir con `node tests/benchmark-runtime-lookups.cjs /ruta/al/game.js-anterior`.

Siguiente paso: probar esta tanda en la instalación real del jugador, primero a 240; después comparar 120/60 con el mismo montaje. Las miniaturas y el desarme se incorporan en la entrega posterior descrita arriba.

## Entrega anterior: culling y banco de medición — 17 de noviembre de 2026

Frustum culling en el renderizador WebGL propio, activado por defecto y guardable en Configuración → Rendimiento. Descarta conjuntos antes de preparar mallas; conserva límites completos, hélices giratorias, gestos, bordes PSX y sombras que aún se ven. Los indicadores seleccionados mantienen su dibujo aunque su cuerpo quede fuera de cámara. Cajas, geometrías de radio conocido, contornos, cables y miniaturas de repisas también tienen descarte conservador. No se cambia la física, energía, navegación, sensores, producción ni el contenido de guardados.

Banco: Num7 alterna observador con avatar/frustum del jugador; mouse y WASD siguen controlando al jugador. Manipulación bloqueada hasta regresar. Num8 muestra mediciones; Num9 congela la misma escena para OFF/ON/ON/OFF, calentamiento y 72 muestras por modo, con cancelación segura. `/` alterna culling salvo si tiene otra acción asignada. P ofrece botones para teclados sin numpad. [Guía y alcance](CULLING_QBITS.md).

Verificación: **839/839 pruebas Node aprobadas**, cero fallos u omisiones; sintaxis/diff correctos y shaders/enfoque GLES aprobados. Verificación gráfica: 22 capturas GLES, diez pares OFF/ON sin diferencias de píxeles en 800×600, estilos limpio/PSX, sombras, borde, conjuntos y hélice; cero errores GPU/buffers. Observador inspeccionado. [Microprueba de envío gráfico](benchmarks/culling-20261117.json) con 80/500/2000 piezas; tiempos JavaScript con GL simulado, no FPS. El navegador remoto no logró crear WebGL: pendiente partida en PC del jugador. La reducción de llamadas no garantiza mejora si domina la física o si todo está delante de cámara.

Siguiente paso: comparar las instalaciones reales del jugador con Num9 y revisar el panel de tiempos en primera persona. No atribuir a GPU el tiempo CPU de envío ni medir la ganancia con el observador activo.

## Entrega anterior: marcha del conjunto — 17 de noviembre de 2026

Los servos físicamente conectados comparten un controlador de marcha. En **P → Mecanismos → Marcha del conjunto** aparecen caderas y rodillas; se elige el extremo inicial mínimo/máximo de cada articulación y se inicia o detiene todo con un botón. Cada fila permite seleccionar su articulación para ajustar el recorrido. Clic derecho sobre un servo también ofrece inicio/parada del conjunto.

Primero se colocan todas las articulaciones en sus extremos iniciales; solo cuando todas llegan comienza la repetición con un reloj común. Inicio máximo produce fase opuesta. El período respeta el recorrido y velocidad más restrictivos. No requiere activar cada servo individualmente. Las preferencias de inicio se conservan en guardados, planos y repisas mediante la configuración existente; recuperar un mecanismo lo deja detenido.

Prevalidación de todas las articulaciones antes de activar motores. Parada colectiva ante pérdida de energía, desconexión, manipulación, edición o bloqueo persistente. Cada articulación conserva torque/carga finitos y freno relativo; no se añaden cuerpos ni se fija el conjunto al mundo. La coordinación no garantiza equilibrio ni avance en cualquier geometría y no añade navegación automática.

Verificación: **809/809 pruebas Node aprobadas**, sin fallos u omisiones. Incluye cuatro patas y ocho articulaciones con cuerpos Cannon reales, fase igual/opuesta, seguimiento del reloj común, frenos, falta/pérdida de energía, separación, agarre, guardado, acciones del panel, bloqueo y limpieza de escena. Sintaxis y diff limpios. `validate-focus-gles.py` aprobado. DOM simulado y GLES; no se afirma una partida visual de navegador.

Siguiente paso: probar el montaje real del jugador, elegir extremos iniciales y ajustar recorridos/apoyos para caminar. Guía actualizada en P, [SERVOS_QBITS.md](SERVOS_QBITS.md) y manual del banco.

## Entrega anterior: Servo pivote y Servo bisagra — 17 de noviembre de 2026

Dos articulaciones de recorrido limitado en el banco, reutilizando cuerpos, grafo, energía y freno de los rotores. **Pivote:** una pirámide de base cuadrada montada por su base; su ápice conecta la cara inferior del cubo móvil y define el eje longitudinal. **Bisagra:** dos pirámides de base cuadrada mantienen sus ápices unidos y abren lateralmente sobre un eje transversal. La geometría visible es la geometría física; no se añaden piezas ni cuerpos decorativos para fingir el movimiento.

Clic derecho en una pirámide → Preparar Servo pivote/bisagra; Shift encaja la extremidad compatible. Q → Tab → Banco rápido ofrece ambos montajes completos y detenidos. Clic derecho en la articulación → Configurar servo, o P → Mecanismos. Recorrido de −90° a +90°, velocidad 5–180°/s, posición objetivo, una vez/mantener/ida y vuelta e invertir. El panel pausa; cerrarlo permite observar el movimiento. Una vez y mantener llegan a la posición y la bloquean mecánicamente; apagar conserva el ángulo sin anclar el conjunto al mundo. Un bloqueo persistente detiene el intento y muestra diagnóstico. Se conservan torque finito, carga y alimentación interna/externa existentes. Manual en P y [SERVOS_QBITS.md](SERVOS_QBITS.md).

Guardar/restaurar, exportar/importar, blueprints con material existente y repisas preservan configuración, postura e identidades. Los servos recuperados quedan apagados. Soldar nuevas piezas reconstruye la articulación; sacudir devuelve las piezas originales y retira el motor. Los controladores antiguos de brazos/cintas no pueden apropiarse de un servo. La cadena física con cadera y rodilla puede configurarse por articulación; el control colectivo se incorpora en la entrega de marcha descrita arriba.

Integrado sobre `daabb07`, conservando vista previa fluida y límites generales de 2.000 piezas/carga. Verificación final: **801/801 pruebas Node aprobadas**, cero fallos u omisiones; sintaxis y diff limpios. Casos de ambos sentidos, repetición, puntas coincidentes, gravedad/suelo real, bloqueo apagado, energía agotada, batería externa compartida, montaje manual en ambos sentidos, soldadura, sacudida y persistencia. `validate-focus-gles.py` aprobado; `validate-robot-arm-gles.py` reprodujo **32 escenas**, incluyendo ambos servos a 0° y 35°, dos shaders/un programa y cero errores GPU. Inspeccionadas capturas de la bisagra. Estas pruebas ejecutan Cannon y GLES con DOM simulado; no constituyen una partida de navegador ni garantizan equilibrio de un caminante.

Continuación realizada: coordinación de marcha incorporada en la entrega descrita arriba.

## Entrega anterior: preview fluido y capacidad de 2000 — 17 de noviembre de 2026

La vista previa del banco rápido sigue la cámara en cada fotograma, sin el intervalo anterior de 30 Hz. Su dibujo ignora el temblor PSX, usa el azul plano de la repisa, une cajas contiguas sin caras internas ni rendijas y ordena la transparencia por distancia. Mantiene geometría, colisiones y confirmación exactas; no crea cuerpos durante la previsualización. Shift conserva una conexión adquirida dentro de 0,78 m (adquisición a 0,65 m), evitando cambios por pequeños movimientos del apuntado. Soltar Shift elimina ese encaje.

Máximo de 2000 piezas activas, formas/mecanismos de hasta 2000 piezas y selección/agarre manual de hasta 2000 piezas/u, activados por defecto. Las capacidades configurables de rotor, pinza, cinta, cuerpo arrastrable y enfriador admiten 2000. Las cintas tienen un campo de carga máxima en su panel. Se conservan capacidades elegidas en guardados y valores iniciales de las recetas; torque, consumo y disponibilidad de energía siguen limitando el trabajo de las máquinas. Los cupos de recetas guardadas, mobiliario y elementos por compartimento no son límites de piezas por estructura y se conservan.

La fuerza manual escala con el peso para levantar realmente un conjunto de 2000 u sin reducir su masa ni la respuesta de la mano. Miniaturas e inventario admiten las 2000 identidades. La categoría de repisa evita repetir cálculos para cada pieza con la misma orientación. Colocación filtra primero por límites del cuerpo y valida las cajas fusionadas, evitando comprobaciones innecesarias de piezas lejanas.

Verificación: suite previa completa **757/757**, más **6/6** regresiones nuevas de seguimiento a 120 Hz, vista previa compacta de 2000 piezas sin cuerpos/buffers nuevos, creación exacta, elevación/desplazamiento con Cannon, selección, guardado/restauración, repisas, capacidades del panel y retención del encaje. GLES: **28 escenas**, sin errores; igualdad píxel a píxel del ghost con temblor PSX en cero y máximo. Inspeccionado el encaje azul. Shaders generales y de enfoque compilados/enlazados, sintaxis y diff correctos. No se afirma una partida visual de navegador ni un rendimiento garantizado con 2000 cuerpos independientes; Chromium no inicia en este entorno.

Siguiente paso: probar la comodidad de colocación en el equipo del jugador y sus montajes reales. No quedan límites de 256 piezas en creación/selección/guardado de estructuras.

## Entrega anterior: colocación azul y agarre estable — 17 de noviembre de 2026

Q → Banco rápido y piezas básicas preparan una vista previa sin cuerpos, IDs ni material. Clic confirma la posición y orientación visibles, con validación nueva en ese instante; no hay búsqueda de huecos alternativos. Suelo y superficies horizontales, límites y obstáculos completos, incluidas las superficies de las cintas. Rueda gira 90°, Esc/clic derecho cancelan. Shift cerca de la salida de una cinta nivelada alinea la entrada del nuevo tramo y suelda las bases al confirmar, conservando rodillos, controladores y energía. Repisas usan su previsualización de pared; Mesa de trabajo abre el taller. Cables colocan primero el material y luego abren el tendido. N, B y botones Crear también usan vista previa; se conserva el permiso explícito de creación de primitivas en puzzles.

Agarre centrado y orientación estable inmediata para estructuras, con velocidad de mano independiente. Masa, materia e inercia conservadas; amortiguación angular según número de piezas para rígidos libres y menor rebote al colisionar. Los componentes articulados conservan su amortiguación calibrada para no alterar motores ni las pruebas de autonomía. Al soltar se eliminan velocidad angular y fuerzas residuales de la mano. Sacudir sigue separando las mismas piezas.

Rueda abajo acerca y arriba aleja por defecto. Configuración → Juego añade dos inversiones independientes: distancia y giro (Shift + WASD y rueda de previsualización), con guardar/descartar/restaurar. Las acciones de mando/teclas «Acercar» y «Alejar» conservan su significado.

Verificación: **757/757 pruebas Node aprobadas**, sin omisiones ni fallos; sintaxis de game/preferences/settings y `git diff --check` correctos. Casos nuevos de previsualización sin cuerpos, colocación exacta, obstáculos y mesa, tres tipos de encaje con físicas reales, giro, cancelación, atajos, permiso de puzzle, agarre centrado, masa/rebote e inversiones persistidas. GLES: 27 escenas, shaders y buffers sin errores; inspección de vista azul y encaje. Chromium instalado no logra iniciar: no se afirma una partida visual de navegador. Microprueba con 180 cubos y esquina de 41 piezas: ~1,14 ms por actualización de preview en este entorno, limitada a 30 Hz y recalculada al confirmar; no representa los FPS del jugador.

Siguiente paso: el jugador debe probar una recta, una esquina con Shift y un brazo sobre mesa; ajustar únicamente la comodidad si sus montajes reales lo requieren.

## Entrega anterior: acabado de circuito y color de cable — 16 de noviembre de 2026

El cable comparte el acabado fino con halo y el ajuste de grosor de las rutas de los Q-bits. Configuración → Apariencia añade Color del cable eléctrico, independiente del color de trayectoria y guardado por estilo; la vista previa muestra ambos. El color se aplica al tendido, despliegue y vista Alt. Los cables inactivos conservan el color atenuado con terminales rojos.

Nuevos tendidos y cambios de entrada generan giros cardinales sobre suelo/pared; la previsualización, selección y alcance utilizan los mismos puntos, incluyendo todos los giros. Hasta 12 apoyos manuales y 64 puntos generados para admitir sus esquinas. Las partidas existentes conservan exactamente su geometría y longitud hasta que el jugador vuelva a tender el cable. No cambia el consumo ni la conservación de materia.

Se mantiene un buffer y una llamada de dibujo por cable terminado, más un buffer compartido para vista previa/despliegue. El color solo cambia un uniforme; el grosor regenera la geometría en el mismo buffer. Verificación: suite completa **746/746** y, después, **18/18** de interacción incluyendo un caso nuevo de doce apoyos alternados/restauración (**747 casos en total**). Se verifican color con guardar/descartar, longitud cardinal, límites y reutilización de buffers. GLES compiló/enlazó los shaders sin errores y validó seis capturas: niveles 100/50/0 %, Alt, azul y azul ancho; inspección visual de ámbar y azul ancho. Sigue pendiente una partida de navegador: el entorno no inicializa WebGL.

Siguiente paso: probar comodidad y legibilidad del circuito en el banco, especialmente sobre paredes y con máquinas en movimiento.

## Entrega anterior: cables y depósito energético — 16 de noviembre de 2026

Banco de pruebas con cable único sin pérdidas y depósito estático de 12.000 J. Q → Tab → Banco rápido: depósito; cables de 1, 4 y 8 cubos, y reservas de 1/4 m. Clic en salida de batería/máquina, apoyos opcionales en suelo/pared y clic en entrada. Se consume el material real solo al confirmar: hasta ocho cubos, 2 m por unidad de materia contando el trayecto completo. Clic derecho permite incorporar cubos cercanos, cambiar entrada o recuperar las mismas piezas con su carga. Alt muestra la red interna; Alt + X separa. Manual: [CABLES_ENERGIA_QBITS.md](CABLES_ENERGIA_QBITS.md).

La red comparte y deduplica fuentes entre mecanismos físicamente independientes. No suma masa ni crea juntas; una fuente activa agotada detiene el consumo externo sin sustituirlo por las reservas internas. Un cable corto, obstruido o con extremo ausente queda inactivo y conserva material. Acercar la máquina o añadir cubos recupera el alcance; sin fuente externa el rotor conserva su comportamiento previo de batería interna. Los depósitos se encienden con clic derecho; recarga manual instantánea solo apagados, en el banco. Se admiten doce depósitos y 128 cables. Guardar/restaurar el laboratorio conserva energía, material e IDs; la red se restaura antes de reactivar motores con reservas internas vacías.

El contenedor adjunto se redujo de 215.382 caras a 6.257 triángulos del modelo más 128 para líquido, en un módulo de ~135 KB. Vidrio separado, altura nominal 1,90 m y líquido que baja con la reserva. Geometría compartida entre depósitos; una malla de cinta por cable terminado, actualizada solo al cambiar el recorrido y liberada al retirarlo. Ningún cuerpo físico por segmento. Grafo eléctrico cacheado por paso físico; una revisión detectó y eliminó recorridos redundantes de conectividad en el dibujo de extremos. La microprueba CPU de 128 cables pasó de ~83,4 a ~0,67 ms para esa consulta concreta; no es una medición de FPS del juego completo.

Verificado: **742/742 pruebas automatizadas aprobadas**, incluidas 26 de red/interacción: ramas y ciclos, varias fuentes, consumo exacto de rotor/cinta/agarre, hélice con depósito grande, límites/obstáculos, cancelación, ampliación, recuperación atómica, guardado entre escenas, Q y Alt remapeado, buffers y ausencia de masa añadida. Sintaxis y diff limpios. `python3 tests/validate-power-gles.py` compiló dos shaders y enlazó un programa con cero errores GLES/buffers; inspeccionadas capturas 100/50/0 % y Alt con líquido y cable visibles. El navegador de prueba abrió la vista local pero no pudo iniciar WebGL: los controles se verificaron con DOM/Cannon simulados, no en una partida visual de navegador.

Siguiente paso: prueba del jugador de comodidad al tender sobre paredes, legibilidad de extremos y duración práctica bajo su instalación. Compra/fabricación y disponibilidad en campaña quedan para el diseño económico; este bloque es funcional en el banco y no añade misiones ni precios.

## Forma de trabajo acordada

Implementar por bloques pequeños, jugables y publicados en GitHub. Este archivo concentra el contexto operativo; el prompt maestro conserva el diseño completo. Cada entrega debe actualizar ambos cuando cambie una decisión, indicar pruebas reales y dejar un siguiente paso concreto. No convertir todo el diseño futuro en una única modificación difícil de revisar.

La revisión de experiencia y equilibrio se hará cuando el usuario pruebe las misiones; las comprobaciones de lógica, físicas e inventario deben completarse en cada entrega. Tras registrar la dirección futura el 14 de noviembre, el usuario autorizó un último bloque de integración y síntesis de lo existente, con atención a lógica y errores. Ese cierre corrige continuidad entre sistemas; las nuevas etapas y el giro narrativo siguen como diseño pendiente.

## Bloques

| Bloque | Alcance | Estado |
| --- | --- | --- |
| I–II | Prólogo y niveles 1–12: movimiento, uniones, formas, fuentes, transporte y equipo | Implementado |
| III | Niveles 13–15: división, subdivisión, recomposición, catálogo y dos planos | Integrado en main mediante PR #1 |
| IV | Niveles 16–18: rotor, esfuerzo, transporte físico autónomo y certificaciones de torque | Integrado en main mediante PR #2 |
| V | Niveles 19–20: dosificación y primer encargo de seis paquetes | Integrado en main mediante PR #3 |
| Taller y sensor | Dispositivo de contacto, investigación pagada y calibraciones de batería/masa/movimiento | Implementado y verificado: 256 pruebas completas |
| Integración | Continuidad de sensores, enfriadores con baterías mejoradas y reinicio de lotes con material tomado | Implementado y verificado: 263 pruebas completas |
| Chasis articulados | Unión con Shift de rotores completos a un cuerpo común, conservando cada eje | Corregido; prueba de lingote con cuatro rotores y cuatro ruedas |
| Campaña amplia | Alrededor de diez misiones grandes en galpones, después de enseñar las mecánicas y materiales necesarios | Dirección registrada; sin etapas ni numeración definitivas |
| Giro narrativo | Cooperación manipulada para producir cubos, explotación revelada y fuga final | Solo registro de diseño; sin cambios de diálogos, IA o etapas |
| Posjuego | Desafíos posteriores, mejores marcas y progresión de coordinación | Pendiente |

## Decisiones que deben conservarse

- Tres geometrías: cubo → seis pirámides → doce tetraedros. La subdivisión termina ahí. El enganche es una pieza mecánica especializada.
- La materia conserva masa, origen, nombre y energía ponderada; dividir no multiplica fuerza de trabajo.
- El catálogo registra conocimiento y guarda planos que requieren piezas existentes.
- El NPC se presenta al principio curioso, cómplice y moderadamente satírico. Su lealtad y conocimiento real del plan quedan abiertos. Sus explicaciones importantes avanzan a petición del jugador.
- La autonomía exige trabajo productivo. Manipular piezas o cambiar órdenes/configuración reinicia la prueba; caminar y mirar no. Pausa y pestaña oculta congelan el tiempo.
- Torque I/II/III es una selección explícita con límites provisionales de 0,40/0,65/1,00 N·m. No aumenta automáticamente el ajuste de un mecanismo existente. La energía sigue calculándose físicamente.
- Los ejercicios comparables fijan equipamiento. El banco de pruebas mantiene el rango libre hasta 4 N·m.
- El taller añade estructura ligera con reserva de materia ligada a cada pieza y contrapartidas de agarre/carga. La coordinación avanzada sigue pendiente. Las correcciones de choques y rutas nunca se bloquean detrás de progreso.
- Potencia disipada no equivale a temperatura: todavía no existe un modelo temporal de sobrecalentamiento.
- Los materiales A/B son recursos inertes, separados del equipo Q-bit. Dos medias unidades forman un paquete conservando identidades y masa.
- Cada pedido utiliza una reserva finita. Reiniciar prepara un único lote de prueba y elimina sus entregas previas. El reloj no premia esperar ante una salida obstruida.

## Verificación y límites

El bloque III tiene pruebas de conservación, entradas inválidas, pausa, salida obstruida, recomposición, planos y controles E/clic/J/Esc. La suite usa el juego real y Cannon con DOM/GPU simulados. No sustituye una partida con navegador.

La prueba visual local quedó bloqueada al iniciar Chromium por restricción de sockets; el navegador remoto no accedió a localhost. No hay evidencia de legibilidad ni equilibrio final con jugador. No repetir esas mismas tentativas sin un cambio de entorno.

El bloque IV añade doce pruebas de autonomía, entrega física, consumo, recuperación, certificaciones y restricciones. Al cerrar el bloque IV, la suite pasó **203 pruebas**, incluyendo los niveles y la carga de módulos disponibles entonces. Los comandos de comprobación de sintaxis y `git diff --check` también pasan. El catálogo tenía seis descubrimientos y dos blueprints al cerrar ese bloque.

El bloque V añade dos misiones, dos fichas de catálogo y controles de lote. Al cerrar ese bloque, la suite pasó **220 pruebas**, incluidas cinco de inventario y once de integración de producción. Las soluciones físicas de referencia entregan tres unidades en ~17,07 s con 7,19 J, y seis paquetes en ~41,42 s con 26,11 J. El catálogo contiene ahora ocho descubrimientos y dos blueprints. El detalle está en `REVISION_BLOQUE_V.md`.

La autonomía de estos pedidos suma segundos de trabajo útil dentro del mismo intento sin intervención; las esperas no suman. La materia conserva masa e IDs entre reserva, línea, cámara y recepción. Las partidas visuales y el equilibrio con jugador siguen pendientes.

## Ampliación transversal acordada

El usuario pidió un dispositivo de contacto preparado a partir de un Q-bit/T-bit existente, conectado por su punta a un rotor para invertir el giro al tocar una pared. No introduce una especie nueva. El taller tiene niveles y la investigación cuesta créditos de primeras finalizaciones. Las mejoras de batería, peso y movimiento tienen efectos y contrapartidas reales; la aplicación de una investigación no vuelve a cobrarse en cada escena. No se promete una duración concreta sin pruebas con jugador.

Mantener la identidad y las reservas al unir/separar, impedir clonación de mejoras/reservas y conservar los julios al cambiar batería. Las misiones certificadas conservan sus restricciones. El trabajo pendiente sobre otros comportamientos de Q-bits requiere especificaciones futuras del usuario.

El taller está disponible en el banco de pruebas: apuntar a la mesa y pulsar E. El sensor se conecta desde su menú de clic derecho y necesita que su cara activa toque una pared a menos de 3 m del rotor. Varios sensores del mismo rotor comparten una sola señal hasta que todos se separan. La investigación se guarda en el navegador; las adaptaciones se conservan al recuperar la escena del laboratorio, pero deben retirarse antes de exportar una plantilla de mecanismo.

Al cerrar el taller pasaron **256 pruebas, sin fallos**: ocho del modelo de taller, nueve de integración de mesa/guardado, ocho de contactos, nueve de baterías y dos nuevas comprobaciones de carga, además de las 220 anteriores. Incluyen colisiones reales de cubos y triángulos, inversión física de un eje apoyado en el suelo, contactos escalonados, borrado de enlaces, conservación de energía/materia y compras únicas. Ver `REVISION_TALLER_SENSOR.md`.

El cierre de integración conserva el bloqueo de contacto en las instantáneas del laboratorio y lo restaura al volver desde campaña o puzzle: cambiar de escena no crea otra pulsación. El enfriador mantiene su porcentaje de salida y tarda ×1/×1,5/×2 para baterías de 20/30/40 J, con espera correcta en el HUD. El reinicio interno del lote libera la materia sujeta antes de retirar sus cuerpos y conserva los agarres ajenos; el menú ya soltaba la mano. La suite completa pasa **263 pruebas, sin fallos**, con siete regresiones nuevas; sintaxis y `git diff --check` aprobados. La [síntesis de integración](SINTESIS_INTEGRACION.md) es la referencia compacta para estado, verificación y recuperación. Sigue pendiente la evaluación visual y de equilibrio con jugador.

## Dirección futura: misiones grandes en galpones

Después de presentar y comprobar todas las mecánicas, elementos y materiales que esos encargos utilizarán, la campaña debería pasar a unas diez misiones grandes. Sus salas serán galpones tipo banco de pruebas, posiblemente más largos, con varias máquinas que el jugador deba poner en funcionamiento mediante mecanismos y automatización. La dificultad debe estar en organizar la instalación y coordinar el trabajo, sin depender del laberinto habitual de puertas.

Es una dirección de diseño, no diez etapas creadas ni un compromiso de duración. La cantidad es aproximada; quedan abiertos numeración, dimensiones, máquinas, pedidos y criterios de éxito. Los antiguos niveles propuestos 21–24 quedan como temas reutilizables, sin fijar el cierre en el 24 ni sumarse automáticamente a las diez misiones. El detalle está en [el prompt maestro](PROMPT_MAESTRO_CAMPANA.md#misiones-grandes-en-galpones).

## Giro narrativo registrado — spoilers

Los cubos habrían aprovechado la simpatía y cooperación del jugador para recuperar la producción de más cubos: hacía mucho que no llegaba una entidad con la capacidad de manipulación que necesitaban. En el tramo final, todos o la mayoría revelan intenciones maliciosas y convierten la ayuda en trabajo impuesto. El jugador usa lo aprendido para superar las misiones, romper ese control en la última y salir por una puerta. El cambio debe sentirse en textos, objetivos, trato y una revelación cinematográfica vinculada a las máquinas construidas.

El núcleo queda registrado; el momento del giro, los motivos concretos, aliados, responsabilidad del NPC y escenas siguen abiertos. Las propuestas de indicios y fuga se describen en [el prompt maestro](PROMPT_MAESTRO_CAMPANA.md#giro-narrativo-y-fuga). Mantener la conservación de materia y las capacidades actuales de los cubos: producir compañeros usa materia externa, los paquetes actuales son inertes y la hostilidad no equivale a alterar arbitrariamente emociones o físicas. Las referencias Portal y The Stanley Parable orientan la sorpresa, sin copiar su guion. No implementar todavía este arco.

## Al retomar

Corrección del montaje de chasis: el agarre de un rotor recoge dos cuerpos y la regla antigua bloqueaba toda unión si había más de un cuerpo sujeto. Ahora un componente conectado completo puede ajustarse y soldarse por una cara compatible, transformando sus cuerpos juntos; la unión rígida afecta solo al cuerpo de contacto. Se mantienen los ejes independientes, las comprobaciones de espacio de todo el conjunto y el rechazo de ciclos rígidos y selecciones inconexas. La previsualización magnética guía todas las mitades. No se elevan automáticamente los límites de carga ni de agarre.

Se añadieron siete regresiones con juego real y Cannon: montaje por agarre/Shift de cuatro rotores en un lingote de 14 Q-bits; cuatro ruedas de cinco piezas impulsando el chasis (38 piezas en total); guardado/copia/recuperación de sus cuatro articulaciones; traslado de un chasis articulado para otra unión; obstáculo en la mitad remota; selección inconexa/ciclo; previsualización y reversión de una punta rechazada. La suite completa pasa **270 pruebas**. Son pruebas de lógica y simulación, no una partida visual en navegador. La siguiente revisión del jugador debe comprobar comodidad del montaje, selección del enganche y ajustes de carga/torque de su vehículo.

Primero recoger las pruebas del jugador sobre lo existente y revisar qué capacidades ya funcionan y cuáles necesitan correcciones o una enseñanza breve. Después se podrá estudiar, en el banco, una instalación con varias máquinas conectadas y al menos dos soluciones físicas verificables. Aprovechar dosificación, transformación, transporte, empaquetado y sensor existentes; no introducir piezas nuevas solo para llenar misiones.

No construir todavía los galpones ni sus etapas definitivas, ni reescribir los diálogos actuales. La temperatura requiere implementar y comprobar un modelo temporal antes de convertirse en requisito. La reactivación puede ser el objetivo aparente del plan de los cubos; el cierre narrativo ahora es la liberación y fuga del jugador. El posjuego continúa pendiente y deberá respetar esa salida.


## Apertura y menú — 15 de noviembre de 2026

Nuevo flujo: cubo de vidrio sobre negro y relleno blanco de 0–100 % → «Comenzar» → cubos formando cada punto del título Q-bits → resplandor → una espiral descendente sin balanceo → menú. La campaña empieza únicamente con «Comenzar campaña». Los accesos a niveles, banco, catálogo y música se conservan; continuar sigue disponible cuando existe una sesión de campaña iniciada.

El porcentaje es una presentación temporizada solicitada por el usuario, con pausas y avances irregulares; el 100 % queda condicionado a la carga real de escena, dependencias, fuentes y música. Fallos conservan el reintento. La cinemática tiene su propio renderizador, sin modificar los cuerpos, inventario ni guardados del juego.

Esta entrega se concentra en la apertura. El pack de pulido discutido (diálogos manuales en todos los tramos, subida/bajada de botones, arrastre de selección y colisiones de vidrio) sigue como especificación pendiente; no se presenta como implementado por esta entrega.

Verificación de esta entrega: **290 pruebas automatizadas aprobadas** (`node --test tests/*.test.cjs`), sintaxis y `git diff --check`. La comprobación `python3 tests/validate-opening-gles.py` ejecuta el renderizador real con captura/reproducción de órdenes GLES: seis shaders y tres programas compilados/enlazados, cero errores, 69/69 cubos colocados, cara del cubo cubriendo toda la pantalla al terminar el vuelo (el menú DOM empieza a revelarse cuando la cara blanca ocupa casi toda la vista). La revisión original incluyó nueve cuadros en 1280×720 y 390×844; esta revisión vuelve a capturar carga, formación, título, picada y blanco en ambos formatos. Incluye regresiones de profundidad entre cuadros y límites de atributos de vértices.

El navegador remoto pudo abrir la vista de prueba, pero no crear un contexto WebGL; por ello estas capturas GLES no se presentan como reproducción completa en navegador. Queda revisar la suavidad y duración subjetiva de la secuencia en el dispositivo del jugador. La carga sortea porcentajes y duraciones de pausa en cada inicio (aproximadamente 2,4–4,2 s, además de cualquier espera por recursos reales). La formación tarda 21,27 s con los 69 cubos; la cinemática completa dura unos 34 s con un único vuelo en espiral de 9,5 s y revelado de menú de 1,2 s solapado con la llegada; la preferencia de movimiento reducido conserva la formación con cámara cenital y salida más breve.

Refinamiento de apertura: movimiento por cuartos de vuelta sobre aristas, rutas cardinales A* con reserva del paso y cesión temporal de sitio cuando otra pieza queda bloqueada. La simulación usa pasos fijos y completa 69/69 destinos a 30, 60 y 120 FPS. Las líneas representan rutas pendientes, sin círculos. Se eliminó la órbita anterior a la picada. La música sigue al menú sin reiniciar la pista; «Comenzar campaña» elige la siguiente pista disponible. Estas rutas pertenecen a la escena de presentación; no cambian la física ni las rutas de campaña.

Continuidad de cámara y menú: una espiral descendente de una vuelta, siguiendo la nueva referencia del usuario, con radio decreciente, altura siempre descendente e inclinación lateral exactamente cero. El giro y la aproximación comparten una curva de 9,5 s con salida y llegada suaves. La cámara de formación coincide con el primer punto de la espiral para evitar un salto al despegar. Esta decisión sustituye la inclinación FPV anterior; no hay bank ni oscilación lateral.

El menú conserva su fade in de 1,2 s cuando las cuatro esquinas del 90 % central de la vista intersectan la cara blanca del cubo. El inicio medido cae entre 8,75 y 8,97 s según la proporción de pantalla, solapado con la llegada. La carga simulada breve, el movimiento de cubos, música y prólogo se conservan.

Las pruebas cubren recorrido por cuatro cuadrantes, inclinación lateral cero, radio y altura sin retrocesos, velocidad máxima menor de 9 unidades/s en cuatro proporciones, continuidad, movimiento reducido y aparición condicionada a cobertura. La velocidad máxima medida es 5,29 unidades/s en 16:9 y 7,07 en formato vertical estrecho. Las capturas GLES incluyen tres puntos del arco, acercamiento y llegada; no incluyen composición CSS ni certifican la sensación de movimiento en una partida en navegador.

Prólogo: tras terminar «Hágase la luz», mantener 1,4 s la frase completa, desvanecerla durante 1,2 s, dejar 2,5 s en negro y revelar «Despertar» durante 1,6 s. E/clic solo abre los ojos cuando termina esa aparición. Pausa y pestaña oculta detienen el reloj; reanudar conserva el progreso y reiniciar restablece la secuencia. La prueba automática cubre estas transiciones sin cambiar los otros diálogos.

## Marcadores y configuración — 15 de noviembre de 2026

Configuración independiente desde el menú principal y la pausa, con Apariencia, Rendimiento, Audio, Teclado, Mando y Subtítulos. La edición es un borrador: solo la vista previa cambia hasta pulsar Guardar. Volver con cambios abre Seguir editando / Salir sin guardar / Guardar y salir. Los fallos de almacenamiento dejan el borrador recuperable. La clave `qbits.preferences.v1` conserva colores y efectos por estilo; importa el volumen anterior al estrenar el sistema. Los controles duplicados de música de los menús se trasladan a Audio.

- Flecha hueca sin asta, orientada hacia abajo, sobre cada estructura seleccionada; sigue su posición y flota suavemente. Color compartido con el delineado; animación y marcadores desactivables. Selecciones simples y múltiples, eliminación y deselección respetadas. Las piezas unidas muestran un marcador por estructura.
- Delineado seleccionado de 2,5 px por defecto, ajustable de 1 a 6 px mediante triángulos orientados a cámara (sin depender del soporte de `lineWidth`). Trayectoria con color y grosor independientes.
- Presets Original, PSX, Dithering + neón y Cel shading. Cada estilo conserva dithering, bits por canal, temblor de vértices, deformación afín de textura, bandas de luz, bloom y colores/grosores propios.
- Calidades Rendimiento, Equilibrado y Alta, más Personalizado. Resolución 50–150 %, muestreo 1/1,5/2×, textura procedural 25–400 %, nearest/bilineal/trilineal, anisotropía limitada a la GPU, límite 30/60/120 FPS o frecuencia de pantalla. Resolución y muestreo efectivos se limitan a 4,5 MP y al máximo de textura de la GPU.
- Sombras apagadas, suaves o de silueta definida proyectada al suelo. Alta representa la geometría real de las piezas y cuerpos; no es un mapa de sombras global sobre todas las paredes u objetos.
- Iluminación ajustable: rebote, luz de acento y reflejo especular aproximados. Se identifica explícitamente como simulación, no RTX/ray tracing. VSync se muestra como automático, gestionado por el navegador, sin un interruptor ficticio.
- Vista previa de cubo giratorio, cuarto blanco, flecha y trayectoria. Se dibuja con los shaders y funciones del juego y se copia a su canvas; no cambia físicas, inventario, cámara guardada ni progresión. Se detiene al cerrar y limita la actualización a 30 FPS.
- Bloom separa luces de color del blanco neutro del cuarto. El postproceso se omite y libera sus buffers cuando no se necesitan efectos. Si falla su framebuffer, se mantiene la imagen básica y la vista previa informa de la limitación.

Validación: **300 pruebas Node aprobadas**, incluyendo 10 nuevas de preferencias, UI con DOM simulado, selección, borrado, grosor de trazo y límites de resolución. `python3 tests/validate-focus-gles.py` compila/enlaza los shaders de escena, enfoque y postproceso en GLES real y verifica píxeles de enfoque, cuantización, dithering y bloom sin blanquear el cuarto. Sintaxis y `git diff --check` correctos. Chromium local no inicia por restricción de sockets; estas pruebas no equivalen a una partida visual en navegador. Revisar comodidad, intensidad y rendimiento en la GPU del jugador.

La revisión remota confirmó que Render sirve los archivos nuevos. El navegador remoto no ofrece WebGL y se detiene en la presentación inicial (sin cambios en opening.js), por lo que no certifica una partida ni la pantalla visual. Se comprobó además guardar, seguir editando y guardar otra vez sin cerrar; el formulario se reenlaza al nuevo borrador tras cada guardado. Las pestañas aceptan flechas, Inicio y Fin.


## Pulido visual de configuración y apertura — 15 de noviembre de 2026

- Neón: halo gaussiano continuo en dos pasadas a media resolución, aplicado después de cuantizar el color para conservar una caída suave. Antialiasing en bordes contrastados; PSX y muestreo nearest conservan el acabado pixelado. La trayectoria desvanece su halo hasta cero en los bordes y extremos. Los buffers se reutilizan y se liberan al desactivar los efectos; no se promete un coste nulo en GPU.
- Configuración: cabecera y barra de guardado fuera del área desplazable; solo la lista y vista previa se desplazan. El pie es opaco y el contenido queda recortado antes de sus botones. Se conserva la confirmación al salir con cambios y el guardado por borrador.
- Formación: eliminada la espera global de la Q; los 69 cubos ya avanzan a los 2 s. Se conserva el planificador de reservas y cesiones, con cero solapamientos de huellas durante la formación y finalización a 30/60/120 FPS. No había dos poblaciones dibujadas: se confirmaron 69 dibujos de cubo tanto durante la formación como en el título; la impresión de tandas provenía de la espera.

Validación conjunta: **303 pruebas Node aprobadas**, sintaxis y `git diff --check` correctos. GLES real: siete shaders y cuatro programas de escena/enfoque/postproceso, halo continuo, bordes suavizados y cuarto blanco preservado; apertura con seis shaders, tres programas y trece capturas por resolución en 960×540 y 390×844. Capturas de formación, título, espiral y muestras de neón inspeccionadas visualmente.

La prueba visual de interfaz en navegador utilizó `tests/settings-layout.html`: carga el marcado, CSS y controlador reales sin exigir WebGL y guarda en memoria, sin tocar preferencias del jugador. Se comprobó desplazamiento hasta el final, ausencia de contenido debajo del pie, confirmación de salida, seguir editando y guardar. La caja de vista previa informa que no renderiza 3D en esa prueba. El navegador remoto no ofrece WebGL: los efectos y la apertura se validaron por separado mediante capturas GLES; no se presenta esto como una partida completa ni una medición de rendimiento en el equipo del jugador.


## Mostrador de selección, controles y subtítulos — 15 de noviembre de 2026

El HUD de escritorio oculta los botones superiores de pausa/pantalla completa y las letras Q/P/N/B. Se conservan los accesos de teclado y los menús. El contador inferior aumenta su cubo y tipografía. La fila superior muestra una miniatura por estructura seleccionada, con geometría real de sus piezas, giro lento, entrada elástica breve y salida inversa. Los gestos reflejan estado, agitación y energía; el hover responde con saludos o petición de descanso con enfriamiento entre frases. Las miniaturas no crean cuerpos físicos ni cambian materia/energía. Canvas2D reutiliza geometría, dibuja a 30 FPS como máximo, presenta hasta ocho miniaturas a la vez y pagina selecciones mayores dentro de los márgenes.

Mantener Tab habilita la selección de miniaturas con mouse o flechas/Enter; clic aísla una estructura y Ctrl-clic la quita de la selección. El acceso se puede reasignar. El desbloqueo temporal del mouse conserva el agarre y la simulación; si el navegador rechaza recapturarlo se conserva la indicación de volver a hacer clic. En mando, mantener L3 abre el mostrador, cruceta recorre y × elige.

Teclado: Clásico WASD, Direccional y Personalizada. Cada acción acepta una tecla o botón de mouse; al duplicar una asignación se intercambia la anterior. Esc conserva la salida de pausa/cancelación. Mando separado: Explorar (agarre □) y Construir (agarre R2), más Personalizada; stick izquierdo camina y derecho mira, con sensibilidad, inversión vertical y zona muerta. Menús con cruceta, × aceptar y ○ volver. Se usa el mapeo estándar Gamepad del navegador; mandos sin él se identifican como no compatibles, sin adivinar botones. Desconexión, pausa, pérdida de foco y captura de asignaciones limpian entradas para evitar controles atascados. Los controles personalizados también cubren modificadores como Alt/Ctrl, volver con la tecla de pausa reasignada y abrir el mostrador/rueda manteniendo ×: en ese caso △ confirma y la ayuda se adapta.

NPC y Q-bits tienen visibilidad, color de texto, tamaño (12–32 px), color y opacidad del contenedor independientes. La muestra de configuración usa el borrador; guardar aplica los cambios. Ocultar texto conserva las opciones y el avance del diálogo. Las preferencias antiguas migran sin perder estilos, volumen ni partidas. Restaurar actúa sobre la pestaña actual.

Verificación de lógica: **343 pruebas Node aprobadas**, sintaxis y `git diff --check` correctos. Incluyen conservación de geometría/energía, selección/eliminación, animación y límite de miniaturas, migración y guardado, captura de asignaciones, cancelación de rueda, pausa, teclado reasignado, movimiento analógico y navegación de menús. Revisión visual en navegador de los componentes reales mediante sus vistas aisladas: miniaturas de cubos/pirámide/estructuras, paginación de 128 selecciones y aislamiento por clic; botones ocultos y contador ampliado; reasignación W→Z, guardado, segundo perfil de mando, subtítulos a 32 px y confirmación al salir. Sin desbordamiento horizontal en escritorio; la lista termina exactamente al comenzar el pie de guardado. Estas vistas no ejecutan una partida WebGL completa. No hay mando PS4 físico en este entorno; la integración se comprueba con entradas Gamepad estándar simuladas. La revisión de comodidad con hardware del jugador sigue pendiente.

## Paneles de cristal — 15 de noviembre de 2026

El selector de piezas sustituye las esquinas cortadas y la trama de bloqueo por contornos redondeados compartidos entre dibujo y selección. Las caras tienen bisel, espesor lateral y labio posterior pulido. El material refracta la imagen real de la sala capturada en GPU: frente esmerilado con desenfoque gaussiano continuo, cantos de mayor desviación y separación cromática sutil. Es una aproximación en espacio de pantalla sobre geometría extruida, no ray tracing. Las figuras y los textos siguen nítidos sobre el cristal; bloqueos, mouse, teclado y mando conservan su comportamiento.

Una captura de la sala y dos texturas pequeñas sirven a todos los paneles. Se reutilizan geometrías y buffers; solo se vuelve a dibujar ante cambios de selección, tamaño, escena o durante el fundido de 240 ms. Cerrar libera las texturas y mallas, conservando los programas compilados. La alternativa CSS mantiene cristal redondeado y selección si no se puede crear el material GPU. Se respetan márgenes y movimiento reducido.

Banco de pruebas, fin de puzle, configuración y confirmación comparten un acabado CSS de vidrio grueso y difuminado, con cantos luminosos. Los HUD libres y las preferencias de subtítulos se conservan. Configuración captura una sola imagen de la sala antes de reutilizar el canvas para su vista previa, evitando un segundo cubo gigante detrás del panel. El área desplazable termina antes de la barra de guardado opaca.

Verificación: capturas de la geometría y compositor reales mediante reproducción GLES en 1280×720 y 390×844, sobre fondos de diagnóstico claros y oscuros. Compilan y enlazan los programas de cristal y desenfoque; sin errores GL, sin alteración del hueco central ni exterior. El contraste de prueba baja de 91,5 a 1,87/5,27 detrás de la cara; la desviación cambia los cantos y deja intacto el centro. Se inspeccionaron las capturas y se corrigió el desenfoque discontinuo de la primera versión. Las 353 pruebas Node pasan y cubren selección, conservación, degradación CSS, liberación y captura única del fondo de configuración. El navegador remoto sigue sin WebGL: las vistas aisladas de interfaz se verifican aparte y no se presentan como una partida completa ni una medición de FPS en el equipo del jugador.

Revisión visual en navegador de los componentes reales: selector abierto/cerrado y piezas bloqueadas sobre fondos claros/oscuros; panel del banco y configuración con esquinas y cantos completos; desplazamiento hasta el final con límite de lista coincidente con el pie (797,39 px), sin desbordamiento horizontal en 1363 px; confirmación, seguir editando y guardar. Se reforzó la placa de lectura local de las etiquetas para conservar contraste sobre piezas oscuras. Estas vistas cargan CSS/controladores reales con fondos de referencia y almacenamiento temporal, sin ejecutar físicas ni la partida WebGL.

## Conjuntos de rotores y límites de prueba — 16 de noviembre de 2026

Primer cambio solicitado tras probar vehículos con sensores: selección precisa con Ctrl + clic o acción T/△, conjuntos lógicos con nombre y menú compartido de marcha, parada, inversión, velocidad, fuerza y carga. Los IDs de articulación distinguen varios rotores soldados al mismo chasis. Los conjuntos no crean nuevas piezas, soldaduras ni baterías compartidas. Iniciar preserva dirección, lado móvil y montaje individuales; invertir multiplica cada sentido por −1. El preflight evita arranques parciales por agotamiento, carga, agarre o montajes fijos incompatibles.

El panel muestra números enteros: velocidad 1–120, fuerza 2–400 (escala torque ×100), carga 2–256. «Varios» conserva ajustes distintos hasta editarlos. Montaje, lado y medidas físicas quedan en Avanzado; solo se modifican con un rotor seleccionado. El clic derecho de un conjunto permite tomar el mecanismo conectado. Los sensores conservan sus enlaces individuales. Un panel de automatización posterior no está implementado.

Los nombres y miembros sobreviven a soldaduras y a recuperación del banco usando endpoints de las piezas. Plantillas, duplicación, exportación e importación remapean los conjuntos a articulaciones nuevas; los archivos antiguos siguen admitidos. Un rotor pertenece a un conjunto; moverlo a otro limpia el anterior. Desconectar retira únicamente ese miembro, elimina conjuntos vacíos y limpia selecciones sin escoger otro eje por accidente. Guardar una plantilla exige un único montaje conectado; conjuntos de máquinas separadas permanecen en la escena.

Límites nuevos: creación 256 piezas; selección inicial 64/máxima 256; agarre inicial 32/máximo 128; carga de rotor inicial 32 en banco/máxima 256; catálogos de formas y mecanismos 64 cada uno; planos y enfriadores simultáneos 12; plazas de enfriador hasta 16. La batería del banco es 40/60/80 J y la de campaña 20/30/40 J: doble autonomía a igual demanda, sin alterar trabajo ni consumo absoluto. Recarga y enfriadores respetan la reserva mayor; taller conserva julios al adaptar. Los ensayos certificados conservan física, batería y progresión. RPM, torque y límites de seguridad física se mantienen.

Verificación: 378 pruebas de lógica/simulación aprobadas, incluidas selección sobre cuatro ejes del mismo chasis, comandos y simulación de veinte rotores, validación de arranque, sensores existentes, persistencia, teclado/mando y baterías. Sintaxis de módulos y `git diff --check` aprobados. Chromium local no pudo crear sockets (`Operation not permitted`): no se presenta esta verificación como partida visual ni como medición de rendimiento en el dispositivo.

Siguiente paso: probar el vehículo del usuario con sus propios sentidos por rueda, comodidad del menú y autonomía ampliada. Recoger la siguiente mejora por separado; automatización colectiva de sensores/paneles sigue pendiente.


## Baterías externas de cristal — 16 de noviembre de 2026

Segundo cambio del jugador: en el banco, convertir 1/2/3 Q-bits normales unidos en línea desde el taller en batería I/II/III, todas disponibles sin investigación. Capacidades 120/240/360 J, carga representada por líquido verde dentro de un recipiente transparente continuo. La conversión conserva IDs, masa, piezas y julios; no rellena la nueva capacidad. La carga se representa como volumen; la actualización de líquido descrita al final mantiene su superficie respecto a la gravedad y añade oscilación visual amortiguada.

La batería se suelda con Shift y se activa explícitamente desde clic derecho o P → Mecanismos. Alimenta todos los rotores de su componente físico, independientemente del conjunto lógico. Suministro agregado por paso y distribuido proporcionalmente entre celdas activas, independiente del orden de motores. Mientras exista fuente externa activa, la reserva interna no se gasta ni se recarga pasivamente. Si se vacía, el motor se detiene sin cambio automático de fuente. Activar/apagar detiene los motores conectados; iniciar sigue siendo una orden explícita. Las baterías apagadas aportan peso, sin alimentar el montaje.

Recarga: 4 J/s por celda, solo batería apagada, montaje quieto y liberado, sin rutas, trabajos ni motores activos; al menos una celda propia del paquete contiguo debe tocar el suelo. Todas las celdas de ese recipiente se recargan (30 s de vacío a lleno), también en orientación vertical. El contacto de chasis/ruedas no basta. Separaciones rompen la continuidad del paquete, aunque los extremos sigan soldados al mismo chasis. Pausa conserva los relojes y energía.

Baterías sin órdenes de equipo, trabajo, reconfiguración, enfriador ordinario o cambios de peso. Volver a cubos normales exige taller detenido y capacidad suficiente para conservar la energía. Guardado/exportación/clonado remapean IDs y paquetes con validación estricta; las nuevas copias nacen vacías y la instantánea de sesión conserva carga. Guardar fragmentos sobre un chasis los divide en tramos contiguos válidos, sin modificar la escena. Metadatos independientes por celda; no se duplican reservas por alias. Campaña y ensayos certificados conservados.

Guía breve permanente en taller, clic derecho y panel P: construir, acoplar, activar, comprobar fuente, arrancar, recargar. Advertencia visible cuando se usan reservas internas. La carga inicial puede ser parcial porque conserva energía; versión II/III conserva el doble/triple de capacidad.

Verificación final: **410 pruebas Node aprobadas**, sin fallos ni omisiones; sintaxis y `git diff --check` correctos. La suite ejecuta lógica y Cannon reales con DOM/GPU simulados. Render validado mediante 15 capturas del shader/dibujos reales en EGL/Mesa: 1/2/3 celdas a 0/25/50/100 %, oclusión frontal y cuerpo negro detrás del vidrio vacío/lleno; cero errores GL y cero líquido verde residual al vaciar. No equivale a una partida visual en navegador, que sigue bloqueado por el entorno. Próximo paso: recoger prueba del jugador de conversión, acoplamiento, autonomía y legibilidad; panel de automatización colectivo y nuevas etapas siguen pendientes.

## Taller visual, cuerpos y organización — 16 de noviembre de 2026

La mesa usa una adaptación ligera del modelo aportado: perfil L, gris claro, banda plomiza y acento verde. Superficie útil 1,40 × 0,80 m a Y=0,60 m, con espacio libre real bajo la tapa. La repisa conserva los quince hexágonos abiertos y la distribución escalonada del otro modelo, sin pestañas ni tornillos. Los 61 segmentos de la repisa y los cinco de la mesa comparten geometría visible y colisiones orientadas. El módulo pesa aproximadamente 3,5 kB; no se cargan los GLB de unos 21 MB durante la partida. [Procedencia, cambios y licencias](FURNITURE_MODELS.md): atribución de cada fuente, CC BY-SA 4.0 limitada a la adaptación geométrica de la repisa.

E mirando la mesa abre un panel de vidrio con Baterías, Mejoras y Cuerpos. Opciones y controles producen un borrador con vista previa; aplicar revalida la pieza y confirma el cambio, manteniendo el resultado sobre la mesa y el panel abierto. Investigaciones y adaptaciones son acciones distintas. La simulación se pausa mientras el panel está abierto. El editor de cuerpos reorganiza un grupo existente de Q-bits normales en dimensiones enteras: volumen igual a la cantidad disponible, huella dentro de la mesa y espacio libre sobre ella. Conserva IDs, masa y energía; rechaza rotores, baterías externas, adaptaciones y grupos en movimiento o trabajando.

Clic derecho en una pared del banco → Organización → Repisa modular inicia una vista previa azul/roja, alineación con repisas vecinas, confirmación por clic/E y cancelación por Esc/clic derecho. Hasta 16 repisas, quince compartimentos cada una y 50 elementos de un mismo tipo por compartimento. Guardar retira de la simulación los objetos reales, incluyendo los componentes mecánicos completos; un mecanismo ocupa un lugar sin convertirlo en una plantilla. Retirar uno, una tanda o todo requiere capacidad y espacio delante de la repisa. La categoría se libera al vaciar el compartimento. Eliminar exige confirmación y anuncia la pérdida de su contenido; cancelar no cambia nada.

La instantánea del laboratorio incluye repisas e inventario, con identidades, energía, articulaciones, ajustes de rotores y conjuntos. Continúa siendo recuperación dentro de la sesión; no se anuncia persistencia completa de la sala entre recargas. El agarre barre el desplazamiento y el giro frente a sólidos próximos y limita el retraso de la mano para evitar acumular tracción detrás de una pared fina; la dinámica libre sigue en Cannon.

Verificación final del bloque: **454 pruebas Node aprobadas, sin fallos ni omisiones; sintaxis y git diff --check correctos. Cinco escenas de muebles y regresiones de enfoque/postproceso en GLES sin errores gráficos**. Las pruebas Node usan DOM/GPU simulados; GLES reproduce los shaders y dibujos reales. La vista aislada `tests/workshop-layout.html` carga marcado, CSS y controlador reales del panel con datos de ejemplo, sin física ni partida WebGL. La revisión visual de ese panel en navegador y una partida completa deben declararse por separado, únicamente cuando existan.

Siguiente paso: comprobar comodidad de construcción, selección y orden con los mecanismos del jugador; conservar la campaña y el alcance posterior ya registrado. Automatización colectiva, galpones y nuevas etapas siguen pendientes.


Revisión visual del panel en navegador a 1363 × 936: pestañas, vista previa, aplicación con confirmación visible, investigación, controles de dimensiones, rechazo de cantidad incompatible, cierre con Escape desde un campo y reapertura. Se usa la vista aislada con datos de ejemplo y el marcado/CSS/controlador reales; no ejecuta una partida WebGL. La revisión amplió el visor y el texto de la vista previa. Las físicas, piezas reales y almacenamiento se verificaron por separado con la suite.


## Líquido de baterías con gravedad — 16 de noviembre de 2026

Las tres baterías usan una superficie libre orientada respecto al suelo. Al girar el recipiente, incluso 90°/180° o con el paquete largo en cualquiera de sus ejes, el líquido ocupa su parte inferior. Se recorta una caja interior cerrada contra un plano y se ajusta la altura para conservar el volumen correspondiente a la carga real. Movimiento, giro y golpes provocan una oscilación amortiguada de hasta 12°; en reposo vuelve al horizonte. Sin partículas, salpicaduras ni un solucionador completo de fluidos.

El estado es exclusivamente visual: no escribe energía, masa, fuerzas, articulaciones ni guardados. Se actualiza una vez por cuadro de simulación después de los subpasos físicos; pausas, paneles y pestaña oculta lo congelan. Saltos grandes y discontinuidades reinician la oscilación. La geometría se reconstruye solo cuando cambian orientación, carga o superficie; los buffers se reutilizan y se liberan al retirar, guardar, separar o limpiar cuerpos. El shader añade brillo y un borde superficial sin desplazar vértices fuera del recipiente.

Verificación: **469 pruebas Node aprobadas, sin fallos ni omisiones**, incluida caída real con Cannon y amortiguación, volumen triangulado y cierre de malla, giros, energía intacta, pausa y ciclo de vida. **25 escenas GLES** de las tres capacidades, cuatro niveles, orientación, impulso/reposo y oclusión; cero errores gráficos. Regresiones de enfoque/postproceso y sintaxis también aprobadas. Inspección visual de capturas reales del renderizador; no es una partida completa en navegador. En este entorno, 20 baterías entre 256 piezas reutilizan todos sus buffers; benchmark de CPU con GPU simulada: mediana 1,63 ms en reposo y 3,00 ms con las 20 moviéndose. No predice los FPS del equipo del jugador.

Siguiente comprobación con jugador: tomar una batería a media carga, girarla con Shift + WASD, desplazarla y soltarla; evaluar la suavidad y legibilidad con sus vehículos. Ajustar amplitud solo si esa prueba lo requiere. Automatización colectiva, galpones y nuevas etapas continúan fuera de este bloque.


## Velocidad de manipulación configurable — 16 de noviembre de 2026

Configuración → Juego incorpora **Velocidad al mover piezas**: Lento (actual, ×1), Normal (×2) y Rápido (×3,5). Preferencia global guardada en el navegador, compartida por teclado/ratón y mando, aplicada a todas las piezas o conjuntos sujetos. Las configuraciones antiguas mantienen ×1. Guardar aplica el cambio; descartar conserva el anterior; Restaurar juego devuelve únicamente este ajuste a Lento. El panel advierte que los choques rápidos pueden lanzar piezas cercanas y recomienda mover con cuidado.

Se multiplican el seguimiento y la velocidad del objetivo de agarre y la respuesta posicional de su unión física, conservando su coeficiente base para no acumular multiplicadores. Solo acelerar el objetivo casi no cambiaba la llegada del cuerpo por el límite de separación de 9 cm. Ahora un recorrido libre de 1,2 m tarda aproximadamente 0,946/0,471/0,267 s con ×1/×2/×3,5 en Cannon; las fuerzas, el techo físico de 6 m/s, el barrido de colisiones, el caminar y el giro conservan sus ajustes. El resultado concreto depende del peso, obstáculos y fuerza de agarre disponibles.

Verificación: **481 pruebas Node aprobadas**, sin fallos ni omisiones; sintaxis y `git diff --check` correctos. Diez nuevas comprobaciones de movimiento real y dos de preferencias/UI cubren llegada de cuerpo y selección de tres, asentamiento, límites de fuerza, retorno a ×1 sin acumulación, piso/panel delgado, liberación bloqueada y conservación del reloj y cuerpos ajenos. Persistencia, migración, descartar y restauración aislada comprobados. La suite ejecuta Cannon real con DOM/GPU simulados; la vista aislada `tests/settings-layout.html?tab=game` permite revisar el menú sin una partida WebGL.

Siguiente comprobación del jugador: elegir Normal, guardar y mover sus vehículos; comparar con Rápido en un espacio despejado antes de organizar piezas cerca de otras.


## Brazo Q-bits y blueprints de mecanismos — 16 de noviembre de 2026

Bloque solicitado a partir del croquis del jugador: base 4×3, cuatro rotores, segmentos de cubos y un cubo adaptado como agarre. Plantilla de **18 cubos + 8 enganches**, sin nuevas geometrías. La batería se acopla después usando el sistema existente. El plano consume piezas reales y conserva identidades, masa y energía; habilita el mecanismo solo después del último encaje. La integración secuencial sustituye las rutas simultáneas que se bloquearon durante la prueba inicial.

Panel en P → Mecanismos: filtro por color, pieza/cuerpo específico, tipo o forma aprendida; giro físico por pasos de 15/45/90°; enseñanza A/B; secuencia esperar → tomar → ir B → soltar → volver A y repetir. La plantilla parte con B a 90°. Agarre corto por restricción física, carga 1–16 u, consumo, bloqueo y agotamiento reales; peso sostenido incluido en los rotores. El cubo conserva su geometría y muestra un marco naranja en su cara activa. El programa conserva posiciones relativas a los enganches, incluso al soldar una batería o restaurar cuerpos.

Formas guardadas separadas en **Formas / Mecanismos**, conservando archivos anteriores. Los catálogos colocan blueprints; duplicación explícita del banco sigue separada. Guardado de montajes, importación/exportación, instantánea del banco y repisas conservan agarre y programa; los brazos se recuperan detenidos y sin carga sujeta. Los cuerpos sólidos que ya fueron levantados conservan su altura/orientación físicas al volver al laboratorio.

Optimización de índices mecánicos por subpaso, geometría de blueprint cacheada y búsqueda de objetivos a 10 Hz. Benchmark de CPU con 256 piezas/20 rotores: −36,8 % detenidos y −54,9 % accionados; estado físico final idéntico con y sin caché. Es una medición con DOM/GPU simulados, no FPS. Guía, comportamiento y método en [BRAZO_QBITS.md](BRAZO_QBITS.md).

Este bloque sustituye el pendiente de un primer panel autónomo del brazo; no implementa un programador universal, galpones ni nuevas misiones. El bloque siguiente incorpora **cintas rectas y esquinas por secciones**; la enseñanza de agarre y posiciones A/B conserva su funcionamiento.

Verificación final: **527 pruebas Node aprobadas, sin fallos ni omisiones**; sintaxis JavaScript y `git diff --check` correctos. **Seis escenas GLES** (incluido cuerpo coloreado elevado a la misma altura que su física), dos shaders/un programa, cero errores gráficos. La revisión adicional corrigió arranque por controles antiguos contra frenos, recuperación de energía durante agarre, incompatibilidad con adaptación de batería y cambios de peso de una carga sujeta. Las pruebas automatizadas no sustituyen una partida visual completa del jugador.


## Cintas modulares y dibujo de estructuras — 16 de noviembre de 2026

Implementados en el banco de pruebas tres blueprints: recta de **18 cubos + 12 enganches**, esquinas izquierda/derecha de **29 cubos + 12 enganches**. Las patas opcionales añaden cuatro cubos recuperables. Cada tramo conserva tres rotores físicos y cuatro cuerpos, sin geometrías de piezas nuevas. La integración consume identidades, masa y energía reales; el controlador y la banda aparecen únicamente al completar el último encaje. Retirar una pieza esencial invalida el mecanismo y retira su superficie física.

Las pruebas de rodillos cuadrados sin banda atrapaban cargas pesadas y en marcha inversa. Se usa la alternativa autorizada de una banda final visible: superficie física continua y tracción tangencial limitada por carga y torque, únicamente sobre contactos reales. No se escriben posiciones de la carga para trasladarla. Rotores a 30 rpm, velocidad basada en su giro real y gasto eléctrico adicional por tracción. Arranque con batería externa activa; parada por agotamiento, sobrecarga, pérdida de apoyo o desmontaje. El tramo debe estar nivelado y físicamente apoyado, también en pisos elevados.

P → Mecanismos y Formas guardadas → Mecanismos: planos, orientación de 90°, altura, patas y prolongación automática según la salida actual del tramo seleccionado. Flechas en el plano anticipan dirección y giro. Las secciones se unen por caras reales al terminar y comparten la alimentación existente, con marcha/sentido independientes. Brazo y cinta comparten correctamente el anclaje al soldar sus chasis; el último control que se apaga devuelve la física dinámica. Se conservan exportación, copias, instantánea del banco y repisas, siempre restaurando los controles detenidos. La mano y la selección consideran la superficie física de la banda; los anclajes de los rodillos no pueden arrastrarla a través de paneles finos.

El contador distingue brazos y cintas de piezas sueltas, conservando todos los componentes en el límite de materia de la sala. Dibujo agrupado cacheado de cubos rígidos: en ocho cintas reales, 240 piezas, las llamadas bajan de 360 a 248 (−31,1 %). La medición de CPU con GPU simulada baja aproximadamente un 31 % en ese escenario; no es una medición de FPS. Caché de superficies sin cambios de física/energía; su mejora de CPU fue pequeña y dentro del ruido, sin atribuirle una aceleración de la simulación. Los buffers se liberan al retirar o reconstruir los cuerpos.

Guía de construcción y límites: [CINTAS_QBITS.md](CINTAS_QBITS.md). La campaña existente queda intacta; los nuevos planos se construyen en el banco. Siguiente paso: probar comodidad de construcción y alimentación con las líneas del jugador. Generador con alcance, coordinación colectiva, galpones y nuevas misiones siguen pendientes.

Verificación final: **597 pruebas Node aprobadas, sin fallos ni omisiones**; sintaxis JavaScript y `git diff --check` correctos. **19 escenas GLES**, dos shaders/un programa, sin errores gráficos ni de buffers, con recta, esquinas, cargas y planos girados/elevados. La comparación del render agrupado conserva los píxeles dentro del margen de cuantización. Pruebas físicas de avance/retroceso, esquinas, sólido coloreado, atasco, batería, apoyos, paso entre tramos, montaje natural, mano contra paneles de 4 mm, conservación y guardado conjunto brazo–cinta. La copia guardada alinea ramas completas y los frenos conservan pivotes/ejes reales sin teletransportar cuerpos. No se certifica una partida completa en navegador; Node utiliza DOM/GPU simulados y GLES reproduce el dibujo real.


## 2026-11-16 — Banco rápido en Q

Nueva pestaña secundaria del selector Q: **Banco rápido**, con tarjetas individuales de vidrio y vistas del montaje, paginadas (12 en escritorio / 6 en formato compacto). Mantener Q, cambiar con Tab, señalar, soltar Q y hacer clic crea una copia completa. Incluye brazo, tres cintas, agarre, baterías I–III, sensor, sólido, enfriador, repisa, acceso al taller y formas/mecanismos guardados; el catálogo se actualiza al cambiar las plantillas. Solo se dibujan las tarjetas visibles.

La creación libre es exclusiva del laboratorio, valida espacio y límite de materia y conserva los componentes físicos. Los motores aparecen detenidos y las baterías de estas copias se cargan expresamente para pruebas, con interruptor apagado. Las plantillas originales, sus piezas y los blueprints no se consumen. Repisa mantiene la confirmación en pared; Mesa abre el taller existente. Campaña y puzzles mantienen sus restricciones.

Verificación: **604 pruebas Node aprobadas**, sin fallos ni omisiones; sintaxis y diff correctos. Reproducción GLES del compositor real con 12 y 6 paneles (1280×720 y 375×667), tres fondos cada uno: refracción, desenfoque y píxeles externos correctos. Se extendió la captura para comprobar la geometría de la cuadrícula. No se completó una partida en navegador: Chromium local no inicia por la restricción de sockets del entorno.


## 2026-11-16 — Consultas de mecanismos como unidades y freno al apagar

Corregido el cuello de botella encontrado al reproducir dos cintas y una esquina: la estabilización de rotores comprobaba pares de piezas exhaustivamente a 240 Hz, incluso con cuerpos dormidos. Ahora filtra primero cuerpos y piezas por sus volúmenes, reutiliza geometría y omite estabilización ya verificada hasta que el cuerpo cambie o despierte. La agrupación rígida existente conserva todas sus piezas, colliders y ejes. Las líneas de selección producen los mismos triángulos con menos asignaciones temporales; gráficos y calidad conservados.

La solicitud adicional cambia el comportamiento de apagado: el rotor conserva el ángulo con un freno angular pasivo dentro de su articulación. Encender libera el freno; detener captura el ángulo alcanzado, también por falta de energía. El conjunto sigue dinámico y transportable, con consumo del motor cero cuando está apagado. Se conservan los frenos del brazo y sus posiciones A/B.

Medición contra `bc1324b`, con todos los mecanismos seleccionados: CPU por cuadro simulado baja 40,94 → 8,78 ms con 101 piezas detenidas (−78,5 %); 53,22 → 19,62 ms con 107 piezas, baterías y cargas en marcha (−63,1 %); 94,01 → 18,55 ms con 240 piezas detenidas (−80,3 %). La escena accionada conserva exactamente posiciones, orientaciones y energía. Son mediciones Node/Cannon con DOM/GPU simulados, no FPS en el PC del jugador. Los rodillos detenidos sí cambian de respuesta porque ahora tienen freno.

Verificación: 610 pruebas completas + una adicional de equivalencia visual de vértices, todas aprobadas; carga de recursos, sintaxis y diff correctos. 19 escenas GLES, dos shaders/un programa y cero errores GL; brazo/esquina inspeccionados. Sin partida de navegador ni promesa de capacidad ilimitada. Se conserva el límite de 256 piezas. Método, números, alcance y siguiente comprobación en [RENDIMIENTO_MECANISMOS.md](RENDIMIENTO_MECANISMOS.md).


## 2026-11-16 — Unidades de todos los tipos, sacudida y esquinas

Extendida la optimización a colocación y agarre de todos los conjuntos rígidos, con dimensiones rotadas cacheadas, expansión de piezas solo cerca de obstáculos e intervalos SAT reutilizados durante el barrido. Render por material para cubos, ambos T-bits y las dos terminaciones del enganche; líneas agrupadas sin alterar geometría ni calidad. Baterías/líquido y marcas dinámicas mantienen sus pases; no se colapsan articulaciones ni colliders exactos.

Shift + sacudida recupera todas las piezas de un mecanismo conectado, incluso si se toma un rodillo/punta. Conserva identidad, forma, masa, energía y adaptaciones, mantiene la pieza tomada en la mano y retira motores, controladores, bandas y buffers. Mantiene la protección contra giros normales; selecciones de conjuntos independientes no se desarman juntas.

Corregida la vibración/penetración de ambas esquinas contra paneles: cada anclaje considera todo el material sostenido, además de la banda. Creación rápida con descarte previo de posiciones ocupadas y validación de la superficie final, con retirada completa si falla.

Contra la entrega `3264913`, CPU al mover esquina con 101 piezas: 35,64 → 19,42 ms/cuadro simulado (−45,5 %); brazo con 127 piezas: −27,8 %; esquina contra panel: −33,1 %, todavía costosa. Con 192 piezas mixtas, llamadas de dibujo 583 → 211 (−63,8 %); no se atribuye una mejora concluyente de CPU en reposo. Gráficos, física precisa y límite de 256 conservados. Detalles y datos reproducibles en `docs/RENDIMIENTO_MECANISMOS.md`.

Verificación: 628 pruebas distintas aprobadas, 21 escenas GLES sin errores y comparación gráfica de cubos/mixtos/líneas. El transporte activo conserva exactamente física y energía frente a la entrega anterior. Son pruebas automatizadas de lógica/render real con DOM/GPU simulados y reproducción GLES, no una partida completa en navegador. Siguiente paso: comprobar la instalación del jugador en su equipo, especialmente contacto sostenido y piezas sueltas después de sacudir.


## Última entrega — estructuras grandes y reposo físico (16 de noviembre)

Los cubos contiguos forman colliders rectangulares exactos sin rellenar huecos; sensores, formas convexas y articulaciones conservan sus contactos propios. Todas las formas se incorporan antes de recalcular masa y radio, evitando el costo cuadrático de construir cuerpos grandes. Se conservan piezas, energía, adaptaciones, guardado y sacudida.

El encaje de bloques reutiliza dimensiones por orientación y valida candidatos en orden. La confirmación filtra parejas geométricas y caras lejanas, y vuelve a validar obstáculos. En la comparación contra `050660f`, unir dos placas de 96 cubos baja de 74,26 a 6,81 ms CPU; añadir una pieza a 192 cubos, de 36,04 a 4,61 ms. Crear un sólido mixto de 192 piezas baja de 39,64 a 11,67 ms. Datos y límites en `docs/RENDIMIENTO_MECANISMOS.md` y `docs/benchmarks/large-assemblies-20261116.json`.

Corregido el desplazamiento de soportes dormidos por el corrector de bisagras. Un despertar real se propaga por todo el mecanismo. El brazo detenido usa sus bisagras frenadas, sin el bloqueo redundante que generaba vibración: cinco cuerpos en reposo y cero desplazamiento en diez segundos medidos, frente a 8,61 mm antes. Sigue moviéndose al recibir un impulso; no se aumenta fricción ni se ancla el conjunto al suelo.

Verificación: 639 pruebas completas aprobadas y 21 escenas GLES sin errores. Gráficos y pasos físicos conservados. Son pruebas de lógica/Cannon y reproducción de render; no una partida en navegador ni una garantía de FPS en el equipo del usuario. Esta entrega sustituye la antigua correspondencia «una pieza = un collider» y la afirmación de trayectoria física idéntica entre versiones; la geometría y conservación se mantienen.

Siguiente paso: verificar la construcción real del jugador, especialmente el contacto sostenido al sujetar mecanismos y el costo de GPU. Si persiste un bajón, medir por separado física, interacción y dibujo en esa escena antes de ampliar el límite de materia. No quedan pendientes de implementación de esta entrega; la expansión de campaña y automatización sigue fuera de este bloque.

## Última entrega — voz del guía y acceso rápido a Despertar (16 de noviembre)

Preparada exclusivamente la voz del guía: `assets/audio/dialogue/guide/voice.json` admite dos bases (`blip_01.wav`, `blip_02.wav`), cuatro variantes (`blip_03.wav` a `blip_06.wav`) y tres finales opcionales (`end_01.wav` a `end_03.wav`). La selección depende de la palabra: 1–3 letras usa 01/02, 4–6 usa 03/04, 7–9 usa 05 y 10 o más usa 06. La variante se conserva dentro de la palabra; si falta se recurre a una base disponible. Se elige un solo final, sin repetición inmediata cuando hay más de uno disponible. Basta un blip; los clips faltantes o inválidos se omiten sin bloquear el inicio. El usuario incorporó las nueve grabaciones del guía en `19a33f5`; se conservan sin modificación. `audio-source/dialogue/guide/` conserva originales y no se carga durante el juego. Las burbujas del equipo y la invocación misteriosa permanecen sin voz.

Motor Web Audio con una carga/decodificación por sesión, muestras cortas reutilizadas, variación de ±0,65 semitonos, pausa en puntuación y límite de frecuencia/fuentes. La aparición real de caracteres activa cada blip; no hay un reloj de audio independiente ni ráfagas para recuperar letras atrasadas. Saltar texto, pausar, ocultar la pestaña o cambiar escena cancela el sonido. El remate solo corresponde al final natural de la escritura. `dialogue-timing.js` prepara una secuencia determinista con velocidad por longitud de palabra, aceleración suave y pausas según puntuación, usando el mismo reloj pausable. Sustituye la cadencia fija de 34 caracteres/s; completar la frase sigue siendo inmediato. Configuración → Audio guarda activación y volumen del guía por separado de la música. El desbloqueo ocurre dentro de un gesto del jugador.

La tecla **º / Backquote** permite llegar a **Despertar** desde carga, cinemática, menú principal o invocación inicial. Espera los recursos reales si aún no están listos; cancela la presentación y deja el botón habilitado, con ojos cerrados hasta E/clic. Conserva el inicio normal y el progreso guardado; no reinicia el prólogo ya jugable, el banco ni niveles activos. No responde al escribir, editar controles, mantener la tecla ni usar Ctrl/Alt/Meta.

Verificación actualizada: **657 pruebas Node aprobadas, sin fallos ni omisiones**, incluyendo selección por longitud, estabilidad de la variante dentro de una palabra, reemplazo por bases disponibles, tres finales, ritmo de puntuación, Unicode, audio con contextos simulados, cancelación, despertar y carga/cinemática. Sintaxis JavaScript, `git diff --check` y `validate-focus-gles.py` correctos. Estas comprobaciones no certifican audio real ni una partida visual en navegador. El banco del guía ya fue subido en `19a33f5`; el ajuste de carácter y volumen se realiza escuchando los clips reales.


## Última entrega — pisadas espaciales de los Q-bits (16 de noviembre)

Preparado `assets/audio/footsteps/qbits/` con manifiesto para `step_01.wav` a `step_08.wav` y guía de exportación. Son ocho variantes equivalentes de un impacto; no hay archivos de sonido inventados ni sustitutos. Originales opcionales en `audio-source/footsteps/qbits/`, fuera de la carga del juego. Los WAV del guía subidos en `19a33f5` quedan intactos.

`footsteps.js` carga y decodifica el banco una sola vez por sesión, sin bloquear el inicio. Comparte el contexto Web Audio del guía, con mezclador y preferencias propios. Rechaza archivos de más de 512 KiB o 2 s y reproduce hasta 450 ms por impacto con envolvente suave. Omite clips faltantes y evita repetición inmediata. Configuración → Audio permite activación y volumen de pisadas independientes (55 % inicial), guardado y restauración de valores.

El evento corresponde al final real de cada giro sobre una cara. Una estructura soldada emite una pisada por giro, independientemente de cuántas piezas contiene. El equipo de arrastre cuenta 11 cm de desplazamiento horizontal real sobre el suelo; no cuenta estar inmóvil, suspendido, sujetado ni teletransportado. Los trabajadores detenidos no ocupan la prioridad de los que caminan.

Espacialización estéreo respecto de la cámara, con distancia 3D: nivel cercano hasta 1,8 m y atenuación cúbica suave hasta 6 m. Se seleccionan como máximo tres conjuntos cercanos, con histéresis y fundidos de unos 180 ms entre grupos. Presupuesto absoluto de seis fuentes cortas y seis canales reutilizables incluyendo salidas; actualización espacial hasta 20 Hz, sin ordenar toda la población, sin raycasts, convolución, oclusión de paredes ni reverberación. Los conjuntos fuera del rango no crean fuentes de reproducción. Pausa, pestaña oculta y cambio de escena cancelan las colas de sonido; no se acumulan eventos para reproducirlos después.

Verificación: **668 pruebas de lógica/Cannon aprobadas**, incluyendo carga opcional, rango, giro de cámara, prioridad estable, fundidos, límite de recursos, pausa, movimiento real, ajustes y arranque. `python3 tests/validate-focus-gles.py` aprobó compilación, enlace y fixtures de píxeles. Las pruebas de audio usan nodos simulados; no equivalen a una escucha ni a una medición de FPS en el navegador del jugador.

Las ocho pisadas ya fueron subidas por el usuario en `2dd6f3e` y se conservan intactas. Comprobar con sus muestras el volumen relativo a música/guía, los impactos al rodar y el tránsito entre dos equipos con auriculares; ajustar mezcla o alcance si esa escucha lo requiere. No se modifica física, campaña ni guardado de construcciones.


## Última entrega — cuatro variantes de unión de bloques (16 de noviembre)

Preparadas las carpetas `assets/audio/joins/qbits/` y `audio-source/joins/qbits/`, con `joins.json` y guía de exportación para `join_01.wav` a `join_04.wav`. El usuario añadirá los cuatro impactos; son variantes equivalentes válidas para todos los tipos de bloques. La selección evita la repetición inmediata. Los archivos ausentes, inválidos o inaccesibles no impiden jugar ni unir piezas. Grabaciones del guía y pisadas previamente subidas conservadas sin cambios.

Un evento después de confirmar cada unión manual de caras cuadradas/triangulares, enganches de rotor y conjuntos compuestos. Un conjunto grande produce un solo impacto. También suenan el montaje completo de un plano rígido o de mecanismo y el empaquetado físico A+B. La extensión automática de cinta silencia su soldadura interna para no duplicar el evento del montaje. Previsualización, choques, intentos fallidos, aparición de piezas y restauración de guardados no disparan el banco. Un fallo de reproducción no puede revertir una construcción física confirmada.

`join-audio.js` comparte el contexto del guía y la función espacial de las pisadas: estéreo según la cámara, caída suave hasta silencio a 6 m y seguimiento de las colas de sonido hasta 20 Hz. Máximo tres fuentes y 40 ms entre eventos, sin cola de recuperación. Cuatro muestras cargadas/decodificadas una vez, de hasta 512 KiB y 2 s; reproducción limitada a 800 ms con envolvente. Pausa, pestaña oculta y cambio de escena cancelan las fuentes. Configuración → Audio añade Unión de bloques y Volumen de uniones (60 %), guardados y restaurables de forma independiente.

Verificación: **681 pruebas Node de lógica/Cannon aprobadas, cero fallos u omisiones**, incluyendo las familias de caras, unión de 192 piezas, enganches, planos, extensión de cinta sin duplicación, producción, fallo del dispositivo, límites de fuentes, rango, caché y preferencias. `validate-focus-gles.py` aprobó shaders y fixtures de píxeles; sintaxis y diff correctos. Audio y DOM simulados en las pruebas: no es una escucha real ni una certificación de FPS.

Siguiente paso: subir los cuatro `join_*.wav`, recargar la página y escuchar el encaje junto a música, guía y pisadas; ajustar Volumen de uniones según el nivel de las grabaciones. No quedan pendientes de implementación de este bloque.


## Última entrega — brazo utilizable y manual del banco (16 de noviembre)

La revisión del jugador pedía distinguir un fallo del brazo de una falta de instrucciones. Se reprodujo un defecto real al ajustar el hombro ±5°: el montaje vacío demanda aproximadamente 6,55 N·m frente a un motor directo limitado a 4 N·m; los frenos activos además duplicaban las restricciones de la bisagra y hacían caer el extremo. El giro de base, cubierto por las pruebas anteriores, no revelaba el problema.

Corrección: base directa y reducción 3:1 en las otras articulaciones del controlador. El motor conserva su límite de torque, entrega el triple al eje a un tercio de rpm y calcula consumo con las magnitudes del motor, conservando potencia y pérdidas. La reducción se deriva del controlador, funciona con guardados anteriores y desaparece al desmontarlo. Los frenos activos añaden una sola restricción de giro, en lugar de un bloqueo redundante de seis ejes; no se eleva el número de iteraciones del solver ni se cambia la masa.

Al recuperar una articulación, la corrección de su pequeña deriva ahora transforma también toda la rama descendiente del grafo guardado. Antes movía solo los cuerpos ya conectados y podía dejar fuera de tolerancia el siguiente eje, perdiendo el controlador al volver al banco tras ajustar el hombro. Se conservan los umbrales de validez, las identidades, las reservas, las posturas y los controles detenidos.

**P → Manual**, con acceso desde **Guía paso a paso** en el brazo: primera entrega con un cubo en el suelo, toma desde una cinta, baterías, manipulación, rotores, taller, sensor, planos, repisas y recuperación. Versión legible en [MANUAL_BANCO_PRUEBAS.md](MANUAL_BANCO_PRUEBAS.md). Incluye la pausa del panel, la diferencia entre copia rápida y plano, la cara naranja, el alcance real de 1,8 cm, y que unir el brazo a una cinta no enseña A/B. En esa entrega los motores usaban el peso de la red como límite. La programación actual verifica la carga de la pinza.

Controles nuevos: **Comprobar toma** (lectura sin consumo ni agarre, con diagnóstico de alcance, filtro, carga, ocupación, energía y obstáculos); **Ir a A/B · sin tomar** para probar posturas sin sobrescribirlas; paso fino de **5°**. La comprobación conserva los filtros editados aún sin aplicar. Los avisos de sobrecarga identifican eje, peso conectado y límite. Sin Repetir, una entrega termina en B; con Repetir regresa a A y espera.

Verificación: **697 pruebas Node aprobadas, sin fallos ni omisiones**; sintaxis, `git diff --check` y `python3 tests/validate-focus-gles.py` correctos. Las regresiones incluyen ambos sentidos en las cuatro articulaciones, energía, diagnóstico sin efectos, recorrido vacío A/B, recuperación de articulaciones y sobrecarga de brazo/cinta unidos. Un brazo apoyado en una plataforma junto a una cinta detenida, con hombro y muñeca ajustados y A enseñada, recoge un cubo real de la banda y lo entrega a más de 0,65 m sin crear materia. La prueba de unión física a cinta comparte correctamente anclaje y batería.

Las pruebas ejecutan Cannon real con DOM/GPU simulados; no certifican legibilidad, comodidad ni FPS del navegador. Se intentó Chromium en este entorno y no pudo iniciar; no hay partida visual nueva. Siguiente paso: el jugador debe seguir P → Manual, conseguir una entrega en el suelo y luego ajustar A/B con la cinta detenida antes de encender toda la línea.

## Última entrega — hélice modular y vuelo asistido (16 de noviembre)

Añadida la receta **1 enganche + 2 T-bits triangulares**, con dos encajes de punta mediante Shift, reconocimiento geométrico, separación y conservación de identidades, masa y energía. Una punta ocupada por palas no acepta un rotor convencional. El grupo completo funciona como hélice; la pala sola no genera sustentación. Las palas giran visualmente sobre un único cuerpo rígido y se comprueba su volumen de giro; el chasis conserva sus lotes de dibujo. No se suman cuerpos o bisagras por pala.

Control de vuelo compartido para **1–4 hélices** por componente físico, alimentado exclusivamente por baterías externas existentes. Cuenta peso del chasis, baterías, manos, articulaciones y objetos sostenidos; el gasto considera empuje, movimiento y altura. Reserva potencia para motores y agarres conectados. Energía debitada una vez por conjunto, con fuerza proporcional al último resto disponible. Sin energía no hay sustentación. Una quinta hélice, anclaje fijo, montaje sujeto por el jugador, inclinación excesiva u obstrucción impiden volar.

Vuelo asistido: altura 0,15–3 m, velocidad 0–1,2 m/s, rumbo desde la mirada, posición estacionaria y aterrizaje. Sensores montados en la misma estructura invierten el avance al contactar una pared, con un evento por contacto agregado. El agarre usa su sistema real; la carga se despierta junto al portador para no convertirse en un anclaje dormido. Las configuraciones se conservan al guardar/recuperar; los motores regresan detenidos. Guardar en repisa exige detener el vuelo.

Q → Banco rápido incluye **Hélice modular** y **Dron de prueba**, este último con batería I cargada y apagada. El plano de hélice usa las tres piezas existentes. P → Mecanismos → Vuelo muestra carga, energía, rpm, potencia, autonomía y alcance aproximados. P → Manual y `MANUAL_BANCO_PRUEBAS.md` explican la primera prueba, el montaje, los sensores y la carga. No se agrega un cobro de créditos ni se altera la campaña.

Calibración inicial: 0,25 kg/u, techo de empuje de 14,7 N por hélice a nivel del piso, hasta 10 W continuos por celda y pérdida de empuje con altura. El límite de potencia puede reducir el techo mecánico. Una hélice rápida + batería I suma 2,167 u; en el banco mantiene 0,50 m con ~2,95 W y consume ~17,74 J durante sus primeros 5 s, incluido el despegue. Las palas de esa receta pesan 1/12 u; las piezas creadas directamente usan el peso elegido en P. Estos números son del modelo del juego.

Verificación de cierre: **715 pruebas Node aprobadas, cero fallos u omisiones**; sintaxis y `git diff --check` correctos. `validate-focus-gles.py` aprobó shaders y fixtures; `validate-robot-arm-gles.py` reprodujo **24 escenas sin errores GPU**. Se verificaron despegue, altura y aterrizaje con una, dos, tres y cuatro hélices; avance, inversión, agotamiento, agarre con carga real, encaje manual en ambos sentidos, obstrucción, desmontaje, planos, guardado y repisas. Las capturas GLES incluyen la hélice detenida y dos fases de giro, junto a la regresión visual de brazos y cintas. Pruebas de Cannon real y render GLES con DOM simulado: no equivalen a una partida en navegador ni certifican FPS en el equipo del jugador.

Siguiente paso: probar primero el Dron de prueba a 0,5 m y velocidad cero; luego 0,3 m/s y aterrizaje. Después contrastar peso, autonomía y comportamiento de las construcciones del jugador antes de aumentar límites o incorporar misiones de vuelo.

