# Agarre de familias · comprobación gráfica EGL/GLES

Fecha: 23 de noviembre de 2026. Fuente de todas las capturas finales, `assets/js/game.js`, SHA-256:

`c6eb37fc126a165a3b774a157aac392ef23cb4d23b5bd7e1418953cdf8bbb2e0`

## Resultado

**25 escenas por ruta, 50 PNG, cero errores GL.** Las rutas de comandos WebGL 1 y WebGL 2 producen los mismos píxeles en los 25 pares. Las 18 escenas de familias que ya existían conservan exactamente los hashes RGBA de la entrega anterior. La comparación queda en [gles-parity.json](gles-parity.json).

| Comprobación | Resultado final en ambas rutas |
| --- | --- |
| Shaders y programas de escena/foco | 4 shaders compilados, 2 programas enlazados |
| Máscara de la familia sostenida | 34.316 píxeles; coincide exactamente con la referencia de caja y bandas |
| Carcasa y bandas, por separado | 32.017 píxeles de carcasa y 2.299 de bandas protegidos |
| Error máximo del contenedor tras enfocar | 0 niveles de 255 |
| Máscara de la familia de baterías | Coincide exactamente con la referencia exterior completa |
| Error máximo de batería tras enfocar | 1 nivel de 255, dentro de la tolerancia de muestreo lineal |
| Proyección Ctrl | Coincide píxel por píxel con una caja de 15 cm |
| Inventario durante las capturas de agarre | 100 piezas guardadas, ninguna pieza materializada, un cuerpo de familia con una forma de colisión |
| Mano durante las capturas de agarre | Un anclaje y una unión física temporales |

Los resúmenes incluyen hashes de cada imagen, inventario, geometría de líquido, número de draws y controles de buffers: [WebGL 1](gles-webgl1/summary.json) y [WebGL 2](gles-webgl2/summary.json). Cada directorio conserva las imágenes y los comandos exactos comprimidos en `commands.json.gz`.

## Cobertura añadida

El capturador usa la función real de agarre y el estado real de Cannon dentro del harness. Reproduce `ensureFocusPass` y `compositeHeldFocus`, incluidos los framebuffers de escena y máscara que comparten profundidad, y el compositado final. Se comprueba la caja sostenida, la familia de baterías con vidrio y líquido, las máscaras de ambas y el ghost de caída que dibuja `drawGuides` con Ctrl.

Las referencias gráficas describen la geometría exterior esperada: caja de 15 cm con sus dos bandas, y proyección de caída de 15 cm. El inventario se compara antes y después del render; no se permite crear piezas físicas internas ni alterar su contenido.

La nueva comprobación detectó que las bandas sobresalían de la primera máscara y quedaban expuestas al desenfoque. También detectó tres píxeles de una tapa de batería excluidos por diferencias de precisión en profundidad. La máscara final vuelve a dibujar las bandas y, para las baterías, las tapas con su geometría exacta. Así protege la superficie visible completa. Son tres draws de máscara para una familia normal y cinco para una familia de baterías, sólo al usar el enfoque de inspección; el número no aumenta con el inventario.

Se conservan las escenas anteriores de color negro/amarillo, carga de baterías, oclusión, inclinación, movimiento del líquido, pausa y reposo, colocación válida/bloqueada, retirada y animación de agrupado. Sus 18 imágenes coinciden con la fuente anterior `9e55241e807593de42c19553878912863dea7952f23f6669b8d0c4257dc57d7a` registrada en Git.

## Regresión de foco y postproceso

También pasa `validate-focus-gles.py` sobre la misma fuente. El fixture de 64 × 64 mantiene error 0 con el efecto desactivado y en el primer plano protegido; el contraste del fondo baja de 255 a 11. No hay sangrado del objeto oscuro hacia el fondo blanco. Pasan además cuantización, dithering, bloom de color, halo conectado, antialias y conservación de la sala neutra. Salida completa: [focus-gles.jsonl](focus-gles.jsonl).

## Reproducir

Desde la raíz del repositorio:

```bash
python3 tests/validate-families-gles.py docs/mediciones/familias-agarre-20261123/gles-webgl1
QBITS_RENDER_BACKEND=webgl2 python3 tests/validate-families-gles.py docs/mediciones/familias-agarre-20261123/gles-webgl2
python3 tests/validate-focus-gles.py
```

El entorno final fue Mesa 25.0.7, llvmpipe LLVM 19.1.7, contexto OpenGL ES 3.2, con capturas de 800 × 600 a resolución nativa. El capturador selecciona por separado las rutas del juego WebGL 1 y WebGL 2 y reproduce sus comandos sobre EGL/GLES real.

Estas comprobaciones verifican render, shaders y píxeles. No constituyen una partida en navegador, una validación del DOM de etiquetas/menús, ni una medición de FPS o tiempo GPU. La interacción física y el coste de CPU se documentan en la [evidencia general de agarre](README.md).
