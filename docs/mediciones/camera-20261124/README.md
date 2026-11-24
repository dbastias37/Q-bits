# Cámara: cadencia y entrada del ratón

24 de noviembre de 2026. Base: `2786aa8617f1712fd38f03d84f6d971acc2fcac3`.
Versión de carga: `20261124-camera-stability-1`.

## Defecto reproducido

El planificador anterior usaba un margen fijo de 0,5 ms. Si un callback llegaba
ligeramente antes del plazo, omitía el dibujo; el siguiente callback podía
avanzar dos períodos a la vez. La repetición de esa pauta reducía a la mitad
las presentaciones aun con una frecuencia nominal igual al límite configurado.
El defecto afecta al giro estando quieto, sin necesitar movimiento del jugador
ni un cambio de posición de Cannon.

| Refresco nominal | Límite | Variación alternante | Dibujos antes, 10 s | Dibujos después, 10 s |
|---|---|---|---:|---:|
| 60 Hz | 60 FPS | ±0,6 ms | 300 | 600 |
| 120 Hz | 120 FPS | ±0,6 ms | 600 | 1.200 |
| 165 Hz | 120 FPS | ±2 ms | 1.050 | 1.200 |
| 144 Hz | 120 FPS | ±2 ms | 960 | 1.200 |
| 90 Hz | 60 FPS | ±4 ms | 599 | 600 |

`pacing.json` conserva las 13 comparaciones y tres ensayos de pausa, los hashes
del planificador, las marcas de tiempo y la definición de cada métrica. Su paso
angular a 90°/s es una magnitud hipotética derivada, no una medición del ratón.
Los recuentos son decisiones del código real ante timestamps sintéticos; no
representan FPS medidos en un navegador o una GPU.

La corrección mantiene la fase del límite, elige el refresco más cercano y
conserva como máximo un período de deuda breve. Tras un hueco largo reinicia la
fase. No reproduce cuadros pasados, no dibuja dos veces para la misma marca de
tiempo y conserva el presupuesto con monitores de distinta frecuencia.

## Entrada del ratón

Se solicita `requestPointerLock({unadjustedMovement:true})`, con vuelta a la
captura convencional solamente ante `NotSupportedError`. Se conservan APIs
legacy sin Promise, errores por evento y el timeout. El rechazo de la opción
raw no borra una recogida pendiente antes de negociar la alternativa.

La solicitud tiene identidad para impedir un fallback tardío después de una
pausa. Una captura que termina mientras el juego está pausado o la pestaña
oculta se libera. Las transiciones explícitas conservan un permiso asociado a
su propia solicitud, para que elegir un nivel siga capturando el ratón durante
el fundido. El giro se bloquea durante ese fundido, aunque la captura ya exista.

Las muestras no finitas se rechazan antes de modificar la cámara o alimentar
los gestos de agitación. Los giros válidos, incluidos los grandes, se conservan
sin recorte ni suavizado artificial. No se descarta la primera muestra válida.

El protocolo y la opción de movimiento sin aceleración se contrastaron con la
[especificación Pointer Lock de W3C](https://w3c.github.io/pointerlock/).
Estas protecciones no demuestran que el navegador del jugador haya enviado
un pico de movimiento; esa hipótesis requiere una observación en su equipo.

## Verificación

- Suite global: **1.617 aprobadas**, 0 fallos, 0 canceladas, 0 omitidas.
- `camera-pacing.test.cjs`: 16 pruebas de cadencia, límites, jitter y pausa.
- `camera-input.test.cjs`: 14 pruebas de captura, errores, pausa, transición,
  datos inválidos, recaptura y giros completos.
- `camera-motion.test.cjs`: cuatro escenarios de eventos y frames reales:
  quieto, caminar girando rápido, agachado girando y giro con cubo sostenido.
  Captura los uniforms `uCamera`, `uLook` y foco, y verifica rayos, proyección,
  movimiento efectivo y agarre físico.
- Sintaxis JavaScript y `git diff --check`: correctos.
- `validate-focus-gles.py`: siete shaders compilados, cuatro programas
  enlazados y fixtures de foco/posprocesado aprobados en Mesa/llvmpipe.

La orientación y proyección coherentes, la ausencia de traslación al girar
quieto y la conservación del agarre son comprobaciones de comportamiento
existente. La regresión corregida es la pérdida de presentaciones, que hacía
acumular varios incrementos de giro entre imágenes. No se atribuye el fallo al
cruce de ±π, a un recentrado automático ni al balanceo de caminar.

El sitio público respondió y su `game.js` coincidía byte a byte con la base:
SHA-256 `d78d86a11a724873880af9c7f05ecb85622ac6ad318c36ced74d9800ba92807d`.
El navegador remoto no pudo iniciar WebGL y mostró el mismo error al reintentar.
Node utiliza DOM/GPU instrumentados; EGL/GLES comprueba shaders y píxeles de
fixtures. Ninguno de estos resultados certifica una partida visual, FPS reales
o la comodidad del ratón en el dispositivo del jugador.

## Reproducción

Desde la raíz del repositorio, con el commit base disponible en Git:

```bash
node docs/mediciones/camera-20261124/measure.cjs
node --test tests/camera-pacing.test.cjs tests/camera-input.test.cjs tests/camera-motion.test.cjs
node --test tests/*.test.cjs
python3 tests/validate-focus-gles.py
```

El resumen de la suite se conserva en `validation.json`; la salida completa,
en `tests-final.log.gz`. La comprobación pendiente en navegador debe cubrir
giro en reposo, giro caminando y agachado, toma y movimiento de un cubo, pausa,
recaptura y cambio de nivel con la versión de recursos indicada arriba.
