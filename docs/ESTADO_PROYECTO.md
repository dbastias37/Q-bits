# Q-bits — punto de continuación

Actualizado: 15 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

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

Nuevo flujo: cubo de vidrio sobre negro y relleno blanco de 0–100 % → «Comenzar» → cubos formando cada punto del título Q-bits → resplandor → un solo giro con picada → menú. La campaña empieza únicamente con «Comenzar campaña». Los accesos a niveles, banco, catálogo y música se conservan; continuar sigue disponible cuando existe una sesión de campaña iniciada.

El porcentaje es una presentación temporizada solicitada por el usuario, con pausas y avances irregulares; el 100 % queda condicionado a la carga real de escena, dependencias, fuentes y música. Fallos conservan el reintento. La cinemática tiene su propio renderizador, sin modificar los cuerpos, inventario ni guardados del juego.

Esta entrega se concentra en la apertura. El pack de pulido discutido (diálogos manuales en todos los tramos, subida/bajada de botones, arrastre de selección y colisiones de vidrio) sigue como especificación pendiente; no se presenta como implementado por esta entrega.

Verificación de esta entrega: **290 pruebas automatizadas aprobadas** (`node --test tests/*.test.cjs`), sintaxis y `git diff --check`. La comprobación `python3 tests/validate-opening-gles.py` ejecuta el renderizador real con captura/reproducción de órdenes GLES: seis shaders y tres programas compilados/enlazados, cero errores, 69/69 cubos colocados, cara del cubo cubriendo toda la pantalla al terminar el vuelo (el menú DOM empieza a revelarse cuando la cara blanca ocupa casi toda la vista). La revisión original incluyó nueve cuadros en 1280×720 y 390×844; esta revisión vuelve a capturar carga, formación, título, picada y blanco en ambos formatos. Incluye regresiones de profundidad entre cuadros y límites de atributos de vértices.

El navegador remoto pudo abrir la vista de prueba, pero no crear un contexto WebGL; por ello estas capturas GLES no se presentan como reproducción completa en navegador. Queda revisar la suavidad y duración subjetiva de la secuencia en el dispositivo del jugador. La carga sortea porcentajes y duraciones de pausa en cada inicio (aproximadamente 2,4–4,2 s, además de cualquier espera por recursos reales). La formación tarda unos 26 s con los 69 cubos; la cinemática completa dura unos 33 s con un único planeo de 4 s y revelado de menú de 1,2 s solapado con la llegada; la preferencia de movimiento reducido conserva la formación con cámara cenital y salida más breve.

Refinamiento de apertura: movimiento por cuartos de vuelta sobre aristas, rutas cardinales A* con reserva del paso y cesión temporal de sitio cuando otra pieza queda bloqueada. La simulación usa pasos fijos y completa 69/69 destinos a 30, 60 y 120 FPS. Las líneas representan rutas pendientes, sin círculos. Se eliminó la órbita anterior a la picada. La música sigue al menú sin reiniciar la pista; «Comenzar campaña» elige la siguiente pista disponible. Estas rutas pertenecen a la escena de presentación; no cambian la física ni las rutas de campaña.

Continuidad de cámara y menú: planeo lateral con una única curva de aproximación, sin giro sobre el eje de la cámara ni balanceo alternado. La salida tiene mayor desplazamiento horizontal que vertical, empieza despacio y acelera hacia el cubo, con asentamiento final suave. Duración reducida de 8 a 4 segundos. El menú empieza su fade in de 1,2 s cuando las cuatro esquinas del 90 % central de la vista intersectan la cara blanca del cubo; ya no espera a completar el vuelo. El inicio medido cae aproximadamente entre 3,77 y 3,84 s según la proporción de pantalla. Se mantiene el mismo encuadre al habilitar los botones. La carga simulada conserva las tres pausas aleatorias breves.

Las pruebas cubren salida horizontal, aceleración, ausencia de balanceo, continuidad de proyección en cuatro proporciones, movimiento reducido, aparición condicionada a la cobertura del cubo y duración de carga. Las capturas GLES comprueban acercamiento y llegada, pero no incluyen la composición CSS del menú; sigue pendiente la evaluación perceptual completa en el navegador del jugador.

Prólogo: tras terminar «Hágase la luz», mantener 1,4 s la frase completa, desvanecerla durante 1,2 s, dejar 2,5 s en negro y revelar «Despertar» durante 1,6 s. E/clic solo abre los ojos cuando termina esa aparición. Pausa y pestaña oculta detienen el reloj; reanudar conserva el progreso y reiniciar restablece la secuencia. La prueba automática cubre estas transiciones sin cambiar los otros diálogos.
