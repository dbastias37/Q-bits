# Guardado de escenas grandes: validación reutilizada — 22 de noviembre de 2026

## Alcance y referencia

El PR #26 quedó integrado en `main` mediante `0cb078038d43c15be34fc52ad4ec259494b3ac22`. Este bloque toma ese commit como referencia y aborda exclusivamente el guardado repetido. Conserva el formato `qbits-save` versión 1, sus dos claves, la captura completa de estado y la programación de autoguardado. No modifica física, producción, cámara, controles ni el límite de 2000 piezas.

Las fuentes funcionales del bloque están en el commit local `8cfec4a`; la publicación puede tener otro identificador de commit. La identidad verificable de las fuentes son los SHA-256 de todos los módulos incluidos en los JSON de medición. El checkout de referencia carga sus propios módulos completos, sin mezclar versiones.

SHA-256 final de `assets/js/save-games.js`: `92d815253e97b75c8e7357d01f6fcb244911279ac778db4025780a71efdfb92b`.

## Causa y cambios

`saveCurrentGame` captura con `saveLab`, hidrata una copia para conservar el banco en memoria y llama a `saveStore.write`. Antes, cada escritura leía, parseaba y validaba de nuevo el guardado anterior completo, incluso si era exactamente el texto que el mismo store acababa de guardar o leer. Después recorría los datos nuevos, los serializaba y preparaba un resultado independiente.

`assets/js/save-games.js` aplica tres cambios dentro de este mismo pendiente:

1. **Metadatos del registro anterior:** cada store conserva como máximo una entrada por modo, con el texto válido exacto, presencia de arrays y fechas primitivas. Cada operación ejecuta `getItem`; sólo un texto idéntico puede reutilizar la validación. `write` necesita las fechas y el estado del registro anterior, no su árbol completo.
2. **Validación especializada del resultado de `JSON.parse`:** sin reviver, el parser no crea ciclos, getters, símbolos ni objetos Cannon. La ruta privada conserva límites de profundidad, números finitos, claves prohibidas, `toJSON`, fechas y reglas del modo, evitando repetir reflexión por cada propiedad. Los datos vivos de `write` conservan la validación completa mediante descriptores.
3. **Hojas primitivas:** ambos recorridos verifican números, strings, booleanos y null dentro del bucle del contenedor, sin crear una llamada recursiva por cada hoja. Los contenedores continúan visitándose y se conserva el límite de profundidad también para las hojas.

El JSON final se valida antes de `setItem`. Sólo después de que la escritura tenga éxito se publican sus metadatos en la caché. Esta comprobación impide convertir un registro inválido en una entrada confiable, incluso si el callback de reloj altera los datos después de la validación inicial. Se reprodujo ese hueco en la referencia y se añadió una regresión.

Las lecturas públicas siguen devolviendo un objeto recién parseado. Mutar una respuesta no altera otra lectura, las fechas retenidas ni el texto persistido. Se siguen efectuando todas las escrituras previstas, aunque la topología no cambie: energía, poses, velocidades, runtime, ánimo y producción deben permanecer vivos.

La captura e hidratación de `game.js` permanecen intactas. Eliminarlas o diferirlas sería otro cambio con riesgos propios de normalización de quaternions, tiempos absolutos de ánimo y recuperación de inventarios.

## Propiedad, invalidación y memoria

| Elemento | Propietario y duración | Invalidación / comprobación |
| --- | --- | --- |
| Registro validado de campaña | Instancia de `createStore`; una entrada | `getItem` devuelve otros bytes, vacío, versión futura o datos inválidos |
| Registro validado del banco | Instancia de `createStore`; una entrada | Misma regla; una escritura exitosa sustituye la entrada anterior |
| Árbol devuelto por `read` o `write` | Llamante | Nunca forma parte de la caché |
| Hooks heredados de JSON | Se comprueban en cada acceso reutilizado | Añadir o retirar `toJSON` en prototipos sigue siendo observable; Array se comprueba sólo si el registro contiene arrays |

El coste persistente añadido por store es un objeto de dos slots y, como máximo, dos registros de cuatro propiedades, con hasta dos textos JSON. No se conserva un historial ni un snapshot decodificado adicional. La comparación exacta de strings puede costar O(bytes) si el almacenamiento entrega un string nuevo: no se declara O(1) universal. El trabajo de captura y validación de los datos nuevos continúa siendo O(datos).

