# Suite global del cierre de B

**1863 / 1863 pruebas aprobadas**, sin fallos, cancelaciones, omisiones ni pendientes. El reportero TAP declara **182053,484583 ms**. Se ejecutaron los **215 archivos `tests/*.test.cjs`** con Node **v24.22.3**:

```sh
node --test --test-reporter=tap tests/*.test.cjs
```

La ejecución se inició después de cerrar los 49 focales de coordinación brazo/QR, interrupción productiva, logística, energía y guardado. Incluye el detector exacto de hélices, los shells familiares y la presentación de la enseñanza revisada en Chromium. El mensaje de extracción recuperada también está incluido en esta versión de las fuentes; su revisión visual final queda separada.

## Fuentes comprobadas

Los manifiestos se capturaron a las **09:11:55,763 UTC** y **09:15:54,750 UTC** del 26 de noviembre de 2026. Registran 348 archivos: JS/CJS, CSS, GLSL y JSON bajo `assets` y `tests`, más `index.html`. Incluyen el arnés y las fixtures; no incluyen documentación, imágenes ni logs.

| Grupo | SHA-256 idéntico antes y después |
| --- | --- |
| Runtime bajo `assets` y `index.html` | `04f4d18c8d7fffbffe5b1723b4ae5bb79c621e0b6d28bea8f55a14e1fbc68f38` |
| Los 215 archivos de pruebas | `907c536be3794babe24eaa782e005bf7db3745ed1ed29a5c6c12bccbc82de451` |
| `tests/game-harness.cjs` | `a6a143fefeafc0ecc50da95ba37dfb7f24ba8f9e9302df726b7bd3f62daa46f2` |

El agregado de los 348 archivos cambia porque entre las dos lecturas se editaron **sólo** `tests/benchmark-galpon-drone-route.cjs` y `tests/benchmark-galpon-feed-drones.cjs`, durante la preparación independiente del helper de montaje. Ningún archivo de prueba, arnés o fixture de esta ejecución los importa. Sus hashes anteriores y posteriores se conservan expresamente en `result.json`; no se afirma que esta suite haya probado esas revisiones del helper.

La rama es `prueba/galpon-primer-ciclo`, sobre HEAD `6cdd33320cc2e022d7c35fc9c34fa544432c4d95`, con los cambios locales de B. Ese HEAD por sí solo no identifica las fuentes probadas: los manifiestos contienen sus hashes individuales.

## Archivos

- `tests.tap`: salida TAP completa; SHA-256 `22aca11508228971931b475c623998deae9b3d6d3e3c146936c82c7b5662497d`.
- `result.json`: conteos, duración, comando, entorno, hashes y diferencias entre manifiestos.
- `sources-before.json` y `sources-after.json`: rutas, tamaños y hashes de cada fuente, más la lista exacta de pruebas seleccionadas.

## Alcance

La suite ejecuta la lógica y Cannon con DOM/GPU simulados. No certifica por sí sola Chromium, shaders GLES ni una partida continua de ochenta entregas. No se repitió GLES porque los ajustes de cierre no cambian shaders. Las capturas QR y los ensayos nativos continuos conservan sus evidencias propias.

Una modificación posterior del runtime, las definiciones de prueba o sus dependencias debe distinguirse de esta ejecución mediante los hashes. La captura y medición del guardado final de ochenta siguen pendientes cuando se registra este resultado.
