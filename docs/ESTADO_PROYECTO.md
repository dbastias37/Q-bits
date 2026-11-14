# Q-bits — punto de continuación

Actualizado: 14 de noviembre de 2026. Repositorio: `dbastias37/Q-bits`.

## Forma de trabajo acordada

Implementar por bloques pequeños, jugables y publicados en GitHub. Este archivo concentra el contexto operativo; el prompt maestro conserva el diseño completo. Cada entrega debe actualizar ambos cuando cambie una decisión, indicar pruebas reales y dejar un siguiente paso concreto. No convertir todo el diseño futuro en una única modificación difícil de revisar.

## Bloques

| Bloque | Alcance | Estado |
| --- | --- | --- |
| I–II | Prólogo y niveles 1–12: movimiento, uniones, formas, fuentes, transporte y equipo | Implementado |
| III | Niveles 13–15: división, subdivisión, recomposición, catálogo y dos planos | Integrado en main mediante PR #1 |
| IV | Niveles 16–18: rotor, esfuerzo, transporte físico autónomo y certificaciones de torque | Implementado y verificado en este bloque |
| V | Niveles 19–20: dosificación y primer encargo de seis paquetes | Pendiente |
| VI | Niveles 21–24: producción sostenida, materiales, presupuesto y cierre | Pendiente |
| VII | Desafíos posteriores, mejores marcas y progresión de coordinación | Pendiente |

## Decisiones que deben conservarse

- Tres geometrías: cubo → seis pirámides → doce tetraedros. La subdivisión termina ahí. El enganche es una pieza mecánica especializada.
- La materia conserva masa, origen, nombre y energía ponderada; dividir no multiplica fuerza de trabajo.
- El catálogo registra conocimiento y guarda planos que requieren piezas existentes.
- El NPC es curioso, cómplice y moderadamente satírico. Sus explicaciones importantes avanzan a petición del jugador.
- La autonomía exige trabajo productivo. Manipular piezas o cambiar órdenes/configuración reinicia la prueba; caminar y mirar no. Pausa y pestaña oculta congelan el tiempo.
- Torque I/II/III es una selección explícita con límites provisionales de 0,40/0,65/1,00 N·m. No aumenta automáticamente el ajuste de un mecanismo existente. La energía sigue calculándose físicamente.
- Los ejercicios comparables fijan equipamiento. El banco de pruebas mantiene el rango libre hasta 4 N·m.
- La construcción ligera y la coordinación avanzada siguen pendientes. Las correcciones de choques y rutas nunca se bloquean detrás de progreso.
- Potencia disipada no equivale a temperatura: todavía no existe un modelo temporal de sobrecalentamiento.

## Verificación y límites

El bloque III tiene pruebas de conservación, entradas inválidas, pausa, salida obstruida, recomposición, planos y controles E/clic/J/Esc. La suite usa el juego real y Cannon con DOM/GPU simulados. No sustituye una partida con navegador.

La prueba visual local quedó bloqueada al iniciar Chromium por restricción de sockets; el navegador remoto no accedió a localhost. No hay evidencia de legibilidad ni equilibrio final con jugador. No repetir esas mismas tentativas sin un cambio de entorno.

El bloque IV añade doce pruebas de autonomía, entrega física, consumo, recuperación, certificaciones y restricciones. La suite completa pasa **203 pruebas**, incluyendo todos los niveles y la carga de los módulos. Los comandos de comprobación de sintaxis y `git diff --check` también pasan. El catálogo contiene seis descubrimientos y dos blueprints.

## Siguiente bloque

Antes del nivel 19, demostrar un dosificador con piezas existentes: separar unidades, detectar el orden y recibir una unidad correcta sin duplicarla. Probar atasco, reinicio y recuperación. Luego construir el primer pedido de seis paquetes con inventario finito y un tramo de autonomía. No introducir temperatura ni otra geometría solo para completar una casilla del plan.

El cierre previsto es reactivar la instalación y abrir desafíos de optimización. Los niveles 19–24 y el posjuego todavía no deben anunciarse como disponibles.
