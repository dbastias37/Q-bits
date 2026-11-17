# Selección, colisiones y rodillos virtuales

## Qué cambia

Una cinta estándar completa conserva sus piezas y sus tres motores como datos, pero simula únicamente su chasis. Las piezas de cada rodillo mantienen sus identificadores, forma, peso y energía. Su masa pasa al chasis exactamente una vez; tres envolventes fijas cubren el volumen de giro de los rodillos. La banda sigue teniendo contacto físico y ejerciendo tracción limitada sobre cargas reales.

El ángulo visual se calcula a partir de la velocidad del motor y del tiempo de simulación. La aceleración respeta el torque y la inercia del rodillo; cada motor sigue consumiendo energía. La tracción paga por el trabajo de transportar la carga. Los rodillos no crean cuerpos ni bisagras independientes mientras cumplen la configuración estándar. Las modificaciones incompatibles recuperan la simulación articulada. Desarmar recupera las piezas originales; los guardados no contienen una copia adicional del material.

La selección de una cinta encendida conserva su producción. Agarrar, unir o separar una línea con algún tramo encendido muestra el aviso de apagar o desconectar primero. El agotamiento de la batería, la sobrecarga y la pérdida de apoyo siguen deteniendo la cinta. El menú general P conserva su pausa global habitual.

La separación por módulo conserva juntos el chasis, los rodillos, los motores y las patas originales de ese tramo. Se distingue del desarme completo, inmediato o gradual. Las piezas añadidas y baterías ajenas al módulo permanecen en el resto del montaje.

## Consultas y dibujo

- La detección preliminar de Cannon usa cajas envolventes; evita enviar a la colisión detallada cuerpos lejanos que solo estaban dentro de la esfera de un chasis alargado.
- Las consultas de agarre usan los mismos colisionadores compactos del material. Una jerarquía de cajas descarta regiones lejanas y mantiene los huecos de estructuras cóncavas.
- Los límites rotados se calculan con los vértices originales mediante una jerarquía de extremos. La rotación libre se acepta de inmediato solo si una envolvente conservadora prueba que todo el recorrido está despejado; cerca de obstáculos se mantiene la comprobación detallada.
- El chasis completo tiene un solo agarre físico. Los rodillos virtuales no reciben fuerzas ni anclas de mano adicionales.
- Los contornos seleccionados reutilizan sus buffers. Las caras interiores coincidentes de un mismo cuerpo rígido se omiten del dibujo y vuelven a aparecer al separarlo. Los rodillos animados comparten la misma postura visual para malla, contorno, sombras y límites de visibilidad.

## Resultado medido

Comparación con `21825fb`, CPU por paso de simulación a 60 pasos/s. La línea se construye con puertos reales y se conserva el mismo inventario. Los restantes materiales se colocan sueltos en el suelo; de las escenas de 80 y 500 piezas, se agarran 60 y 472 respectivamente. En la de 2.000 se agarra toda la línea.

| Piezas en escena | Agarre, antes → después | Giro, antes → después | Dibujo seleccionado, antes → después |
| ---: | ---: | ---: | ---: |
| 80 | 8,04 → 3,32 ms | 16,93 → 1,88 ms | 3,60 → 1,84 ms |
| 500 | 135,29 → 5,84 ms | 280,79 → 6,75 ms | 30,50 → 3,69 ms |
| 2.000 | 1.373,48 → 13,85 ms | 2.006,14 → 27,51 ms | 63,96 → 8,20 ms |

En la línea de 2.000 piezas, los 189 rodillos conservan su composición como datos. El mundo pasa de 386 a 8 cuerpos contando sala y mano, y de 379 a una restricción; la cinta ocupa un solo cuerpo con masa 500. El informe verifica las 2.000 identidades y que la masa física no se duplica.

La mayor unión costó 9,27 ms en la escena de 80 piezas, 37,95 ms en la de 500 y **152,17 ms** en la de 2.000. Es una medición individual de la transacción de unión: excluye crear el módulo entrante y el dibujo posterior. No se dispone de esa misma medición para el commit de referencia, por lo que no se atribuye un porcentaje de mejora de unión frente a él. Todavía puede haber una pausa perceptible al unir montajes enormes. El giro de 2.000 piezas tampoco cabe siempre dentro de 16,7 ms.

El reposo de 500 piezas aumentó de 1,72 a 3,14 ms en esta ejecución; las mejoras grandes corresponden al agarre, giro y dibujo de selección. No se afirma que todas las fases sean más rápidas. [Datos, muestras, límites y huellas del código probado](benchmarks/selection-conveyors-20261117.json).

## Pruebas reproducibles

```sh
node --test --test-concurrency=2 tests/*.test.cjs
python3 tests/validate-focus-gles.py
python3 tests/validate-robot-arm-gles.py
node tests/benchmark-selection-conveyors.cjs 21825fb7dea5cd47a8f5453454d891a40110c97f /tmp/selection-conveyors.json
node tests/benchmark-selection-cache.cjs
```

La concurrencia de pruebas se limita para que los escenarios de 2.000 piezas no compitan por toda la memoria disponible. El benchmark usa Cannon y las funciones reales del juego, con DOM/GPU simulados; mide CPU por paso de simulación o llamada de dibujo, no FPS. Incluye rectas, esquinas en ambos sentidos, piezas sueltas, selección, agarre y giro con 80, 500 y 2.000 piezas a 60 pasos/s. Conserva todas las identidades y comprueba masa física, valores finitos y separación de ejes. Las capturas GLES ejecutan los shaders y buffers reales mediante EGL; tampoco sustituyen una partida completa en el navegador del jugador.

Las regresiones cubren transporte con contacto, ambos sentidos y esquinas, batería compartida y agotada, sobrecarga, obstáculos, pérdida de soporte, selección encendida, extracción de módulos, personalización, reconstrucción, repisas, planos, guardados actuales/antiguos y desarme inmediato/gradual. Las pruebas geométricas incluyen estructuras compactas y dispersas de 2.000 piezas, huecos, rotaciones y obstáculos intermedios durante el giro.

Estas pruebas no certifican ausencia de tirones en cualquier montaje o equipo. Los tiempos y límites observados se registran en el estado del proyecto y en los archivos de medición de esta entrega.
