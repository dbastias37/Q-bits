# Revisión independiente de SAP — resultados integrados

Referencia a988610 → código bba9f8f. No se ejecutaron nuevas pruebas ni mediciones durante esta revisión. Todos los tiempos de las tablas son milisegundos; las matrices describen trabajo parcial de Node por frame simulado, con DOM/GPU simulados. Medianas de los estadísticos de tres repeticiones; los intervalos son mínimos y máximos entre esas repeticiones.

## matrix-settled-60

| Escenario/piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| independent / 16 | 0.233338 → 0.240588 | 0.347788 → 0.300167 | 0.466384 → 0.325896 | 0.295600 → 0.259333 | 0.196372–0.264484 | 0.196382–0.302621 |
| independent / 100 | 0.845509 → 0.808714 | 1.119316 → 1.041601 | 1.215720 → 3.557787 | 1.155300 → 1.319300 | 0.837136–0.848283 | 0.801112–0.835264 |
| independent / 500 | 4.700018 → 4.197289 | 5.879614 → 4.989969 | 7.158288 → 5.094774 | 5.508733 → 5.010633 | 4.618116–4.733828 | 4.197009–4.457857 |
| independent / 1000 | 11.093308 → 8.807624 | 12.828510 → 9.894541 | 22.662913 → 11.285196 | 12.717300 → 10.099767 | 10.852698–11.490849 | 8.773883–8.830607 |
| independent / 1500 | 13.356406 → 15.904900 | 23.364179 → 20.379552 | 52.097131 → 25.818090 | 16.110133 → 16.700500 | 12.280884–20.303790 | 10.446654–16.856444 |
| independent / 2000 | 21.759539 → 25.362272 | 25.885808 → 27.171757 | 27.753202 → 27.827194 | 22.762000 → 24.973100 | 20.016339–35.188449 | 12.526145–27.306422 |

## matrix-settled-120

| Escenario/piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| independent / 16 | 0.289561 → 0.363220 | 0.481306 → 0.988351 | 1.025607 → 3.101968 | 0.758733 → 1.244167 | 0.244184–0.434678 | 0.289220–0.914401 |
| independent / 100 | 1.115511 → 1.075400 | 1.376469 → 1.849524 | 1.910324 → 2.084244 | 1.475467 → 1.610167 | 1.114019–1.182821 | 1.059077–1.133327 |
| independent / 500 | 7.364494 → 6.491325 | 8.078118 → 9.073806 | 9.064004 → 10.581425 | 8.637033 → 7.958833 | 7.313799–7.369192 | 6.143848–6.579004 |
| independent / 1000 | 21.860275 → 15.044358 | 29.332908 → 17.314168 | 31.262655 → 18.220317 | 34.082367 → 16.342867 | 18.934370–22.456744 | 14.921566–15.100181 |
| independent / 1500 | 24.491293 → 13.914126 | 32.026752 → 15.465796 | 50.656700 → 15.600786 | 26.092400 → 14.437633 | 22.292909–37.682102 | 13.154224–14.499107 |
| independent / 2000 | 63.478849 → 47.853307 | 67.508839 → 53.041251 | 81.110469 → 56.692054 | 64.700800 → 49.897700 | 37.204654–65.126575 | 19.333384–51.187033 |

## matrix-settled-240

| Escenario/piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| independent / 16 | 0.380267 → 0.386916 | 0.460676 → 0.508888 | 0.785290 → 0.575387 | 0.522667 → 0.575267 | 0.348029–0.461467 | 0.360577–0.396601 |
| independent / 100 | 1.659031 → 1.612301 | 1.891367 → 1.869024 | 2.574666 → 2.520555 | 1.762633 → 1.726700 | 1.650929–1.775685 | 1.587676–1.629607 |
| independent / 500 | 11.885045 → 10.731836 | 13.078853 → 11.559380 | 14.131978 → 11.832256 | 14.487767 → 11.656267 | 11.795479–12.088604 | 10.307625–10.841400 |
| independent / 1000 | 35.701893 → 26.975341 | 39.775411 → 36.408352 | 50.145652 → 38.552511 | 37.799333 → 31.573567 | 35.543626–39.168906 | 14.113402–27.430080 |
| independent / 1500 | 72.610287 → 53.466630 | 76.086400 → 58.521599 | 84.026621 → 61.071017 | 74.346867 → 54.176933 | 42.364523–73.861426 | 25.329102–55.231552 |

