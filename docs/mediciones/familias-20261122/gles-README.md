# Familias: verificación del render 3D con EGL/GLES

Fecha del trabajo: 22 de noviembre de 2026, America/Santiago.

Los comandos de `drawFamilies`, `drawFamilyGlass` y `drawFamilyPlacement` se capturan ejecutando las funciones de producción de `assets/js/game.js`. Se reproducen sus shaders, buffers, uniformes y órdenes de dibujo sobre un contexto EGL/GLES real. Las referencias a esas funciones se exponen solamente en la copia en memoria del fixture; el renderer del juego no se reemplaza.

Esta evidencia valida la compilación GLSL, las llamadas de dibujo, los píxeles 3D y la terminación de los efectos temporales. **No es una captura del navegador ni una validación visual del DOM, el HUD, los menús, las etiquetas o la interacción con ratón/teclado.** Tampoco mide FPS de hardware: Mesa usa el renderizador de software llvmpipe.

## Resultado

| Verificación | Resultado |
| --- | --- |
| Resolución | 800 × 600 |
| Contexto | OpenGL ES 3.2, Mesa 25.0.7-2+deb13u1 |
| Renderizador | llvmpipe, LLVM 19.1.7, 256 bits |
| Rutas de producción | WebGL 1 y WebGL 2 |
| Fotogramas | 18 por ruta; 36 PNG |
| Compilación por ruta | 2 shaders, 1 programa |
| Errores GL / atributos fuera de buffer | 0 / 0 |
| Paridad | Los 18 pares de PNG son idénticos byte por byte |
| Familia de 100 piezas | 1 cuerpo físico, 1 forma de colisión, 0 piezas sueltas activas |
| Familia sólida sin efectos | 3 llamadas de dibujo |
| Familia de baterías con carga | 6 llamadas de dibujo |
| Familia de 100 baterías | 1 vasija de líquido y su buffer reutilizado |

La fuente capturada tiene SHA-256 `9e55241e807593de42c19553878912863dea7952f23f6669b8d0c4257dc57d7a`. Cada `summary.json` conserva la huella de la fuente, la del RGBA de cada fotograma, el inventario, los cuerpos, los efectos, el estado de la vasija y los contadores de píxeles. `gles-parity.json` conserva la comparación entre las dos rutas. Los comandos completos están en `commands.json.gz`, comprimidos después de superar las comprobaciones.

## Escenas

| Archivos en cada carpeta `gles-*` | Comprobación |
| --- | --- |
| `family-black.png`, `family-yellow.png` | El cuerpo acepta negro y amarillo; las dos bandas distinguen al contenedor. |
| `family-battery-blue-0.png`, `-25.png`, `-75.png`, `-100.png` | La superficie azul visible aumenta con la fracción de carga. Las bandas azules permanecen incluso vacía. |
| `family-battery-red-75.png` | El volumen interior y las bandas adoptan el rojo elegido, sin retener el azul de la escena anterior. |
| `family-battery-red-occluded.png` | Un objeto opaco delante reduce los píxeles rojos visibles; el vidrio respeta la profundidad. |
| `family-battery-blue-tilted-50.png` | Con el contenedor girado 45°, la superficie en reposo permanece horizontal en el mundo. |
| `family-battery-blue-slosh-impulse.png`, `family-battery-blue-slosh-paused.png` | El impulso inclina la superficie; pausar conserva sus píxeles y no reconstruye ni vuelve a subir su buffer. |
| `family-battery-blue-slosh-settled.png` | El movimiento se amortigua hasta una superficie horizontal, reutilizando el mismo buffer. |
| `family-placement-blue.png` | La guía de traslado válida es azul. |
| `family-placement-blocked.png` | La guía ocupada pasa a rojo y deja de emitir el azul válido. |
| `family-withdraw-blue.png` | Se muestran diez piezas previstas sin crear diez cuerpos físicos. |
| `family-animation-a.png`, `family-animation-b.png` | Ocho piezas visuales cambian de posición/tamaño entre 0,05 s y 0,30 s. |
| `family-animation-complete.png` | A los 0,80 s se han retirado los efectos temporales; queda el contenedor. |

La prueba de carga compara los cuatro niveles contra el estado vacío porque las bandas de familia también usan su color. En esta captura los píxeles azules son, respectivamente, 12.043, 14.874, 23.368 y 23.841. La batería roja al 75 % presenta 23.366 píxeles rojos y cero azules; el obstáculo reduce los rojos a 6.230. Ninguna escena azul o roja conserva píxeles de líquido verde según el umbral de color de la prueba.

