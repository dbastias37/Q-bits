# Flota de la partida real restaurada · Chromium

Este escenario procede de la partida continua de cuatro trabajadores que completó A y construyó B con la misma materia y reserva. Se restaura el checkpoint `qbits-native-fleet-first-cycle/final.json`; no se extraen piezas, cambian poses de equipos ni acreditan hitos durante la preparación visual. El avance automático se pausa para que las cuatro capturas representen el mismo instante. Los controles y el render de la página siguen activos.

## Estado observado

- Tiempo de misión: **1844,0 s**.
- Reserva exterior: **154782,201505 J**, idéntica antes y después de las capturas.
- Pedido: **tanda 1/4, 1/20, total 1/80**; actividad útil en esta ventana: **0/60 s**; racha opcional de recepciones: **0/3**.
- Brazo **279** en espera/repetición, **seis ciclos** conservados; **34 articulaciones** restauradas.
- Tres seguidores QR —**295, 387 y 398**— apoyados en origen (`ground`, índice 0).
- **155 cuerpos** presentes. Todas las identidades del inventario coinciden con el archivo de entrada.
- Cero advertencias de restauración, cero excepciones de página, cero errores de consola y `gl.getError() === 0`.

El retorno sano que precede al checkpoint se comprobó por separado con Cannon. Estas imágenes verifican la instalación y su interfaz al restaurarse; **no prueban por sí solas el recorrido anterior ni el pedido completo de ochenta**.

## Presentación

| Archivo | Vista |
| --- | --- |
| `01-flota-restaurada.png` | Fuente, línea A, brazo, mesa, frío y alimentadores de la instalación existente |
| `02-frio-alimentadores-drones.png` | Zona del segundo enfriador y flota QR |
| `03-objetivos-1440.png` | Pedido y opcional dentro de la tableta a 1440 × 900 |
| `03-objetivos-960.png` | Los mismos textos y controles a 960 × 640 |

El objetivo del HUD del galpón usa tinta oscura sobre una placa clara con borde menta. La placa conserva el contraste sobre las superficies grises y desaparece mientras la tableta muestra su propia copia del objetivo. Ambos tamaños mantienen los cuatro bordes del panel dentro del viewport, sin desbordamiento horizontal del documento ni controles recortados horizontalmente. El panel conserva su desplazamiento vertical normal.

Después de estas capturas se corrigieron dos textos de restauración: la primera línea se presenta como recuperada y alimentando al brazo, y la receta superior de B muestra sus tramos montados y activos, remitiendo al material de cada plano de la segunda cadena. Las imágenes de este checkpoint conservan la ayuda anterior de A que aún aparece sobre «Segunda cadena»; la próxima captura de cierre comprobará esas dos líneas actualizadas.

Chromium **131.0.6778.0**, WebGL 2 real y ANGLE/Vulkan sobre SwiftShader. `browser.json` registra el renderer, los límites, textos y estados exactos, además de los SHA-256 del checkpoint y del código servido. `checkpoint.json` conserva los bytes de entrada reproducibles. No se usa GPU simulada del arnés Node.

## Reproducción y medición opcional

```sh
QBITS_CHROMIUM=/tmp/galpon-chrome-runtime/chromium node tests/benchmark-galpon-chain-restored-browser.cjs --checkpoint=docs/mediciones/galpon-b-20261126/real-fleet/checkpoint.json --output=/tmp/qbits-real-fleet
```

Añadir `--measure=true` ejecuta **120 y 600 subpasos nativos de 1/120 s** después de las capturas, con la partida reanudada y los diálogos cerrados. Cada bloque registra tiempo, cuerpos, saldo y avance real. El render se mide aparte a 1280 × 800, con dos calentamientos y doce imágenes completadas mediante `gl.finish()`. Los datos de simulación y render no son FPS del dispositivo del jugador. El archivo original no se sobrescribe. Esta captura final no incluye esa medición; así queda separada del ajuste de contraste y de los perfiles posteriores de la instalación acumulada.
