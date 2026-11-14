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
| Opciones de separación | Alt, apuntando a una estructura |
| Seleccionar varias piezas | Arrastrar con clic izquierdo desde un espacio vacío |
| Dar órdenes y elegir un destino | Menú de clic derecho sobre la pieza y después sobre el suelo |
| Tomar un grupo seleccionado | Clic derecho → Tomar selección |
| Duplicar selección en el laboratorio | V |
| Crear la pieza elegida en el laboratorio | N, o P → Piezas → Crear |
| Detener una orden | R |
| Avanzar o completar el texto del diálogo | E o Espacio |
| Asignar un equipo al material señalado | E, cuando no hay diálogo activo |
| Saltar la presentación del grupo | O, durante esa presentación |
| Pausar / liberar el mouse | Esc |
| Abrir las herramientas de prueba | P, también dentro del tutorial |
| Pantalla completa | Botón de pantalla completa |

El panel de pruebas incluye controles adicionales y ajustes del laboratorio. En campaña, las herramientas de creación requieren abrir ese panel.

## T-bits en el banco de pruebas

En **P → Piezas → Tipo de pieza** se elige entre el Q-bit cúbico y dos T-bits grises. El botón Crear y el atajo N usan esa elección. Las nuevas formas se crean en el banco libre.

| Pieza | Proporciones respecto al lado del Q-bit |
| --- | --- |
| T-bit triangular | Tetraedro regular: cada arista mide un lado del Q-bit. |
| T-bit rectangular | Base de 1 × 0,8 lados y altura de 1 lado. |

Tienen colisiones según sus caras reales, peso ajustable, agarre, giro, recorrido, estados, energía y enfriamiento. Se unen entre sí y con Q-bits acercando sus caras y soltando con Shift; Alt permite separar una pieza o desarmar la estructura. Duplicar, guardar formas y volver al banco conservan cada tipo. Los blueprints requieren piezas de la forma correcta y siguen aceptando las formas cúbicas guardadas anteriormente.

El contador inferior izquierdo muestra únicamente el icono negro y las existencias Q/T. Los atajos visibles se reducen a P · N · B; las órdenes y ajustes siguen disponibles en sus menús.

## Transformación de materia

La materia es finita: cada bloque se consume una sola vez y produce la cantidad de Q-bits que indican sus unidades. El equipo debe arrastrarlo hasta el desintegrador. La transformación pasa por la entrada, el recorrido del líquido y la salida de nuevos compañeros; si la salida está ocupada, espera a que quede libre.

Los desintegradores tienen una superficie de portal animada con fondo negro opaco, manguera transparente, compuerta de salida y contador de producción. Las estaciones están distribuidas en distintos espacios de los niveles del segundo bloque.

## Archivos y desarrollo

| Archivo | Contenido |
| --- | --- |
| `index.html` | Interfaz, estilos y apertura en negro. |
| `assets/js/boot.js` | Presentación y progreso de precarga real. |
| `assets/js/game.js` | Lógica, físicas, gráficos procedurales y campaña. |
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
- Las opciones de menú son texto sin cajas ni fondos, con subrayado al señalar y foco de teclado visible.
- El desintegrador transporta líquido negro hasta formar los nuevos Q-bits. Los artefactos conservan sus volúmenes y colisiones, con acabados blancos y grafito y detalles discretos.

## Música

Sube tus MP3/OGG a [`assets/audio/music/`](assets/audio/music/) y añádelos a `playlist.json`. La [guía de esa carpeta](assets/audio/music/README.md) contiene el formato exacto. La lista inicial está vacía: el juego funciona en silencio hasta añadir tus temas. No se incluyen audios de ejemplo.

Todas las pistas configuradas se descargan y se comprueba que sean reproducibles antes del 100%. Se conservan como archivos comprimidos en memoria, sin decodificar una lista completa a PCM. La reproducción comienza con el clic en **Jugar**; los controles de volumen y música aparecen en los menús cuando hay pistas. Se pausa al pausar el juego o cambiar de pestaña.

## Rendimiento y comprobación

Las búsquedas de rutas se reparten entre fotogramas y se cancelan si cambia la orden o la escena. Se conservan los límites de búsqueda, la resolución, antialiasing, efectos, materiales y frecuencia de la física. También se reutilizan límites geométricos, datos de previsualización y enlaces de atributos de WebGL.

Pruebas locales (Node.js, sin dependencias):

```sh
node --test tests/*.test.cjs
node --check assets/js/game.js
node --check assets/js/boot.js
node --check assets/js/music.js
```

Las pruebas automatizadas cubren lógica y coordinación de la carga; no sustituyen una prueba visual de WebGL ni una medición de FPS en el equipo del jugador.

El progreso y las formas del nombre anterior se recuperan cuando están disponibles en el almacenamiento del mismo navegador y origen.

La licencia MIT de Cannon.js se conserva en el código y en `THIRD_PARTY_NOTICES.md`; corresponde a ese componente.
