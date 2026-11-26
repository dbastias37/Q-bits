# Balance de la cadena del galpón

Procedencia declarada: **native**. Linaje: `1795673510034`. Recibos observados: **81**.

| Checkpoint | Tiempo (s) | Fuente (J) | Recibos | Orígenes / materia (u) |
| --- | ---: | ---: | ---: | ---: |
| a_complete | 548.00 | 170716.23 | 0 | 256 / 256.00 |
| attempt_1_start | 1754.40 | 155063.09 | 1 | 434 / 434.00 |
| attempt_1_stop_9 | 3314.40 | 139935.86 | 9 | 439 / 439.00 |
| recovery_1_end_10 | 3549.60 | 137458.19 | 10 | 442 / 442.00 |
| attempt_2_start | 3551.07 | 137410.22 | 10 | 442 / 442.00 |
| attempt_2_stop_17 | 4691.07 | 126077.92 | 17 | 454 / 454.00 |
| recovery_2_ready_17 | 4708.27 | 125504.80 | 17 | 455 / 455.00 |
| recovery_2_end_17 | 4753.20 | 125420.39 | 17 | 455 / 455.00 |
| attempt_3_start | 4754.67 | 125348.97 | 17 | 455 / 455.00 |
| batch_20 | 5227.67 | 120138.36 | 20 | 460 / 460.00 |
| batch_40_start | 5229.20 | 120134.89 | 20 | 460 / 460.00 |
| batch_40 | 8769.20 | 83467.21 | 40 | 500 / 500.00 |
| batch_60_start | 8770.67 | 83463.75 | 40 | 500 / 500.00 |
| batch_60 | 12311.67 | 46773.95 | 60 | 540 / 540.00 |
| batch_80_start | 12313.20 | 46770.49 | 60 | 540 / 540.00 |
| batch_80_stop_60 | 13513.20 | 43798.02 | 60 | 541 / 541.00 |
| recovery_yaw_end_60 | 13563.47 | 43515.90 | 60 | 541 / 541.00 |
| batch_80_yaw_start | 13565.00 | 43487.06 | 60 | 541 / 541.00 |
| batch_80 | 17029.00 | 7892.14 | 80 | 580 / 580.00 |
| post_victory_81 | 17210.00 | 6048.50 | 81 | 582 / 582.00 |

| Segmento | Clase | Nuevos recibos | Tiempo (s) | Fuente gastada (J) |
| --- | --- | ---: | ---: | ---: |
| setup_and_first_receipt | setup · recorded | 1 | 1206.40 | 15653.15 |
| attempt_1 | run · interrupted | 8 | 1560.00 | 15127.23 |
| recovery_1 | recovery · recorded | 1 | 235.20 | 2477.67 |
| resume_2 | setup · recorded | 0 | 1.47 | 47.96 |
| attempt_2 | run · interrupted | 7 | 1140.00 | 11332.31 |
| recovery_2_manual | recovery · recorded | 0 | 17.20 | 573.11 |
| recovery_2_coordinated | recovery · recorded | 0 | 44.93 | 84.42 |
| resume_3 | setup · recorded | 0 | 1.47 | 71.42 |
| run_to_20 | run · completed | 3 | 473.00 | 5210.61 |
| resume_40 | setup · recorded | 0 | 1.53 | 3.46 |
| run_to_40 | run · completed | 20 | 3540.00 | 36667.68 |
| resume_60 | setup · recorded | 0 | 1.47 | 3.46 |
| run_to_60 | run · completed | 20 | 3541.00 | 36689.80 |
| resume_80 | setup · recorded | 0 | 1.53 | 3.46 |
| run_to_80_wait | run · interrupted | 0 | 1200.00 | 2972.47 |
| recovery_yaw | recovery · recorded | 0 | 50.27 | 282.12 |
| resume_80_yaw | setup · recorded | 0 | 1.53 | 28.84 |
| run_to_80_yaw | run · completed | 20 | 3464.00 | 35594.92 |
| continue_after_victory | run · completed | 1 | 181.00 | 1843.64 |

## Intervalos comparables dentro de cada intento

| Intento | Intervalos | s/rotor (sondeo) | J de fuente/rotor |
| --- | ---: | ---: | ---: |
| attempt_1 | 7 | 182.43 | 1848.68 |
| attempt_2 | 6 | 179.83 | 1839.10 |
| run_to_20 | 2 | 177.50 | 1832.56 |
| run_to_40 | 19 | 177.11 | 1833.58 |
| run_to_60 | 19 | 177.16 | 1834.72 |
| run_to_80_yaw | 19 | 181.00 | 1843.45 |

## Hitos

- 20: observado en batch_20.
- 40: observado en batch_40.
- 60: observado en batch_60.
- 80: observado en batch_80.

## Alcance

- Los hashes fijan archivos y los validadores comprueban coherencia; createdAt y contabilidad no prueban por sí solos acciones físicas ni excluyen una rama clonada.
- Native o fixture es procedencia declarada en el manifiesto; se debe acompañar de los scripts y registros de la ejecución.
- El débito de fuente incluye recarga. No sumes de nuevo la carga transferida ni la capacidad nominal de baterías como consumo.
- No se calcula energía total disipada: las baterías externas no abarcan toda la carga almacenada en trabajadores, productos y componentes.
- Los intervalos dentro de un intento y los costes de recuperación se informan por separado. No se proyectan ochenta recepciones a partir de un tramo corto.
- No se ejecutan pasos físicos, no se acredita una interfaz visual y no se modifican los guardados.
