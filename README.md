# Q-bits

Juego de puzles en primera persona, ambientado en salas blancas minimalistas. Mueve y une Q-bits, organiza al equipo, activa circuitos y transforma materia para abrir nuevas rutas.

Versión actualizada el 14 de noviembre de 2026: prólogo, 20 niveles y laboratorio de pruebas.

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
| 13 | La primera división | Reconfigurar un Q-bit en seis pirámides conservando su materia. |
| 14 | La segunda escala | Subdividir una pirámide en dos triangulares complementarios. |
| 15 | Seguimos siendo nosotros | Recomponer los triangulares y recuperar el cubo original. |
| 16 | El acuerdo del eje | Hacer girar un rotor del banco durante 6 segundos útiles sin intervenir. |
| 17 | La fuerza tiene un precio | Mantener una carga de 4 unidades durante 8 segundos dentro del presupuesto de energía. |
| 18 | La primera entrega autónoma | Llevar el extremo de un brazo articulado hasta el receptor con movimiento físico real. |
| 19 | Una pieza cada vez | Dosificar tres medias unidades y recibirlas en orden A, B, A. |
| 20 | Los primeros seis paquetes | Reunir doce medias unidades en seis paquetes A+B y entregarlos autónomamente. |

El menú permite seleccionar niveles, reiniciar, pausar y entrar al laboratorio. Las transiciones incluyen fundidos, una carga de transición deliberada de al menos 1,8 segundos para dar una pausa entre escenas, y pantalla de final de nivel. Esa pausa es independiente de la precarga real inicial.

El [estado del proyecto](docs/ESTADO_PROYECTO.md) concentra lo terminado y el siguiente bloque para retomar el trabajo sin reconstruir las conversaciones.

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
| Operar la cámara de reconfiguración | Dejar las piezas en ENTRADA y pulsar E mirando la cámara; también clic derecho. |
| Consultar el catálogo de materia | J durante la partida, o desde los menús principal y de pausa. |
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

## Reconfiguración y catálogo

Los niveles 13–15 continúan la campaña existente. La cámara trabaja con piezas de un mismo origen, colocadas en el círculo ENTRADA. Un Q-bit produce seis pirámides; una pirámide produce dos triangulares. El triangular es la última subdivisión. En el nivel 15 se habilitan las operaciones inversas. Las piezas pueden reunirse sueltas en la bandeja; la cámara realiza la recomposición, que es distinta de la unión manual de caras.

El proceso dura cuatro segundos de simulación y se congela al pausar, consultar el catálogo o cambiar de pestaña. Si la bandeja SALIDA está ocupada, conserva la transacción y espera: mueve las piezas anteriores antes de empezar otra transformación. La emisión ocurre completa, sin perder ni duplicar partes. Materia, energía ponderada, estado de descanso y origen se conservan; seis pirámides aportan juntas la misma capacidad de arrastre que su cubo original. Los ajustes manuales de peso incompatibles con la materia se rechazan al transformar.

El NPC introduce cada experimento con diálogos que avanzan con E. J abre el catálogo; también está disponible desde los menús. Los descubrimientos se conservan en el progreso existente. Los planos de referencia de un cubo formado por seis pirámides y de una pirámide formada por dos triangulares se añaden a **Formas guardadas**. Para colocar uno: clic derecho en el suelo → Formas guardadas. Para construirlo: reúne piezas compatibles y activa **Integrar cercanos** sobre el blueprint. Guardar un plano no concede cuerpos ni recursos.

