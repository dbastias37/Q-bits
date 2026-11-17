# Prueba de culling de Q-bits

Implementada el 17 de noviembre de 2026 sobre `76a0714`.

## Qué hace

El renderizador del juego es WebGL 1 propio, con física Cannon. Esta prueba añade **frustum culling**: antes de preparar y enviar geometría, comprueba si su volumen puede intersectar la vista del jugador. Si está completamente fuera, omite su dibujo. No cambia la resolución ni el detalle de los objetos visibles: eso sería LOD, una técnica distinta. Tampoco detecta automáticamente objetos tapados por paredes (occlusion culling).

La física, los motores, la energía, los sensores, las rutas y la producción continúan fuera de pantalla. El culling evita trabajo de preparación y envío gráfico en CPU y reduce geometría enviada a GPU. No libera las piezas de memoria ni resuelve por sí solo el costo de 2000 cuerpos físicos independientes.

## Uso

| Control | Función |
| --- | --- |
| Configuración → Rendimiento → Descartar fuera de cámara | Guardar el estado del culling; activo inicialmente |
| `/` | Alternar culling en juego si la tecla no tiene otra acción asignada |
| `7` del teclado numérico | Entrar/salir del observador en el banco de pruebas |
| `8` del teclado numérico | Mostrar/ocultar mediciones |
| `9` del teclado numérico | Comparar A/B en el banco, con la misma escena congelada |
| P → Prueba de rendimiento · culling | Botones equivalentes, también para teclados sin bloque numérico |
| Esc durante A/B | Cancelar conservando la configuración |

Los atajos usan `KeyboardEvent.code`, por lo que Num7 funciona con Bloq Num encendido o apagado. No se interceptan al escribir, al configurar controles ni si tienen una acción remapeada. El preset Direccional ya usa `/` para el menú Q: allí se conserva esa asignación y se usa el botón del panel para culling.

El observador muestra un avatar sencillo y líneas del campo de visión. Mouse/WASD siguen moviendo al jugador, mientras la cámara externa lo sigue desde arriba y atrás. La decisión de culling utiliza siempre la cámara del jugador. Las líneas ilustran los primeros 8 metros; el plano lejano real sigue a 60 m. Los conjuntos que cruzan el borde se conservan completos, así que pueden sobresalir del dibujo del frustum. El suelo y la habitación permanecen como referencia.

Suelta la pieza o cancela su vista previa antes de entrar. La manipulación se bloquea en el observador para evitar tomar un objeto usando un rayo distinto del que muestra la pantalla. Num7 devuelve la vista normal. Cambiar de escena o abrir pausa/configuración sale del observador.

## Qué se descarta y cómo

- Una esfera por conjunto físico evita recorrer sus piezas, construir paquetes de batería, preparar mallas o generar contornos cuando todo el conjunto está fuera. No se subdividen los cuerpos ni sus lotes existentes.
- El radio incluye los colliders existentes, un margen para gestos visuales y el volumen barrido por las palas de hélices. Se reutiliza entre fotogramas; las transformaciones y radios físicos se consultan en cada vista.
- Las sombras tienen un volumen independiente. La sombra definida se proyecta con el desplazamiento real del juego; la suave incluye la extensión máxima del quad. Un objeto oculto puede conservar una sombra visible. Con sombras apagadas no se generan sus poses.
- Cajas, mallas estáticas con radio conocido, contornos, cables y miniaturas de repisas tienen pruebas conservadoras. Una geometría desconocida permanece visible. No se descarta por el centro del objeto.
- Los indicadores de selección se conservan por separado: su flecha puede verse aunque el cuerpo quede fuera de cámara. Se mantiene el orden de dibujo.
- Los planos coinciden con el shader: near 0,04 m, far 60 m, yaw/pitch, focal y relación de aspecto actuales. Un margen angular incluye el temblor PSX y protege los bordes. Las seis pruebas por esfera no crean arrays ni vectores nuevos.
- El estado de descarte vive únicamente durante `renderScene` y se limpia en `finally`. La vista previa de Configuración conserva su propia cámara. Los cuerpos no se eliminan/recrean al girar.

## Lectura de las mediciones

El panel informa piezas/conjuntos omitidos, llamadas y triángulos de la escena, CPU de render, CPU del bloque de simulación/actualización, intervalos de fotogramas (mediana y p95), FPS observados y tiempo GPU cuando la extensión lo permite. El historial incluye tirones largos y se reinicia al cambiar culling o configuración. El límite de FPS/VSync puede mantener los FPS iguales aunque disminuya el trabajo.

