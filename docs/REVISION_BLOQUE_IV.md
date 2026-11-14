# Revisión del bloque IV — rotores y autonomía

Base: `aa9db5be07697b13bc6edffc602a49da334d3669`. Alcance: niveles 16–18 y certificaciones de torque. Fecha: 14 de noviembre de 2026.

## Comportamiento esperado

| Área | Criterio |
| --- | --- |
| Giro | El tiempo útil exige rpm reales y un rotor válido, encendido y sin atasco. |
| Carga | El banco conserva sus piezas, peso, base, lado móvil y capacidad certificados. |
| Energía | El presupuesto utiliza energía retirada de los enganches por el modelo físico existente. |
| Entrega | El extremo del brazo debe alcanzar físicamente el receptor y cumplir el tramo autónomo. |
| Intervención | Cambiar el mecanismo u órdenes invalida el tramo; mirar y caminar no lo hacen. |
| Pausa | Pausa, panel, catálogo y pestaña oculta no aportan tiempo útil. |
| Recuperación | Fallos no abren la puerta; reiniciar reconstruye el banco. Una pieza borrada no debe causar excepción. |
| Perfil | Completar 16/18 desbloquea II/III, sin subir ajustes existentes automáticamente. |
| Comparabilidad | Los tres ejercicios fijan 0,40 N·m; el laboratorio conserva hasta 4 N·m. |

Validación final: `node --test tests/*.test.cjs` — **203 pruebas aprobadas**, incluidas doce pruebas nuevas de automatización. También pasan `node --check` de los tres scripts nuevos/modificados y `git diff --check`.

Las soluciones de referencia activan el rotor a 30 rpm y utilizan los cuerpos originales: nivel 16, aproximadamente 0,370 J en seis segundos útiles; nivel 17, 0,749 J en ocho segundos; nivel 18, 1,459 J y llegada física a los 3,11 segundos. Se comprueba que el consumo registrado coincida con la energía retirada de ambos enganches. A 120 rpm el nivel 17 supera su presupuesto de 1,20 J y corta el motor; una configuración más lenta puede reintentarlo y superar el ensayo.

La revisión corrigió una excepción al borrar un enganche, bloqueó controles de recarga de depuración y cambios de físicas, fijó la identidad del extremo receptor e impidió añadir mecanismos auxiliares al banco certificado. Los ensayos tienen una solución comprobada y una falla/recuperación; no se consideran todavía problemas abiertos de construcción. Los valores de tiempo, presupuesto y torque son iniciales y no equivalen a equilibrio validado por jugadores.

## Límite de la evidencia

El juego y Cannon se ejecutan realmente en el arnés de pruebas; DOM y GPU son simulados. Las pruebas de movimiento verifican posiciones y consumo, pero no legibilidad, interacción real con ratón ni calidad visual. Sigue pendiente una partida en navegador de las tres misiones, entrada por el selector y continuación desde 15, lectura de objetivos y controles, recuperación de fallos y salida.

La cámara de transformación, el rotor y el brazo funcionan dentro de las mecánicas actuales. Todavía no hay dosificador, cinta transportadora, paquetes, temperatura temporal ni campaña 19–24. Estos sistemas no se anuncian como disponibles.
