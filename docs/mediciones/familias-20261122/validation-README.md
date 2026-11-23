# Validación funcional de familias

## Resultado

| Versión | Pruebas | Aprobadas | Fallos | Omitidas | Duración |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base `f045a96e812c1142f77008b0a113debb994b91bb` | 1.269 | 1.269 | 0 | 0 | 54,797 s |
| Familias, fuente `9e55241e…` | 1.328 | 1.328 | 0 | 0 | 56,389 s |

La ejecución final incluye toda la suite del repositorio, 27 pruebas nuevas de integración de familias, las pruebas del modelo y la interfaz, y tres regresiones de conjuntos de rotores distribuidos entre elementos almacenados. No hubo pruebas canceladas ni pendientes.

## Evidencia reproducible

- [Resumen y hashes completos](tests-summary.json).
- [TAP completo final comprimido](tests-final.tap.gz).
- [Registro completo de la base comprimido](tests-baseline.log.gz).
- [Validación visual de shaders y geometría](gles-README.md).

Comando de la ejecución final:

```bash
node --test --test-reporter=tap tests/*.test.cjs
```

Para leer el registro:

```bash
gzip -dc docs/mediciones/familias-20261122/tests-final.tap.gz
```

## Riesgos cubiertos

- Conservación de identidad, forma, masa, energía y origen al agrupar, dividir, fusionar, guardar y retirar contenido; capacidad de 100 piezas por familia y mantenimiento del límite total de 2.000 piezas del banco.
- Un cuerpo y un colisionador por familia; retirada correcta de los cuerpos originales de Cannon y de su índice espacial, conservando los objetos ajenos a la selección.
- Preparación repartida entre fotogramas, simulación congelada durante la operación, cancelación con Escape y limpieza al cambiar de escena sin publicar inventarios parciales.
- Agrupación mediante selección, clic secundario y editor; nombre, color negro, botón de desarme en familias, colocación, giro con rueda y confirmación/cancelación con los controles habituales.
- Sacudidas deliberadas con Shift para crear lotes de hasta diez, sin activación por movimiento normal o vibraciones pequeñas del ratón.
- Retirada de baterías sin recarga gratuita, módulos articulados intactos, enlaces de sensores externos, cables y depósitos eléctricos, filtros por identidad de los agarres y conjuntos de rotores retirados en varias tandas.
- Guardado y restauración del banco; reinicio de campaña desde su checkpoint sin duplicar materia almacenada; exclusión de recursos de puzzles y trabajos activos.
- Ausencia de recorridos de estado de las piezas almacenadas durante la simulación continua y efectos de agrupación limitados globalmente a 16.

La primera ejecución integrada detectó únicamente una lista desactualizada de dependencias en el fixture del arranque: faltaba `families.js`. Se actualizó el orden de carga y se añadió la comprobación de que el fallo de esa dependencia bloquea el arranque. Después se repitió la suite completa.

## Alcance

Las pruebas de integración ejecutan el código del juego y Cannon reales con DOM y WebGL simulados. Verifican las operaciones y los manejadores de entrada, pero no equivalen a una sesión manual en navegador ni miden FPS. El informe GLES separado comprueba shaders, geometría, colores y renderizado real mediante Mesa; sus límites también están documentados.