Detenido: 2000 piezas, 240 Hz, baseline repetición 1, fase measurement, 30 muestras ejecutadas, 20001.105042 ms contra presupuesto 20000 ms. Última escala completa: 1500. Reloj al detener: 360 pasos, 1.499999999999996 s, descarte 0 s. Sin pareja optimizada completa.

## matrix-settling-120

| Escenario/piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| independent / 16 | 1.662376 → 1.586382 | 3.049171 → 3.272063 | 11.374809 → 8.316395 | 3.341233 → 3.652100 | 1.315900–1.834943 | 1.494686–1.857125 |
| independent / 500 | 42.246325 → 43.325299 | 71.796360 → 69.491631 | 91.391536 → 97.171563 | 48.458300 → 48.174800 | 40.629327–43.209416 | 40.774935–43.786137 |
| independent / 1500 | 138.904327 → 154.995106 | 241.510704 → 242.569162 | 3733.221811 → 3195.776700 | 251.554600 → 234.764600 | 135.150584–157.075008 | 148.806743–155.222044 |
| independent / 2000 | 235.540540 → 239.190557 | 337.945614 → 321.283363 | 6517.283075 → 6513.270542 | 407.694667 → 403.687733 | 220.457537–242.996168 | 217.257973–243.097289 |

## matrix-controls-120

| Escenario/piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| welded / 100 | 0.494346 → 0.479815 | 1.707903 → 1.490689 | 5.142067 → 1.642195 | 1.739667 → 1.376800 | 0.466394–1.306275 | 0.420627–0.626463 |
| welded / 500 | 1.256631 → 1.253276 | 2.124283 → 2.216190 | 4.430417 → 2.398862 | 3.033200 → 2.800867 | 1.245925–1.325814 | 1.243071–1.900370 |
| welded / 2000 | 4.086906 → 4.192123 | 5.222216 → 5.482434 | 5.927846 → 7.037539 | 5.260800 → 5.003267 | 4.071833–4.400933 | 4.087887–4.381254 |
| few-articulated / 100 | 3.141789 → 3.124632 | 5.363126 → 3.915660 | 8.792032 → 6.883760 | 6.131233 → 5.055467 | 3.056732–3.369127 | 3.097182–3.347765 |
| few-articulated / 500 | 5.405750 → 5.450686 | 6.665965 → 6.119021 | 6.965492 → 6.696651 | 8.812233 → 8.929067 | 5.377648–5.437237 | 5.372570–5.511597 |
| few-articulated / 2000 | 7.812753 → 7.654838 | 9.669307 → 9.279908 | 10.974892 → 9.681556 | 10.514833 → 10.121567 | 7.594238–7.915467 | 7.313951–7.766084 |
| many-mechanisms / 100 | 7.909487 → 7.720756 | 11.741343 → 10.848133 | 12.874601 → 12.291192 | 12.588133 → 11.557733 | 7.770641–8.035425 | 7.644873–8.126340 |
| many-mechanisms / 500 | 21.744718 → 22.115741 | 27.546948 → 25.282506 | 31.053259 → 37.466098 | 30.514900 → 30.215733 | 21.198660–22.565381 | 20.960561–23.523568 |
| many-mechanisms / 2000 | 24.203429 → 24.638777 | 29.947562 → 35.084763 | 34.881218 → 37.744952 | 32.736467 → 32.876533 | 24.014739–25.625116 | 24.637305–24.970030 |
| factory / 100 | 2.744176 → 2.882552 | 4.102389 → 4.328185 | 4.849180 → 4.711686 | 4.194800 → 4.501233 | 2.727491–2.874350 | 2.742794–2.922211 |
| factory / 500 | 5.569123 → 5.560660 | 7.623291 → 7.081424 | 7.708148 → 7.414561 | 9.064100 → 8.592400 | 5.534821–5.599808 | 5.483284–5.581040 |
| factory / 2000 | 14.934778 → 14.664676 | 18.511033 → 17.414080 | 19.013231 → 18.238718 | 18.809700 → 18.809900 | 14.653980–15.132533 | 14.628252–14.730825 |

## control-long-120

| Escenario/piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| independent / 16 | 0.231995 → 0.220819 | 0.366666 → 0.322730 | 0.570720 → 0.374267 | 0.432683 → 0.381056 | 0.213608–0.268129 | 0.215511–0.248440 |

