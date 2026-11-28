# Cintas Q-bits

La cinta inicia la línea de producción del banco de pruebas. Sus laterales, soportes y rodillos se construyen con las mismas piezas que ya existen. No se consume una máquina prefabricada ni se crean cubos gratis al terminar el plano.

## Construcción

1. Abre **P → Mecanismos → Cinta Q-bits**. También hay planos iniciales en **Formas guardadas → Mecanismos**.
2. Elige recta, esquina izquierda o esquina derecha. Puedes orientar el plano en pasos de 90° y elegir su altura. Las patas son opcionales: en altura puedes usar una estructura de apoyo existente.
3. Acerca las piezas sueltas solicitadas. Haz clic derecho en el plano y selecciona **Integrar cercanos**. Si falta material o el recorrido está obstruido, el plano informa el problema.
4. Solo después del último encaje aparecen el control y la banda. Acopla una batería externa a los laterales con el sistema de unión existente y enciéndela.
5. Selecciona el tramo y pulsa **Iniciar marcha de la línea**. Los tramos unidos al chasis arrancan juntos. Desde el menú contextual puedes detener o invertir un tramo por separado. La velocidad normal usa 30 rpm; el panel muestra la velocidad real de la banda.

| Plano | Cubos | Enganches | Motores del módulo |
| --- | ---: | ---: | ---: |
| Recta | 18 | 12 | 3 |
| Esquina izquierda | 29 | 12 | 3 |
| Esquina derecha | 29 | 12 | 3 |

Las patas añaden **4 cubos** al plano elegido. Puedes retirarlas si la estructura queda apoyada de otra forma; quitar una pieza esencial del rodillo o del chasis desactiva el mecanismo. La batería se acopla aparte; no aparece cargada como premio por construir. En un tramo estándar completo, los tres motores conservan su identidad y consumo, mientras los rodillos se animan visualmente sin cuerpos ni articulaciones independientes en la simulación.

## Prolongar y alimentar una línea

Selecciona un tramo y marca **Al final de la cinta seleccionada** antes de elegir el siguiente plano. Se alinean la altura, la orientación y el extremo de salida. Al completar la construcción se unen los laterales que encajan. También puedes colocar líneas separadas o paralelas y orientar cada una por tu cuenta.

Las secciones físicamente unidas comparten la batería mediante la red mecánica existente. Al iniciar la marcha arrancan todos los tramos del mismo chasis. Si pegas uno girado, su rodadura se ajusta para continuar el flujo en la unión. El clic derecho permite detener o invertir ese tramo. Un brazo acoplado conserva el límite de carga de su pinza y de sus ejes. La proximidad por sí sola no transmite energía. El tramo debe estar nivelado y apoyado: no se puede encender suspendido sin soporte. Puede funcionar sobre un banco o sobre otra estructura estable; si pierde ese apoyo, se detiene. Un generador de área y su alcance son trabajo posterior; este bloque utiliza baterías externas.

## Acoplador

En el catálogo de mecanismos, **Acoplador** coloca el modelo de dos entradas A y B y una salida central C. En el editor 3D también está en **F8 → Mecanismos**. Cada boca termina en un tramo recto de altura estándar. Para prolongarlo, selecciona la máquina, abre su tableta y elige **Conectar otra cinta** y el extremo que vas a usar. El plano se alinea con ese puerto. Integra sus piezas para completar la unión.

1. Sitúa el mecanismo sobre una superficie estable. Acóplale una batería encendida o aliméntalo por cable desde un depósito con energía.
2. Haz clic en el centro del techo, la cortina negra o el indicador exterior para elegir el producto. Con clic secundario puedes abrir la tableta del Acoplador y pulsar **Iniciar línea**.
3. Pon una pieza en A y otra en B. La primera espera a la segunda dentro de la cámara. El indicador se enciende en verde al salir un conjunto compatible por C. Puedes seleccionarlo como cualquier montaje soldado.
4. Si las piezas no corresponden a la receta, el indicador parpadea en rojo y aparece un aviso. Por C salen primero la pieza de A y después la de B, enteras. Una salida ocupada retiene las piezas hasta que hay espacio.
5. Con **Invertir para desacoplar**, C recibe el producto y cada pieza sale por su entrada original. Un objeto ajeno al proceso atraviesa entero por una rama libre. Puedes detener e invertir desde el menú secundario o desde la tableta.

