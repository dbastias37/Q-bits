# Revisión transversal — taller y sensor de contacto

Base: `df95f4edf44c00470480ae7ab1d812dde29bf103` (niveles 19–20 integrados). Alcance: una adaptación de piezas existentes, mesa de trabajo y progresión con costes; sin agregar etapas a la campaña.

## Requisitos de verificación

| Área | Criterio |
| --- | --- |
| Identidad | El sensor adapta el mismo Q-bit/T-bit y puede montarse con las uniones existentes. |
| Contacto | Solo el cuerpo/forma del sensor debe detectar paredes; el suelo y otra pieza vecina no deben activarlo. |
| Inversión | La señal cambia la dirección del rotor conectado una vez por contacto; todos sus sensores deben separarse durante 0,08 s para rearmarlo. |
| Conexiones | IDs estables al unir/separar; enlaces eliminados o inactivos cuando falta una pieza. |
| Pausa | No procesa nuevas señales ni tiempo de rearme mientras está pausado. |
| Investigación | Créditos de primeras finalizaciones, concesión idempotente, costes finitos y compras persistentes. |
| Batería | Cambiar capacidad conserva julios almacenados; el motor debita cada batería según su capacidad. |
| Masa | La materia retirada se contabiliza como reserva ligada a la identidad original. |
| Movimiento | Más velocidad implica mayor gasto; no se ocultan correcciones de rutas detrás de investigación. |
| Guardado | Se conservan perfil y configuraciones admitidas; una operación incompatible se rechaza con una explicación. |

## Economía inicial

La investigación se paga una vez y habilita aplicaciones gratuitas para evitar perder créditos al reiniciar escenas. Las 20 primeras finalizaciones otorgan 12 créditos cada una (240 en total). Investigar todas las mejoras cuesta 236 créditos. Repetir una misión ya registrada no otorga créditos nuevos. Estas cifras son calibración inicial, no una garantía de duración de campaña.

| Investigación | Coste | Requisito |
| --- | ---: | --- |
| Sensor | 8 | Taller I |
| Taller II | 24 | Nivel 8 completado |
| Taller III | 48 | Taller II y nivel 16 completado |
| Batería, estructura ligera o movimiento II | 20 por rama | Taller II |
| Batería, estructura ligera o movimiento III | 32 por rama | Taller III y mejora II de la misma rama |

Baterías: 20/30/40 J por enganche. Estructura ligera: 100/90/80 % de masa física, con menor agarre y capacidad de carga. Movimiento: 100/110/120 % de velocidad con multiplicadores de gasto 1/1,15/1,35. Las adaptaciones de masa son reversibles y la reserva retirada no es transferible a otra identidad.

## Límites de este bloque

La mesa está disponible en el banco de pruebas y conserva las adaptaciones de la escena al salir y regresar. El perfil de investigación se guarda en el almacenamiento del navegador. Los ejercicios certificados conservan su equipamiento. Las piezas adaptadas deben volver a su configuración base antes de dividirse, duplicarse o guardarse como plantillas de mecanismos; esto impide copiar reservas de materia o enlaces. Las plantillas geométricas existentes continúan ensamblando las piezas presentes.

El enlace del sensor alcanza 3 m; la punta coloreada identifica la cara activa. Solo invierte un rotor encendido: no lo arranca ni procesa contactos mientras está en pausa. El montaje puede unirse y separarse conservando identidades. La duración, dificultad y sensación de progreso se ajustarán con pruebas del jugador; este bloque no implementa los niveles 21–24 ni el posjuego.

## Resultado

**256 pruebas aprobadas; cero fallos, canceladas u omitidas.** Comando: `node --test tests/*.test.cjs`. Comprobaciones de sintaxis de los cinco módulos modificados/añadidos y `git diff --check` también aprobadas.

| Evidencia nueva | Pruebas | Resultado |
| --- | ---: | --- |
| `workshop-model.test.cjs` | 8 | Economía alcanzable, compras únicas, requisitos, datos inválidos y conservación de materia/energía. |
| `workshop-integration.test.cjs` | 9 | Entrada E y botones reales, ajuste físico, guardado, unión/separación, recuperación del banco, restricciones y aviso si el navegador no permite guardar. |
| `contact-sensors.test.cjs` | 8 | Pared real, cubos y triángulos, exclusión de suelo/vecinos/cara trasera, pausa, contactos escalonados, borrado seguro e inversión angular real de un eje apoyado en el suelo. |
| `battery-capacity.test.cjs` | 9 | Reservas de 20/30/40 J, capacidades distintas, agotamiento, consumo/recarga absoluta y efectos reales de masa, agarre, carga y velocidad. |
| `boot.test.cjs` | 2 adicionales | La falta de cualquiera de los dos módulos nuevos impide declarar la carga completa. |

Las 220 pruebas anteriores siguen aprobadas. La revisión independiente reprodujo y verificó la corrección de dos fallos: inversión doble por contactos de sensores en pasos distintos y acceso a un enganche eliminado antes del siguiente paso de física. Los sensores de un mismo rotor ahora comparten el bloqueo de contacto; los enlaces sin extremos válidos se ignoran al dibujar y se retiran al actualizar.

El entorno ejecuta el juego y Cannon reales con DOM/GPU simulados. Esto demuestra comportamiento lógico y físico, pero no certifica legibilidad, aspecto visual ni duración o equilibrio de una partida. Esas comprobaciones siguen pendientes con jugador.