## Seguimientos de SAP aislado

Cada seguimiento usa 180 consultas de calentamiento y 180 medidas, tres pares AB/BA/AB. La unidad es ms/consulta, no ms/frame. Los resultados originales de 20/30 muestras se conservan.

| Caso | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| sap-control16-long | 0.005117 → 0.005128 | 0.005979 → 0.005979 | 0.023254 → 0.030105 | 0.019156 → 0.012278 | 0.005037–0.005438 | 0.005107–0.005237 |
| sap-active500-long | 0.250723 → 0.255521 | 0.314738 → 0.347998 | 0.446395 → 0.601866 | 0.263528 → 0.303283 | 0.244534–0.257694 | 0.244304–0.326606 |
| sap-sleep2000-long | 7.693455 → 0.004477 | 8.118177 → 0.006800 | 11.625980 → 0.034592 | 7.795989 → 0.013461 | 7.211336–7.805922 | 0.004467–0.004767 |

El pico original de 30,029897 ms de sleeping/2000/clean no reaparece en este seguimiento: máximos optimizados 0,051357 / 0,042634 / 0,204996 ms. Esto no identifica su causa ni permite borrar la observación inicial.

## Perfiles: bloques inclusivos por frame

Los tiempos de matrixTick y broadphase ya están contenidos en world.step. No sumarlos entre sí para formar un coste adicional al de world.step. Los perfiles se capturan separadamente de la medición principal.

| Perfil | Variante/rep | Broadphase nativo | world.step | world.collisionMatrixTick |
|---|---|---:|---:|---:|
| profile-500-120 | baseline/1 | 0.920966 | 3.258330 | 1.959832 |
| profile-500-120 | baseline/2 | 0.920429 | 3.290362 | 2.001584 |
| profile-500-120 | baseline/3 | 1.005642 | 3.627177 | 2.228532 |
| profile-500-120 | baseline mediana | 0.920966 | 3.290362 | 2.001584 |
| profile-500-120 | optimized/1 | 0.023948 | 2.372004 | 1.975701 |
| profile-500-120 | optimized/2 | 0.047741 | 3.053449 | 2.485898 |
| profile-500-120 | optimized/3 | 0.037007 | 2.549407 | 2.085213 |
| profile-500-120 | optimized mediana | 0.037007 | 2.549407 | 2.085213 |
| profile-1500-240 | baseline/1 | 16.774019 | 24.716945 | 5.045124 |
| profile-1500-240 | baseline/2 | 18.821144 | 26.390248 | 4.958258 |
| profile-1500-240 | baseline/3 | 17.552766 | 27.574187 | 5.229837 |
| profile-1500-240 | baseline mediana | 17.552766 | 26.390248 | 5.045124 |
| profile-1500-240 | optimized/1 | 0.414019 | 8.746722 | 5.058155 |
| profile-1500-240 | optimized/2 | 0.364373 | 7.226554 | 4.741374 |
| profile-1500-240 | optimized/3 | 0.410445 | 8.364778 | 4.925409 |
| profile-1500-240 | optimized mediana | 0.410445 | 8.364778 | 4.925409 |

## Interpretación y límites

