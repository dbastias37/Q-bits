# Verificación del agarre físico de familias

Fecha: 23 de noviembre de 2026. Se ejecutan los manejadores reales de entrada y la física Cannon del juego con el andamiaje del repositorio. El DOM y WebGL están simulados: estas pruebas no certifican una partida ni la presentación visual en navegador. La evidencia GLES se registra por separado.

## Resultado y trazabilidad

| Comprobación | Aprobadas | Fallos | Canceladas u omitidas | Duración |
| --- | ---: | ---: | ---: | ---: |
| Suite global final, fuente congelada | 1.347 / 1.347 | 0 | 0 | 52,273 s |
| Agarre y familias, repetidas sobre la fuente final | 49 / 49 | 0 | 0 | 3,503 s |

La suite global final y las 49 dirigidas corresponden a `game.js` SHA-256 `c6eb37fc126a165a3b774a157aac392ef23cb4d23b5bd7e1418953cdf8bbb2e0`. Se comprobaron los hashes de juego, modelo, andamiaje e instrumentos antes y después de la global final: permanecieron iguales. La medición acotada y la captura GLES final también corresponden a esa fuente.

Se conserva además una global anterior de 1.347/1.347, iniciada con `a19d0fad0172ed1835c33c56db2bbf356a854163e4ecbd053e146e26923ec55e`. Durante esa ejecución se agregaron dos dibujos de las tapas de batería a la máscara de foco, sin cambiar agarre ni física. Esa captura de transición **no es la certificación principal**: se repitió la global con la fuente final inmóvil para resolver la trazabilidad. Su [TAP anterior](validation-global-transition.tap.gz) y metadatos se conservan por separado.

La primera ejecución global detectó manifiestos de audio rastreados que estaban excluidos del checkout parcial. Se incorporaron desde `HEAD` los directorios existentes de pasos, voz y uniones, sin cambiar su contenido; sus 17 pruebas pasaron y luego se repitió la global. No se omitieron pruebas para conseguir el resultado final.

Los hashes de fuentes e instrumentos, comandos, conteos y hashes de los TAP completos figuran en [validation-summary.json](validation-summary.json). Salidas completas comprimidas: [global](validation-global.tap.gz) y [dirigidas finales](validation-targeted.tap.gz).

## Qué se comprueba

Las 19 regresiones nuevas de `tests/family-grab.test.cjs` recorren la entrada física real, además de consultas geométricas y pasos de Cannon:

- Clic, arrastre y liberación en el banco; el clic sostenido mantiene la misma familia y soltar retira el ancla. En campaña se conserva el control de clic para tomar y siguiente clic para soltar. La opción **Tomar familia** del menú usa ese mismo agarre enclavado y avisa cuando está fuera de alcance.
- Una familia delante de un dron tiene prioridad sobre el menú de vuelo del dron lejano. La toma normal no activa la guía azul.
- La familia sigue la mano, cae por gravedad al soltar y descansa sobre su carcasa de 15 cm. La rueda cambia la distancia y Shift más las teclas de movimiento gira el cuerpo. Se comprueban paredes delgadas, mesas, deslizamiento, retirada de obstáculos y colisiones entre familias y cubos normales.
- El límite de transporte usa el peso total cacheado. Una familia de 100 piezas mantiene su masa de 25 kg, una sola forma y un solo cuerpo; el agarre añade únicamente un ancla cinemática y una restricción. Su proxy no entra en la colección de piezas y no contiene una pieza ficticia.
- Durante toma, simulación, HUD, dibujo y liberación de 100 piezas guardadas, los interceptores registran **cero lecturas del inventario `f.items` y de los estados `mood` almacenados**. No se crean piezas vivas ni nuevos buffers por frame en ese recorrido; el inventario queda igual después.
- La pausa y la pérdida de captura de mouse congelan y reanudan el agarre como en el cubo normal. La liberación explícita, la eliminación de la familia y el cambio de escena retiran ancla y restricción.
- No se permite retirar, mover con la guía o fusionar el inventario mientras su contenedor está agarrado. Una sacudida deliberada con Shift libera la mano y reparte 35 piezas en familias de 10, 10, 10 y 5; movimientos normales o pequeños no activan el reparto.

La liberación conserva la regla del agarre ordinario: anula las velocidades lineal y angular antes de dejar actuar a la gravedad. No se añadió una mecánica de lanzamiento distinta para las familias.

## Reproducción

Desde la raíz del repositorio, con los activos rastreados presentes:

```sh
node --test --test-reporter=tap tests/*.test.cjs
node --test --test-reporter=tap tests/family-grab.test.cjs tests/families-integration.test.cjs tests/family-sets.test.cjs
```
