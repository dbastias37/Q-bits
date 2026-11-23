# Coste de las familias

La versión final reduce 2.000 piezas sueltas a 20 contenedores físicos. En esta medición de simulación, el tiempo de CPU mediano pasó de **15,9763 a 0,0757 ms por frame sintético**. La preparación se reparte entre avances; para agrupar esas 2.000 piezas sueltas, el mayor tramo síncrono observado fue **19,916 ms**.

Los resultados completos, las tres repeticiones y los hashes están en [final-families.json](final-families.json). La fuente de `game.js` medida es `9e55241e807593de42c19553878912863dea7952f23f6669b8d0c4257dc57d7a`, la misma de la [validación funcional final](tests-summary.json) y de las capturas GLES finales.

## Simulación continua

| Piezas | CPU: sueltas, ms/frame | CPU: en familias, ms/frame | Familias | Cuerpos físicos: antes → después |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 0,8022 | 0,0638 | 1 | 106 → 7 |
| 500 | 3,6917 | 0,1281 | 5 | 506 → 11 |
| 2.000 | 15,9763 | 0,0757 | 20 | 2.006 → 26 |

Los cuerpos totales incluyen seis cuerpos base del escenario. Cada familia añade un cuerpo y un colisionador sencillo. Las piezas almacenadas conservan sus datos y no ejecutan física ni comportamiento individual mientras permanecen dentro.

Los tiempos de pared medianos por frame también se incluyen en el JSON: con 2.000 piezas, 8,7993 ms sueltas y 0,0348 ms almacenadas. CPU y tiempo de pared son medidas distintas; estos números no representan el porcentaje de uso de CPU del equipo.

## Preparación y desarme por avances

Se midieron tanto piezas independientes como un solo cuerpo compuesto por todas las piezas, que ejercita el camino de desarme. La columna de trabajo total suma los tiempos de inicio y de cada llamada de preparación, sin introducir esperas entre ellas.

| Piezas | Escenario | Trabajo total, ms | Avances | Máximo por ejecución, mediana en ms | Mayor tramo observado, ms |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | Sueltas | 12,096 | 3 | 9,917 | 10,050 |
| 100 | Compuesto | 11,270 | 2 | 10,685 | 10,873 |
| 500 | Sueltas | 48,441 | 14 | 10,543 | 10,706 |
| 500 | Compuesto | 51,605 | 7 | 11,901 | 12,413 |
| 2.000 | Sueltas | 192,952 | 54 | 19,691 | 19,916 |
| 2.000 | Compuesto | 174,991 | 26 | 11,240 | 13,236 |

Trabajo total y avances son medianas de tres ejecuciones; el último valor es el máximo absoluto entre ellas. La llamada inicial mediana toma entre 0,05 y 0,20 ms y programa el trabajo. Durante la preparación, la escena conserva sus cuerpos originales y la simulación queda suspendida. Escape cancela; la transferencia se publica al terminar la validación completa.

El presupuesto de 4 ms se comprueba entre tareas. Una validación de lote o la transferencia final puede superar ese presupuesto, como muestran los máximos medidos. El juego procesa un avance por frame; el benchmark los ejecuta consecutivamente para medir su coste, por lo que el número de avances no es una medida de duración real en el navegador.

El wrapper síncrono utilizado por las pruebas registró medianas de 23,859 / 49,449 / 199,801 ms para 100 / 500 / 2.000 piezas. La interfaz usa el camino incremental. [initial-families.json](initial-families.json) conserva la medición del primer prototipo, cuyo agrupado síncrono de 2.000 piezas tomó 848,219 ms; esa fuente anterior no debe confundirse con la versión final.

## Método y reproducción

```bash
node tests/benchmark-families.cjs docs/mediciones/familias-20261122/final-families.json 100,500,2000
```

- Node `v24.22.3`, procesador informado: AMD EPYC 9V74 80-Core Processor.
- Ejecución exclusiva respecto de las otras tareas de validación del proyecto.
- Tres repeticiones por escala, alternando el orden sueltas/familias.
- 120 frames de calentamiento y 60 medidos; cada frame ejecuta dos pasos reales de Cannon y del juego a 120 Hz, más la actualización de familias a 60 Hz.
- Tiempo de CPU obtenido con `process.cpuUsage`; tiempo de pared con `performance.now`.
- Inventario, identidades, masa y energía iguales al transferir. Los relojes de física y la conservación de piezas se comprueban dentro del benchmark.
- Código de juego capturado una sola vez al iniciar; hashes del modelo, Cannon y harness comprobados de nuevo al terminar.

El harness simula DOM y GPU. Estas cifras caracterizan la simulación y la preparación; no miden FPS de navegador, GPU ni el renderizado completo. El estado individual de las piezas sueltas puede evolucionar durante la simulación, mientras el contenido almacenado permanece suspendido. La [validación GLES](gles-README.md) cubre por separado shaders, geometría, oclusión, líquido, guías y efectos.
