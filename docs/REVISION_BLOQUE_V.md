# Revisión del bloque V — dosificación y paquetes

Base: `578ece83bf98abb56df135176b1499c5fed09db7`. Alcance: niveles 19–20. Fecha: 14 de noviembre de 2026.

## Criterios de cierre

| Área | Evidencia necesaria |
| --- | --- |
| Inventario finito | La reserva, las unidades en tránsito, la máquina y las entregas conservan la materia inicial. |
| Identidad | Cada unidad se emite, transforma y recibe una sola vez; se rechazan IDs duplicados o ajenos. |
| Dosificación | Separa unidades y respeta el orden; no descuenta materia si la salida está bloqueada. |
| Empaquetado | La receta agrupa dos medias unidades en un paquete con la misma masa total. |
| Transporte | Los cuerpos llegan mediante fuerzas físicas; el receptor no cuenta una animación ni un temporizador. |
| Consumo | La energía de la estación y del motor se descuenta; un motor parado no transporta productos. |
| Autonomía | La medición exige trabajo útil y no combina logros de intentos separados por intervención. |
| Recuperación | Obstrucción, material incorrecto, pausa, reinicio y falta de energía tienen respuestas definidas. |
| Continuidad | 18 conduce a 19; 19 a 20; solo el último nivel configurado oculta Siguiente. |
| Narrativa | La materia del pedido se distingue de los compañeros Q-bit y el catálogo registra lo aprendido. |

## Resultado de verificación

Las dos soluciones de referencia se completan con cuerpos de Cannon, conservando IDs y masa en cada paso entre reserva, cuerpos, buffer, cámara y recepción:

| Nivel | Configuración de referencia | Resultado observado |
| --- | --- | --- |
| 19 | 30 rpm; intervalo 1,2 s | Tres entregas correctas en aproximadamente 17,07 s y 7,19 J |
| 20 | 30 rpm; intervalo 2,4 s | Seis paquetes en aproximadamente 41,42 s y 26,11 J, dentro de 30 J |

Se verificó dibujo durante el transporte, acceso al control con E, inicio mediante el menú, pausa con catálogo y regreso, y recuperación del lote sin eliminar al guía. El modelo de inventario tiene cinco pruebas específicas y la integración once. La suite completa pasa **220 pruebas** con `node --test tests/*.test.cjs`; también pasan las comprobaciones de sintaxis y `git diff --check`. Se verificó además que un rotor ausente mantenga el error visible y que reiniciar el nivel reconstruya el banco.

El tiempo de autonomía acumula trabajo útil en un mismo lote sin intervención. Se congela durante espera improductiva y no representa un requisito de caudal constante en cada instante.

## Prueba con jugador pendiente

El usuario todavía no puede jugar desde su teléfono y revisará después las misiones. El entorno de pruebas utiliza juego y Cannon reales con DOM/GPU simulados; no se presenta como una partida visual. Se conserva pendiente revisar lectura de objetivos, acceso a estaciones, ritmo del NPC, comprensión de los errores y equilibrio de tiempos y consumo.

Este bloque introduce una línea guiada de producción. La construcción abierta, el modelo temporal de temperatura, las misiones 21–24 y el posjuego pertenecen a los siguientes bloques. No se añaden solo para extender la lista de niveles.
