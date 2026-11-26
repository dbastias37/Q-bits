# Carga de ochenta rotores · Chromium y WebGL2

**Alcance:** guardado preparado con fixtures de producción pagada y procedencia explícita. Los ochenta rotores fueron ensamblados con cuerpos y articulaciones Cannon, recibidos físicamente y agrupados antes de abrir el navegador. No es una partida completa desde cuatro trabajadores ni una prueba de los ochenta transportes del brazo y del dron.

El escenario incluye ocho tramos de A, brazo y dron estacionados, dos alimentadores, fuente y cables reales, láser, ensambladora y dos familias. Los dos siguientes cubos se colocan inicialmente sobre las entradas de los alimentadores como fixture. Desde la carga del guardado, el navegador conserva sus cuerpos y ejecuta contactos, tracción, división, reserva, articulación y recepción sin recolocarlos.

## Entorno y método

- Chromium: `131.0.6778.0`.
- WebGL: `WebGL 2.0 (OpenGL ES 3.0 Chromium)`.
- Renderizador: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
- Resolución del buffer: 1280 × 800.
- La página conserva render y controles reales. Un hook de prueba evita pasos automáticos del reloj entre mediciones; se llama al `stepSimulation(1/120)` original, que ejecuta física y lógica del juego. No se altera el código distribuido.
- Los tiempos de simulación incluyen el registro ligero de actividad y máximos de cuerpos. El render se mide por separado, con dos calentamientos y doce muestras que esperan a `gl.finish()`. No son FPS de una pantalla ni resultados de una GPU del jugador.

## Simulación medida

| Subpasos | Tiempo simulado | Tiempo de CPU | ms/paso | Pasos con láser / ensambladora | Pico de cuerpos |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 120 | 1.00 s | 381.00 ms | 3.1750 | 119 / 0 | 115 |
| 600 | 5.00 s | 1857.60 ms | 3.0960 | 0 / 232 | 121 |

## Render medido

| Estado | Mediana | P95 | Llamadas | Triángulos |
| --- | ---: | ---: | ---: | ---: |
| Estaciones activas con 80 almacenados | 0.80 ms | 5.30 ms | 430 | 3048 |
| 81 recibidos en las mismas dos familias | 0.70 ms | 7.40 ms | 403 | 9437 |

## Conservación y resultado

- Recepciones almacenadas: 80 → 81; 2 familias al terminar.
- Piezas en las familias: 160 → 162. Articulaciones guardadas finales: 81.
- Identidades actuales: 532 → 532; masa: 526 → 526 u. Se comprueba igualdad del conjunto de IDs antes y después del ciclo; las identidades temporales de las seis pirámides se retiran al recomponer.
- Cuerpos: 116 → 114. La recepción incorpora el nuevo rotor en una familia existente y retira sus dos cuerpos dinámicos.
- Energía de la fuente: 163129.000 → 163099.570 J. La preparación de este fixture omite los transportes previos; su saldo no representa el presupuesto de una partida completa.
- Errores JavaScript observados: 0. Error GL final: 0. Guardado final validado mediante la operación real del juego.

## Evidencia y reproducción

- [Resultados y estados](browser-load.json) · [Guardado inicial de 80](fixture-80.json) · [Guardado final](after-cycle.json).
- [Escena inicial](01-ochenta-almacenados.png) · [Estaciones trabajando](02-corte-en-marcha.png) · [Familias después del nuevo ciclo](03-familias-y-estaciones.png).

```sh
QBITS_CHROMIUM=/ruta/chromium node tests/benchmark-galpon-chain-load-browser.cjs --output=/tmp/qbits-chain-load
```

Requiere Playwright y Chromium con WebGL2. Este ensayo comprueba restauración, coste acotado y continuidad de una operación física con el inventario acumulado. La distribución sostenida entre mesa, enfriador y entradas, la autonomía energética de todas las rutas y la corrida integrada de ochenta entregas necesitan su propia evidencia.
