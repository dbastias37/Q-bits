# Q-bits — síntesis de integración

Fecha: 14 de noviembre de 2026. Base revisada: `c97792c4349571039b2741a25f81ce8b37f587a7`. Este bloque consolida el juego existente y corrige errores entre sistemas. No añade etapas de galpones ni implementa la traición o la fuga.

## Qué está disponible

| Parte | Función actual | Límite importante |
| --- | --- | --- |
| Prólogo y niveles 1–12 | Movimiento, órdenes, presión, uniones, formas, transporte, descanso y fuentes | La experiencia y el ritmo requieren partidas del jugador. |
| Niveles 13–15 | División, subdivisión y recomposición; catálogo y dos planos | Conservan masa, origen y energía; dividir no crea compañeros adicionales por sí solo. |
| Niveles 16–18 | Bancos de rotor, carga y transferencia física autónoma; torque I–III | Equipamiento certificado para mantener comparables los ejercicios. |
| Niveles 19–20 | Dosificación ordenada y seis paquetes A+B con reserva finita y recepción física | Línea montada configurable; todavía no es un editor abierto de fábricas. |
| Banco y taller I–III | Investigación pagada, sensor, batería, estructura ligera y movimiento | Aplicar investigación es gratis; las adaptaciones deben retirarse antes de duplicar o exportar un mecanismo. |
| Guardado | Progreso e investigación en el navegador; instantánea del laboratorio al cambiar de escena | Recuperar la escena durante la sesión no equivale a guardar toda la fábrica entre recargas del navegador. |

El circuito disponible es aprender una regla, probarla, registrarla en el catálogo y combinarla en una prueba mayor. La investigación amplía capacidades; los defectos de física o rutas se corrigen para todos.

## Correcciones de este cierre

| Caso reproducido | Corrección | Verificación |
| --- | --- | --- |
| Un sensor seguía tocando la mesa, se viajaba a otra escena y al regresar invertía nuevamente el rotor sin separarse. | La instantánea conserva estados de contacto por sensor y rotor. Restaurar valida identidades y valores; los registros antiguos sin esos datos siguen siendo compatibles. | Ida y vuelta por campaña y por puzzle independiente, con colisiones reales y posterior separación/recontacto. |
| El mismo ciclo del enfriador terminaba igual de rápido con baterías de 20 y 40 J. El HUD además ignoraba el tiempo propio de algunas estaciones. | Se conserva el porcentaje de salida. La duración escala con capacidad: ×1/×1,5/×2; el indicador usa la espera real mayor del grupo. | Baterías I/II/III con la misma energía inicial y estación mixta con duración particular. |
| La función interna de reinicio podía retirar materia sujeta y dejar su agarre activo si se invocaba sin pasar por el menú. El menú actual ya soltaba la mano. | El reinicio también se protege por sí mismo: suelta las piezas afectadas antes de retirar el lote y limpia sus anclas/uniones. Conserva los agarres ajenos. | Regresiones de la transacción interna con materia tomada y con un compañero ajeno al lote. Es prevención de un estado inválido, no un fallo demostrado del botón actual. |

Se mantienen las invariantes de materia finita, identidades únicas, energía cobrada a baterías, pausa de los relojes y recompensa de investigación una sola vez. Las soluciones de referencia de producción siguen siendo tres unidades ordenadas y seis paquetes completos; nunca se juntan entregas de intentos distintos.

## Recuperación y lectura de los controles

| Situación | Acción disponible |
| --- | --- |
| Lote intervenido, material perdido o receta incorrecta | E en el control → Reiniciar lote. Se descarta el intento anterior y se prepara una sola reserva nueva. |
| Falta un enganche del banco | Reiniciar el nivel desde pausa; un simple reinicio de lote no debe fingir que reconstruyó el mecanismo. |
| Salida o entrada ocupada | La estación espera sin inventar recursos. Si mover piezas invalida el ensayo, preparar el espacio y reiniciar el lote. |
| Sensor no invierte | Revisar enlace, distancia máxima de 3 m, rotor encendido y cara activa orientada a una pared; todos los sensores del rotor deben separarse para rearmar. |
| Batería mejorada muestra menor porcentaje | La adaptación conserva julios, no porcentaje. El enfriador tarda más con una batería de mayor capacidad. |
| La mesa rechaza una adaptación | Dejar y soltar la pieza sobre ella, detener el montaje completo y comprobar investigación. Para reducir batería debe caber la carga actual. |
| El navegador no puede guardar una investigación | El aviso indica que solo queda en la sesión. No se presenta esa compra como guardado duradero. |