El Map de medición puede compartir los strings con la caché; no permite aislar bytes adicionales de heap de un navegador. La longitud exacta de los registros figura en los resultados. Tampoco se afirma que un campo retirado sea recolectado inmediatamente por V8.

El inventario reproducible de [memoria.json](mediciones/guardado-20261122/memoria.json), mediante una copia instrumentada sólo en memoria, verificó seis actualizaciones de ambos modos en 16/1000/2000 piezas. Máximo: **tres objetos propios** (raíz + dos registros), dos referencias a registros y ocho campos primitivos: dos strings, cuatro números y dos booleanos. Cero grafos decodificados o entradas/resultados del llamador retenidos por la caché. Los valores raw de banco + campaña suman 7515/387426/774091 bytes UTF-8, respectivamente; son longitudes del contenido, no memoria V8 atribuida. El fallo de cuota conserva la entrada previa; corrupción y eliminación externas se detectan al leer. Tras eliminar y leer ambos slots quedan cero registros y strings, con sólo la raíz vacía.

## Método

`tests/benchmark-save-games.cjs` usa el juego y Cannon reales, con DOM/GPU simulados y almacenamiento Map persistente. Aplica 120 Hz mediante preferencias antes de crear la escena. Los relojes de fechas y autoguardado son deterministas y se comparan entre variantes.

La escena de carga contiene cubos soldados en grupos de hasta diez piezas. Con 1000 piezas son 100 cuerpos dinámicos, más seis estáticos; con 2000 son 200 dinámicos. El fixture estático no tiene restricciones, sensores ni motores activos. El escenario con cambios avanza física real y modifica energía, pose, velocidad y cámara. No sustituye una prueba de producción de todos los mecanismos: su recuperación permanece cubierta por las regresiones integradas.

- Escalas: 16, 100, 500, 1000, 1500 y 2000 piezas, sin aumentar el límite.
- Tres repeticiones AB / BA / AB; ocho calentamientos y 24 muestras por operación.
- Primera operación fría separada. En las escrituras completas el slot comienza vacío; en lectura comienza lleno y el lector es nuevo.
- Escenarios: guardado completo repetido, guardado tras avanzar simulación y modificar datos vivos, lectura repetida y store nuevo antes de cada escritura sobre un slot existente.
- Guarda de ocho segundos por caso/variante, incluyendo preparación y verificación entre operaciones atómicas. No interrumpe Cannon o almacenamiento a mitad.
- CPU: usuario + sistema del proceso Node; pared: duración transcurrida de la operación. No son porcentajes de CPU, tiempo exclusivo del hilo principal, FPS ni tiempo de GPU.
- Almacenamiento: el coste real de Web Storage y disco no está medido. Las escrituras y lecturas del Map no simulan esa latencia.
- Los contadores detallados y los perfiles de fases se ejecutan aparte. Los tiempos principales conservan sólo dos contadores escalares de accesos al almacenamiento. No hay logs por tick ni buffers indefinidos.
- p50/p95/p99 se calculan por rango más próximo. Con 24 muestras, p95 es el elemento 23 y p99 el 24: el ensayo acotado no caracteriza pausas raras a largo plazo.

La validación compara strings completos y registros parseados completos en frío y al final, hashes de payload/resultado/fechas en cada muestra, snapshot guardable y estado físico al final. Cada operación comprueba que guardar o leer no ejecuta pasos ni descarta tiempo. Los cambios de estado del escenario activo ocurren antes del intervalo cronometrado y llegan al guardado.

## Resultados medidos

Equipo: Linux x64, Node v24.22.3, AMD EPYC 9V74 80-Core Processor, `availableParallelism=9`. Todas las **24 configuraciones × 3 repeticiones = 72 parejas** terminaron dentro de la guarda y conservaron exactamente sus resultados. La tabla muestra la mediana de las tres medias de CPU de proceso y la mediana de los percentiles de pared. Las muestras, rangos, p99 y primeras operaciones están en [tiempos.json](mediciones/guardado-20261122/tiempos.json); [resumen.json](mediciones/guardado-20261122/resumen.json) contiene los agregados.

