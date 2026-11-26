# Primer ciclo del galpón

En una partida nueva con cuatro Q-bits, Chromium registró **ocho cintas en marcha y doce cubos de doce orígenes en una familia**. El ciclo consumió 252 unidades extraídas: 144 cubos y 96 enganches para las cintas, más los doce cubos entregados. La cuota se completó a los **9 min 31,5 s** de simulación. La estimación de cinco a ocho minutos quedó por debajo de los cuatro recorridos medidos.

| Recorrido | Primera extracción | Primer cubo | Primer tramo | Ocho tramos | Recepción 12 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium · 4 trabajadores · 240 Hz | 4,60 s | 8,67 s | 201,00 s | 516,93 s | 571,53 s |
| Node/Cannon · 4 trabajadores · 240 Hz | 4 s | 9 s | 173 s | 492 s | 547 s |
| Node/Cannon · 4 trabajadores · 60 Hz | 5 s | 9 s | 217 s | 536 s | 591 s |
| Node/Cannon · 1 trabajador · 240 Hz | 4 s | 8 s | 304 s | 632 s | 687 s |

Las estaciones y los puestos de trabajo aparecen en la [entrada](01-entrada.png). La [tableta de extracción](02-extraccion.png) muestra población, plazas y energía. El [primer tramo](03-primer-tramo.png) y la [recepción completa](05-recepcion.png) se capturaron en la sala. En esta última se ven la línea física, la familia sobre la plataforma derecha y el objetivo «12 / 12».

### Reanudación con una carga en tránsito

La segunda sesión de Chromium continuó el autoguardado a los **441,27 s**. Conservaba seis tramos, 195 extracciones y un traslado en curso. El equipo montó las dos rectas restantes, completó el pedido a los 571,47 s y dejó una familia con doce miembros. La cámara se acercó caminando hasta la [plataforma de recepción](06-familia.png), donde se ve el indicador **×12**. [Estado inicial y final de la reanudación](reanudacion.json).

### Coste en Chromium 131

WebGL 2, ANGLE/Vulkan y SwiftShader a 960 × 640, con física Cannon a 240 Hz. El navegador terminó sin excepciones de página y el muestreo obtuvo cero errores de WebGL. El primer tramo se midió desde la sala y la recepción con la tableta todavía abierta. La imagen de cierre se capturó después de guardarla.

| Estado medido | Cuerpos Cannon | Grupos | Dibujos | Triángulos | Física y lógica mediana / p95 | Render y espera mediana / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Un tramo en marcha | 52 | 10 | 170 | 2.510 | 1,2 / 2,9 ms | 0,8 / 3,3 ms |
| Ocho tramos y familia completa | 58 | 36 | 510 | 5.200 | 1,3 / 1,7 ms | 1,0 / 1,7 ms |

[Registro Chromium](browser.json) · [Cuatro trabajadores a 240 Hz](4-trabajadores-240hz.json) · [Cuatro a 60 Hz](4-trabajadores-60hz.json) · [Un trabajador a 240 Hz](1-trabajador-240hz.json).

## Cómo repetir el recorrido

Desde la raíz del repositorio, el banco utiliza los botones del menú y la tableta para empezar con cuatro trabajadores, dar la orden de extracción, montar cada tramo en cuanto están disponibles sus piezas y ponerlo en marcha. La variante individual ejecuta el mismo recorrido con un trabajador. Ambas partidas arrancan en blanco y fabrican todo el material del pedido.

```sh
node tests/benchmark-galpon.cjs --workers=4 --hz=60 --output=/tmp/galpon-cuatro.json
node tests/benchmark-galpon.cjs --workers=1 --hz=60 --output=/tmp/galpon-uno.json
```

Para la ejecución en navegador se necesita Playwright y Chromium. El servidor temporal sirve las fuentes de producción y añade al motor instrumentos para leer su estado, medir el dibujo y adelantar la simulación. El mando de construcción, el arranque de las cintas y los cambios de cámara pasan por los botones, el teclado y el ratón del navegador. La preferencia de movimiento reducido se aplica a la presentación de entrada y vuelve al modo normal al elegir el galpón.

```sh
QBITS_CHROMIUM=/ruta/a/chromium node tests/benchmark-galpon-browser.cjs --workers=4 --software=yes --output=/tmp/galpon-webgl
```

El archivo de prueba conserva los datos locales de esa partida. Para repetir la recuperación en un perfil de navegador nuevo:

```sh
QBITS_CHROMIUM=/ruta/a/chromium node tests/benchmark-galpon-browser.cjs --software=yes --checkpoint=docs/mediciones/galpon-20261126/guardado-seis-tramos.json --output=/tmp/galpon-reanudado
```

Los segundos de los hitos provienen del reloj de la escena. Entre decisiones, el piloto adelanta el mismo reloj por pasos de 1/60 s, con los pasos fijos de física y de lógica configurados en el juego. Los trabajos de navegación reciben su turno en cada fotograma simulado. Los tiempos incluyen las esperas de transporte, fabricación y enfriamiento. Una persona puede tardar más en leer el diálogo, explorar o dar la siguiente orden.

La medición del navegador toma doce muestras después de dos de calentamiento. Mide por separado el tiempo de navegación, física y lógica de 1/60 s de juego, y el tiempo para dibujar la escena y esperar a que termine la GPU. El contador gráfico mide las llamadas y triángulos visibles desde la cámara de la captura. El controlador por software comparte recursos con otros procesos. Estas muestras no permiten extrapolar FPS a la tarjeta gráfica del jugador.
