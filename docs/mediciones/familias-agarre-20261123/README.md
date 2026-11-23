# Agarre físico de familias

Fecha: 23 de noviembre de 2026. Referencia: `a0477707a03ca1ed2ca006a628c716d70e3f5175`, integración del PR #34. Versión de carga: `20261123-family-grab-1`.

Fuente final de `assets/js/game.js`, SHA-256:

`c6eb37fc126a165a3b774a157aac392ef23cb4d23b5bd7e1418953cdf8bbb2e0`

## Cambio observable

El clic principal toma la familia con la mano física que ya usan los cubos. En el banco se mantiene el clic izquierdo y se suelta para dejarla; en campaña se toma con un clic y se deja con otro. El menú **Tomar familia** permite llevarla hasta el siguiente clic. La rueda cambia la distancia de la mano, **Shift + WASD** gira y **Ctrl** proyecta la caída con el tamaño exterior correcto.

La guía azul queda disponible mediante **Colocar familia · guía azul** y las opciones de retirada. La unión de familias se confirma expresamente. Las sacudidas deliberadas con Shift también funcionan al sostener físicamente una familia; se libera la mano antes de repartir su inventario en lotes.

La familia mantiene un cuerpo dinámico con una forma de colisión. Tomarla añade un anclaje cinemático y una restricción temporales, como el agarre ordinario. Al soltar se eliminan ambos. Su proxy de geometría no entra en la colección de piezas activas. El peso guardado cuenta para el límite manual, pero las piezas internas conservan sus datos sin participar en los pasos de física, ánimo o energía.

Guía completa de controles y límites: [Familias Q-bits](../../FAMILIAS_QBITS.md).

## Verificación funcional

La suite global pasa **1.347 pruebas**; el conjunto dirigido pasa **49**, incluidas **19 regresiones nuevas de agarre**. Se usa Cannon real con DOM y GPU simulados. Los resultados completos, hashes y comandos están en [la validación funcional](validation-README.md) y [su resumen](validation-summary.json).

La cobertura incluye entrada real del mouse, modos de banco y campaña, recogida desde menú, alcance y peso, rotación, seguimiento de la mano, caída, paredes finas, mesas, obstáculos de otras familias y cubos, pausa y reanudación, limpieza de anclajes, HUD, conservación del inventario y división por sacudida. Una familia delante de un dron recibe el clic antes que el menú remoto del dron.

Durante el agarre y la simulación se interceptan las lecturas de `f.items` y de los estados de las piezas: **cero lecturas de inventario y cero lecturas de estados internos**. También se comprueba que no aparecen piezas vivas ni nuevos buffers por frame, y que el inventario serializado queda idéntico después de soltar.

## Coste de simulación observado

Se compara **un cubo ordinario de peso agregado** con **una familia del mismo peso**, que contiene diez o cien piezas. Ambos mantienen una forma física, un anclaje y una restricción durante el agarre. El cubo mide 9 cm y la familia 15 cm. Se realizan tres repeticiones alternadas, con 120 frames de calentamiento y 240 medidos; cada frame sintético incluye dos subpasos de física a 120 Hz y la lógica a su frecuencia normal.

| Contenido de la familia | CPU cubo, ms/frame | CPU familia, ms/frame | Pared p95 cubo, ms | Pared p95 familia, ms |
| --- | ---: | ---: | ---: | ---: |
| 10 piezas | 0,25962 | 0,15097 | 0,17511 | 0,18232 |
| 100 piezas | 0,18650 | 0,17371 | 0,17090 | 0,18035 |

Son medianas entre las tres repeticiones. La mediana de CPU no aumenta frente al control de igual masa en este ensayo. Los percentiles p95 de pared empeoran ligeramente y hay rondas individuales desfavorables; se conservan todos los datos en [benchmark.json](benchmark.json). No se deduce una mejora uniforme ni se suma este resultado a los porcentajes de CPU históricos.

En ambas escalas se mantienen ocho cuerpos totales del fixture: seis fijos de la escena, el cuerpo sostenido y el anclaje de mano. Las familias conservan una forma exterior y una restricción de agarre, independientemente de sus diez o cien piezas. Cada ronda completa 480 pasos y cuatro segundos simulados, sin materializar el inventario.

La medición excluye creación, agrupación, render y GPU. No mide FPS ni una partida de navegador. Tampoco compara con diez o cien cubos físicos separados: comprueba que añadir contenido almacenado mantiene un agarre de coste acotado. [Metodología, resultados por ronda y reproducción](benchmark-README.md).

## Verificación gráfica

Pasan **25 escenas por ruta**, con **50 PNG** y **cero errores GL**. Los 25 pares de las rutas WebGL 1 y WebGL 2 son idénticos; las 18 escenas anteriores conservan sus píxeles. La máscara protege la carcasa y sus bandas completas; las baterías añaden las tapas exactas. La proyección Ctrl coincide píxel por píxel con la caja de 15 cm.

El contenedor normal conserva error cero tras el enfoque. La batería tiene un error máximo de un nivel sobre 255 por el muestreo del compositado, con máscara completa. La corrección de máscara requiere tres dibujos para la familia normal y cinco para la de baterías, sólo durante la inspección y sin depender de su inventario. También pasa el validador general de foco y postproceso.

[Método, capturas y resultados EGL/GLES](gles-README.md). Es render real sobre Mesa llvmpipe; no valida el DOM ni sustituye una comprobación interactiva en navegador.

## Reproducción

Desde la raíz del repositorio, ejecuta la medición de CPU sin otras pruebas ni render simultáneos:

```bash
node --test tests/*.test.cjs
node --test tests/family-grab.test.cjs tests/families-integration.test.cjs tests/family-sets.test.cjs
node tests/benchmark-family-grab.cjs /tmp/qbits-family-grab-benchmark.json
python3 tests/validate-focus-gles.py
python3 tests/validate-families-gles.py /tmp/qbits-family-grab-webgl1
QBITS_RENDER_BACKEND=webgl2 python3 tests/validate-families-gles.py /tmp/qbits-family-grab-webgl2
```