## Evidencia y límites

**263 pruebas aprobadas, sin fallos, canceladas ni omitidas.** Las 256 anteriores siguen pasando; se suman tres de continuidad de sensores (incluidos datos inválidos, referencias independientes y compatibilidad antigua), dos de enfriadores y dos de recuperación interna de lotes. Sintaxis de `game.js` y `boot.js`, más `git diff --check`, también aprobados.

Comprobación reproducible desde la raíz del repositorio:

```sh
node --test tests/*.test.cjs
node --check assets/js/game.js
node --check assets/js/boot.js
git diff --check
```

La suite ejecuta el juego y Cannon reales con DOM/GPU simulados. Comprueba lógica, conservación y movimiento físico; no demuestra legibilidad, FPS en el dispositivo, duración de campaña ni equilibrio. No sustituye jugar la versión del navegador. No se vuelven a intentar las pruebas visuales bloqueadas sin un cambio de entorno.

## Lo que sigue registrado para después

Unas diez misiones grandes en galpones, construcción abierta de líneas, coordinación avanzada, temperatura y desafíos posteriores siguen pendientes. El giro de manipulación de los cubos y la fuga final también es diseño documentado. El detalle narrativo contiene spoilers en el [prompt maestro](PROMPT_MAESTRO_CAMPANA.md#giro-narrativo-y-fuga).

Al retomar: revisar primero los errores y sensaciones que reporte el jugador, comprobar las correcciones y luego estudiar una instalación de varias máquinas en el banco. No convertir una propuesta futura en contenido anunciado como disponible. El [estado del proyecto](ESTADO_PROYECTO.md) conserva las decisiones y el punto de continuación.

## Actualización: conjuntos y banco ampliado — 16 de noviembre de 2026

Se agrega selección exacta de ejes con Ctrl + clic/T/△, conjuntos con nombre, arranque/parada/inversión y ajustes comunes de velocidad, fuerza y carga con enteros. La orientación individual se conserva; el arranque valida todos los miembros antes de aplicar la orden. Los conjuntos sobreviven a recuperación del banco y a plantillas/copia/exportación del montaje, con validación retrocompatible. Sensores y automatización colectiva permanecen separados: los sensores existentes siguen controlando sus ejes individuales.

El banco duplica autonomía de batería, creación (256), selección (64 inicial, 256 máximo) y agarre (32 inicial, 128 máximo); carga rotor hasta 256. Catálogos 64 por tipo, planos/enfriadores 12 y plazas de enfriador 16. Campaña certificada conserva sus condiciones; la reserva mayor requiere recarga proporcional.

Suite actual: **378 pruebas aprobadas** de lógica y Cannon con DOM/GPU simulados. Incluye control de veinte rotores y regresiones de energía, persistencia, teclado/mando y selección dentro de un mismo chasis. No se verificó una partida visual: Chromium local continúa bloqueado al crear sockets. Ver [estado vigente](ESTADO_PROYECTO.md) y [controles](../README.md#conjuntos-de-rotores).


## Actualización: baterías externas — 16 de noviembre de 2026

Taller con recipientes de cristal de 1/2/3 Q-bits y capacidades proporcionales, disponibles de inmediato. El verde muestra carga real y desaparece al vaciarse. Conversión conserva materia y energía; recarga al apagar y apoyar el recipiente quieto en el suelo. Acoplamiento con Shift y activación explícita alimentan la red física de rotores; fuente activa vacía detiene el montaje sin consumir reservas internas. El panel P indica la fuente y controla las baterías conectadas. Incluye tutorial breve persistente en los menús.

Persistencia validada: instantánea conserva energía; copias/plantillas nuevas están vacías; IDs y paquetes remapeados, también al separar celdas sobre un mismo chasis. Cubos convertidos quedan fuera de trabajos, reconfiguración y recarga ordinaria. La vuelta a cubos normales en el taller conserva julios o se rechaza si no caben. Las tres versiones pueden reutilizarse sin comprar investigación.

Verificación final: **410 pruebas Node aprobadas**, sin fallos ni omisiones; sintaxis y `git diff --check` correctos. La suite ejecuta lógica y Cannon reales con DOM/GPU simulados. GPU real por EGL/Mesa: 15 escenas, cristal, cuatro alturas de líquido, profundidad delante/detrás, sin errores GL. Son capturas del renderizador, no una partida completa en navegador. Comandos: `node --test tests/*.test.cjs`, `python3 tests/validate-battery-gles.py`, `python3 tests/validate-focus-gles.py`.

## Actualización: taller y organización — 16 de noviembre de 2026

Mesa L y repisa de quince hexágonos adaptadas de los modelos entregados, con sólidos visibles y colliders orientados coincidentes. No se cargan los GLB originales. [Créditos y licencias por modelo](FURNITURE_MODELS.md). E en la mesa abre Baterías, Mejoras y Cuerpos, con vista previa, validación y aplicación explícita. El resultado queda sobre la mesa; cerrar no aplica borradores. Cuerpos reorganiza los Q-bits disponibles conservando volumen, identidad, masa y carga.

Organización desde clic derecho en pared permite instalar hasta 16 repisas. Cada compartimento almacena hasta 50 objetos de un mismo tipo; un montaje conectado cuenta como uno. Guardar suspende los objetos reales y retirar los devuelve delante, conservando piezas, articulaciones y carga. Una retirada bloqueada conserva el inventario. El borrado requiere confirmar la pérdida de contenido. La instantánea del laboratorio conserva repisas y objetos durante la sesión; no añade guardado completo entre recargas. Los [controles y condiciones](../README.md#repisas-y-organización) describen el flujo del jugador.

El agarre comprueba el recorrido de traslación y giro ante mesa, repisas y otros cuerpos para evitar atravesarlos; no sustituye la simulación libre de Cannon. Prueba visual aislada del panel: `tests/workshop-layout.html`; render de muebles: `python3 tests/validate-furniture-gles.py`. La interfaz HTML y la partida completa requieren evidencia separada del replay GLES.

Verificación final del bloque: **454 pruebas Node aprobadas, sin fallos ni omisiones; sintaxis y git diff --check correctos. Cinco escenas de muebles y regresiones de enfoque/postproceso en GLES sin errores gráficos**.


Revisión visual del panel en navegador a 1363 × 936: pestañas, vista previa, aplicación con confirmación visible, investigación, controles de dimensiones, rechazo de cantidad incompatible, cierre con Escape desde un campo y reapertura. Se usa la vista aislada con datos de ejemplo y el marcado/CSS/controlador reales; no ejecuta una partida WebGL. La revisión amplió el visor y el texto de la vista previa. Las físicas, piezas reales y almacenamiento se verificaron por separado con la suite.


## Actualización: líquido con gravedad — 16 de noviembre de 2026

Baterías I–III con líquido que conserva el horizonte mundial y su volumen al inclinar o invertir el recipiente. Movimiento, giro y choque producen una oscilación breve amortiguada, acotada a 12°. Malla interior cerrada, sin partículas y sin cambios a carga o física; buffers persistentes, reconstrucción solo al cambiar la superficie y limpieza al retirar cuerpos. Pausa y menús congelan la animación.

**469 pruebas Node aprobadas** y **25 escenas GLES sin errores**, con volumen triangulado, orientación 90°/180°, caída real, asentamiento, oclusión, conservación de energía y limpieza de recursos. Enfoque/postproceso también aprobado. Capturas inspeccionadas del renderizador; no se afirma una partida completa en navegador. Comprobación del jugador: girar y soltar una batería a media carga para valorar la suavidad en su equipo.