| Producto | Piezas que deben entrar |
| --- | --- |
| Doble Q-bit | Dos cubos |
| Q-bit con enganche | Un cubo y un enganche, en cualquier orden |
| Pirámide de dos triangulares | Dos pirámides triangulares |
| Bipirámide | Dos pirámides cuadradas |

El guardado de escena conserva la receta, los conjuntos, la procedencia de sus piezas y las piezas que estén esperando en las cintas. Al volver al banco, pulsa **Iniciar línea** para continuar.

## Seleccionar, mover y separar tramos

Seleccionar la cinta, abrir su menú contextual o consultar su contorno mantiene la producción y el consumo de batería. Si intentas tomar, unir o separar un conjunto que contiene un tramo encendido, se conserva su estado y aparece **Primero apaga o desconecta la cinta**. Detén todos los tramos del conjunto antes de modificar el chasis compartido. El agotamiento de la batería, la sobrecarga y la pérdida de apoyo conservan sus paradas físicas.

Clic derecho sobre la banda o una pieza propia → **Separar módulo completo** extrae ese tramo con sus rodillos, motores y patas originales. **Alt → Separar módulo completo** realiza la misma operación. Los demás tramos siguen armados; si retiras una esquina intermedia, los extremos quedan como conjuntos independientes. La operación conserva piezas, orientación, masa y energía, sin generar material. Las baterías y piezas añadidas que no pertenecían al módulo quedan en el resto del montaje. Los guardados antiguos recuperan las patas en las cuatro posiciones estándar de cada tramo. **Desarmar piezas… → Desarmar todo** sigue disponible como una operación distinta y explícita.

## Transporte y piezas

Se probaron primero cubos girando directamente contra la carga. Los espacios entre rodillos cuadrados atrapaban algunos objetos al invertir el sentido o aumentar el peso. Por eso se utiliza la alternativa de banda final: una superficie continua visible, con contacto físico, accionada por los rodillos. La banda forma parte del mecanismo terminado y no aparece antes de completar sus piezas.

La tracción tiene límites. La carga mantiene su cuerpo físico, puede chocar, atascarse y caer al salir de la cinta. No se teletransporta entre puntos. Apagar o agotar la batería detiene el accionamiento. El panel informa la carga, la capacidad y la energía disponible; no utiliza una probabilidad de éxito inventada.

El contador distingue brazos y cintas de los Q-bits sueltos. Sus componentes mantienen identidad, masa y energía y siguen contando para el límite material de la sala. Desarmar devuelve esas piezas: terminar un mecanismo no las elimina ni permite fabricar materia adicional.

El guardado de mecanismos, la exportación, las repisas y la recuperación del banco conservan los tramos, sus sentidos y conexiones. Los controles se restauran detenidos.

## Rendimiento y verificación

Los tramos estándar completos usan un chasis físico con la masa de sus rodillos y volúmenes de colisión simplificados. Sus rodillos conservan piezas, identidades y energía como datos, pero no añaden cuerpos ni articulaciones al solver. Modificar o desarmar un rodillo recupera sus piezas físicas originales; los cartuchos modificados conservan la simulación completa. Los módulos compatibles vuelven automáticamente al modo virtual.

Los cubos de una estructura rígida irregular comparten una malla de dibujo cacheada. Las piezas, las colisiones y la selección individual siguen existiendo. Las baterías y los cuerpos móviles conservan sus rutas específicas. La malla se libera al retirar o reconstruir el cuerpo.

En una medición anterior al modo virtual, con 256 cubos agrupados en 16 estructuras, las llamadas de dibujo bajan de 256 a 16. El tiempo de CPU del dibujo medido con GPU simulada baja aproximadamente un 79 %; esta cifra no predice los FPS del navegador. En otra medición con ocho cintas reales (240 piezas), incluidas sus bandas y marcas, las llamadas bajan de 360 a 248, un 31 %. La comparación de imágenes GLES verifica que la agrupación conserva el resultado visual. El estado del proyecto registra las pruebas finales del bloque.

Para repetir la medición de dibujo: `node tests/benchmark-rigid-render.cjs`. La suite lógica usa Cannon real con DOM y GPU simulados; las capturas GLES reproducen el renderizador real. Ninguna de estas comprobaciones equivale a una partida completa en navegador.

La medición de selección, agarre y giro con hasta 2.000 piezas y sus límites está en [RENDIMIENTO_CINTAS.md](RENDIMIENTO_CINTAS.md).
