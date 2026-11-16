# Q-bits — punto de continuación

Actualizado: 16 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

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
