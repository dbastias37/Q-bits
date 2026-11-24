# Inicio y paseo · evidencia del 24 de noviembre de 2026

Base del trabajo: [`0d0b8df77be0fa19bf592d371273ee5f7c346d04`](https://github.com/dbastias37/Q-bits/tree/0d0b8df77be0fa19bf592d371273ee5f7c346d04). Versión de recursos `20261124-opening-walk-1`. La preparación original fue local y revisable; el usuario autorizó integrar este primer ciclo en `main` el 24 de noviembre de 2026. Esta evidencia conserva la distinción entre pruebas funcionales, dibujo GLES y comprobación pendiente en navegador.

Guion, alcance y pendientes: [Inicio y paseo](../../INICIO_Y_PASEO_20261124.md). Resultados legibles por máquina: [verificación](verification.json) y [capturas GLES](results.json).

## Verificación funcional

La ejecución completa terminó con **1.584 pruebas aprobadas, 0 fallos, 0 canceladas, 0 omitidas y 0 pendientes**. Son 71 casos más que los 1.513 registrados para la base. Duración de esa ejecución: 50,06 segundos; es tiempo de pruebas, no una medición de rendimiento del juego.

```bash
node --test tests/*.test.cjs
python3 tests/validate-focus-gles.py
```

Las regresiones cubren conservación de identidad, materia y estado; cuota finita; solicitud, agarre y devolución explícita; recuperación sin crédito; reclamación y transacciones al guardar/cargar; protección frente a herramientas del banco; compatibilidad de partidas antiguas; pausa coherente; seguimiento del guía; ambos descensos y liberación de recursos. Los ensayos ejecutan código de producción y Cannon con DOM y llamadas GPU instrumentados. No equivalen a una partida visual en navegador.

La revisión previa a integrar añadió cuatro regresiones: recarga de la devolución cerrada hasta el ciclo 2, conservación del archivo desde el selector y el banco, rechazo de identidades duplicadas y cancelación/aceptación del reinicio de una práctica reclamada desde arranque frío. La suite final incluye estos casos. Las 13 capturas GLES se repitieron con la fuente final y conservaron exactamente sus PNG.

El validador EGL/GLES de foco y posprocesado terminó con `pixel_fixture: PASS` y `graphics_pixel_fixture: PASS`, compilación y enlace correctos. Su alcance sigue siendo el de esos fixtures.

## Verificación de dibujo

```bash
python3 tests/validate-factory-passage-gles.py /tmp/qbits-opening-review 960 720
```

El capturador ejecuta `renderScene()` de producción —incluidos mundo, Q-bits y vidrio— y reproduce sus buffers, shaders y órdenes en Mesa GLES, con renderer de software **llvmpipe**. Resultado: **13 imágenes de 960 × 720, 2 shaders compilados, 1 programa enlazado y 0 errores GL**. Las fases A/B de la fábrica difieren en 8.354 píxeles desde una misma cámara: la decoración cambia de pose.

La galería contiene **108 cajas estáticas**, incluidas cuatro superficies de vidrio, y **34 cajas animadas**. La fábrica añade **cero cuerpos físicos decorativos**. Esto no significa que la escena completa carezca de cuerpos: el guía y la infraestructura física existente siguen presentes. La ruta tiene 20,1 m horizontales, dos descensos y un descanso intermedio.

Las capturas usan cámaras de comprobación y excluyen interfaz y posprocesado. La entrada del paseo sí usa la posición y mirada iniciales del juego. Son evidencia del dibujo y de poses concretas; no son una grabación de interacción, una medición de FPS ni una prueba de audio.

### Muestras

| Archivo | Qué permite revisar |
| --- | --- |
| [Sala inicial](01-supply-room.png) | Escena previa a la primera petición. |
| [Escotilla cerrada](02-supply-hatch-closed.png) | Bandeja y abertura. |
| [Salida en curso](03-supply-hatch-offering.png) | Transferencia física muestreada. |
| [Compañero disponible](04-supply-offered.png) | Pieza ofrecida en la bandeja. |
| [Entrada del paseo](05-passage-start.png) | Encuadre inicial y guía visible. |
| [Mirada hacia el guía](06-passage-start-look-down.png) | Misma entrada con otra orientación del jugador. |
| [Fábrica A](07-factory-phase-a.png) / [Fábrica B](08-factory-phase-b.png) | Dos fases de cintas, brazos y drones decorativos. |
| [Giro](09-left-turn.png) | Continuación hacia la escalera. |
| [Primer descenso](10-first-descent.png) | Peldaños y guía. |
| [Descanso](11-middle-landing.png) | Tramo horizontal entre vuelos de escalera. |
| [Segundo descenso](12-second-descent.png) | Llegada al piso inferior. |
| [Puerta inferior](13-lower-door.png) | Cierre del recorrido. |

La inspección detectó y corrigió superficies superpuestas en el suelo de fábrica, el final de la escalera y la puerta; también mejoró la lectura de los bordes de peldaños. La mirada de entrada se ajustó para incluir al guía. Las muestras finales ya incorporan estas correcciones.

## Comprobación pendiente en navegador

Chromium terminó al crear su socket con `Operation not permitted`. No se acreditan manejo visual, audio audible, comodidad de cámara, FPS ni ausencia de tirones en navegador. La siguiente revisión debe jugar el tramo completo en el dispositivo del jugador, detenerse ante las ventanas y guardar/reanudar en ambos descensos. Los criterios de aceptación están en el guion enlazado arriba.

## Fuentes finales verificadas

SHA-256 de los archivos de producción y de los scripts de captura al cerrar la entrega:

| Archivo | SHA-256 |
| --- | --- |
| `assets/js/game.js` | `d78d86a11a724873880af9c7f05ecb85622ac6ad318c36ced74d9800ba92807d` |
| `assets/js/campaign-supply.js` | `e7166adc62ecda1a6e276bdc1b44a47c466feb600437ec9754a2e50787959ba6` |
| `assets/js/factory-passage.js` | `18cda7e2bb810e32b364d56ae6f57d2a32aa0091cd7c5fd249cd49f557cc80d6` |
| `assets/js/save-games.js` | `9b96b65927d03f84d764853aa666394bb62d66fb7188d49dfcd165206e3de8fe` |
| `assets/js/boot.js` | `a804ef6ba273c2d4b3168edc62320ab9d0e076a5bf70f7813ae46cdc436fdf9d` |
| `index.html` | `3be157f5b6c54bf4b4abf13e8a0502e60f0307db2f8c6854e4c12724720477f8` |
| `tests/capture-factory-passage-frame.cjs` | `9c8bd8d1bd65c95bbef0f683ec34fc9d3320df36837b47936079df1b0aff26ed` |
| `tests/validate-factory-passage-gles.py` | `4e0c23676cec32ba4217cb989cf65cbb829918e7ac3b0b8b3c8fbce9b2b0d465` |
| `tests/opening-campaign-integration.test.cjs` | `45ab9bf596aab5e138908ddc22965a4e7898c81852c1e852a762c93cf9cd4ca4` |