| Operación | Piezas | CPU antes → después, ms | Pared p50 antes → después, ms | Pared p95 después, ms |
| --- | ---: | ---: | ---: | ---: |
| Guardado repetido | 16 | 1,972 → 1,180 | 1,534 → 1,020 | 1,103 |
| Guardado repetido | 100 | 9,416 → 5,308 | 7,607 → 5,008 | 5,329 |
| Guardado repetido | 500 | 41,659 → 26,917 | 37,625 → 24,716 | 27,242 |
| Guardado repetido | 1000 | 78,018 → 51,198 | 74,589 → 48,703 | 54,165 |
| Guardado repetido | 1500 | 118,514 → 76,780 | 114,918 → 74,283 | 80,084 |
| Guardado repetido | 2000 | 158,467 → 103,915 | 153,484 → 99,845 | 110,399 |
| Guardado con cambios | 16 | 1,977 → 1,638 | 1,656 → 1,136 | 1,280 |
| Guardado con cambios | 100 | 9,153 → 6,337 | 7,980 → 5,378 | 5,751 |
| Guardado con cambios | 500 | 42,016 → 28,301 | 39,237 → 25,729 | 27,842 |
| Guardado con cambios | 1000 | 83,131 → 56,712 | 78,240 → 52,860 | 59,009 |
| Guardado con cambios | 1500 | 123,444 → 81,099 | 117,874 → 77,582 | 83,496 |
| Guardado con cambios | 2000 | 162,439 → 106,764 | 156,355 → 102,035 | 111,253 |
| Lectura repetida | 16 | 0,932 → 0,038 | 0,643 → 0,036 | 0,042 |
| Lectura repetida | 100 | 3,288 → 0,185 | 3,180 → 0,177 | 0,215 |
| Lectura repetida | 500 | 16,126 → 0,902 | 15,386 → 0,884 | 0,946 |
| Lectura repetida | 1000 | 32,092 → 1,765 | 30,797 → 1,755 | 1,850 |
| Lectura repetida | 1500 | 48,521 → 2,619 | 45,639 → 2,611 | 2,683 |
| Lectura repetida | 2000 | 66,821 → 3,896 | 62,810 → 3,717 | 5,592 |
| Store nuevo, slot existente | 16 | 1,790 → 1,174 | 1,285 → 0,979 | 1,125 |
| Store nuevo, slot existente | 100 | 7,234 → 5,393 | 6,488 → 4,917 | 6,852 |
| Store nuevo, slot existente | 500 | 32,392 → 24,362 | 31,526 → 23,366 | 26,684 |
| Store nuevo, slot existente | 1000 | 64,033 → 46,535 | 62,975 → 45,746 | 48,594 |
| Store nuevo, slot existente | 1500 | 95,578 → 68,998 | 94,123 → 68,192 | 69,983 |
| Store nuevo, slot existente | 2000 | 135,985 → 92,462 | 131,427 → 90,365 | 96,453 |

### Variación entre repeticiones, 1000 piezas

| Operación | Rango de medias CPU antes, ms | Rango después, ms |
| --- | ---: | ---: |
| Guardado repetido | 76,603–78,837 | 50,875–52,317 |
| Guardado con cambios | 81,638–83,972 | 55,678–56,909 |
| Lectura repetida | 31,281–32,476 | 1,760–1,783 |
| Store nuevo, slot existente | 63,807–64,455 | 45,383–46,866 |

### Coste frío y límites

La primera escritura de una escena grande sobre un slot vacío es más cara por la comprobación final del registro. En el escenario de guardado repetido, su mediana de pared pasa de **48,984 a 57,785 ms** para 1000 piezas y de **97,393 a 116,650 ms** para 2000. El control de 16 pasa de 1,798 a 2,160 ms. La mejora se acepta para el uso repetido junto con la protección adicional de la partida anterior; este coste inicial no se oculta en los valores calientes.

La lectura fría sí mejora: 1000 piezas pasan de 34,693 a 7,769 ms de pared; 2000, de 71,105 a 16,681 ms. Es una validación completa del texto externo, todavía sin un hit en la caché.

El guardado continúa siendo una operación síncrona grande. Desde 500 piezas el guardado repetido ya excede por sí solo los 16,67 ms de pared; con 2000 llega a p50 99,845 ms. No se declara eliminado todo tirón de autoguardado, ni se extrapola el resultado a FPS. La siguiente reducción de este coste exige investigar la validación/captura e hidratación restantes, o una tarea separable con orden y recuperación de fallos medidos. No se omiten consumos, datos ni escrituras para obtener estas cifras.

Estos cambios reducen picos de autoguardado y de acceso al menú de partidas. No aceleran por sí mismos los pasos físicos continuos. No se suman porcentajes de escritura y lectura para prometer una mejora global.

## Contadores y fases, separados de los tiempos principales

