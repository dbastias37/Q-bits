# Cintas Q-bits

La cinta inicia la línea de producción del banco de pruebas. Sus laterales, soportes y rodillos se construyen con las mismas piezas que ya existen. No se consume una máquina prefabricada ni se crean cubos gratis al terminar el plano.

## Construcción

1. Abre **P → Mecanismos → Cinta Q-bits**. También hay planos iniciales en **Formas guardadas → Mecanismos**.
2. Elige recta, esquina izquierda o esquina derecha. Puedes orientar el plano en pasos de 90° y elegir su altura. Las patas son opcionales: en altura puedes usar una estructura de apoyo existente.
3. Acerca las piezas sueltas solicitadas. Haz clic derecho en el plano y selecciona **Integrar cercanos**. Si falta material o el recorrido está obstruido, el plano informa el problema.
4. Solo después del último encaje aparecen el control y la banda. Acopla una batería externa a los laterales con el sistema de unión existente y enciéndela.
5. Selecciona el tramo y pulsa **Iniciar tramo**. Puedes detenerlo o invertir su sentido desde el mismo panel o el menú contextual. La velocidad normal usa 30 rpm; el panel muestra la velocidad real de la banda.

| Plano | Cubos | Enganches | Rotores activos |
| --- | ---: | ---: | ---: |
| Recta | 18 | 12 | 3 |
| Esquina izquierda | 29 | 12 | 3 |
| Esquina derecha | 29 | 12 | 3 |

Las patas añaden **4 cubos** al plano elegido. Puedes retirarlas si la estructura queda apoyada de otra forma; quitar una pieza esencial del rodillo o del chasis desactiva el mecanismo. La batería se acopla aparte; no aparece cargada como premio por construir. Cada rodillo utiliza una articulación accionada; los enganches del lado opuesto actúan como apoyo pasivo.

## Prolongar y alimentar una línea

Selecciona un tramo y marca **Al final de la cinta seleccionada** antes de elegir el siguiente plano. Se alinean la altura, la orientación y el extremo de salida. Al completar la construcción se unen los laterales que encajan. También puedes colocar líneas separadas o paralelas y orientar cada una por tu cuenta.

Las secciones físicamente unidas comparten la batería mediante la red mecánica existente. Cada tramo conserva su propio control de marcha y sentido. Si unes también un brazo, su límite de carga de rotor sigue considerando el conjunto conectado: revisa ese límite al ampliar la línea. La proximidad por sí sola no transmite energía. El tramo debe estar nivelado y apoyado: no se puede encender suspendido sin soporte. Puede funcionar sobre un banco o sobre otra estructura estable; si pierde ese apoyo, se detiene. Un generador de área y su alcance son trabajo posterior; este bloque utiliza baterías externas.

## Transporte y piezas

Se probaron primero cubos girando directamente contra la carga. Los espacios entre rodillos cuadrados atrapaban algunos objetos al invertir el sentido o aumentar el peso. Por eso se utiliza la alternativa de banda final: una superficie continua visible, con contacto físico, accionada por los rodillos. La banda forma parte del mecanismo terminado y no aparece antes de completar sus piezas.

La tracción tiene límites. La carga mantiene su cuerpo físico, puede chocar, atascarse y caer al salir de la cinta. No se teletransporta entre puntos. Apagar o agotar la batería detiene el accionamiento. El panel informa la carga, la capacidad y la energía disponible; no utiliza una probabilidad de éxito inventada.

El contador distingue brazos y cintas de los Q-bits sueltos. Sus componentes mantienen identidad, masa y energía y siguen contando para el límite material de la sala. Desarmar devuelve esas piezas: terminar un mecanismo no las elimina ni permite fabricar materia adicional.

El guardado de mecanismos, la exportación, las repisas y la recuperación del banco conservan los tramos, sus sentidos y conexiones. Los controles se restauran detenidos.

## Rendimiento y verificación

Los cubos de una estructura rígida irregular comparten una malla de dibujo cacheada. Las piezas, las colisiones y la selección individual siguen existiendo. Las baterías y los cuerpos móviles conservan sus rutas específicas. La malla se libera al retirar o reconstruir el cuerpo.

En el escenario de medición de 256 cubos agrupados en 16 estructuras, las llamadas de dibujo bajan de 256 a 16. El tiempo de CPU del dibujo medido con GPU simulada baja aproximadamente un 79 %; esta cifra no predice los FPS del navegador. En otra medición con ocho cintas reales (240 piezas), incluidas sus bandas y marcas, las llamadas bajan de 360 a 248, un 31 %. La comparación de imágenes GLES verifica que la agrupación conserva el resultado visual. El estado del proyecto registra las pruebas finales del bloque.

Para repetir la medición de dibujo: `node tests/benchmark-rigid-render.cjs`. La suite lógica usa Cannon real con DOM y GPU simulados; las capturas GLES reproducen el renderizador real. Ninguna de estas comprobaciones equivale a una partida completa en navegador.
