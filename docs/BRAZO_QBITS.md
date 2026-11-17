# Brazo Q-bits — construir, enseñar y repetir

Implementado el 16 de noviembre de 2026. Brazo y cintas disponibles en el banco de pruebas.

**Empieza por [el manual paso a paso](MANUAL_BANCO_PRUEBAS.md)**, disponible también en P → Manual. Para probarlo sin construir el plano: mantén Q → Tab → Brazo Q-bits, suelta Q y haz clic. Puede funcionar separado, apoyado en el suelo; unirlo a una cinta no programa la toma ni la entrega.

## Primera prueba

1. Entra al **banco de pruebas** y abre **P → Mecanismos → Brazo Q-bits → Colocar blueprint del brazo**. También está en clic derecho sobre el suelo → **Formas guardadas → Mecanismos**.
2. Acerca **18 cubos normales y 8 enganches sueltos**, descansados y apoyados en el suelo. El radio inicial es 1,5 m. Son 26 piezas reales: no hace falta fabricar cuatro rotores previamente. El plano muestra los tipos pendientes.
3. Clic derecho en el blueprint → **Integrar cercanos**. Las piezas se colocan una a una, con comprobación de obstáculos. Antes del último encaje no existe un brazo activo. Al terminar hay una base de 4×3, cuatro rotores y cinco cuerpos rígidos articulados.
4. Acopla tu batería I, II o III a una cara libre de la base con **Shift** y actívala. Se conserva la energía real y el programa. La batería se construye aparte con el taller actual. Sin fuente externa activa se usan las reservas internas de los enganches y del agarre.
5. Pon un Q-bit suelto bajo la **cara inferior marcada en naranja**. Clic derecho sobre el brazo → **Configurar agarre y secuencia**. El plano inicial viene con A en la postura construida y B a 90° de giro de base.
6. Pulsa **Iniciar secuencia**. Espera un objeto compatible, lo toma, gira a B, lo libera y regresa a A. Desactiva **Repetir** para ejecutar una entrega y terminar en B. **Ir a A · sin tomar** y **Ir a B · sin tomar** permiten probar las posturas vacías sin sobrescribirlas. **Comprobar toma** explica distancia, alineación, filtro, peso, ocupación, energía y obstáculos, sin tomar ni consumir energía. **Detener** libera el objeto y frena las articulaciones.

El panel pausa la simulación. Iniciar o ajustar un eje cierra el panel para que ocurra el movimiento; **P** vuelve a abrirlo. La dirección de la cara activa viaja con el cubo de agarre.

## Elegir lo que toma

- **Cualquier sólido:** un objeto compatible frente al agarre, dentro del límite de carga.
- **Un color:** coincidencia con el color definido en el objeto; no depende de luces ni sombras. Resulta especialmente útil con los cuerpos de colores y los materiales de producción existentes.
- **Una pieza específica:** una instancia elegida de la lista. Incluye Q-bits, piezas de una estructura y cuerpos sólidos. Una copia distinta no se convierte en el objetivo original.
- **Tipo de pieza:** cubo, pirámide, triangular o enganche.
- **Forma aprendida:** selecciona una estructura de la sala, vuelve al panel y pulsa **Aprender forma seleccionada**. Compara sus piezas, pesos y disposición relativa; funciona aunque esté trasladada o girada.

Puedes preparar otro cubo con **Convertir cubo en agarre**. Conserva su materia y energía; no añade geometría física. Conecta una cadena de uno a cuatro rotores y pulsa **Usar este montaje como brazo**. No se admite un segundo controlador sobre los mismos ejes.

## Enseñar otra entrega

Selecciona el paso **5° / 15° / 45° / 90°** y ajusta Base, Hombro, Codo o Muñeca con los botones −/+. Espera a que termine y guarda **A · tomar**. Ajusta la postura de entrega y guarda **B · soltar**. No hay teletransporte del objeto ni posicionamiento automático hacia cualquier punto: los motores recorren físicamente los ángulos enseñados y necesitan espacio libre.

La carga predeterminada del agarre es **4 u**, ajustable de 1 a 16. El plano usa rotores del banco configurados a 12 rpm de motor, 4 N·m de motor y 64 u de carga total. Base directa; hombro, codo y muñeca con reducción 3:1 (máximo de salida de 4 rpm y 12 N·m con esos ajustes). La energía usa torque y rpm del eje del motor, conservando potencia mecánica y las pérdidas existentes. La reducción se deriva del controlador y también corrige brazos guardados; desaparece al desmontar ese controlador. Esto no modifica los ajustes de otros mecanismos. El peso del objeto también cuenta para los rotores, además de todas las cintas y estructuras conectadas. Un brazo (26 u), una cinta recta (30 u) y una esquina (41 u) unidos superan el límite inicial de 64 u. El estado identifica el eje, la carga y el límite; no los eleva automáticamente. El panel muestra carga, energía útil, entregas y porcentaje de capacidad de agarre libre, no una probabilidad de éxito inventada.

