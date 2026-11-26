# Enseñanza visual del dron en una partida real

Revisión realizada en Chromium 131.0.6778.0, con WebGL 2 real sobre ANGLE/Vulkan/SwiftShader. Se restaura el checkpoint de la instalación a los **3549,6 s**, con **10 / 80 rotores recibidos**, **137458,185596 J**, 156 cuerpos físicos y los tres drones apoyados. No se construyen piezas, se conceden hitos ni se reposicionan cargas.

## Procedimiento y alcance

El controlador del ensayo sólo instrumenta la cámara y mantiene detenido el reloj automático durante la inspección. La selección del receptor 295 se hace con el rayo de la cámara y clic derecho; la apertura de su panel, la detención del recorrido y los botones de enseñanza usan controles DOM nativos. La muestra es el cubo 521 que ya estaba sobre la mesa.

Durante ocho fotogramas de la recogida se libera además el bloqueo de reloj del ensayo. La pausa propia de la enseñanza permanece activa y conserva el estado físico durante los 1971,3 ms observados. El resto de la inspección conserva el instante inicial para comparar las vistas. Las 11 pruebas de `logistics-ui.tap` comprueban por separado los controles, la pausa y el transporte con Cannon; no certifican el renderizado.

Se confirman una recogida y una entrega con Enter, se rechaza una confirmación inválida y se cancela esa vista previa con clic derecho. Las confirmaciones cambian los puntos de ruta y la configuración del agarre. El receptor inspeccionado queda detenido por la acción normal del panel; los otros dos seguidores conservan su espera en tierra. El checkpoint original no se sobrescribe.

Esta revisión verifica las vistas previas y sus controles, no un vuelo ejecutado en el navegador, una sesión manual completa ni el pedido de ochenta.

## Capturas

| Archivo | Estado observado |
| --- | --- |
| `01-controles-ensenanza.png` | Panel nativo del receptor, recorrido detenido y botones de recogida y entrega disponibles |
| `02-recogida-azul.png` | Seis piezas fantasma azules; cubo 521 al alcance a 2,5 cm |
| `03-recogida-roja.png` | El ajuste con rueda deja 8,5 cm frente a un alcance de 5 cm; motivo visible y confirmación rechazada |
| `04-entrega-azul.png` | Dron y proyección de carga sobre el segundo enfriador; la interfaz identifica la caída como estimada |
| `05-ayuda-b-960.png` | Tableta a 960 × 640 con la receta vigente de B, sin desbordamiento horizontal |
| `before-instruction.png` | Evidencia anterior al ajuste: la vista previa mostraba la instrucción de tomar selección |

La entrega apunta a la superficie existente `(4,04; 0,575; 0,45)`. Es una previsualización calculada con la forma y movimiento de la muestra; no mueve ese cubo ni demuestra una recepción física. Las capturas principales se toman a 1440 × 900.

## Conservación y errores

Las ocho comparaciones después de detener, mostrar azul, rechazar, cancelar, confirmar la toma, mostrar entrega, confirmar la entrega y revisar la tableta conservan exactamente:

- Las poses y masas de los **156 cuerpos**.
- Las **406 piezas activas**, sus IDs, formas, pesos, carga, origen y transformaciones locales.
- El inventario y las poses de las familias, los cargos y todos los registros de producción.
- El tiempo de misión y los **137458,185596 J** de la fuente exterior.

La representación completa de esos campos produce siempre SHA-256 `d2db1ac35dc0f1d5890cb5a22dbc4d7a34b03eb2e854f4fffb48012343cffb69`. `browser.json` conserva cada comprobación, los programas anterior/posteriores, las validaciones y los hashes de código, documento y checkpoint. No hubo advertencias de restauración, excepciones de página, errores de consola ni errores WebGL (`gl.getError() = 0`).

## Ajuste visual comprobado

Durante la enseñanza aparecía la instrucción genérica «tomar selección», aunque el clic guardaba la pose. `updateTarget` ahora presenta la acción de recogida o entrega, guardar, rueda y cancelar; el motivo de una invalidación permanece visible. Una placa clara conserva el contraste de la instrucción y del aviso mientras tienen contenido. El mensaje de alcance emplea «agarre», válido también para un dron, y la entrega mantiene «Caída estimada» en su instrucción persistente. No se modifican las validaciones, las físicas ni las acciones.

La ayuda de B muestra literalmente:

> Primera línea · 8 / 8 tramos · 8 en marcha. Los planos de la segunda cadena indican su propio material.

El estado contiene «Primera línea recuperada · alimenta la recepción del brazo». En estas capturas el guardado conserva antes de esa línea «Asigna un equipo a la fuente». Un ajuste de restauración posterior deriva «Equipo de extracción recuperado · N en turno» cuando hay trabajadores asignados y conserva la ayuda de asignar sólo si no hay equipo; se revisará en la captura final del pedido, sin presentar estas imágenes como prueba de ese texto posterior. El objetivo y su opcional muestran 10 / 80, 60 / 60 s útiles y 3 / 3 recepciones sin bloqueo ni corte.

## Reproducción

Desde la raíz del repositorio, con Playwright disponible:

```sh
QBITS_CHROMIUM=/tmp/galpon-chrome-runtime/chromium node tests/benchmark-galpon-drone-teaching-browser.cjs --checkpoint=docs/mediciones/galpon-b-20261126/drone-teaching/checkpoint.json --output=/tmp/qbits-drone-teaching-browser
```

La cámara es instrumentada, pero las pruebas de apuntado, colisión, alcance, comandos y dibujo son las del juego. El ensayo aborta si cambia el estado físico, falla una confirmación requerida o aparece un error de página/GL.
