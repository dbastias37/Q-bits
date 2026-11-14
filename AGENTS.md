# Q-bits — continuidad de trabajo

Este repositorio pertenece al proyecto Kiubits Game, publicado como Q-bits.

## Al retomar

1. Comprueba la rama, el estado local y el último commit remoto. Conserva cambios ajenos.
2. Lee `docs/ESTADO_PROYECTO.md`: contiene el punto de continuación, las decisiones y los pendientes.
3. Consulta `docs/PROMPT_MAESTRO_CAMPANA.md` solo para el alcance narrativo o mecánico que vayas a tocar.
4. Implementa un bloque pequeño y jugable; termina sus verificaciones y actualiza el estado antes de ampliar el siguiente.

## Reglas de continuidad

- Conserva prólogo, niveles anteriores, guardado y banco de pruebas.
- No presentes contenido diseñado como implementado, ni una prueba lógica como una partida visual.
- Las divisiones conservan materia, energía y origen; los planos requieren piezas existentes.
- Las mejoras desbloquean capacidades. Las correcciones de errores físicos y de rutas se aplican a todos.
- Cada bloque debe tener objetivo observable, explicación breve del NPC y recuperación de fallos.
- Evita ampliar tipos de piezas o sistemas hasta demostrar su utilidad con un mecanismo funcional.
- Registra únicamente decisiones vigentes, evidencia y siguiente paso. Elimina pendientes resueltos del punto de continuación.

## Verificación

Juego estático, sin compilación. `node --test tests/*.test.cjs` ejecuta lógica real y Cannon con DOM/GPU simulados; no certifica la interfaz visual. `python3 tests/validate-focus-gles.py` comprueba los shaders con EGL. Conserva esa distinción en informes y PR.