- Primer incumplimiento probado del p95 de 16,67 ms: 1.500 piezas a 60 Hz y 1.000 a 120/240 Hz, tanto antes como después. A 120 Hz el resultado optimizado NO es monótono: 1.000 piezas 17,314168 ms; 1.500 piezas 15,465796 ms; 2.000 piezas 53,041251 ms. No convertir ese primer cruce en un límite de capacidad garantizado.
- A 60 Hz, 1.500 y 2.000 piezas tienen medianas marginales de p50 desfavorables, pero dos de tres pares mejoran en cada escala. Deltas por pareja: 1.500 [-1,834230; +2,548494; -3,447346] ms; 2.000 [+5,546883; -7,490194; -9,826177] ms. Mantener dispersión y casos desfavorables.
- A 120 Hz/500 mejora p50 y CPU, pero p95/p99 empeoran. El control largo de 16 piezas mejora p50/p95/p99 y CPU medianos; no elimina el control corto desfavorable.
- El seguimiento de SAP con 500 activos y AABB dirty sigue desfavorable en las medianas p50/p95/p99 y CPU. Una repetición nueva es especialmente lenta; no hay recorte de candidatos en esta ruta nativa.
- Los controles soldados de 2.000 piezas, pocos brazos de 500, muchos mecanismos de 500/2.000 y fábrica de 100 tienen p50 marginal desfavorable. Muchos mecanismos de 2.000 empeora además p95/p99/CPU. SAP no resuelve la carga de numerosas articulaciones activas.
- En el arranque sin calentamiento siguen picos de aproximadamente 6,5 segundos para 2.000 independientes. La optimización de parejas pasivas no certifica mejora de ese pico.
- matrixTick continúa costando alrededor de 2 ms/frame en 500/120 y 5 ms/frame en 1.500/240, con cero cuerpos despiertos y cero contactos en las ventanas perfiladas. A 240 Hz equivale aproximadamente a 1,23 ms por paso. Esto confirma trabajo residual real de la matriz; no identifica por sí solo la causa de los regímenes lentos observados en otras ventanas, ni demuestra un problema de V8.
- El profiler incluye diferencias de instrumentación amplias: a 1.500/240 baseline OFF repetición 2 promedia 79,950019 ms/frame frente a ON 50,234741. No interpretar una resta aislada ON−OFF como un coste universal de instrumentación.
- ArrayBuffers registrados en los perfiles: 500 cuerpos dinámicos + 6 estáticos agregan exactamente 2.024 bytes frente a baseline; 1.500 + 6 agregan 6.024 bytes. Coincide con 4N bytes del índice. Los deltas de heap/RSS incluyen V8/harness/profiler y no son tamaño de caché.
- No hay mejora de GC demostrada: 500 CPU-profile tiene 50 eventos en ambas variantes; 1.500 tiene 70 → 71. Los eventos y sus tiempos permanecen separados de las mediciones principales.
- Matrices y control integrado largo: 34 configuraciones completas, 102 pares, 7.020 frames medidos, 14.760 pasos físicos y 117 s simulados agregados entre variantes, con cero descarte. Una configuración detenida, 2.000/240. Antes del ensayo aislado grande, el total de runners con los tres seguimientos opcionales es 340 pares, incluidos 72 de conteos; no suma perfiles ni pruebas unitarias. El ensayo aislado descrito al final añade seis pares.

## Repetición aislada de escenas grandes a 60 Hz

Ensayo nuevo: tres pares AB/BA/AB, 60 frames de calentamiento y 30 medidos, mismas fuentes limpias a988610 → bba9f8f. Conserva estados completos, 30 pasos/0,5 s por ventana y cero descarte. No reemplaza la matriz anterior: es evidencia adicional.

| Piezas | p50 A → B | p95 A → B | p99 A → B | CPU media A → B | Rango p50 A | Rango p50 B |
|---|---:|---:|---:|---:|---:|---:|
| 1500 | 13.467998 → 15.563814 | 18.326915 → 17.639003 | 21.721431 → 19.114753 | 14.762567 → 16.278700 | 13.033145–20.150794 | 15.255663–16.854507 |
| 2000 | 21.068237 → 26.513780 | 24.599245 → 32.964098 | 49.294107 → 50.497652 | 21.807667 → 29.114533 | 19.934876–34.633067 | 26.318838–27.125640 |

Deltas p50 por pareja (optimizado menos baseline):

- 1500: +3.821362 / +2.095816 / -4.895131 ms. Dos de tres parejas son desfavorables.
- 2000: +6.578904 / -8.314229 / +6.057403 ms. Dos de tres parejas son desfavorables.

La evidencia sigue siendo desfavorable en las medianas de p50 y CPU para ambas escalas. En 2.000 empeoran también p95/p99 y aparece un máximo optimizado de 92,398328 ms. El resultado no permite afirmar ausencia de regresión global aunque SAP aislado reduzca su trabajo. La decisión de integración y la interpretación vigente del diagnóstico se documentan en [el informe principal](../../RENDIMIENTO_SAP_2026-11-22.md). No se atribuye el régimen a V8 sin la evidencia correspondiente.

Totales adicionales: 2 configuraciones completas, 6 pares, 360 frames medidos, 360 pasos físicos y 6 s simulados agregados entre variantes; cero descarte. Matrices + control largo + ensayo aislado: 36 configuraciones completas, 108 pares, 7.380 frames, 15.120 pasos físicos y 123 s simulados agregados, más una configuración detenida. Todos los runners, incluidos microbenchmarks, conteos y equivalencia: 346 pares completos. Perfiles y pruebas unitarias quedan fuera de esa suma.

