# Evidencia — contornos de cajas

Informe: [RENDIMIENTO_CONTORNOS_CAJAS_2026-11-22.md](../../RENDIMIENTO_CONTORNOS_CAJAS_2026-11-22.md).

Referencia `b20cb02af270cdbf19a26b07dd22edb6b5ae02c1`; código local medido `dcbf3f8ba9883d07dd867b7311c5f1ece439597d`, publicado `a327f7542ca5aa05460729a8f8747b4a7e9df048`, árbol idéntico `d025ff2d9f827f22a84436e917c4c64bdc7a7443`. SHA-256 del juego medido: `db3f26eee06a5b7768cb27ef3dcb18be15dd1d46d32f92efc33201f6e129f4e7`.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `matrix-settled-{60,120,240}.json.gz` | Reposo real: inventarios, relojes, muestras de pared/CPU y tres parejas por escala. La comparación de 2000/240 queda interrumpida y se conserva |
| `matrix-settling-120.json.gz` | Asentamiento desde el primer paso, separado del reposo |
| `matrix-controls-120.json.gz` | Soldados, pocos brazos, muchos rotores y fábrica activa; 100/500/2000 piezas |
| `outlines.json.gz` | Operación aislada, primer uso y 30 muestras después de calentar; contadores apagados |
| `outline-counts.json.gz` | Conteos separados de triangulaciones, subidas, bytes, llamadas y vértices; sin tiempos principales |
| `profile.json.gz`, `node-independent-500-*` | Inspector Node CPU/heap, GC y tres pares OFF/ON por variante en 500/120 |
| `profile-1500-240.json.gz`, `node-independent-1500-*` | Diagnóstico del régimen de coste de 1500/240. Los timers inclusivos no se suman |
| `isolated-1500-240.json.gz` | Repetición dirigida en proceso nuevo, conservando el resultado desfavorable |
| `control-long-120.json.gz` | Control de 16 piezas con 180 calentamientos y 180 muestras para comprobar su cola |
| `equivalence.json.gz` | Trece escenarios de cámara, retrasos y Producción 19/20 a las frecuencias reales |
| `architecture-{baseline,final}.json.gz` | Los 21 resultados/contadores del benchmark existente coinciden exactamente |
| `ground-{baseline,final}.json.gz` | Las 36 caídas conservan resultados físicos exactos |
| `tests-final.txt` | Suite íntegra: 1228 aprobadas, cero fallos/omisiones/cancelaciones |
| `gles-webgl{1,2}.json`, `gles-focus.txt` | 112 capturas por ruta, layouts/shaders reales, comparación CPU/GPU y fixtures de foco |
| `capturas/outline-box-*` | Siete pares de referencia CPU anterior y render nuevo. Los duplicados cacheados se verifican en el replay y constan en el JSON |
| `chromium-no-disponible.txt` | Intento local real: fallo de creación de sockets. No se midieron FPS, RAF, Main ni GPU de navegador |
| `analysis-summary.json.gz`, `resumir.py` | Agregado reproducible con medianas, rangos, parejas, inventarios, relojes y advertencias. El perfil adicional de 1500 está en su propio archivo |
| `commands.json`, `additional-commands.json` | Argumentos exactos ejecutados y códigos de salida; paths originales del entorno de medición |
| `manifest.json` | Tamaños y SHA-256 de los archivos; también hashes/tamaños descomprimidos de los gzip |

Los `.gz` usan `mtime=0` para compresión reproducible y conservan los JSON completos. Los perfiles son de **Node/V8**, aunque el formato `.cpuprofile` pueda abrirse en una herramienta de Chrome. Los heap profiles solicitan muestras de objetos recogidos cuando V8 lo admite: son estimaciones, no tamaños exactos de caché.

## Configuración y lectura

Linux x64, AMD EPYC 9V74, nueve CPU disponibles, Node v24.22.3. Cámara `[0,1.7,0]`, yaw/pitch cero, viewport simulado 1280×720, estilo clean, sombras/audio desactivados. La cámara ve 458 cajas de la escena de 500 y 516 de las escenas de 1000–2000; toda la materia sigue simulada. Las matrices registran piezas, grupos/cuerpos, formas, restricciones, contactos, ecuaciones, sensores y motores.

