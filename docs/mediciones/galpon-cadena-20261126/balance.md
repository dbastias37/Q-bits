# Cómo reproducir el balance por tandas

El agregador lee la secuencia declarada de guardados del galpón y los recibos de sus logs. No inicia Cannon, el navegador ni la producción. Mantiene separados **montaje**, **intento automático** y **recuperación**, de modo que una pausa o un remontaje conserve todo su coste sin alterar la media de los intervalos anteriores.

El [manifiesto observado](balance-manifiesto.json) contiene el A de origen, las recuperaciones declaradas y los checkpoints separados de **20, 40, 60, 80 y 81 recibos**. Valida veinte checkpoints y diecinueve tramos. El pedido de ochenta termina con **7892,14 J** y la recepción posterior deja **6048,50 J** en la misma fuente. Sus rutas relativas apuntan a las copias incluidas en `partida/`; los hashes conservan los bytes observados y permiten verificar esas copias. El [JSON de resultados](balance-observado.json) conserva los datos numéricos y hashes, y el [informe legible](balance-observado.md) muestra los tramos. Los resultados pueden leerse directamente o regenerarse con los guardados y logs incluidos en este directorio.

No se descuenta ningún intento anterior. La cuarta tanda conserva el intento interrumpido de 1200 s y 2972,47 J sin otro recibo, la recuperación de la toma 902 de 50,27 s y 282,12 J y el nuevo arranque de 1,53 s y 28,84 J. Entre los checkpoints de sesenta y ochenta transcurren **4717,33 s** y se debitan **38881,81 J**; el último tramo automático dentro de ese total ocupa 3464,00 s y 35594,92 J. El tramo 80→81 está separado: **181,00 s y 1843,64 J**. La secuencia incluye intervenciones y no se presenta como una sola ejecución ininterrumpida.

El [log final](partida/run_to_80_yaw.log) se congeló después de la recepción 81, con su [resumen original](partida/run_to_80_yaw_benchmark.json). Los eventos `rotor recibido 61` a `rotor recibido 80` contienen el contador de cadena y se cotejan con el checkpoint de ochenta. El evento posterior a la victoria tiene otro formato: el recibo 81 se verifica mediante los dos guardados y aparece sin observación de ese formato en `missingReceiptCounts`. No falta el producto en el registro y no se inventa una línea de log para completar esa columna. El contador visible de objetivo se limita a 80; el inventario durable conserva 81 productos y 162 integrantes.

## Ejecutar

Desde la raíz del repositorio:

```sh
node tests/aggregate-galpon-chain-balance.cjs \
  docs/mediciones/galpon-cadena-20261126/balance-manifiesto.json \
  docs/mediciones/galpon-cadena-20261126/balance-observado
```

El último argumento es un prefijo de salida. Se escriben dos informes, `.json` y `.md`; los guardados y logs se abren sólo para lectura. Sin ese argumento, el JSON se emite por stdout. Las rutas relativas de los archivos de entrada se resuelven respecto del manifiesto, no del directorio de ejecución.

## Extender la misma partida a 20, 40, 60 y 80

1. Conservar el checkpoint original de A. Esta secuencia usa `createdAt = 1795673510034`, cuatro trabajadores con IDs 3–6, 548 s y 170716,231376 J. Otra apertura puede tener un saldo muy parecido y pertenecer a una rama distinta.
2. Añadir el checkpoint que termina el siguiente tramo a `checkpoints`, con un `id` nuevo y su ruta. Añadir `sha256` fija los bytes del archivo; si cambian, el agregador rechaza la entrada.
3. Añadir a `segments` un tramo entre el último checkpoint anterior y el nuevo. Usar `kind: "run"` para el intento automático, `"recovery"` para su recuperación o `"setup"` para montaje y arranque. No omitir una parada para presentar dos intentos como uno continuo.
4. Para un tramo automático, añadir su log JSON por líneas a `logs` y declarar `outcome: "interrupted"` o `"completed"`. El agregador sólo promedia recibos consecutivos dentro de ese tramo. Si se vuelven a proporcionar los mismos recibos, los deduplica; si discrepan en tiempo o energía, los rechaza.
5. Regenerar el informe. Los objetivos de `targets: [20, 40, 60, 80]` sólo cambian a observados cuando un checkpoint validado contiene esos recibos. Ningún hito se infiere a partir del ritmo de producción.

