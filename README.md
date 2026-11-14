# Q-bits

Juego de puzles en primera persona, ambientado en salas blancas minimalistas. Mueve y une Q-bits, organiza al equipo, activa circuitos y transforma materia para abrir nuevas rutas.

Versión actualizada el 14 de noviembre de 2026: prólogo, 12 niveles y laboratorio de pruebas.

## Jugar

La apertura comienza en negro con «Un juego imaginado por Diego Bastías», fundido a negro y el título Q-bits. Después aparece el progreso de carga y, al terminar, **Jugar**. El prólogo comienza todavía a oscuras: «En el inicio no había nada…», seguido de «Y un ser todopoderoso dijo: “Hágase la luz”». Solo al terminar esa frase aparece **Despertar**, sin contenedor. Pulsarlo o presionar E abre los ojos y continúa el encuentro con el Q-bit.

El porcentaje se obtiene de tareas completadas: carga del motor, código del juego, construcción de la escena inicial, primer dibujo en la GPU y descarga/validación de las pistas configuradas. Los tiempos de la presentación no hacen avanzar el porcentaje. El botón no se habilita si falla un recurso requerido. Los demás niveles son procedurales y se construyen al entrar a ellos.

Sirve la carpeta completa por HTTP/HTTPS (GitHub Pages, un sitio estático o un servidor local). No requiere npm, compilación ni un servidor de aplicación. La lista de música se lee con `fetch`, por lo que no se debe abrir mediante `file://`.

Para trabajar con un servidor local, abre una terminal en esta carpeta y ejecuta, si tienes Python instalado:

```sh
python -m http.server 8000
```

Luego visita <http://localhost:8000>. En algunos equipos el comando es `python3` o `py`.

## Subir a GitHub

1. Crea un repositorio para el juego, por ejemplo `q-bits`.
2. Descomprime este ZIP y sube sus archivos a la raíz del repositorio. `index.html` debe quedar directamente en la raíz, sin una carpeta adicional alrededor.
3. Guarda los archivos en la rama `main`.

También puedes subir esta carpeta mediante GitHub Desktop o Git. El ZIP es el paquete de entrega: para publicar el juego, sube su contenido descomprimido.

## Publicar con GitHub Pages

En el repositorio, abre **Settings → Pages**. En **Build and deployment**, elige **Deploy from a branch**, selecciona **main** y **/(root)**, y pulsa **Save**. GitHub mostrará la dirección del juego cuando termine la publicación. El archivo `.nojekyll` está incluido para servir el contenido estático.

