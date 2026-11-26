# Suite global posterior al ajuste de giro

La ejecución completa aprobó **1868 / 1868 pruebas** en **183,885 s**, sin fallos, cancelaciones, omisiones ni pruebas pendientes. Incluye los tres focales nuevos del objetivo relativo a la cara de la pinza y las dos regresiones de reutilización de la ensambladora y del rotor fabricado en B. Se lanzó después de cerrar los 48 focales de vuelo y las dos pruebas de reutilización.

```sh
node --test --test-reporter=tap tests/*.test.cjs
```

| Dato | Resultado |
| --- | --- |
| Node | v24.22.3 |
| Archivos de prueba | 216 |
| Pruebas aprobadas | 1868 |
| Fallos / cancelaciones / omisiones / pendientes | 0 / 0 / 0 / 0 |
| Duración informada por Node | 183884,809405 ms |
| Manifiesto anterior | 2026-11-26 09:48:51,252 UTC |
| Manifiesto posterior | 2026-11-26 09:51:55,380 UTC |
| Fuentes registradas antes y después | 349 |
| Fuentes cambiadas durante la ejecución | 0 |
| Rama | `prueba/galpon-primer-ciclo` |
| HEAD de base | `6cdd33320cc2e022d7c35fc9c34fa544432c4d95` |

El HEAD identifica la base del árbol de trabajo, no un commit de los cambios del bloque B. Los manifiestos identifican los bytes que se probaron: incluyen JS, CJS, CSS, GLSL y JSON bajo `assets` y `tests`, además de `index.html`; excluyen documentos, imágenes, logs e informes generados. La captura posterior se hizo automáticamente al finalizar el proceso. **Todos los hashes individuales y agregados permanecieron idénticos.**

| Conjunto | SHA-256, idéntico antes y después |
| --- | --- |
| Todas las fuentes registradas | `2c5699e92c1a265bacd339e0376fa2d652211fd5dd3bc407ce20da53ead53837` |
| Runtime y documento principal | `96610d18f4c7e880cf5aa42f2ff8028514c7c4ef9a0cd27218a680dfc15d34d5` |
| Definiciones de las 216 pruebas | `7d0e2af21eee16257dcd329b302c7660e8f07f25e5a03642164d0a8eda9d47f9` |
| Arnés | `47dffb097d3dfe58f5d2e9cc28f8837f6951d9e6cd0f58c28263f8d3ece88c03` |

`tests.tap` conserva la salida completa, con SHA-256 `ef0792b870a11fd76813268d9932d0905718f028744bbc46c80f13c60ab06258`. `result.json` contiene los conteos y agregados; `sources-before.json` y `sources-after.json` enumeran cada archivo y su hash.

## Alcance

Son pruebas de lógica y física con Cannon real y DOM/GPU simulados. El pase incluye las protecciones de los niveles anteriores, banco, familias, energía, guardado, mecanismos y los nuevos casos del galpón. No sustituye una revisión visual en Chromium ni certifica por sí solo el recorrido continuo de ochenta productos. No se repitió GLES: las correcciones finales no cambian shaders.

La ejecución anterior de **1863 / 1863**, conservada en `../global-close/`, corresponde al comportamiento previo al objetivo relativo de la pinza. Este registro posterior se mantiene separado para no atribuirle a aquel pase los cinco casos añadidos después.
