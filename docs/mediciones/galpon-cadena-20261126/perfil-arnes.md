# Coste del arnés durante la cadena nativa

Medición del 26 de noviembre de 2026, Node **v24.22.3**. Se continúa una copia del guardado real `09-cadena-autonoma.json` durante **30 s de simulación: 1800 subpasos a 60 Hz**. Se ejecutan Cannon, los controladores, la navegación y la lógica habituales. El arranque queda fuera de la medición. DOM y GPU están simulados: **este ensayo no mide render ni FPS**.

## Tres variantes, mismo resultado

| Variante temporal del arnés | CPU del proceso, usuario + sistema | Tiempo de pared | Decisión |
| --- | ---: | ---: | --- |
| Contexto previo | 16,961 s | 14,317 s | Sigue siendo el valor por defecto. |
| Global nativo mediante `DONT_CONTEXTIFY` | 10,653 s | 16,138 s | Disponible mediante opción explícita. |
| Alias léxicos locales a los mismos builtins y CANNON | 11,626 s | 11,007 s | No incorporado. |

La máquina compartía la corrida prolongada y otros diagnósticos. Por eso el tiempo de pared no constituye una comparación aislada; el total de CPU también incluye los hilos auxiliares del proceso. La reducción observada de CPU es de **37,2 %** con el global nativo y **31,5 %** con los alias. Estos porcentajes pertenecen al arnés y a este intervalo, no al navegador ni a una garantía de duración para el pedido completo.

Las tres variantes producen **el mismo `saved.data` completo, byte por byte**, incluidos posiciones, velocidades, IDs, procedencias, energía y controladores. Su SHA-256 es:

```text
574c2efdd9476b76d246d47b32bd56d64e1426505755eebdd75e673269a10d18
```

La reserva pasa de **155063,08515643395 J** a **154885,56286821235 J**. El procesamiento normal lleva los registros de 452 a 457 y los cuerpos de 150 a 155 en las tres variantes. El brazo termina en espera; el estado y la carga de los tres drones también coinciden.

## Dónde se concentra el trabajo

El perfil de CPU del contexto previo, muestreado cada 1000 µs, identifica estos bloques:

| Bloque | Porcentaje inclusivo del perfil |
| --- | ---: |
| Actualización de los vuelos, `updateFlights` | 47,02 % |
| Paso de Cannon, `n.step` | 12,68 % |
| Evaluación de potencia de los rotores, `rotorPowerState` | 7,55 % |

Dentro de las consultas de vuelo, `flightSnapshot` alcanza 48,19 % incluyendo llamadas desde otros puntos, `gripperCheck` 19,41 %, `propellerObstruction` 11,45 % y la preparación de destino 8,43 %. Son costes **solapados** y no se suman. `gripperFaceDistance` ocupa 9,48 % de tiempo propio, y las funciones `V` y `collisionPoseBounds` rondan 6 % cada una. El DOM no figura entre los mayores costes.

El diagnóstico posterior de logística identificó 838 consultas anidadas que repetían un `flightSnapshot` ya disponible: 516 desde la toma y 322 desde el destino. Pasar únicamente su centro y altura reduce las consultas de 6238 a 5400 en el mismo intervalo. Se mantienen las 516 comprobaciones de toma, las 322 de destino, las 739 de pinza y las 2655 de colocación, con el mismo hash final. Ese contador demuestra trabajo eliminado; no mide por separado su ahorro de CPU.

## Opción adoptada y compatibilidad

El [arnés](../../../tests/game-harness.cjs) acepta `createGame({nativeContext:true})`. El resultado `game.nativeContext` indica si pudo usar el global nativo. Conserva los mismos stubs, eventos, semilla y scripts; no cambia fuerzas, energía, frecuencia, iteraciones del solver ni orden de los pasos. Si la versión de Node carece de `vm.constants.DONT_CONTEXTIFY`, utiliza el contexto previo. Los tests existentes siguen utilizando ese contexto por defecto.

La comprobación del arnés verifica el valor por defecto, la opción, el fallback sin la constante, la misma secuencia aleatoria y las identidades de `window`, `self` y los eventos. La opción incorporada, junto con la posterior reutilización de centro y altura del dron, vuelve a producir el mismo hash completo tras los 1800 subpasos. Esa última ejecución tarda 7,504 s de pared y 9,833 s de CPU; combina ambos cambios y no permite atribuir su diferencia a uno solo.

El [informe estructurado](perfil-arnes.json) conserva hashes del guardado y del código, medidas, estado resumido y resultados de las comprobaciones. Los perfiles completos y las copias de ensayo quedaron en `/tmp/qbits-native-chain-profile*`; no contienen una ejecución de las ochenta recepciones.