La toma tiene alcance corto, hasta 1,8 cm frente a la cara. Rechaza objetivos propios, objetos sujetos por otro agarre o por el jugador, huecos de formas y objetos tapados por una pared. El agarre usa una restricción física con fuerza limitada y consume energía al tomar y sostener. Los ejes frenados mantienen su postura; los que se mueven respetan el torque y el consumo de los rotores. Una carga excesiva, falta de energía, pérdida de agarre o trayecto bloqueado exige corregir la causa y reiniciar.

## Guardar y recuperar

**Formas guardadas** contiene dos categorías: **Formas**, con las anteriores, y **Mecanismos**, con rotores, baterías, agarres y montajes articulados. Guardar una estructura con mecanismos conserva cuerpos, conexiones, filtros y posiciones enseñadas. Colocar una plantilla desde el catálogo crea un blueprint que requiere existencias; la duplicación explícita del banco sigue siendo una herramienta de prueba independiente.

Las repisas guardan el objeto real con sus identidades, energía, filtro y programa. Detén el brazo y suelta la carga antes de almacenarlo. Al retirarlo queda detenido. Exportación/importación de plantillas mantiene las conexiones; las referencias a una pieza específica dependen de que esa identidad siga existiendo en la sala. La recuperación del banco conserva el programa, no reanuda automáticamente una maniobra interrumpida.

## Verificación técnica

**Resultado final: 527 pruebas Node aprobadas, seis escenas GLES sin errores, sintaxis y diff correctos.** Las pruebas de Node ejecutan el juego y Cannon reales con DOM/GPU simulados. Incluyen ensamblaje natural completo desde piezas en el suelo, conservación, cancelación, guardado, repisas, filtros, obstáculos, control por interfaz, batería acoplada y ciclo físico de cuatro articulaciones. La prueba de referencia entrega un cubo aproximadamente a 0,85 m de su posición inicial y verifica el regreso y la repetición.

El render se comprueba aparte mediante captura/reproducción de órdenes reales en GLES: frente, lateral, cenital, detalle del agarre, blueprint y cuerpo de color elevado. Esto no constituye una partida completa en navegador. Chromium local sigue bloqueado por la creación de sockets del entorno; falta evaluar comodidad y equilibrio en el equipo del jugador.

Optimización: índice de piezas y componentes mecánicos reutilizado dentro de cada subpaso e invalidado al cambiar conexiones; posiciones y energía siempre actuales. Se cachea la geometría de los planos y la firma de formas. El agarre busca objetivos a 10 Hz durante la espera y solo una pieza del plano se monta a la vez, evitando la congestión de rutas encontrada en la primera prueba.

Benchmark reproducible: `node tests/benchmark-mechanical-cache.cjs`. Con 256 piezas y 20 rotores, mediana de tres repeticiones de CPU por subpaso: detenidos 4,992 → 3,157 ms (−36,8 %); accionados 9,054 → 4,082 ms (−54,9 %). Misma escena y semilla, 120 subpasos de calentamiento y 120 medidos a 1/240 s, Node 24.22.1. Posiciones, rotaciones, energía, RPM y torque finales idénticos entre variantes. No es una medición de FPS ni una promesa de rendimiento en otro dispositivo.

## Corrección de movimiento y guía — 16 de noviembre de 2026

La revisión de uso reprodujo el fallo al ajustar el hombro ±5°: la pinza caía y el programa terminaba bloqueado. El montaje inicial exige aproximadamente 6,55 N·m sobre el hombro vacío, por encima de los 4 N·m de transmisión directa. Además, los frenos activos añadían un bloqueo de seis ejes sobre una bisagra que ya restringía cinco; el solver no convergía al levantar el brazo.

La reducción 3:1 proporciona fuerza a cambio de velocidad, sin aumentar el límite del motor ni crear energía. Los frenos activos restringen solo el giro pendiente (una ecuación en lugar de seis). Se mantienen contactos, límites de carga, baterías, masa e identidades. Los botones nuevos permiten diagnóstico y prueba vacía antes de empezar una entrega. La verificación vigente y sus límites están al final de `ESTADO_PROYECTO.md`.
