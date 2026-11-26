# Reutilización de la ensambladora y del rotor de B

**Resultado:** 2/2 regresiones focales aprobadas, sin fallos ni omisiones. [Salida TAP](galpon-chain-reuse.tap) · [Pruebas reproducibles](../../../tests/galpon-chain-reuse.test.cjs).

Se ejecutan el juego y Cannon con DOM/GPU simulados. La preparación usa las fixtures explícitas de producción pagada y acreditación de B: no acredita el recorrido previo del brazo o de los drones, ni forma parte del linaje nativo del pedido de ochenta. Estas dos pruebas no son una comprobación visual en navegador.

## Ensambladora vacía

La prueba coloca la estación, la mueve y gira mediante las APIs de colocación normales, la retira, guarda y carga en una instancia nueva. Después vuelve a colocar y girar la misma estación, guarda y vuelve a cargar. No escribe poses de cuerpos directamente.

Comprueba que la estación conserva el identificador único `1`; que los sólidos anteriores desaparecen de Cannon al moverla o retirarla; y que sólo existen los sólidos, dos entradas y una salida correspondientes a su estado actual. La restauración de una estación retirada mantiene cero sólidos. La restauración posterior conserva su ubicación y giro. En todos los estados permanecen idénticos los IDs materiales, los orígenes, las masas, la carga de las piezas, la reserva de la fuente y los gastos acumulados.

## Rotor producido por B

La fixture prepara un cubo y seis pirámides de otro origen en las entradas. La estación real reserva esas piezas, paga **12 J**, materializa dos enganches con una bisagra Cannon y recibe el rotor tras comprobar su apoyo físico en la salida. La recepción archiva las dos piezas como un mecanismo y acredita un único producto.

La prueba retira ese mecanismo mediante la guía de colocación de familias, configura sus parámetros con la API normal del rotor y guarda. En una instancia nueva comprueba la misma articulación y sus ajustes: 37 rpm, 1,25 N·m, capacidad de 32 u, sentido inverso, lado A, montaje libre y motor detenido. Después ejecuta el botón normal de separar el rotor y vuelve a guardar y cargar.

El estado final conserva los mismos dos enganches, IDs, orígenes, masas y carga; no reconstruye la bisagra retirada. Los inventarios físicos y contables completos, la reserva y los gastos permanecen idénticos desde la recepción. El pedido sigue acreditando exactamente el mismo producto, y otro intento de acreditarlo se rechaza. Configurar el motor detenido no se presenta como una medición de giro o consumo en marcha.

## Reproducción

Desde la raíz del repositorio:

```sh
node --test --test-reporter=tap tests/galpon-chain-reuse.test.cjs
```
