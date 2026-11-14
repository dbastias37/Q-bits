# Q-bits — punto de continuación

Actualizado: 14 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

## Forma de trabajo acordada

Implementar por bloques pequeños, jugables y publicados en GitHub. Este archivo concentra el contexto operativo; el prompt maestro conserva el diseño completo. Cada entrega debe actualizar ambos cuando cambie una decisión, indicar pruebas reales y dejar un siguiente paso concreto. No convertir todo el diseño futuro en una única modificación difícil de revisar.

La revisión de experiencia y equilibrio se hará cuando el usuario pruebe las misiones; las comprobaciones de lógica, físicas e inventario deben completarse en cada entrega. Al cerrar la jornada del 14 de noviembre, el usuario indicó que el taller y el sensor serían el último bloque jugable por ahora: esta actualización solo registra la dirección futura. No continuar creando etapas a partir de la autorización anterior para avanzar por bloques.

## Bloques

| Bloque | Alcance | Estado |
| --- | --- | --- |
| I–II | Prólogo y niveles 1–12: movimiento, uniones, formas, fuentes, transporte y equipo | Implementado |
| III | Niveles 13–15: división, subdivisión, recomposición, catálogo y dos planos | Integrado en main mediante PR #1 |
| IV | Niveles 16–18: rotor, esfuerzo, transporte físico autónomo y certificaciones de torque | Integrado en main mediante PR #2 |
| V | Niveles 19–20: dosificación y primer encargo de seis paquetes | Integrado en main mediante PR #3 |
| Taller y sensor | Dispositivo de contacto, investigación pagada y calibraciones de batería/masa/movimiento | Implementado y verificado: 256 pruebas completas |
| Campaña amplia | Alrededor de diez misiones grandes en galpones, después de enseñar las mecánicas y materiales necesarios | Dirección registrada; sin etapas ni numeración definitivas |
| Posjuego | Desafíos posteriores, mejores marcas y progresión de coordinación | Pendiente |

## Decisiones que deben conservarse

- Tres geometrías: cubo → seis pirámides → doce tetraedros. La subdivisión termina ahí. El enganche es una pieza mecánica especializada.
- La materia conserva masa, origen, nombre y energía ponderada; dividir no multiplica fuerza de trabajo.
- El catálogo registra conocimiento y guarda planos que requieren piezas existentes.
- El NPC es curioso, cómplice y moderadamente satírico. Sus explicaciones importantes avanzan a petición del jugador.
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

La suite actual pasa **256 pruebas, sin fallos**: ocho del modelo de taller, nueve de integración de mesa/guardado, ocho de contactos, nueve de baterías y dos nuevas comprobaciones de carga, además de las 220 anteriores. Incluye colisiones reales de cubos y triángulos, inversión física de un eje apoyado en el suelo, contactos escalonados, borrado de enlaces, conservación de energía/materia y compras únicas. Sintaxis y `git diff --check` aprobados. Ver `REVISION_TALLER_SENSOR.md`; sigue pendiente la evaluación visual y de equilibrio con jugador.

## Dirección futura: misiones grandes en galpones

Después de presentar y comprobar todas las mecánicas, elementos y materiales que esos encargos utilizarán, la campaña debería pasar a unas diez misiones grandes. Sus salas serán galpones tipo banco de pruebas, posiblemente más largos, con varias máquinas que el jugador deba poner en funcionamiento mediante mecanismos y automatización. La dificultad debe estar en organizar la instalación y coordinar el trabajo, sin depender del laberinto habitual de puertas.

Es una dirección de diseño, no diez etapas creadas ni un compromiso de duración. La cantidad es aproximada; quedan abiertos numeración, dimensiones, máquinas, pedidos y criterios de éxito. Los antiguos niveles propuestos 21–24 quedan como temas reutilizables, sin fijar el cierre en el 24 ni sumarse automáticamente a las diez misiones. El detalle está en [el prompt maestro](PROMPT_MAESTRO_CAMPANA.md#misiones-grandes-en-galpones).

## Al retomar

Primero recoger las pruebas del jugador sobre lo existente y revisar qué capacidades ya funcionan y cuáles necesitan correcciones o una enseñanza breve. Después se podrá estudiar, en el banco, una instalación con varias máquinas conectadas y al menos dos soluciones físicas verificables. Aprovechar dosificación, transformación, transporte, empaquetado y sensor existentes; no introducir piezas nuevas solo para llenar misiones.

No construir todavía los galpones ni sus etapas definitivas. La temperatura requiere implementar y comprobar un modelo temporal antes de convertirse en requisito. El cierre narrativo de reactivar la instalación y abrir desafíos sigue como intención; su posición se decidirá junto con la campaña amplia. El posjuego continúa pendiente.
