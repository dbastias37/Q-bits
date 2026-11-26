# Cadena del galpón · partida y balance observados

Esta carpeta conserva la continuación de una misma partida de A, iniciada con cuatro trabajadores. El linaje `1795673510034` llegó a ocho cintas y doce cubos a los **548 s**, con **170716,231376 J** de los 180000 J iniciales. Los montajes, viajes, recargas, cortes y productos de B se apoyan en ese mundo. Las pausas y recuperaciones durante el desarrollo se conservan en el balance; no se presenta toda la secuencia como una ejecución sin intervención.

## Resultado completo

La partida recibió **ochenta rotores únicos**, acreditó **sesenta segundos de actividad útil** y continuó fabricando hasta recibir un **producto 81** en el mismo mundo. La vista del pedido permanece en 80/80 después de la victoria; la lista de recibos conserva el producto adicional.

| Hito | Tiempo acumulado de misión (s) | Reserva de la fuente (J) |
| --- | ---: | ---: |
| A: ocho tramos y doce cubos | 548,00 | 170716,23 |
| Primera tanda: 20 rotores | 5227,67 | 120138,36 |
| Segunda tanda: 40 rotores | 8769,20 | 83467,21 |
| Tercera tanda: 60 rotores | 12311,67 | 46773,95 |
| Cuarta tanda: 80 rotores y continuidad | 17029,00 | 7892,14 |
| Continuación: rotor 81 | 17210,00 | 6048,50 |

El [guardado de ochenta](partida/batch_80.json) conserva **598 registros y 580 u** en el conjunto de la instalación. El [guardado posterior](partida/post_victory_81.json) conserva **600 registros y 582 u**, con **81 recibos** y **162 piezas** de esos productos. El validador comprueba materia por origen, custodia única y permanencia de los recibos entre todos los checkpoints del manifiesto.

La última tanda parte de la recuperación de orientación y produce veinte recibos sin otra intervención en las cargas: **3464 s**, **35594,920012 J** debitados de la fuente, hasta **157 cuerpos activos** y **110 grupos** durante el tramo. Termina con **150 cuerpos** y **103 grupos**. El producto adicional necesita **181 s y 1843,638081 J**; no se concede materia ni energía al completar el pedido.

El [estado de ochenta restaurado en Chromium](../galpon-b-20261126/real-order/README.md) conserva las mismas identidades y reserva y abre sin advertencias, con el brazo y los tres seguidores. Sus capturas y mediciones de pasos y render se distinguen del recorrido físico ejecutado por el benchmark. La [suite global final](../galpon-b-20261126/global-final/README.md) aprobó **1868/1868** pruebas con todas las fuentes intactas durante el pase.

## Evidencia disponible

- [Balance observado](balance-observado.md): checkpoints, saldo y duración de cada montaje, intento y recuperación.
- [Datos exactos](balance-observado.json) y [manifiesto](balance-manifiesto.json): identidades, materia, custodia, categorías de gasto y hashes de los archivos incluidos en `partida/`.
- [Cómo regenerar el balance](balance.md): validación de las copias sin iniciar la simulación.
- [Componentes y presupuesto](../../GALPON_ECONOMIA.md): costes medidos y proyecciones identificados por separado.
- [Brazo sobre pedestal](../../GALPON_BRAZO_PEDESTAL.md): tres transferencias físicas del segundo frío a la entrada B, coste y límite observado del montaje ensayado hacia A.
- [Render, interacción y regresiones](../galpon-b-20261126/README.md): Chromium, GLES y pruebas aisladas, con su alcance propio.
- [Perfil del arnés](perfil-arnes.md): equivalencia de estado y coste del contexto de ejecución; no es una medición de FPS.

## Reproducir una partida nueva

Desde la raíz del repositorio:

```sh
node tests/benchmark-galpon-chain.cjs \
  --hz=60 --until=complete --target=80 --after-victory=rotor \
  --output=/tmp/qbits-cadena-nueva
```