Las cifras principales separan pared y CPU de proceso; no son CPU exclusiva del hilo principal ni FPS. Hay tres repeticiones AB/BA/AB. Con 30 muestras, p99 es el máximo de la ventana. El informe conserva resultados desfavorables: especialmente 1500/240 y el p99 inicial del control pequeño.

El presupuesto de 20 s de las matrices y la operación aislada incluye preparación y calentamiento, comprobado entre operaciones síncronas. El profiler limita sus ventanas de calentamiento/captura por separado. Los contadores de contornos se habilitan después de la inicialización; la subida única de 2592 bytes está contabilizada en la memoria y el tiempo de preparación.

Para leer un archivo sin modificarlo:

```bash
gzip -dc docs/mediciones/contornos-cajas-20261122/matrix-settled-120.json.gz
```

El agregado puede regenerarse en una copia de la carpeta, o sobre los JSON sin comprimir obtenidos al reproducir los comandos:

```bash
python3 docs/mediciones/contornos-cajas-20261122/resumir.py /tmp/qbits-contornos
```

Escribe `analysis-summary.json` en la carpeta de entrada. Los tiempos y demás datos numéricos no cambian; la fecha de generación del agregado sí.

## Reproducción

Desde el checkout con el código publicado, crear o reutilizar la referencia sin sobrescribir trabajo existente:

```bash
git worktree add --detach ../qbits-independent-baseline b20cb02af270cdbf19a26b07dd22edb6b5ae02c1
node --test tests/*.test.cjs
node tests/benchmark-architecture-audit.cjs
node tests/benchmark-ground-contacts.cjs
```

Medición principal de reposo; repetir el comando completo con `--hz=60` y `--hz=240` en corridas separadas. El fixture conserva el límite de 2000:

```bash
node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --mode=matrix --families=independent --phase=settled --warmup=60 --samples=30 --repetitions=3 --case-budget-ms=20000 --hz=120 --output=/tmp/matrix-settled-120.json
```

Asentamiento y familias de control:

```bash
node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --mode=matrix --families=independent --phase=settling --warmup=0 --samples=30 --repetitions=3 --case-budget-ms=20000 --scales=16,500,1500,2000 --output=/tmp/matrix-settling-120.json
node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --mode=matrix --families=welded,few-articulated,many-mechanisms,factory --phase=mixed --warmup=12 --samples=18 --repetitions=3 --case-budget-ms=20000 --scales=100,500,2000 --output=/tmp/matrix-controls-120.json
```

Operación aislada y conteos, siempre por separado:

```bash
node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --mode=outlines --warmup=12 --samples=30 --repetitions=3 --case-budget-ms=20000 --output=/tmp/outlines.json
node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --mode=outlines --instrumentation=counts --warmup=2 --samples=3 --repetitions=1 --case-budget-ms=20000 --output=/tmp/outline-counts.json
```

Perfiles y conservación:

```bash
node --expose-gc tests/profile-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --scenario=independent --pieces=500 --hz=120 --warmup=60 --frames=30 --case-budget-ms=20000 --output=/tmp/profile.json
node --expose-gc tests/profile-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --scenario=independent --pieces=1500 --hz=240 --warmup=60 --frames=30 --case-budget-ms=20000 --output=/tmp/profile-1500-240.json
node --expose-gc tests/benchmark-cpu-architecture.cjs --baseline-root=../qbits-independent-baseline --mode=equivalence --output=/tmp/equivalence.json
```

Las comprobaciones adicionales se reproducen con `--mode=matrix --families=independent --phase=settled --repetitions=3`: `--scales=1500 --hz=240 --warmup=60 --samples=30 --case-budget-ms=20000` o `--scales=16 --hz=120 --warmup=180 --samples=180 --case-budget-ms=8000`. Sus comandos exactos están en `additional-commands.json`.

Gráficos y comparación de backend:

```bash
python3 tests/validate-focus-gles.py
python3 tests/validate-robot-arm-gles.py /tmp/contornos-webgl1
QBITS_RENDER_BACKEND=webgl2 python3 tests/validate-robot-arm-gles.py /tmp/contornos-webgl2
```

El benchmark de navegador existente requiere una estación con Chromium, Playwright y WebGL disponibles. No forma parte de las dependencias del juego. El intento de este entorno está registrado como fallido y no aporta métricas de navegador.
