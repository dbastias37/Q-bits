# Modelo de depósito energético

`assets/js/reservoir-model.js` contiene una adaptación de la geometría suministrada por el usuario en `scifi-container-blender.zip`, preparada para el renderizador WebGL propio del juego. No requiere OBJLoader, Three.js, GLB ni solicitudes adicionales en ejecución.

## Fuente

El archivo adjunto contiene `source/ScifiContainer.zip`, que a su vez contiene exclusivamente `ScifiContainer.obj` (30.665.463 bytes). El encabezado indica Blender 2.82 y `ScifiCylinder_Merged.blend`. Hay 217.094 vértices, 215.382 caras y seis objetos. El archivo hace referencia a `ScifiContainer.mtl`, pero no incluye ese material, texturas, autor ni licencia. Por ello los materiales y colores de la adaptación son propios del juego y no se atribuye una licencia que no fue suministrada.

## Reducción y fidelidad

Se conserva la cápsula vertical, las tapas, los soportes laterales, el detalle frontal, la rejilla y el cilindro de vidrio independiente. Conversión con Blender 4.3.2:

1. Importar OBJ y soldar vértices coincidentes con tolerancia de 0,0001 en las unidades originales.
2. Disolver caras coplanares con umbral de tres grados y triangular.
3. Reducir tapas y soportes mediante Decimate. La rejilla, cuya microgeometría contenía 57.048 caras, se reconstruye volumétricamente con vóxeles de 0,003 antes de reducirla a 450 triángulos.
4. Transformar las coordenadas a Y vertical y base en el piso. La altura nominal es 1,90 m; ancho aproximado 0,77 m. La cuantización conserva cinco decimales de metro.
5. Omitir triángulos degenerados y calcular normales planas unitarias. Agrupar el marco y los detalles en dos mallas opacas; mantener separado el vidrio.

Resultado: 6.257 triángulos derivados del modelo original, más 128 del líquido procedural. El módulo ocupa aproximadamente 135 KB de texto sin compresión. La malla se expande una sola vez y se reutiliza entre depósitos; cada depósito necesita dos dibujos opacos para su estructura, uno para líquido y uno para vidrio.

## API

El módulo expone `QBitsReservoirModel` en navegador y `module.exports` en Node. `create()` devuelve el mismo objeto de geometría compartida en llamadas sucesivas:

- `opaque`: dos entradas (`frame`, `details`).
- `glass`: cilindro de vidrio procedente del OBJ.
- `liquid`: cilindro unitario con radio 1 y altura de Y=0 a Y=1.
- Cada malla contiene `data: Float32Array`, `count` de vértices y `color: [r,g,b,a]`. Los datos intercalan `x,y,z,nx,ny,nz`, directamente compatibles con `buffer` y `drawAsset` del juego.
- `bounds`: límites reales de la geometría reducida.
- `fill`: `{radius: .315, bottom: .43, height: 1.26, top: 1.69}`.
- `collision`: `{radius: .39, height: 1.9, center: [0,.95,0], half: [.39,.95,.39]}`. Es una envolvente simple, no un collider por triángulo.
- `ports.input`: `[-.19,.35,.341]`; `ports.output`: `[.19,.35,.341]`. Son ubicaciones sugeridas en el zócalo frontal para los contactos dibujados por el juego.

Dibujar marco y vidrio con escala `(1,1,1)` y origen en la base del depósito. Para una fracción de carga `f` entre 0 y 1, dibujar líquido en base + `(0,.43,0)` con escala `(.315,1.26*f,.315)`; omitirlo cuando `f=0`. Las mallas compartidas no se reconstruyen al variar la carga.

## Verificación de esta conversión

Se abrió el OBJ en Blender, se inspeccionaron vistas de la silueta original y la malla reducida, y se ejecutó el módulo en Node. Todas las posiciones y normales son finitas; todas las mallas contienen triángulos completos y normales unitarias con error máximo menor de 0,000001. Esta verificación corresponde al recurso geométrico y no certifica la integración jugable ni una partida visual del juego.