## Diagnósticos adicionales fuera del agregado de 16 inputs

Estos diagnósticos no alteran los 346 pares del agregado ni sustituyen resultados desfavorables. La interpretación y decisión de integración se mantienen en [el informe principal](../../RENDIMIENTO_SAP_2026-11-22.md).

### Matrices: temporizadores inclusivos

En 2.000 piezas/60 Hz, con 60 frames de calentamiento y 30 medidos, las medias por frame instrumentado fueron:

| Corrida | SAP, ms | Matriz, ms | world.step, ms | Frame, ms |
| --- | ---: | ---: | ---: | ---: |
| Referencia 1 | 7.706924 | 2.093529 | 10.791739 | 20.365904 |
| Optimizada 1 | 0.123691 | 2.142527 | 3.193784 | 12.911835 |
| Optimizada 2 | 0.136562 | 15.866446 | 17.008634 | 26.857860 |
| Referencia 2 | 7.547744 | 2.154752 | 10.756076 | 21.296857 |
| Referencia 3 | 7.710511 | 16.640318 | 25.811293 | 35.868950 |
| Optimizada 3 | 0.236400 | 2.229990 | 3.551869 | 16.266332 |

SAP y matriz ya están incluidos en `world.step`; no sumar las columnas. La variación observada se localiza dentro de la limpieza/intercambio de matrices y aparece en ambas fuentes. Las matrices observadas después de calentamiento y medición tienen longitud 2.011.015, `fast-holey` y `dictionary=false` en las seis corridas. No se confirmó una diferencia de representación ni se atribuye el régimen a V8, GC o JIT. Son puntos observados, no una traza continua de representación. Véase [V8: Elements kinds](https://v8.dev/blog/elements-kinds) como contexto de las representaciones, no como explicación de esta latencia.

### Crossover dentro del mismo mundo

Control específico con piezas inicialmente cargadas al 100 % y neutrales durante seis segundos simulados por mundo. Esta carga inicial y el calentamiento difieren de las matrices principales; los resultados no se mezclan con ellas.

Tres mundos nuevos; mismo conjunto de cuerpos, matrices y estado estructural en cada comparación. Calentamiento común 180 frames alternando rutas, recalentamiento 30 por brazo y 60 medidos; sin contadores detallados, temporizadores nativos, intrínsecas V8 ni GC forzado. Orden nativo/filtrado, filtrado/nativo, nativo/filtrado. Todas las filas se orientan nativo → filtrado:

| Mundo | p50, ms/frame | p95, ms/frame | p99, ms/frame | CPU proceso media, ms/frame |
| --- | ---: | ---: | ---: | ---: |
| 1 | 21.881781 → 12.535115 | 25.964780 → 15.084801 | 35.803268 → 17.566285 | 22.293150 → 13.017133 |
| 2 | 19.853080 → 12.298111 | 22.719678 → 14.081547 | 42.980126 → 15.217948 | 20.615350 → 12.647367 |
| 3 | 34.580610 → 26.905321 | 37.553436 → 30.001841 | 50.183751 → 44.001607 | 34.800133 → 27.037333 |

Las tres comparaciones reducen el coste de la ruta dentro de su propio mundo; el tercer mundo sigue siendo sensiblemente más lento en ambas rutas. Este resultado sustenta el ahorro local y no demuestra ausencia de regresión global entre VMs independientes. Se conservan los ensayos previos desfavorables. Los datos completos, las muestras y la invocación están en `sap-crossover-2000-60.json.gz`; el resumen legible está en su archivo `-summary`.

El estado se compara excluyendo solamente los cinco paths de reloj enumerados en la configuración, incluidos `mood.idle/fullTime`. Hay una limitación explícita de metadatos: el primer brazo del mundo 2 registra `clock.simTime=4.5` y `moodClockRange=6`. No se modificó el dato ni se identificó una causa estática confirmada; no se usan esos rangos mood como evidencia de tiempo ni se atribuye la inconsistencia a V8/VM. La comprobación separada registra por brazo 60 pasos físicos, 15 lógicos, 1 s simulado y cero descarte. Las identidades de cuerpos/arrays, pares ordenados, matrices a cero, energía y estado normalizado coinciden. Son 360 frames y 360 pasos medidos adicionales, excluidos del agregado principal.
