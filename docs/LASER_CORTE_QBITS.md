# Láser de corte adaptable

Implementado el 26 de noviembre de 2026. Primera pieza industrial, disponible en el banco y el editor de escenas. La máquina de dos entradas y una salida sigue pendiente.

## Uso

1. F8 → Mecanismos → **Láser de corte · cubo adaptable**, o Q → Banco rápido → **Láser de corte**. Coloca su fantasma azul. También puedes adaptar la cara señalada de un cubo libre desde su clic derecho.
2. Coloca **dos cubos láser enfrentados**, con los distintivos naranjas apuntándose directamente, a la altura del material y separados por un máximo de 50 cm entre cabezales. Se pueden instalar a ambos lados de una cinta o de cualquier mecanismo. La alineación lateral tolera 1,5 cm.
3. Clic derecho → **Iniciar láser** en uno de ellos. Ambos se iluminan y forman **un solo haz tubular** centrado en la cara marcada, sin líneas arriba ni abajo; el otro es un receptor pasivo. Si falta pareja válida, aparece «Se necesitan 2 cubos láser enfrentados para activarse». Si pierden la alineación se detienen. No hay selector de material, temporizador ni receta.
4. La pieza se transforma al tocar la franja y continúa con su movimiento. Otra franja posterior realiza el siguiente corte.

| Entrada que toca la franja | Resultado |
| --- | --- |
| Un cubo | Seis pirámides de base cuadrada |
| Una pirámide cuadrada | Dos T-bits tetraédricos, pirámides triangulares |
| Un T-bit tetraédrico | Desaparición, con un breve destello de desintegración |

Un cubo completo pasa así a seis pirámides, luego a doce triangulares; una tercera franja elimina esas doce piezas. Los dos primeros pasos conservan materia, origen y julios, incluida la capacidad interna repartida mediante `cutEnergyScale`. La desaparición de la unidad mínima es una **destrucción deliberada solicitada para esta mecánica**: no devuelve materia, carga ni inventario. No cambia las reglas de recomposición de la campaña.

## Contacto y seguridad de la transacción

- Cada transformación consume 8 J del extremo emisor o de su batería externa conectada; el receptor no cobra un segundo corte. El contacto aplica la operación completa; no exige que el material se detenga cuatro segundos.
- Las partes ocupan el volumen original, mantienen la orientación y heredan el movimiento lineal y angular. No se depositan en una bandeja más ancha que la cinta.
- Los descendientes quedan protegidos de la misma franja durante ese paso, incluso si hay un emisor opuesto. Apagar, encender o pulsar R no borra esa protección. Una franja distinta puede efectuar inmediatamente la siguiente transformación. Al alejarse 15 cm perpendicularmente a una franja, la pieza puede volver a atravesarla para otro corte.
- Se comprueba el trayecto entre pasos físicos para detectar cruces rápidos. Los sólidos incompatibles y las paredes bloquean el haz; otras piezas procesables pueden atravesar la misma franja.
- Solo se corta materia suelta. No se cortan conjuntos soldados, adaptaciones, baterías, el emisor, piezas en la mano/pinza ni piezas ocupadas por tareas.
- Si la salida está ocupada, se alcanza el límite de piezas o falta energía, el original permanece intacto. La sustitución física es atómica; no se cobra un corte cancelado por espacio.
- Tomar el emisor lo detiene. Pausa y pestaña oculta suspenden la operación. El agotamiento requiere cargar y volver a encender.

## Guardado y compatibilidad

`mood.cutter` versión 2 conserva la cara emisora. Los guardados anteriores con alcance y modo manual se aceptan y migran al funcionamiento automático. Banco, escenas y mecanismos conservan la adaptación; al restaurar, los láseres quedan apagados.

`mood.cutPasses` guarda hasta dos marcas de franja por fragmento. Se copia de forma independiente, se valida al cargar y evita que un fragmento recién cortado vuelva a cortarse en el mismo lugar al recargar. La destrucción retira inmediatamente cuerpo físico, ID y materia del inventario; el destello de quemadura es más grande y dura 0,48 s, no tiene física y está limitado a 64 efectos.

Solo el extremo emisor de cada pareja activa busca objetivos. La detección consulta la región de la franja en el broadphase y usa un barrido local en cada paso físico; el dibujo del haz comprueba oclusores a 30 Hz. El cabezal utiliza cajas del render existente, sin articulaciones nuevas.

## Verificación reproducible

- `node --test tests/laser-cutter.test.cjs`: 19 pruebas de contacto, tres etapas, conservación, destrucción, guardado, recarga, protecciones, barrido rápido, oclusores, energía y colocación 3D. Incluye una cinta real alimentada que lleva un cubo por tres franjas hasta eliminar los doce fragmentos, sin reposicionar el material durante la prueba.
- `node --test tests/*.test.cjs`: regresión general.
- `QBITS_CAPTURE_SCRIPT=capture-cutter-frame.cjs python3 tests/validate-robot-arm-gles.py /tmp/qbits-cutter-gles`: seis vistas del render real —apagado, encendido, pirámides, triangulares, desintegración y blueprint azul— reproducidas en GLES. También admite `QBITS_RENDER_BACKEND=webgl2`.
- `python3 tests/validate-focus-gles.py`: shaders, foco y posprocesado.

Las pruebas ejecutan lógica y física Cannon con DOM simulado y verifican píxeles GLES por separado. No sustituyen una partida manual en navegador ni miden FPS en el equipo del jugador.
