# Tablet 2.0 · validación del prototipo

**Resultado:** 37/37 pruebas automáticas aprobadas y revisión de las interacciones principales en un navegador real. La adaptación se comprobó en cuatro resoluciones, con **cero desbordamiento horizontal de página** después de corregir el diseño móvil. La repetición final del guardado también pasó: la nueva construcción aparece inmediatamente en la colección, con las tarjetas anteriores visibles y una confirmación discreta.

La base auditada es [`e02afe3d1bd9a0d116c5c915e5efc960caa5a26a`](https://github.com/dbastias37/Q-bits/tree/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a). Esta validación corresponde a la web independiente `tablet-v2/`: no constituye una prueba de integración de la nueva tableta en el juego. La [auditoría](AUDITORIA.md) documenta las funciones originales y la [guía de integración](INTEGRACION.md) distingue el contrato futuro del código ejecutado en la demo.

## 1. Entorno y reproducción

La demo se sirvió como sitio estático desde la raíz del repositorio y se operó mediante controles reales del navegador. En el entorno de revisión, la solicitud de un contexto WebGL no estuvo disponible y el visor utilizó su respaldo **Canvas 2D**. El respaldo proyecta la geometría 3D, calcula la selección y representa la cinemática; no usa una imagen fija del mecanismo ni crea una simulación física.

Para repetir la revisión local:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abrir <http://127.0.0.1:8000/tablet-v2/>. Se debe servir la raíz para resolver las fuentes y los módulos originales de `../assets/`; no se necesita instalar paquetes ni realizar una compilación.

La suite automática se ejecuta también desde la raíz:

```sh
node --test tablet-v2/tests/*.test.mjs
```

## 2. Pruebas automáticas

| Archivo | Aprobadas | Cobertura |
| --- | ---: | --- |
| [`model.test.mjs`](../tests/model.test.mjs) | 25 | Rangos originales, selección, acciones atómicas, relación fuerza/torque, límites del servo, presets por tipo, bloqueos durante marcha, familias, duplicado, guía, rutas, guardados e importación. |
| [`route-preview.test.mjs`](../tests/route-preview.test.mjs) | 8 | Trayecto desde el origen, esperas, aterrizaje demostrativo, repetición, respaldo de velocidad cero, puntos coincidentes, ruta vacía y atributos de altura. |
| [`renderer.test.mjs`](../tests/renderer.test.mjs) | 3 | Proyección y selección de geometría, pausa por sección/visibilidad, liberación de recursos, finalización de servo una vez y movimiento reducido. |
| [`isolation.test.mjs`](../tests/isolation.test.mjs) | 1 | Entrada del prototipo limitada a su vista y recursos permitidos; sin cargar el juego, Cannon ni dependencias de CDN. |
| **Total** | **37/37** | Sin fallos en la ejecución revisada. |

La [salida de la ejecución](validation-tests.txt) conserva los 37 resultados, con cero fallos, cancelaciones o pruebas omitidas.

Las comprobaciones del modelo contrastan los límites de motor y la configuración de vuelo con los módulos originales. Se verifica que una acción inválida no aplique un cambio parcial, que fuerza y torque permanezcan enlazados y que la capacidad no cambie como consecuencia de un preset de fuerza. Los cambios de parámetros durante la marcha se rechazan.

Las familias conservan identidades, ajustes y carga al agrupar y recuperar. Una copia recibe identidades nuevas y baterías vacías. La guía de colocación es transaccional: cancelarla conserva la pose y un guardado no serializa la guía pendiente. La serialización recupera mecanismos detenidos; las pruebas rechazan valores fuera de rango, inventarios con identidades duplicadas, controladores ausentes y propietarios de recorrido incoherentes.

Las pruebas de renderer utilizan un contexto instrumentado. Comprueban el contrato de dibujo, la selección y el ciclo de vida, **no el rasterizado en una GPU real**. La revisión visual en navegador descrita a continuación complementa esos tests y corresponde al backend Canvas 2D.

## 3. Interacciones comprobadas en navegador

| Flujo | Acción realizada | Resultado observado |
| --- | --- | --- |
| Navegación | Cambiar entre Construir, Controlar, Recorrido y Guardados. | Las cuatro secciones abren sus herramientas y su contenido correspondiente. |
| Selección | Pulsar una pieza de la construcción. | Cambian el contorno, la identificación y los controles contextuales de la selección. |
| Rotor | Seleccionar Rápido, iniciar y detener. | Se muestra marcha activa y se bloquean los cambios incompatibles hasta detener. |
| Ajuste preciso | Introducir **48** con el teclado nativo en el campo numérico. | La edición exacta se refleja en el estado y se conserva como valor personalizado. |
| Sentido | Invertir con el mecanismo detenido. | Cambia el sentido; la acción queda bloqueada durante la marcha. |
| Familia | Seleccionar las **14 piezas** del conjunto, agrupar y recuperar. | Se crea la familia y vuelve su contenido al recuperarla. |
| Colocador | Mover una guía y cancelarla. | Se cancela la colocación sin aplicar el desplazamiento provisional. |
| Puntos del recorrido | Añadir un cuarto punto, seleccionarlo y moverlo. | El mapa, las conexiones y los atributos reflejan la edición. |
| Atributos del punto | Cambiar altura y elegir aterrizaje. | Los controles conservan los valores y la acción del punto seleccionado. |
| Prueba de recorrido | Iniciar y detener la prueba. | La representación avanza, la edición se bloquea durante la prueba y vuelve a habilitarse al detener. |
| Eliminación de punto | Eliminar un punto tras detener. | El recorrido vuelve a **3 puntos** y sus conexiones se actualizan. |
| Guardado y lista | En Guardados → Guardar ahora, introducir **Guardado verificado** y guardar. | La nueva tarjeta aparece inmediatamente sin otra navegación; la colección previa sigue visible y aparece un aviso discreto. Comprobado de nuevo después de corregir la actualización de la lista. |
| Persistencia | Recargar la página y recuperar una construcción guardada. | La colección de la demo persiste y permite recuperar la construcción. |
| Cierre y reapertura | Guardar la tableta y volver a abrirla. | La interfaz vuelve a estar disponible con su estado de demo. |
| Tamaño | Ajustar a 75 %, después 115 % y restaurar. | En el escritorio de prueba el ancho observado pasó de **885 px a 1272 px**; restaurar recuperó la presentación predeterminada. |
| Posición y presentación | Revisar desplazamiento, opciones de posición y restauración. | La tableta conserva su marco y el diseño adapta el espacio disponible. |

La animación de los mecanismos y la prueba del recorrido son representaciones demostrativas. No se deduce de ellas un resultado físico de carga, fuerza, consumo, colisión o estabilidad de una máquina del juego.

## 4. Resoluciones y legibilidad

| Ventana revisada | Organización | Resultado de desbordamiento horizontal |
| --- | --- | --- |
| **390 × 844 px** | Adaptación móvil; tableta al ancho disponible y paneles apilados. | **0 px** después de la corrección móvil. |
| **768 × 1024 px** | Ventana estrecha vertical; distribución adaptada. | **0 px**. |
| **1024 × 768 px** | Ventana horizontal intermedia. | **0 px**. |
| **1366 × 900 px** | Escritorio con construcción central e inspector. | **0 px**. |

La comprobación detectó desbordamiento en móvil y se repitió después del ajuste de CSS. El inspector conserva sus controles mediante flujo vertical; el desplazamiento vertical en pantallas estrechas es parte de la distribución. En ese modo, tamaño y anclaje manuales dejan paso al ancho disponible, con explicación en los ajustes.

Estas resoluciones son las revisadas. No se extrapola el resultado a todas las combinaciones de navegador, zoom, fuente del sistema o dispositivo de entrada.

## 5. Medición básica de rendimiento

La medición se obtuvo con **Canvas 2D y 15 piezas visibles**. El visor estaba detenido antes de solicitar cambios de cámara mediante **Rendimiento → Medir respuesta de la vista**.

| Indicador observado | Resultado | Interpretación |
| --- | ---: | --- |
| Cuerpos físicos del prototipo | **0** | La vista no crea una segunda simulación. |
| Frames pendientes en reposo | **0** | No había un `requestAnimationFrame` del visor esperando ejecución con la vista detenida. |
| Buffers GPU de geometría | **0** | Corresponde al backend Canvas 2D usado en esta sesión. |
| Dibujos de la muestra corta | **7** | La prueba finalizó por su límite de **1800 ms**; no completó una muestra prolongada. |
| Tiempo de dibujo, mediana | **3,30 ms** | Coste del trabajo de dibujo instrumentado en esa muestra. |
| Tiempo de dibujo, p95 | **11,10 ms** | Percentil de la misma muestra pequeña; no es una garantía de latencia estable. |
| Actualización de DOM observada | **6,90 ms** | Una actualización registrada; no es una distribución representativa de todas las interacciones. |

Las cifras describen el trabajo instrumentado de este visor en el navegador de revisión. **No representan FPS del juego, tiempo de GPU ni porcentaje de CPU global.** Siete dibujos y una actualización de DOM sirven para comprobar que existe instrumentación y detectar costes básicos; no constituyen un benchmark comparable entre dispositivos ni prueban un ahorro concreto para el juego integrado.

Los tests de ciclo de vida comprueban pausa al ocultar la sección o el documento, cancelación de planificación y liberación al cerrar. La reducción de movimiento también se verifica en la finalización del servo. La integración futura deberá medir esos mismos estados con el juego real, sus recursos compartidos y la telemetría efectiva.

## 6. Evidencia visual

Las capturas de la demo corresponden a la interfaz ejecutable. Los bocetos son diagramas HTML/SVG. La referencia original es el DOM y CSS auditados de `e02afe3`, en lectura y con carcasa esquemática: **no es una captura de una partida original ejecutándose**.

| Evidencia | Archivo |
| --- | --- |
| Construcción y controles de escritorio | [01-desktop.jpg](../screenshots/01-desktop.jpg) |
| Editor de recorrido | [02-route.jpg](../screenshots/02-route.jpg) |
| Disposición móvil | [03-mobile.jpg](../screenshots/03-mobile.jpg) |
| Inspector y controles en móvil | [03b-mobile-controls.jpg](../screenshots/03b-mobile-controls.jpg) |
| Comparación de tres bocetos | [04-layouts.jpg](../screenshots/04-layouts.jpg) |
| DOM de la tableta original, sin simulación | [05-original.jpg](../screenshots/05-original.jpg) |
| Panel y muestra de rendimiento | [06-performance.jpg](../screenshots/06-performance.jpg) |

Páginas de comparación: [tres distribuciones](../design.html) y [referencia original](original-reference.html?page=mechanisms&focus=create-rotor). La matriz funcional y las fuentes exactas están en [AUDITORIA.md](AUDITORIA.md).

## 7. Límites y comprobaciones de integración posteriores

- **GPU real:** el entorno de navegador revisado utilizó el respaldo Canvas 2D. El camino WebGL necesita una comprobación visual y de recursos en un navegador que ofrezca ese contexto.
- **Oclusión por software:** Canvas 2D ordena caras por profundidad. Geometrías arbitrarias que se intersequen pueden superar las posibilidades de esa representación simplificada.
- **Mundo del juego:** no se ha conectado el prototipo a la selección canónica, los cuerpos, las restricciones, la energía, el inventario real o las partidas. Las pruebas de equivalencia necesarias se enumeran en [INTEGRACION.md](INTEGRACION.md).
- **Semántica de la ruta:** la prueba en planta respeta puntos, orden, velocidad y esperas; conserva la altura como dato. No simula tiempo de ascenso, sustentación o contacto durante el aterrizaje.

La aprobación de esta experiencia independiente permite revisar el diseño y sus estados. Reemplazar la tableta actual y hacer merge a `main` requieren la autorización del usuario y una etapa de integración separada.