El benchmark automatiza los mismos comandos de construcción, mano, configuración, cables y enseñanza disponibles en el juego. Avanza Cannon con pasos de 1/60 s. La producción paga material y energía; las cargas no se crean como fixtures ni se escriben sus poses durante el transporte. Los helpers de las rutas usan la muestra física presente al enseñar la pinza. La instalación y configuración son intervenciones automatizadas; sólo los segmentos de producción posteriores se informan como autónomos.

`--target=20`, `40` o `60` permite detener y guardar una tanda. `--checkpoint=/ruta/al/guardado.json` abre ese mismo mundo en otra instancia, comprueba sus controladores y conserva sus poses, recibos y gasto. El script guarda cada recepción y conserva `failed.json` ante una parada. `--after-victory=rotor` exige que la fábrica reciba otro producto físico después del pedido, además de comprobar que el reloj continúa.

La opción predeterminada `nativeContext` evita el coste de las consultas a través del contexto de Node. No acelera los relojes ni altera las constantes físicas. `--native-context=false` permite usar el contexto anterior; la equivalencia está documentada en el perfil del arnés.

## Qué valida cada nivel

| Nivel | Qué observa | Límite |
| --- | --- | --- |
| Modelo y regresiones | Recetas, pagos, reservas, historial, guardado, restricciones y continuidad | Los ensayos aislados pueden preparar entradas como fixtures declaradas |
| Partida nativa con Cannon | Construcción pagada, agarres, contactos, transporte, productos y recuperaciones | DOM y GPU instrumentados; acciones automatizadas y reloj ejecutado más rápido que el tiempo real |
| Agregador | Permanencia de recibos y orígenes, masa, custodia y cierre de gasto entre guardados | Los hashes y el linaje no prueban por sí solos las acciones que produjeron el archivo |
| Chromium y WebGL | Restauración, controles reales, texto, encuadre y render del checkpoint | La captura de un estado no reproduce de nuevo todo su recorrido previo |
| Medición de simulación y render | Coste de los pasos y del dibujo en el entorno medido | No predice los FPS de una GPU de escritorio ni la comodidad de una sesión manual |

## Recuperaciones conservadas

El primer intento se detuvo tras nueve rotores por una falsa obstrucción del volumen de hélice. Se trasladaron el dron vacío y sus balizas mediante la mano y se volvieron a enseñar las poses. La corrección geométrica posterior conserva el radio y el espesor de seguridad y comprueba el sólido real.

El segundo intento se detuvo después de diecisiete. La carga 569 se soltó con la pinza, se llevó a la primera cinta y volvió a recorrer los ocho tramos; ese recorrido recuperó su historial automático. El dron vacío se enderezó, se recargó desde su borne y se reenseñó sobre otra carga real. La recuperación detectó además la interferencia entre el regreso del dron y la entrega siguiente del brazo: ambos se turnan ahora en ese puesto hasta terminar su retirada. Las fases manual y automática, con su gasto concurrente, permanecen separadas.

Las tandas de veinte, cuarenta y sesenta conservaron todos los productos al guardar y cargar. El intento siguiente esperó 1200 s sin tomar la carga 902 y sin recibir otro rotor. Su coste, **2972,465216 J**, incluye la actividad inicial, el frío, la recarga y el funcionamiento durante la espera; no es un consumo de reposo puro. La continuidad útil volvió a cero y el saldo de **43798,022655 J** permanece en el checkpoint de esa parada.

El estado final de cada hito y las recuperaciones posteriores se deben leer en el balance observado. Sólo los objetivos respaldados por un checkpoint validado se consideran completados; no se extrapola el pedido desde una tanda corta.

La recuperación de esa última pausa conservó el punto enseñado de la cara de la pinza mientras el chasis mantuvo su orientación física. La carga 902 fue recogida, entregada y seguida de un regreso y recarga reales. El tramo añadió **50,266667 s y 282,123126 J** de trabajo concurrente, sin reenseñar ni recolocar cuerpos. El arranque restaurado posterior se contabiliza por separado. La tanda final y el producto 81 conservan todos esos gastos anteriores.