Una entrada nueva al final del manifiesto puede seguir esta estructura, sustituyendo los valores por los archivos observados:

```json
{
  "checkpoint": {
    "id": "tanda_20",
    "path": "tanda-20/10-tanda-1.json",
    "label": "Primera tanda completa"
  },
  "segment": {
    "id": "intento_hasta_20",
    "kind": "run",
    "outcome": "completed",
    "from": "ultimo_checkpoint_validado",
    "to": "tanda_20",
    "logs": [{"path": "tanda-20/ejecucion.log"}]
  }
}
```

El ejemplo muestra los dos objetos que se insertan en sus listas respectivas; no es por sí mismo un manifiesto ejecutable. Un único tramo largo puede contener los recibos intermedios en el log. Los checkpoints por recibo del benchmark permiten conservar energía exacta en esos puntos; para la evidencia final bastan las tandas si se mantienen también los intentos interrumpidos, las recuperaciones y su linaje.

## Qué verifica

Cada guardado pasa `QBitsSavedGames.validate('galpon', data)` y `QBitsGalponProduction.validate`. Además, entre archivos consecutivos se exige:

- La misma apertura, trabajadores iniciales y pedido; reloj y extracción crecientes y fuente sin incrementos.
- La conservación de cada origen y de su unidad de materia. Los IDs geométricos pueden cambiar al dividir o recomponer, pero un ID observado no puede reaparecer vinculado a otro origen.
- La permanencia y el orden de los recibos, sin cambiar los productos, sus dos orígenes ni su fecha de recepción ya acreditada.
- El cierre de la fuente con extracción, conversión, conformado, carga, refrigeración, transporte, montaje y reconfiguración. Conformado y montaje se comprueban también como suma: la ensambladora reclasifica 8 J al confirmar los dos enganches sin volver a cobrarlos.
- La correspondencia de cada evento `rotor recibido N` con un producto del checkpoint final del tramo. El sondeo del benchmark es de 1 s, por lo que su lectura puede ser posterior a la recepción física guardada. Los logs anteriores redondean la fuente a 0,01 J; ambas horas quedan diferenciadas en el informe.

El informe conserva el SHA-256 de cada guardado, log y módulo validador. Los IDs históricos, masa por custodia, procesos pendientes y carga de las baterías externas ayudan a distinguir una entrega nueva de un producto previo o de material en tránsito.

## Cómo interpretar la energía

`sourceSpentJ` es la disminución del depósito compartido durante todo el tramo. Incluye la recarga de baterías realizada en ese tiempo. No se suma otra vez esa recarga, ni los 900 J de capacidad nominal de cada batería, como energía consumida. La carga personal inicial de los cuatro trabajadores es una concesión separada de 1200 J y ya existe desde la apertura.

`externalBatteryDecreaseJ` compara las mismas baterías externas en los extremos cuando sus IDs coinciden. Puede ser negativa si terminan más cargadas. No representa todo el cambio de carga de la instalación: trabajadores, cubos, enganches y productos también pueden conservar energía. Por ese motivo el agregador no presenta un balance térmico o de disipación total a partir de esa columna parcial.

La media entre recibos consecutivos evita usar como coste por rotor el primer producto de un intento que ya tenía insumos avanzados. Sigue siendo una medición de la instalación entera, con inventario en tránsito, no del dron aislado. El coste total del tramo —incluidas esperas y la parada final— siempre se conserva en otra columna.

## Límite de la evidencia

El manifiesto distingue procedencia `native` o `fixture` de forma explícita. Los validadores comprueban coherencia de datos y los hashes fijan archivos; no pueden demostrar por sí solos qué controles usó una persona, ni impedir que dos clones compatibles compartan `createdAt`. La procedencia se apoya también en los controladores, registros y checkpoints de la ejecución elegida. Este conjunto contiene los ochenta recibos y la continuación hasta ochenta y uno; el informe no acredita render, interacción visual ni estabilidad durante más tiempo o en otras instalaciones que las observadas.
