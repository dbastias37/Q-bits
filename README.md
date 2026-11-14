# Q-bits

Juego de puzles en primera persona, ambientado en salas blancas minimalistas. Mueve y une Q-bits, organiza al equipo, activa circuitos y transforma materia para abrir nuevas rutas.

Este paquete contiene la versión completa del 14 de noviembre de 2026: prólogo, 12 niveles y laboratorio de pruebas.

## Jugar

Descomprime el paquete y abre `index.html` en un navegador de escritorio con WebGL activado. Haz clic en **Jugar** y después en **Despertar** para iniciar el prólogo.

El juego incluye su código, estilos, gráficos procedurales y motor de físicas dentro de `index.html`. No requiere npm, compilación, descargas de recursos ni un servidor de aplicación.

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

El menú permite seleccionar niveles, reiniciar, pausar y entrar al laboratorio. Las transiciones incluyen fundidos, carga breve y pantalla de final de nivel.

## Controles principales

| Acción | Control |
| --- | --- |
| Caminar | WASD |
| Mirar | Mouse |
| Tomar y soltar una pieza en campaña | Clic izquierdo |
| Ajustar la distancia de una pieza sostenida | Rueda del mouse |
| Agacharse con las manos libres | Mantener Shift |
| Ajustar la altura al agacharse | Shift + rueda |
| Girar una pieza sostenida | Shift + WASD |
| Unir piezas | Acercar sus caras y soltar manteniendo Shift |
| Opciones de separación | Alt, apuntando a una estructura |
| Seleccionar varias piezas | Arrastrar con clic izquierdo desde un espacio vacío |
| Dar órdenes y elegir un destino | Menú de clic derecho sobre la pieza y después sobre el suelo |
| Tomar un grupo seleccionado | Clic derecho → Tomar selección |
| Detener una orden | R |
| Avanzar o completar el texto del diálogo | E o Espacio |
| Asignar un equipo al material señalado | E, cuando no hay diálogo activo |
| Saltar la presentación del grupo | O, durante esa presentación |
| Pausar / liberar el mouse | Esc |
| Abrir las herramientas de prueba | P, también dentro del tutorial |
| Pantalla completa | Botón de pantalla completa |

El panel de pruebas incluye controles adicionales y ajustes del laboratorio. En campaña, las herramientas de creación requieren abrir ese panel.

## Transformación de materia

La materia es finita: cada bloque se consume una sola vez y produce la cantidad de Q-bits que indican sus unidades. El equipo debe arrastrarlo hasta el desintegrador. La transformación pasa por la entrada, el recorrido del líquido y la salida de nuevos compañeros; si la salida está ocupada, espera a que quede libre.

Los desintegradores tienen una superficie de portal animada con fondo negro opaco, manguera transparente, compuerta de salida y contador de producción. Las estaciones están distribuidas en distintos espacios de los niveles del segundo bloque.

## Archivos y desarrollo

| Archivo | Contenido |
| --- | --- |
| `index.html` | Juego completo y código fuente editable. |
| `README.md` | Instalación, publicación, campaña y controles. |
| `THIRD_PARTY_NOTICES.md` | Aviso de licencia del motor de físicas incluido. |
| `.nojekyll` | Configuración para servir archivos estáticos en GitHub Pages. |
| `.gitignore` | Exclusiones de archivos temporales y paquetes ZIP. |

Para modificar el juego, edita `index.html`: contiene las secciones de interfaz y estilos, el motor de físicas incorporado y la lógica del juego. Los comentarios `Campaign prologue`, `Eight complete campaign levels` y `Chapter II` identifican las secciones de narrativa y campaña.

Esta entrega conserva el juego del archivo original `Q-bits_Sala_Blanca.html`, renombrado como `index.html` para su publicación. Está preparado para teclado y mouse; la comprobación final de jugabilidad debe hacerse en un navegador con WebGL.

El progreso y las formas del nombre anterior se recuperan cuando están disponibles en el almacenamiento del mismo navegador y origen.

La licencia MIT de Cannon.js se conserva en el código y en `THIRD_PARTY_NOTICES.md`; corresponde a ese componente.
