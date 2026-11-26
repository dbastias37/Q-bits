# Hélice: volumen exacto y obstrucciones reales

Esta evidencia separa una regresión geométrica, una continuación con Cannon y una medida de CPU de consultas. No es una revisión visual ni una demostración de ochenta recibos.

## Geometría y causa

`obstruction-before.json` registra el corte del receptor 295, módulo 287, a los 3316,667 s. La mesa 41 tiene centro `(3,08; 0,55; −0,25)`, semiejes `(0,34; 0,025; 0,35)` y orientación identidad. El tip estaba en `(3,597709; 0,480726; −0,246920)`. Su separación horizontal real, 0,177709 m, excede el radio 0,130279 m. El AABB de la mesa expresado en el marco girado de la hélice incluía espacio vacío y arrojaba 0,128790 m.

`propellerSweepIntersects` conserva las dimensiones anteriores: radio `0.09 * sqrt(2) + 0.003`, límite axial inferior `0.001` y superior `0.09 / 2 + 0.002`. Para un poliedro convexo, los vértices del recorte por dos planos paralelos son los vértices interiores originales y las intersecciones de las aristas con esos planos. Su envolvente proyectada es exactamente la proyección del sólido recortado. Por tanto, su distancia al eje determina si invade el cilindro protegido. Se mantiene la comparación radial estricta anterior y el contacto con los planos axiales. Los cálculos usan coma flotante ordinaria, sin introducir márgenes o muestreo angular del disco.

La esfera centrada en el tip con radio `hypot(radio, límite axial superior)` contiene todo el cilindro para cualquier orientación. Comparar su distancia a una OBB sólo descarta candidatos imposibles antes de generar vértices. Los perfiles tetra, pirámide y acoplador usan sus aristas y vértices reales. Las piezas se consultan por separado; no se envuelven los huecos de un conjunto. Los cargos, las paredes y los shells de familias mantienen sus cuerpos propios.

## Archivos y alcance

| Archivo | Comprobación |
| --- | --- |
| `checkpoint-before.json` | Guardado real de la tanda detenida, antes de reintentar el vuelo |
| `obstruction-before.json` | Fallo original, geometría de la mesa y caja que produjo el falso positivo |
| `continuation-after.json` / `.log` | Mismo guardado: arranque normal y 120 s de Cannon, sin fallos de obstrucción |
| `column-yaw.json` | Consultas virtuales de sólo lectura, 72 giros por 121 alturas en dos columnas; cuerpos sin cambios |
| `query-perf.json` | Coste de consultas sobre un checkpoint real distinto, a 3549,6 s |
| `propeller-focus.tap` | 32/32 de geometría y hélices; anterior a añadir la familia al barrido |
| `drone-power-focus.tap` | 34/34 de QR, guardado, recarga y potencia; anterior a añadir la familia al barrido |
| `family-focus.tap` | 37/37 de geometría y familias; incluye el shell físico |
| `manifest.json` | Hash de código y checkpoint, límites conservados y conteos |

Los tres logs focales contienen 94 pruebas distintas por el solapamiento de geometría. Las pruebas nuevas permanentes están en `tests/propeller-clearance.test.cjs`; no necesitan los checkpoints de esta carpeta. La continuación de 120 s se ejecutó antes de añadir la consulta de familias; la inclusión posterior está comprobada por su focal. La siguiente tanda nativa debe volver a cargar el código actual para incluir ambas correcciones.

El barrido virtual reproduce la consulta en orientaciones e incrementos de altura distintos sin reposicionar cuerpos, gastar energía ni acreditar hitos. De las 72 orientaciones, el AABB anterior bloqueaba 55 en la columna inicial y 40 en la de `x=4`, mientras que el volumen exacto deja libres ambas columnas. No implica que cualquier ruta completa o cualquier distribución de obstáculos sea transitable.

En la medida de CPU se cargaron dos instancias del mismo checkpoint de 3549,6 s, con 156 cuerpos y tres hélices: una con el detector anterior y otra con el actual. Se comprobó igualdad de poses, identidades, inventario familiar, energía y respuestas. Después de calentar ambas, nueve pares alternados de 1050 consultas dieron medianas de 0,15047 y 0,01443 ms por módulo. Es una microcomparación de consultas en Node con el contexto nativo del arnés; no incluye física, renderizado ni una promesa de rendimiento en dispositivos.
