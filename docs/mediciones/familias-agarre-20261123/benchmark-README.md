# Coste acotado del agarre físico

Fecha: 23 de noviembre de 2026. Fuente medida: `game.js` SHA-256 `c6eb37fc126a165a3b774a157aac392ef23cb4d23b5bd7e1418953cdf8bbb2e0`. Datos completos y rondas individuales: [benchmark.json](benchmark.json).

Se compara el código actual sujetando **un cubo normal de la misma masa total** con el código actual sujetando **una familia que contiene 10 o 100 piezas**. El cubo de control mide 9 cm y la carcasa familiar 15 cm. No se compara una familia contra diez o cien cuerpos sueltos ni contra una versión anterior del juego.

## Método

Cada brazo usa un contexto nuevo del andamiaje del juego y Cannon real. Se ejecutan 120 frames de calentamiento y 240 medidos, con dos subpasos de simulación a 120 Hz por frame sintético; la lógica conserva su cadencia normal del juego. Se actualiza también la animación familiar. La cámara se desplaza y gira suavemente para mantener activo el agarre. Cada ronda medida conserva 480 pasos físicos y cuatro segundos simulados.

Hay tres pares por tamaño, en orden cubo/familia, familia/cubo, cubo/familia. Se mide el tiempo de CPU del proceso y la pared de cada frame, excluyendo creación, agrupación y calentamiento. La captura de fuentes se fija al comienzo y se comprueba al terminar; no se ejecutaron simultáneamente otras pruebas ni renderizados del equipo de trabajo. Entorno: Node v24.22.3, AMD EPYC 9V74, con DOM/GPU simulados.

## Resultados

Son medianas de las tres rondas: para CPU, mediana de las medias por frame; para pared, mediana de los respectivos percentiles de cada ronda. Todos los tiempos están en milisegundos por frame sintético.

| Contenido familiar y control de igual masa | CPU cubo normal | CPU familia | Pared p50 cubo | Pared p50 familia | Pared p95 cubo | Pared p95 familia |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 piezas, 2,5 kg | 0,25962 | 0,15097 | 0,10232 | 0,08516 | 0,17511 | 0,18232 |
| 100 piezas, 25 kg | 0,18650 | 0,17371 | 0,09577 | 0,08666 | 0,17090 | 0,18035 |

En los dos tamaños permanecen **ocho cuerpos totales**: seis del escenario base, uno del objeto y uno del ancla de mano; hay una única forma en el objeto y una única restricción de agarre. Las familias no producen grupos de piezas vivas. Los interceptores de inventario y estado registran **cero lecturas de `f.items` y cero lecturas de `mood` guardado** durante toma, calentamiento, medición y liberación. El inventario permanece idéntico después de soltar.

La diferencia entre los tamaños no indica un recorrido de las piezas internas: cambian la masa y la respuesta física, mientras los conteos y accesos permanecen constantes. La evidencia estructural es más firme que una diferencia pequeña de tiempos entre rondas.

## Variación y límites

Las rondas desfavorables se conservan en el JSON. La mediana de p95 de pared aumenta de 0,17511 a 0,18232 ms con 10 piezas y de 0,17090 a 0,18035 ms con 100. En el segundo par de 10 piezas, la familia consume 0,15097 ms de CPU frente a 0,14809 del cubo; en el tercer par de 100, 0,17371 frente a 0,16074. El mayor frame de pared observado entre todas las rondas familiares fue 3,72302 ms y entre los cubos 1,85402 ms.

Los tiempos de CPU familiares oscilan entre 0,13022 y 0,24950 ms con 10 piezas, y entre 0,16369 y 0,18325 ms con 100. No se atribuye esa variación a una causa de runtime concreta. No se calcula ni promete una nueva reducción porcentual global de CPU; tampoco se suman estos resultados al 81 % histórico.

Esta es una medición pequeña de la simulación y del agarre en Node. No incluye render, GPU, interacción de navegador, coste de crear o guardar inventario, ni escenas extensas con muchas familias y obstáculos. **No mide FPS ni certifica que toda escena tenga el mismo coste.**

## Reproducción

Ejecutar en serie y conservar un archivo separado para una nueva medición:

```sh
node tests/benchmark-family-grab.cjs /tmp/qbits-family-grab-benchmark.json
```
