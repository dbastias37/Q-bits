# Pedido real de 80: restauración, imagen y rendimiento

Esta revisión restaura en Chromium el guardado **`11-pedido-completo.json`** de la cadena real que continuó desde A. El archivo se copió sin modificar sus bytes después de cerrarse el pedido. Las imágenes muestran el estado exacto restaurado a los **17029,000 s de misión**, con **80 / 80 rotores**, continuidad útil cumplida y **7892,139659 J** en la misma reserva exterior.

La captura no crea piezas, completa hitos ni prepara poses de fixture. Su alcance es comprobar la restauración, la presentación y el rendimiento de ese estado; los logs y checkpoints de la corrida continua acreditan por separado cómo llegó hasta él. Tampoco representa una sesión manual completa en el navegador.

## Estado comprobado

| Dato de la instalación restaurada | Resultado |
| --- | ---: |
| Pedido recibido | 80 / 80, cuarta tanda 20 / 20 |
| Pedido completado / continuidad demostrada | `true` / `true` |
| Actividad útil continua | 60 / 60 s |
| Reserva exterior | 7892,139659 J |
| Identidades registradas | 598 |
| Cuerpos físicos / grupos activos | 150 / 103 |
| Articulaciones / cintas | 34 / 10 |
| Brazo 279 | En espera, programa activo, ciclo 164, sin carga retenida |
| Seguidores QR | Tres: receptores 295 y 387 en suelo; 398 en `travel`, índice 5 |
| Reserva opcional al retorno / recepciones sin corte | Cumplida, 92,7123 % observado / 3 de 3 |

La carga produjo **cero advertencias** y conservó todos los controladores esperados. Durante las cuatro capturas el reloj automático estuvo bloqueado: tiempo, energía exterior y lista completa de identidades coinciden antes y después. Las imágenes no ocultan el dron B que seguía volando cuando se recibió el producto número 80.

## Revisión visual

Se utilizó **Chromium 131.0.6778.0**, WebGL 2.0 y **ANGLE/Vulkan con SwiftShader**. No hubo excepciones JavaScript, errores de consola ni errores WebGL; `gl.getError()` devolvió cero. Es renderizado WebGL real por software, no una medición de una GPU de consumo.

| Captura | Contenido |
| --- | --- |
| `01-flota-restaurada.png` | Instalación completa y HUD de pedido terminado |
| `02-frio-alimentadores-drones.png` | Segundo enfriador, entradas, cableado y dron B en vuelo |
| `03-objetivos-1440.png` | Tableta con el pedido completo y mensaje de extracción recuperada, a 1440 × 900 |
| `03-objetivos-960.png` | La misma tableta a 960 × 640 |

Los cuatro bordes del panel quedan dentro de ambos tamaños de ventana, sin desbordamiento horizontal del documento ni controles cortados horizontalmente. Se comprobó el texto **«Equipo de extracción recuperado · 4 en turno.»**; la línea anterior muestra **8 / 8 tramos y 8 en marcha**, y remite a los materiales propios de B. El objetivo dice **«Pedido completado · 80 rotores y continuidad demostrada»**. La ayuda confirma que la instalación sigue disponible y muestra la reserva restante.

## Medición separada de simulación y renderizado

Después de congelar y capturar el guardado, la misma sesión aislada reanuda el juego y ejecuta dos lotes consecutivos de subpasos nativos. No se guarda ese avance ni se sobrescribe el checkpoint de 80. Cada llamada usa **1/120 s**; la preferencia del bucle automático conserva **240 Hz** y se registra como otro dato.

| Lote | Subpasos | Tiempo simulado | Duración del bucle | Duración por subpaso |
| --- | ---: | ---: | ---: | ---: |
| Primero | 120 | 1,000 s | 824,1 ms | 6,8675 ms |
| Segundo | 600 | 5,000 s | 1574,2 ms | 2,6237 ms |

Son tiempos transcurridos medidos con `performance.now()` en el paso nativo con Cannon, lógica y trabajos de navegación pendientes, sin dibujar entre subpasos. Incluyen cualquier espera de planificación del proceso y no equivalen a un contador de tiempo exclusivo de CPU. La escena conserva 150 cuerpos durante ambos lotes. Se mantienen los dos resultados: no se descarta el primero ni se extrapola de ellos una frecuencia de imagen garantizada.

Después de cada lote se miden **12 renderizados completos**, separados de la simulación, tras dos calentamientos. Se usa `gl.finish()` antes y después de cada muestra a **1280 × 800**. Los tiempos incluyen envío de CPU y finalización de WebGL/SwiftShader.

| Renderizado separado | Total de 12 muestras | Media por muestra | Mayor muestra |
| --- | ---: | ---: | ---: |
| Tras el primer lote | 229,7 ms | 19,1417 ms | 189,5 ms |
| Tras el segundo lote | 17,2 ms | 1,4333 ms | 1,7 ms |

El primer grupo incluye una muestra de **189,5 ms** y otras de 16,9 y 8,3 ms; permanecen en el informe. `browser.json` conserva los 24 valores individuales, además de los valores centrales y percentiles calculados por el helper. Esta medición breve de una escena y un renderer por software **no es una prueba sostenida de FPS** ni una predicción para otros dispositivos.

Tras los seis segundos de medición quedan los tres seguidores y el brazo, sin advertencias ni errores GL. El pedido continúa en 80 completados, las 598 identidades se conservan y la reserva baja a **7880,599958 J** por el avance físico real de esa copia.

## Procedencia y reproducción

```sh
QBITS_CHROMIUM=/tmp/galpon-chrome-runtime/chromium \
node tests/benchmark-galpon-chain-restored-browser.cjs \
  --checkpoint=docs/mediciones/galpon-b-20261126/real-order/checkpoint-80.json \
  --output=/tmp/qbits-order-80-browser-repeat \
  --measure=true
```

`checkpoint-80.json` tiene SHA-256 **`3b6f1782a2cb74f81c91678b601915f336c68811cc1ff8bb4c7b6972a72d674d`**. `provenance.json` identifica el guardado original y el momento de la copia; `browser.json` registra estados, textos, límites, renderer, muestras y errores. El manifiesto registra los hashes de la evidencia.

El runtime coincide con el probado por la [global final de 1868 pruebas](../global-final/README.md): **`96610d18f4c7e880cf5aa42f2ff8028514c7c4ef9a0cd27218a680dfc15d34d5`**. Los manifiestos anteriores y posteriores a esta revisión permiten comprobar que no cambió durante ella. No se repitió GLES: no hubo cambios de shaders.