La batería agrupada usa el sistema `QBitsBatteryLiquid` con una sola vasija por familia. La superficie se recorta según la gravedad, la carga agregada y la respuesta al movimiento; el shader 15 toma el color elegido también para el menisco y los reflejos. El ensayo de impulso produce una normal `[0.1611587709, 0.9869284931, 0]`. La pausa conserva ese estado y una sola subida de geometría; al asentarse, la normal vuelve a `[0, 1, 0]` y la segunda subida reutiliza el mismo buffer. La vasija inclinada conserva una variación vertical menor de `1e-5` en la superficie mundial en reposo.

El contenido de cien baterías permanece como inventario: no se crean cien estados de líquido, cuerpos ni colisiones. Las reglas de carga, extracción y conservación se cubren mediante pruebas de lógica independientes. La prueba de píxeles detectó durante la integración una superficie verde heredada del shader de baterías; se corrigió para derivar los brillos del color elegido antes de generar esta evidencia.

Se inspeccionaron visualmente los PNG de negro, amarillo, batería azul vacía y al 75 %, batería roja, guía de traslado, guía de extracción y los dos tiempos de animación. Tras incorporar líquido dinámico se revisaron de nuevo azul al 25 %, rojo al 75 %, la inclinación de 45° y el impulso. Las vistas usan una cámara fija y fondo liso para aislar el render de familias.

## Regresión del shader compartido

También se ejecutaron sin modificar los validadores existentes:

- `tests/validate-battery-gles.py`: 25 escenas de baterías normales, dos shaders compilados, un programa enlazado y cero errores GL. Comprueba carga visible, vidrio, oclusión, inclinación, respuesta a un impulso y retorno al reposo. Se inspeccionó además la batería de tres celdas al 50 %: conserva líquido verde. PNG y comandos comprimidos en `regression-battery/`.
- `tests/validate-focus-gles.py`: los siete shaders y las cuatro combinaciones de programas informadas compilan/enlazan. Los fixtures de foco y postproceso pasan; el error máximo de píxel con el foco desactivado y en el primer plano protegido es cero. El contraste del fondo pasa de 255 a 11. Pasan también antialias, cuantización, dithering y bloom sin alterar la sala neutra. Imágenes de referencia en `regression-focus/`.

`battery-gles.jsonl` y `focus-gles.jsonl` conservan las salidas, y `regression-summary.json` reúne los resultados. Las huellas de los shaders de escena de la regresión de baterías coinciden con las de la captura final de familias. Estas comprobaciones conservan el mismo límite: son EGL/GLES real y fixtures, sin validar la interfaz en navegador ni medir su rendimiento.

## Reproducción

Desde la raíz del repositorio, con Node, Python 3 y `libEGL.so.1` disponibles:

```bash
python tests/validate-families-gles.py docs/mediciones/familias-20261122/gles-webgl1
QBITS_RENDER_BACKEND=webgl2 python tests/validate-families-gles.py docs/mediciones/familias-20261122/gles-webgl2
```

Para repetir las regresiones compartidas:

```bash
python tests/validate-battery-gles.py docs/mediciones/familias-20261122/regression-battery
QBITS_GRAPHICS_CAPTURE_DIR=docs/mediciones/familias-20261122/regression-focus python tests/validate-focus-gles.py
```

El fixture `tests/capture-families-frame.cjs` registra las llamadas. `tests/validate-families-gles.py` las reproduce, consulta errores GL tras cada orden, guarda los PNG y comprueba sus propiedades. Si cambia `game.js`, repetir ambas rutas antes de atribuir estas imágenes a la nueva fuente.

La paridad se puede volver a comprobar con:

```bash
python - <<'PY'
import json
from pathlib import Path
base = Path('docs/mediciones/familias-20261122')
a = json.loads((base / 'gles-webgl1/summary.json').read_text())
b = json.loads((base / 'gles-webgl2/summary.json').read_text())
assert a['sourceSha256'] == b['sourceSha256']
assert len(a['snapshots']) == len(b['snapshots']) == 18
for shot in a['snapshots']:
    assert (base / 'gles-webgl1' / shot['png']).read_bytes() == (base / 'gles-webgl2' / shot['png']).read_bytes()
print('18 pares de fotogramas idénticos')
PY
```