Referencia: [configurar la publicación en GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Campaña

| Nivel | Nombre | Mecánica principal |
| --- | --- | --- |
| 00 | El primer encuentro | Despertar, conocer al Q-bit, tomarlo y llevarlo al enfriador. |
| 01 | Primer contacto | Llevar un Q-bit a un destino. |
| 02 | Cada uno por su camino | Dar destinos independientes a dos Q-bits. |
| 03 | Dos lados | Mantener dos botones presionados al mismo tiempo. |
| 04 | Juntos pesamos más | Completar un botón con dos Q-bits y observar su aro de carga. |
| 05 | La primera unión | Unir dos piezas y activar el circuito de líquido. |
| 06 | Cambiar de forma | Resolver tres puertas con una L, un cuadrado y una T. |
| 07 | Seis piezas | Construir un rectángulo y una escalera. |
| 08 | Salimos juntos | Combinar botones, formas y salida de todo el equipo. |
| 09 | La fuente | Conocer al grupo y sus estados; transformar materia. |
| 10 | El camino de vuelta | Transportar materia entre dos estaciones y organizar descansos. |
| 11 | Dos rutas | Elegir entre materiales y organizar el equipo de transporte. |
| 12 | La instalación | Utilizar tres estaciones y reunir al equipo completo en la salida. |

El menú permite seleccionar niveles, reiniciar, pausar y entrar al laboratorio. Las transiciones incluyen fundidos, una carga de transición deliberada de al menos 1,8 segundos para dar una pausa entre escenas, y pantalla de final de nivel. Esa pausa es independiente de la precarga real inicial.

## Controles principales

| Acción | Control |
| --- | --- |
| Caminar | WASD |
| Mirar | Mouse |
| Tomar y soltar una pieza en campaña | Clic izquierdo |
| Ajustar la distancia de una pieza sostenida | Rueda del mouse |
| Agacharse, también sosteniendo piezas | Mantener C (soltar para levantarse) |
| Ajustar la altura al agacharse | C + rueda |
| Girar una pieza sostenida | Shift + WASD |
| Unir piezas | Acercar sus caras y soltar manteniendo Shift |
| Desarmar con un gesto | Sostener una estructura unida, mantener Shift y sacudirla rápidamente de un lado a otro varias veces |
| Enfocar una pieza sostenida | Acercar con la rueda; el fondo se suaviza y aparecen sus barras de energía |
| Opciones de separación | Alt, apuntando a una estructura |
| Seleccionar varias piezas | Arrastrar con clic izquierdo desde un espacio vacío |
| Dar órdenes y elegir un destino | Menú de clic derecho sobre la pieza y después sobre el suelo |
| Tomar un grupo seleccionado | Clic derecho → Tomar selección |
| Duplicar selección en el laboratorio | V |
| Elegir Q-bit o T-bit en el laboratorio | Mantener Q, apuntar con el mouse y soltar Q; centro o Esc para cancelar |
| Crear la pieza elegida en el laboratorio | Clic izquierdo después de elegir con Q; también N o P → Piezas → Crear |
| Detener una orden | R |
| Avanzar o completar el texto del diálogo | E o Espacio |
| Asignar un equipo al material señalado | E, cuando no hay diálogo activo |
| Saltar la presentación del grupo | O, durante esa presentación |
| Pausar / liberar el mouse | Esc |
| Abrir las herramientas de prueba | P, también dentro del tutorial |
| Pantalla completa | Botón de pantalla completa |

El panel de pruebas incluye controles adicionales y ajustes del laboratorio. En campaña, las herramientas de creación requieren abrir ese panel.

## T-bits en el banco de pruebas

Mantén **Q** para abrir el selector radial de vidrio: apunta a una figura y suelta Q para elegirla. El centro y Esc cancelan. Después de elegir, **el siguiente clic izquierdo crea una sola pieza** delante del jugador. Esc o clic derecho cancelan esa creación pendiente; pausar o cambiar de escena también la cancela. N sigue disponible como atajo. Las figuras giran suavemente y aceleran al señalarlas; la descripción aparece con la misma línea animada del Q-bit. Las flechas también permiten recorrer las opciones. Mientras está abierto, la escena se detiene y el mouse controla el selector sin mover la cámara. Se cierra sin elegir al pausar o cambiar de pestaña; cambiar el tamaño de la ventana cancela la opción resaltada. Abre el selector con el mouse capturado y las manos libres, en el banco sin puzzle activo.

También en **P → Piezas → Tipo de pieza** se elige entre el Q-bit cúbico y dos T-bits grises. El botón Crear y el atajo N usan esa elección. Las nuevas formas se crean en el banco libre.

Las tres piezas proceden de una misma partición del cubo. Igualar todas las aristas no basta para cerrar construcciones: las piezas regulares anteriores podían unirse de dos en dos y aun así dejar un hueco al cerrar una cadena.

| Pieza | Geometría modular |
| --- | --- |
| Q-bit | Cubo de 9 × 9 × 9 cm. |
| T-bit de base cuadrada | Pirámide de base 9 × 9 cm y altura 4,5 cm; volumen de 1/6 de Q-bit. |
| T-bit triangular | Mitad de esa pirámide, cortada por una diagonal de la base y la punta; volumen de 1/12 de Q-bit. No es un tetraedro regular. |

**Dos triangulares completan una pirámide; seis pirámides o doce triangulares completan un cubo**, con las puntas en el centro. Esto describe ensamblajes concretos, no que cualquier cadena arbitraria cierre. El encaje exige caras completas compatibles, normales opuestas y todas las esquinas coincidentes. Solo se permiten giros que conserven las longitudes y el papel de cada esquina.

| Cara | Conexión compatible |
| --- | --- |
| Cuadrada | Cara de Q-bit, base de pirámide o base completa formada por dos triangulares. |
| Triangular lateral | Otra lateral de pirámide o de T-bit triangular. |
| Media base triangular | Otra media base de la misma forma. |
| Corte diagonal interno | Otro corte diagonal; dos triangulares completan así una pirámide. |
| Triángulo frente a cuadrado | Incompatible si no hay una segunda mitad que complete el cuadrado. |

Las piezas mantienen su identidad al formar una cara compuesta y pueden desarmarse. Al quitar una mitad, su cara cuadrada incompleta deja de sostener esa unión. Las uniones se vuelven a validar al soltar: si una pieza se movió o el espacio quedó ocupado, no se unen. Los blueprints obedecen las mismas reglas; las formas antiguas incompatibles se conservan para exportar, pero deben rearmarse para volver a construirlas. Las nuevas formas guardadas usan `geometryVersion: 3`.

Tienen colisiones según sus caras reales, peso ajustable, agarre, giro, recorrido, estados, energía y enfriamiento. Al mantener Shift y sacudir rápidamente una estructura varias veces, sus piezas se separan: la pieza tomada permanece en la mano y las demás caen conservando su identidad. Un giro normal o una vibración pequeña no activa el desarme. Al acercar una pieza sostenida con la rueda, la vista cambia suavemente de campo de visión, mantiene las piezas nítidas y suaviza el fondo; sus barras de energía aparecen solo de cerca. Se unen entre sí y con Q-bits acercando sus caras y soltando con Shift; Alt permite separar una pieza o desarmar la estructura. Duplicar, guardar formas y volver al banco conservan cada tipo. Los blueprints requieren piezas de la forma correcta y siguen aceptando las formas cúbicas guardadas anteriormente.

El contador inferior izquierdo muestra únicamente el icono negro y las existencias Q/T. Los enganches se cuentan como M, separados de Q y T. Los atajos visibles se reducen a Q · P · N · B; las órdenes y ajustes siguen disponibles en sus menús.

## Transformación de materia

La materia es finita: cada bloque se consume una sola vez y produce la cantidad de Q-bits que indican sus unidades. El equipo debe arrastrarlo hasta el desintegrador. La transformación pasa por la entrada, el recorrido del líquido y la salida de nuevos compañeros; si la salida está ocupada, espera a que quede libre.

Los desintegradores tienen una superficie de portal animada con fondo negro opaco, manguera transparente, compuerta de salida y contador de producción. Las estaciones están distribuidas en distintos espacios de los niveles del segundo bloque.

## Archivos y desarrollo

| Archivo | Contenido |
| --- | --- |
| `index.html` | Interfaz, estilos y apertura en negro. |
| `assets/js/boot.js` | Presentación y progreso de precarga real. |
| `assets/js/game.js` | Lógica, físicas, gráficos procedurales y campaña. |
| `assets/js/radial-menu.js` | Selector Q, figuras con las geometrías reales y descripciones animadas. |
| `assets/css/radial-menu.css` | Paneles de cristal, fundido, desenfoque y adaptación del selector. |
| `assets/js/cannon.min.js` | Motor Cannon.js incluido, sin dependencia de CDN. |
| `assets/js/music.js` | Música ambiental, volumen, silenciamiento y precarga. |
| `assets/audio/music/playlist.json` | Lista de temas que se reproducen en orden. |
| `assets/audio/music/README.md` | Instrucciones para subir los archivos de música. |
| `tests/` | Pruebas de carga, música, escenas, colisiones y rutas. |
| `README.md` | Instalación, publicación, campaña y controles. |
| `THIRD_PARTY_NOTICES.md` | Avisos del motor de físicas y las fuentes incluidas. |
| `.nojekyll` | Configuración para servir archivos estáticos en GitHub Pages. |
| `.gitignore` | Exclusiones de archivos temporales y paquetes ZIP. |

Para modificar la interfaz y los estilos, edita `index.html`; para la lógica, edita `assets/js/game.js`. Los comentarios `Campaign prologue`, `Eight complete campaign levels` y `Chapter II` identifican las secciones de narrativa y campaña.

## Tipografía y artefactos

- **LED Calculator**: exclusivamente el título Q-bits de la presentación y del menú principal, ampliado y adaptable a la pantalla.
- **Spaceman**, nueva versión aportada: menús, nombres de unidades y contador Q/T. Incluye las minúsculas acentuadas, ñ/Ñ y ¿/¡; los caracteres sin dibujo en el archivo usan la fuente de respaldo mediante `unicode-range`, incluidos algunos signos y las vocales mayúsculas acentuadas.
- **Fuente de sistema**: información secundaria de peso, enfriamiento, estado de ánimo, energía, distancia, metros y tiempo, en gris discreto y 10–11 px. Las mediciones del panel y las anotaciones de mecanismos usan el mismo estilo.
- **Tengoku**: diálogos, subtítulos, saludos y burbujas emocionales, con tamaño compacto (16 px en diálogos y 15 px en burbujas; 15/14 px en móvil).
- Las tres fuentes están alojadas dentro del repositorio, conservadas sin modificar, y se comprueba su carga antes de habilitar Jugar. Los originales y sus avisos están en `assets/fonts/` y `THIRD_PARTY_NOTICES.md`. Parisienne y la Spaceman anterior se conservan como archivos históricos y ya no se cargan.
- Las opciones de menú son texto sin cajas ni fondos, con subrayado al señalar y foco de teclado visible. El selector Q usa tres paneles de cristal translúcido y respeta la preferencia de movimiento reducido.
- El desintegrador transporta líquido negro hasta formar los nuevos Q-bits. Los artefactos conservan sus volúmenes y colisiones, con acabados blancos y grafito y detalles discretos.

## Enganches y rotores

El **Enganche** es una sola pieza con base cúbica de 9 cm y punta piramidal. Sus cinco caras cuadradas permiten añadir Q-bits o estructuras. La punta es un conector mecánico: acerca las puntas de dos enganches y suelta con Shift para formar un **Rotor**. Las dos mitades conservan cuerpos independientes unidos por un eje; no se convierten en una soldadura rígida.

El banco de pruebas ofrece ambos mecanismos desde el inicio, debajo de las figuras en el menú Q. En campaña se desbloquean al completar el nivel 5, **La primera unión**. El clic posterior a elegir crea el enganche o el rotor. El menú Q usa cristal con cantos y grosor y una transición suave del FOV al abrir y cerrar.

- **Clic derecho → Rotación:** horario, antihorario o detener. El sentido se observa desde el lado móvil, mirando hacia su punta.
- **Elegir lado que gira:** A o B; el otro lado queda fijo como base mientras funciona el motor. Las piezas añadidas a cada mitad se mueven con esa mitad.
- **P → Mecanismos:** velocidad de 1 a 120 rpm, elección del lado, creación y guardado. El arranque es gradual; las estructuras de gran radio muestran su velocidad máxima efectiva. Un obstáculo detiene el giro sin romper el eje. Al tomar un rotor, se detiene y se transportan sus dos mitades juntas.
- **Guardar mecanismo:** una mitad se guarda como Enganche; una pareja articulada se guarda como Rotor, conservando piezas, articulación, lado, sentido y velocidad. Se pueden crear copias, exportar e importar desde la misma pestaña. Los diseños guardados con Q-bits o T-bits añadidos se crean en el banco, para conservar los recursos de la campaña.
- **Separar enganches:** desconecta el eje sin borrar las piezas. Las caras de la punta no admiten soldaduras rígidas; usa las caras cuadradas para construir la rueda o el soporte.

## Música

La lista de [`assets/audio/music/`](assets/audio/music/) incluye seis MP3 aportados: **Latencia azul**, **Siete sobre cero**, **Materia tácita**, **Error de fase**, **El peso del aire** y **Nota fantasma**. La [guía de esa carpeta](assets/audio/music/README.md) muestra el orden, los archivos y cómo reemplazarlos o añadir pistas. Los archivos 01 y 05 recibidos son idénticos y se conservan hasta reemplazar el quinto.

Todas las pistas configuradas se descargan y se comprueba que sean reproducibles antes del 100%. Se conservan como archivos comprimidos en memoria, sin decodificar una lista completa a PCM. La reproducción comienza con el clic en **Jugar**; los controles de volumen y música aparecen en los menús cuando hay pistas. Se pausa al pausar el juego o cambiar de pestaña.

## Rendimiento y comprobación

Las búsquedas de rutas se reparten entre fotogramas y se cancelan si cambia la orden o la escena. Se conservan los límites de búsqueda, la resolución, antialiasing, efectos, materiales y frecuencia de la física. También se reutilizan límites geométricos, datos de previsualización y enlaces de atributos de WebGL.

Pruebas locales (Node.js, sin dependencias):

```sh
node --test tests/*.test.cjs
node --check assets/js/game.js
node --check assets/js/boot.js
node --check assets/js/music.js
node --check assets/js/radial-menu.js
```

Las pruebas automatizadas cubren lógica y coordinación de la carga; no sustituyen una prueba visual de WebGL ni una medición de FPS en el equipo del jugador.

En Linux con EGL/GLES (por ejemplo Mesa), `python tests/validate-focus-gles.py` compila los shaders reales y comprueba píxeles de una escena de prueba: enfoque desactivado sin alteración, piezas nítidas, fondo suavizado y ausencia de halos. Usa la biblioteca estándar de Python y no añade dependencias al juego.

El progreso y las formas del nombre anterior se recuperan cuando están disponibles en el almacenamiento del mismo navegador y origen.

La licencia MIT de Cannon.js se conserva en el código y en `THIRD_PARTY_NOTICES.md`; corresponde a ese componente.
