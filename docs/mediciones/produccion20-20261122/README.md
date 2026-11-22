# Evidencia de Producción 20 · 22 de noviembre de 2026

Informe: [CORRECCION_PRODUCCION20_2026-11-22.md](../../CORRECCION_PRODUCCION20_2026-11-22.md).

| Archivo | Contenido |
| --- | --- |
| `resumen.json` | Configuración, fuentes, resultados de las 36 corridas principales, percentiles y variación; resumen de los doce recorridos instrumentados. |
| `tiempos.json.gz` | JSON completo de medición, incluidas todas las muestras de CPU/tiempo de pared, comprimido sin pérdida. |
| `traza.json.gz` | JSON completo de trazas, inventarios, identidad/materia, energía terminal y límites observados dentro del solver nativo. |
| `tiempos.log`, `traza.log` | Confirmación de finalización por caso; no contienen registros por tick. |
| `tests-integrados.txt` | Suite final: 1223/1223. |
| `regresion-baseline.txt` | Control negativo: la nueva prueba de 60 Hz falla por presupuesto usando el harness/código de `41bc729`. |
| `arquitectura.json`, `arquitectura-baseline.json` | Contadores del benchmark existente; 21 informes exactamente iguales entre `41bc729` y el código final. |
| `contactos-suelo.json` | 36 caídas; resultados físicos idénticos a la entrega anterior. |
| `manifest.json` | Hashes de archivos y fuentes, árbol de código y comandos utilizados. |

Para leer los JSON completos:

```bash
gzip -dc docs/mediciones/produccion20-20261122/tiempos.json.gz > /tmp/produccion-tiempos.json
gzip -dc docs/mediciones/produccion20-20261122/traza.json.gz > /tmp/produccion-traza.json
```

Los hashes del contenido JSON sin comprimir son:

- Tiempos: `fb7c7fb1ebed4843853c5e5a6ab28b729f2e049b1792a31073646507993fb7e8`.
- Traza: `481e244c475ae1a03c72521842bf79ac9ede31ab2b69fad5bbb38b9691406838`.

La traza registra el cambio antes del commit local, con `trackedChanges: true`; el hash de `game.js` coincide con la fuente final. La medición principal registra el commit local `777fa7d`. El código publicado `f48cb4c` tiene exactamente el mismo árbol. No se editaron las muestras para reemplazar esos identificadores históricos.

Todos los tiempos son de Node. No se midieron FPS, GPU ni el hilo principal de Chrome. La sonda detallada del solver está ausente en las corridas principales.
