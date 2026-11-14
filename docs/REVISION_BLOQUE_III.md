# Revisión del primer incremento de campaña

Base revisada: `ded75fe98fbebc5293fdb82acdd3c5ad0a96e5c9`. Alcance: niveles 13–15, cámara reversible, catálogo y planos. Fecha: 14 de noviembre de 2026.

| Área | Evidencia | Estado |
| --- | --- | --- |
| Conservación de materia | Ciclo completo cubo → 6 pirámides → 12 triangulares → 6 pirámides → cubo; misma masa y origen | Probado |
| Energía y descanso | Suma ponderada constante; recomponer energías distintas no recarga; conserva agotamiento | Probado |
| Entradas inválidas | Partes ausentes, duplicadas, de otro origen, peso alterado y tercer nivel de subdivisión rechazados | Probado |
| Transacción física | Sustituye cuerpos e IDs de equipo una sola vez; bandeja obstruida conserva la operación | Probado |
| Tiempo y reinicio | Pausa, pestaña oculta y transición congelan el proceso; reinicio no filtra piezas entre escenas | Probado |
| Capacidad de trabajo | Las subdivisiones reparten la fuerza de arrastre; no multiplican trabajadores por dividir | Probado |
| Catálogo | Planos compatibles con las caras existentes, sin otorgar piezas y sin duplicar el guardado | Probado |
| Campaña previa | Los 15 niveles construyen, simulan y ejecutan sus rutinas de dibujo; cuerpos y buffers estables tras recargas | Probado con DOM/GPU simulados |
| Continuidad | El nivel 12 permite avanzar; el 15 es el último nivel de esta entrega | Probado |
| Gráficos | Compilación/enlace real de shaders y fixture GLES de enfoque | Probado; no equivale a una partida visual |
| Partida de principio a fin y legibilidad en navegador | Chromium local no pudo iniciarse por una restricción de sockets; el navegador remoto no accede al servidor local | Pendiente |
| Equilibrio y ritmo del NPC | Revisión editorial y lógica de avance manual | Pendiente prueba con jugador |

Comandos de verificación: `node --test tests/*.test.cjs`, `node --check assets/js/game.js`, `node --check assets/js/campaign-reconfiguration.js` y `python3 tests/validate-focus-gles.py`. Se corrigió además una excepción previa al colocar blueprints contra paredes de campaña sin un cuaternión explícito.

Antes de integrar en producción: jugar las tres misiones, comprobar lectura y selección de piezas pequeñas, colocación y despeje de bandejas, acceso con E/clic derecho/J, recuperación del cursor al cerrar el catálogo y transporte de todo el equipo por la puerta. Evaluar si la primera cámara necesita más orientación espacial. No considerar calibradas todavía la autonomía, la temperatura o la progresión de torque: pertenecen al siguiente bloque.
