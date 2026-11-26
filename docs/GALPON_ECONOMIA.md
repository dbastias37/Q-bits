# Economía del primer galpón

El pedido se cierra cuando doce cubos de materia extraída pasan por la línea, reciben enfriamiento activo y entran físicamente en la familia de recepción. El pedido cuenta orígenes distintos. La fuente puede seguir suministrando materia si hay un equipo, espacio y energía.

## Balance de materia

| Operación | Entrada | Salida y custodia |
| --- | --- | --- |
| Inicio | Concesión de escenario | 4 trabajadores de 1 u, o 1 en la variante individual. La instalación empieza con 180 000 J. |
| Extracción | Trabajo junto a la fuente y 2 J | Una carga inerte de 1 u con ID nuevo. La salida está limitada por espacio y una cadencia de 0,65 s. |
| Transporte | Una carga y su equipo | El mismo ID pasa del suelo a transporte y luego al acopio. Un primer tramo operativo admite descarga junto a la fuente. |
| Conversión | 1 carga en el acopio | Tras 0,8 s sale 1 cubo de 1 u con el ID de la carga. Al solicitar un compañero se reserva también una plaza. |
| Conformado | 1 cubo manipulable de 1 u | Tras 0,55 s sale 1 enganche de 1 u con idénticos origen y carga eléctrica. |
| Montaje de una recta | 18 cubos y 12 enganches de 1 u | El blueprint ensambla 30 IDs existentes e incorpora sus tres motores. Los apoyos del galpón permiten la versión sin patas. La variante con patas del banco agrega cuatro cubos. |
| Recepción | 1 cubo manipulable con paso automático comprobado | Su ID entra en una familia, con un solo crédito histórico por origen. Retirar y reintroducir conserva ese crédito. |

En el motor, `weight` registra la materia en unidades de cubo. Un cuerpo ordinario recibe masa dinámica `weight × 0,25` en Cannon. Un cubo de peso 1 y un enganche de peso 1 tienen por tanto la misma masa dinámica 0,25 antes de ensamblarse. El perfil geométrico del enganche sigue siendo el del juego.

Los ocho tramos incorporan 144 cubos y 96 enganches. El pedido necesita otros 12 cubos. Si se mantienen los trabajadores iniciales y se utiliza la receta sin patas, se extraen como mínimo 252 u. Los 96 enganches vienen de conformar 96 de los 252 cubos producidos.

El registro permite hasta cuatro cargas en la salida de la fuente y doce en el acopio. El adaptador físico puede esperar antes si otra carga ocupa la boca. Cada cámara posee una sola entrada hasta que el cuerpo de salida se materializa. Acabar el tiempo con la bandeja ocupada mantiene el trabajo pagado y su ID. El límite técnico de 2 000 piezas incluye los fragmentos. Las familias y las piezas incorporadas siguen contando.

El límite inicial es de doce trabajadores autónomos. Una familia que contenga cuatro compañeros conserva cuatro plazas, y sus miembros esperan mientras permanecen guardados. Unirse en un grupo físico conserva las plazas. Un integrante colocado en una máquina deja de trabajar de forma autónoma. Seis pirámides o doce triangulares de un trabajador suman una sola plaza y una unidad de capacidad laboral.

## Energía y temperatura

| Concepto | Cargo a la instalación |
| --- | --- |
| Extracción | 2 J por unidad |
| Conversión técnica | 5 J de trabajo y 15 J transferidos al cubo, que sale al 5 % |
| Conversión de trabajador | 5 J de trabajo y 225 J transferidos al compañero, que sale al 75 % |
| Conformado, división o recomposición | 4 J por operación |
| Montaje | 60 J por recta |
| Motores y tracción | Julios que solicita el modelo de transporte durante cada paso |
| Refrigeración activa | 4 W por producto durante el tiempo útil de refrigeración |
| Recuperación eléctrica en el enfriador y borne de la fuente | Incremento real de la carga, en julios |

La reserva eléctrica de la instalación y la carga personal son cuentas distintas. Cada compañero inicial trae una celda llena de 300 J como parte de la concesión de apertura. Los cubos producidos reciben su energía del depósito al iniciar la conversión. En el ejemplo de 252 productos, extracción, conversión, carga inicial, conformado y montaje suman 6 408 J. Motores, refrigeración y reposición de carga se añaden según el recorrido efectivo.

Dividir un cubo reparte también su capacidad. Una pirámide tiene 50 J y un triangular tiene 25 J de capacidad. Seis pirámides al 40 % almacenan 120 J en total, igual que el cubo original. Durante la recomposición, la carga de salida es la media ponderada por materia. El borne de la fuente paga la recarga de trabajadores cercanos hasta el 95 %. El descanso por sí solo conserva la carga en el galpón.

Tanto el cubo como el enganche recién emitidos tienen temperatura normalizada 1. El enfriamiento pasivo reduce 0,085 por segundo, por lo que una pieza alcanza el umbral manipulable 0,45 tras unos 6,47 s. En refrigeración activa se reduce 0,9 por segundo con energía disponible. La recepción exige temperatura manipulable, al menos 0,5 s de tratamiento activo pagado y el recorrido físico comprobado. El paso por el túnel usa la recuperación del enfriador y paga la reposición hasta el 50 % de carga. El umbral estabilizado 0,12 queda registrado para encargos posteriores. Guardar una pieza en familia conserva su temperatura y no genera tratamiento activo.

## Identidad, pruebas y continuidad

Cada registro vincula un ID actual, el origen inicial o extraído, su fracción geométrica, masa, plaza laboral, carga, temperatura y custodia. Una carga está en la fuente, en transporte, sobre la cinta, en el acopio o en una cámara. El cubo o enganche emergido está en la sala o integrado. Una recepción conserva el crédito aun cuando el cuerpo vuelva a salir de la familia. Dividir y recomponer mantienen el origen y la suma de fracciones geométricas.

`node --test tests/galpon-production.test.cjs tests/galpon-energy.test.cjs` ejecuta diez pruebas del registro y tres del juego con Cannon y DOM/GPU simulados. Cubren fuente bloqueada, capacidad de una sola unidad, transporte local, conversión interrumpida, conservación de carga y masa, financiación, custodia, recepción repetida, ocho recetas y doce créditos. Se midieron en los cuerpos físicos la capacidad fraccionada, el gasto de recarga y la carga al recomponer. El ensayo de las ocho recetas en ese archivo verifica contabilidad. La duración con desplazamiento y el coste de simulación pertenecen a la medición de la escena.

Para Prompt B, partir del guardado del primer ciclo y de las mediciones del galpón. La cuota, los límites y las tarifas están en `assets/js/galpon-production.js`. La siguiente cadena sigue abierta. La hipótesis inicial de cinco a ocho minutos para construir la línea requiere contraste con una partida y las mediciones de esta entrega.