El [prompt maestro de campaña](docs/PROMPT_MAESTRO_CAMPANA.md) reúne el lore, el tono del guía, la secuencia posterior, la autonomía, los desafíos y la progresión propuesta. Los niveles 16–20 y las certificaciones Torque I–III están implementados. Las misiones 21–24, coordinación avanzada, temperatura y posjuego siguen pendientes. El taller incorpora calibraciones de batería, estructura ligera y movimiento para las piezas del banco. La [revisión del bloque](docs/REVISION_BLOQUE_III.md) detalla qué se comprobó y qué queda pendiente.

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
- **Elegir lado que gira:** A o B. Las piezas añadidas a cada mitad se mueven con ella. El montaje predeterminado **Rueda libre** deja ambas mitades físicas: el contacto con el suelo puede mover el conjunto. **Eje fijo** ancla la base para pruebas estacionarias. Se pueden accionar varios rotores de rueda en un mismo chasis; un eje fijo excluye otros motores encendidos de ese conjunto.
- **P → Mecanismos:** velocidad objetivo de 1 a 120 rpm, torque máximo de 0.02 a 4 N·m y capacidad de 2 a 128 u. Los valores iniciales son 30 rpm, 0.4 N·m y 16 u. El arranque es gradual y la velocidad real depende del esfuerzo. El panel muestra rpm reales, torque utilizado, carga y consumo. Al tomar un rotor se detiene y se transporta el mecanismo conectado.
- **Rodar en el piso:** coloca el eje horizontal y añade la rueda al lado móvil. Una rueda hecha de cubos levanta su eje al pasar sobre las aristas; no se convierte en un círculo. Usa suficiente torque y evita que el soporte invada su recorrido. El eje permanece unido frente a obstáculos, que pueden frenar o bloquear el giro.
- **Carga y energía:** la capacidad suma el peso de todas las piezas conectadas, incluidos ambos enganches (un Q-bit normal pesa 1 u). Superarla corta el motor. Ambos enganches alimentan sus barras de energía; las piezas añadidas no aportan batería. Consumen al estar encendidos, por trabajo y por calentamiento durante un atasco. Apagados recuperan energía con el sistema de descanso existente; no se reinician solos al agotarse. Pausar o abrir Q congela el consumo.
- **Guardar mecanismo:** una mitad se guarda como Enganche; una pareja articulada se guarda como Rotor, conservando piezas, articulación, lado, sentido, montaje, velocidad, torque y capacidad. Se pueden crear copias, exportar e importar desde la misma pestaña. Los diseños guardados con Q-bits o T-bits añadidos se crean en el banco, para conservar los recursos de la campaña.