En un guardado repetido de 1000 piezas permanecen una captura, 100 llamadas a `worldParts`, 1000 copias de ánimo, una hidratación, dos `JSON.stringify`, una lectura de almacenamiento y una escritura. Los parseos bajan de **3 a 2** porque deja de materializarse la partida anterior. El texto de ese fixture estático conserva exactamente **387175 bytes**.

Las llamadas recursivas de `checkJson` pasan de 73172 a 5834: se elimina el recorrido previo y las hojas pasan a verificarse en el bucle. La ruta privada `checkParsedJson` entra 5835 veces para verificar los contenedores del resultado nuevo. Estos son **conteos de llamadas**, no de valores omitidos: las propiedades primitivas continúan comprobándose. En una lectura repetida, queda un parseo y la comprobación de prototipos; desaparece el recorrido estructural repetido.

El perfil separado de 1000 piezas, tres repeticiones con ocho calentamientos y ocho muestras, informa medianas de medias de pared **instrumentadas e inclusivas**: `readFrom` en escritura 42,621 → 0,024 ms; validación de entrada 42,007 → 31,685 ms; hidratación 10,435 → 10,941 ms. La nueva comprobación final consume 7,308 ms, incluyendo su validación del modo. No se suman estas fases ni se usan como sustituto de los tiempos sin wrappers. El coste restante de hidratación no se presenta como optimizado.

Los archivos [contadores.json](mediciones/guardado-20261122/contadores.json) y [perfil.json](mediciones/guardado-20261122/perfil.json) contienen las fuentes, llamadas, muestras y equivalencia de sus ejecuciones. Los contadores abarcan 16/1000/2000 piezas; el perfil temporal diagnóstico utiliza 1000. El escenario de estado cambiado produce textos mayores al incorporar posiciones/velocidades decimales; cada variante conserva exactamente los mismos bytes de cada muestra, y no se mezcla su tamaño con el fixture estático.

## Validación funcional

La suite final pasó **1213/1213 pruebas**, cero fallos/cancelaciones/omisiones: 51,143 s. Ese tiempo es duración de la suite y no una medida de rendimiento del juego. La comprobación dirigida de guardado pasó **56/56**. La versión de carga pasa a `20261122-save-cpu-1`.

Las seis regresiones nuevas cubren cambios externos del mismo tamaño, corrupción y versiones futuras después de una lectura válida; eliminación; mutación de las fechas devueltas; cuota y reintento; cambio de almacenamiento y permisos; profundidad y números no finitos; hooks de prototipo; y alteración de datos durante el callback de reloj. La suite existente verifica restauración real de cintas, cargas, vuelo, rutas, servos, marcha, inventarios, ánimo, campaña y transiciones, además de pausa, pestaña oculta y pagehide.

No se modifica el renderizado. No se atribuyen resultados visuales ni nuevos FPS a este bloque.

## Reproducción

Desde el checkout de la entrega, crear la referencia sólo si no existe:

```bash
git worktree add --detach ../qbits-save-baseline 0cb078038d43c15be34fc52ad4ec259494b3ac22
node --test tests/*.test.cjs
node --expose-gc tests/benchmark-save-games.cjs --output=/tmp/qbits-guardado-tiempos.json
node tests/benchmark-save-games.cjs --mode=counters --scales=16,1000,2000 --repetitions=1 --warmup=1 --samples=1 --output=/tmp/qbits-guardado-contadores.json
node tests/benchmark-save-games.cjs --mode=profile --scales=1000 --repetitions=3 --warmup=8 --samples=8 --output=/tmp/qbits-guardado-perfil.json
node tests/benchmark-save-memory.cjs --output=/tmp/qbits-guardado-memoria.json
```

Ejecutar los comandos temporales secuencialmente, sin pruebas ni perfiladores paralelos. `--baseline-root`, `--optimized-root`, `--scales` y `--scenarios` permiten seleccionar checkouts y subconjuntos; el JSON registra toda la configuración. El script rechaza modificaciones de las fuentes durante la ejecución.

## Fuentes primarias

- [MDN: JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse): tipos producidos por el parser, reviver y tratamiento de claves como `__proto__`.
- [MDN: JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify): conversión de valores, hooks y orden de propiedades. La validación previa conserva el rechazo de datos que JSON omitiría o convertiría.
- [WHATWG HTML: Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html): lectura del valor actual, fallo de cuota antes de sustituir el registro y notificación de cambios. La caché comprueba los bytes en cada acceso y no depende de que ya se haya entregado un evento `storage`.