CPU render mide el tiempo JavaScript de preparación/envío; **no es tiempo GPU ni porcentaje de uso de CPU**. El bloque de simulación incluye física, líquidos y actualización asociada; no es un perfil completo de todas las tareas del navegador. Las llamadas del panel corresponden a escena y postprocesado; excluyen avatar/frustum de depuración y vidrio del menú radial. El observador sí añade costo a los tiempos: úsalo para entender el recorte, no para afirmar una mejora de rendimiento.

GPU usa `EXT_disjoint_timer_query` de WebGL1, con consultas asíncronas y cola acotada. Los resultados afectados por un evento disjoint se descartan. Si no está disponible, se indica así; no se inventa un valor a partir de CPU.

### Comparación integrada A/B

Congela la escena y la cámara durante OFF → ON → ON → OFF, con 12 fotogramas de calentamiento y 36 muestras por fase: **72 muestras por modo**. No dibuja el observador ni cambia la preferencia guardada. Informa llamadas, triángulos y CPU render mediana/p95. No mide FPS de una partida ni GPU A/B. Mover el mouse no modifica la comparación; Esc, cambio de tamaño, pestaña oculta o cambio de escena la cancelan. Al terminar se reanuda sin acumular pasos físicos pendientes.

Conviene repetirla mirando una zona poblada y luego de espaldas. Si hay pocas piezas fuera de cámara, el descarte puede aportar poco e incluso añadir costo CPU. El botón permite comprobar esa condición en el equipo real.

## Verificación reproducible

- `node --test tests/*.test.cjs`: lógica real y Cannon, con DOM/WebGL simulados; incluye controles, física/energía fuera de pantalla, hélices, sombras, ciclos A/B, cancelar, reutilización y configuración.
- `node tests/benchmark-culling.cjs`: escenarios de 80, 500 y 2000 piezas, distintas proporciones detrás del jugador y conjuntos grandes; salida en `docs/benchmarks/culling-20261117.json`. Los contadores se contrastan con las llamadas GL independientes. Los tiempos son JavaScript con GPU simulada: no son FPS ni rendimiento de hardware del jugador.
- `python3 tests/validate-culling-gles.py`: reproduce shaders y comandos reales en Mesa GLES. Compara imágenes OFF/ON, cubre estilo limpio/PSX, sombras, bordes, conjunto irregular, hélice, indicador seleccionado en el borde y observador. Capturas/resultados en `/tmp/qbits-culling`.

La suite final pasó **839/839 pruebas Node**, sin fallos ni omisiones. La verificación GLES produjo 22 capturas y diez pares OFF/ON de 800×600 con **cero píxeles distintos**, dos shaders/un programa y cero errores GPU/buffers. La captura del observador fue inspeccionada. El navegador de este entorno no pudo iniciar WebGL; no se certifica una partida completa ni los FPS en el PC del jugador.

## Resultado de la microprueba de envío

Con sombras suaves, 2000 piezas independientes y el 90 % colocado detrás del jugador:

| Medida | Culling OFF | Culling ON |
| --- | ---: | ---: |
| Llamadas de dibujo | 4201 | 601 |
| Triángulos enviados | 32812 | 7612 |
| CPU JavaScript de render, mediana (GL simulado) | 20,139 ms | 11,218 ms |

Son **85,7 % menos llamadas** y **76,8 % menos triángulos** en ese escenario. La reducción del 44,3 % en tiempo JavaScript pertenece sólo al entorno de prueba sin GPU real. Con las 2000 piezas delante, las llamadas se mantienen en 6001 y el tiempo de esta corrida pasa de 73,453 a 78,530 ms: el descarte tiene costo cuando no puede omitir nada. No se promete un porcentaje de FPS ni una mejora uniforme.

La revisión eliminó una comprobación redundante de cada línea de contorno que aumentaba ese costo. Los conjuntos se comprueban antes de construir sus contornos; los cables conservan su comprobación propia. Los hashes del informe corresponden al código medido y no cambiaron durante la corrida.

## Base técnica consultada

- [MDN: WebGL model/view/projection, clip space y viewing frustum](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_model_view_projection).
- [Khronos: EXT_disjoint_timer_query para WebGL 1](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/).

Se decidió empezar por frustum culling, sin consultas de oclusión ni reducción de frecuencia de la física. La próxima decisión debe basarse en los tiempos de una partida real: si domina simulación, habrá que perfilar ese trabajo por separado.
