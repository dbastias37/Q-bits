# Muebles del taller

`assets/js/furniture-models.js` contiene adaptaciones ligeras de los dos modelos entregados por el usuario. No descarga ni carga los GLB originales durante la partida. Las piezas visibles y sus colliders usan los mismos centros, orientaciones y semiejes; los huecos permanecen abiertos.

## Mesa

Referencia: [SciFi Desk](https://sketchfab.com/3d-models/scifi-desk-d4a09022a8874ae6bdc44b3e42a6ea6c), de [Sousinho](https://sketchfab.com/sousinho), proporcionada como `scifi_desk.glb`. Los metadatos del archivo indican [Sketchfab Standard](https://sketchfab.com/licenses).

La fuente tiene 318 vértices y 476 triángulos. Sus cuatro texturas PNG explican casi todo el archivo de 17.933.148 bytes. Se inspeccionaron la geometría transformada, los materiales y las vistas frontal, lateral y posterior. Su perfil es una L: una tapa volada gruesa y un panel continuo hasta el suelo en uno de los bordes largos.

La adaptación conserva ese perfil con cinco cajas: tapa gris clara, banda plomiza, panel posterior, base y acento verde discreto. Omite texturas, circuitos, líneas superficiales y biseles. Mide 1,40 × 0,80 m y mantiene la superficie del taller a 0,60 m de altura. El origen local es el centro de la superficie; el hueco bajo la tapa tiene colisiones abiertas. `surfaceHalf=[.7,0,.4]` es la huella utilizable por los controles del taller.

## Repisa

Referencia: [Honeycomb Shelf](https://sketchfab.com/3d-models/honeycomb-shelf-181888b5bfbc48019061529af3270839), de [re:3D](https://sketchfab.com/re3d), proporcionada como `honeycomb_shelf.glb`, bajo [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

La geometría y distribución adaptadas de esta repisa se ofrecen bajo **CC BY-SA 4.0**. Este alcance corresponde a la adaptación geométrica de la repisa en `QBitsFurniture.shelf()`; no cambia la licencia del resto del juego ni de la mesa. Se han modificado la escala, el grosor, el color y la construcción geométrica, y se eliminaron las pestañas y orificios de tornillos.

La fuente tiene 68.555 vértices, 128.368 triángulos y ocupa 3.187.996 bytes. Se conservan los quince huecos hexagonales, sin respaldo, con techo y suelo horizontales. Las seis columnas mantienen 2–2–3–3–3–2 huecos y sus alturas escalonadas originales. La adaptación usa 61 segmentos compartidos, equivalentes a 732 triángulos, y mide aproximadamente 1,534 × 0,982 × 0,240 m.

El modelo está en el plano XY, con el frente hacia +Z y su borde inferior cerca de Y=0. `cells` enumera los huecos por columna de izquierda a derecha y de abajo hacia arriba. `parts` contiene cajas `{p,q,half,color}` en ese mismo espacio local. Cada caja se transforma mediante la pose de instalación y se usa tanto para dibujo como para física; ninguna caja llena el interior del hexágono.

## Comprobación

Las pruebas Node de muebles comprueban el perfil abierto, la continuidad entre dibujo y collider, el apoyo de piezas con Cannon, la retirada del banco y la geometría de los quince huecos. Las capturas GLES ejecutan los shaders y dibujos reales del juego. No sustituyen una partida visual en navegador.