La calibración energética de juego usa 20 J por enganche, 0.06 W de consumo base, eficiencia 0.72 y pérdida térmica de 5·torque² W. `assets/js/rotor-power.js` concentra estos parámetros. El consumo utiliza torque y velocidad relativa medidos, con corriente de retención al bloquearse; no pretende representar un motor comercial concreto.
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
node --check assets/js/rotor-power.js
```

Las pruebas automatizadas cubren lógica y coordinación de la carga; no sustituyen una prueba visual de WebGL ni una medición de FPS en el equipo del jugador.

En Linux con EGL/GLES (por ejemplo Mesa), `python tests/validate-focus-gles.py` compila los shaders reales y comprueba píxeles de una escena de prueba: enfoque desactivado sin alteración, piezas nítidas, fondo suavizado y ausencia de halos. Usa la biblioteca estándar de Python y no añade dependencias al juego.

El progreso y las formas del nombre anterior se recuperan cuando están disponibles en el almacenamiento del mismo navegador y origen.

La licencia MIT de Cannon.js se conserva en el código y en `THIRD_PARTY_NOTICES.md`; corresponde a ese componente.

## Automatización inicial y perfil

Los niveles 16–18 usan un banco montado para aprender a configurar el movimiento antes de encargar líneas completas de producción. La prueba requiere giro físico útil, carga original y continuidad sin intervención. El objetivo muestra tiempo, energía consumida, presupuesto y rpm reales. El nivel 18 mueve un compañero unido al extremo del brazo hasta un receptor; al recibirlo, detiene el motor. Este ejercicio utiliza un brazo; la cinta y el empaquetado se introducen en los niveles 19–20.

Tomar o reorganizar piezas y cambiar órdenes o parámetros reinicia el tramo autónomo. La pausa, el panel de parámetros, el catálogo y la pestaña oculta congelan el reloj. La puerta se habilita tras registrar la prueba y el jugador puede cruzar dejando el banco en su sitio.

Completar el nivel 16 desbloquea Torque II y completar el 18 desbloquea Torque III. En **P → Mecanismos → Certificación de torque** se elige el nivel autorizado: I hasta 0,40 N·m, II hasta 0,65 N·m y III hasta 1,00 N·m. Subir de certificación no aumenta automáticamente el ajuste de un rotor. Son valores iniciales de equilibrio; pedir más fuerza conserva su costo energético real. Los ejercicios 16–18 fijan Torque I aunque el perfil tenga mejoras, y el laboratorio mantiene hasta 4 N·m.

Las comprobaciones automatizadas se describen en la [revisión del bloque IV](docs/REVISION_BLOQUE_IV.md). Sigue pendiente una partida visual para ajustar legibilidad, ritmo y equilibrio.

## Dosificación y primer pedido

Los niveles 19–20 añaden una línea guiada con depósito finito, dosificador, cámara de empaquetado y receptor. La materia de trabajo se distingue de los compañeros: las medias unidades A y B son recursos sin estados de ánimo. El dosificador espera espacio antes de retirar una unidad del depósito.

En el nivel 19 se reciben tres unidades en orden A, B, A. En el 20, cada paquete requiere una media unidad A y una B; doce medias unidades producen los seis paquetes pedidos conservando masa e identidades. El receptor cuenta llegadas físicas únicas.

**Apunta a la estación y pulsa E** para elegir el intervalo y comenzar o reiniciar el lote. La cinta aplica fuerzas a los cuerpos según el giro real del rotor y el consumo incluye trabajo de la estación. Mirar y caminar no intervienen en el ensayo. Manipular piezas o cambiar parámetros invalida el intento autónomo; reiniciar prepara nuevamente un solo lote de prueba, sin acumular entregas anteriores.

El tiempo de trabajo útil se acumula dentro de un único lote sin intervención; las pausas entre operaciones o una salida obstruida no añaden tiempo. Son ejercicios de configuración de una instalación existente. La construcción abierta de líneas y los desafíos finales siguen pendientes. La [revisión del bloque V](docs/REVISION_BLOQUE_V.md) registra las verificaciones y los ajustes que deberá confirmar una partida con jugador.

## Mesa de trabajo y sensor de contacto

Entra al **Banco de pruebas**. La mesa está a la izquierda, cerca de la entrada. Apunta a ella y pulsa **E** para investigar; deja una pieza sobre la mesa y suéltala para adaptar esa misma pieza. Los ejercicios certificados de campaña mantienen sus configuraciones.

Cada primera finalización de un nivel otorga **12 créditos**. El taller reconoce también las misiones ya guardadas y no vuelve a pagarlas al repetirlas. La investigación se compra una vez; aplicar una calibración investigada no vuelve a consumir créditos. El taller II cuesta 24 créditos y requiere completar el nivel 8; el III cuesta 48 y requiere el nivel 16. El sensor cuesta 8 créditos; las tres ramas II cuestan 20 cada una y las III, 32 cada una, con su nivel anterior como requisito.

El sensor es un módulo en un Q-bit o T-bit existente, conservando su identidad. Instálalo en la mesa, móntalo con las uniones de caras habituales y usa **clic derecho → Sensor → Conectar punta** para elegir el rotor. La marca de la punta indica su cara activa y se vuelve verde al conectarla; gira la pieza para hacerla mirar a la pared. El enlace alcanza 3 m. Un contacto válido invierte el rotor encendido una vez. Si hay varios sensores vinculados, todos deben separarse antes de una nueva inversión. El suelo y los contactos de piezas vecinas no son pulsaciones del sensor.

Las baterías pasan de 20 a 30 y 40 J. Adaptarlas conserva los julios actuales: una batería mayor puede mostrar menor porcentaje sin haber perdido energía. Una batería menor debe poder contener la carga antes de instalarse. La estructura ligera reduce masa a 90/80 %, con menor agarre y capacidad de trabajo; la materia retirada queda registrada como reserva de esa identidad en la mesa. El movimiento aumenta 10/20 % y eleva su gasto 15/35 %. Las mejoras no alteran la corrección del planificador de rutas.

Las adaptaciones se conservan al unir, separar y recuperar la escena del banco. Retíralas antes de dividir la materia, duplicar piezas o guardar una plantilla de mecanismo; las reservas y enlaces pertenecen a las identidades originales. Los planos geométricos habituales siguen funcionando con piezas existentes. La investigación permanece desbloqueada.

La [revisión del taller y sensor](docs/REVISION_TALLER_SENSOR.md) documenta costes, pruebas y límites. Esta es una primera economía completa y alcanzable; su duración y dificultad todavía requieren prueba con jugador. No añade niveles para alargar artificialmente la campaña.
