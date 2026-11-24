# Inicio y paseo entre ciclos · primer incremento revisable

Fecha: 24 de noviembre de 2026. Base comprobada: [`0d0b8df77be0fa19bf592d371273ee5f7c346d04`](https://github.com/dbastias37/Q-bits/tree/0d0b8df77be0fa19bf592d371273ee5f7c346d04), la misma referencia de la auditoría del 23 de noviembre. El `main` consultado al comenzar seguía en esa revisión. Los cambios de este documento pertenecen al incremento posterior del primer ciclo, cuya integración en `main` fue autorizada el 24 de noviembre de 2026. La comprobación en el dispositivo del jugador sigue pendiente.

## Decisión narrativa vigente

El propósito de la instalación permanece implícito. Ningún personaje explica por qué se prepara al jugador, para qué servirá el aprendizaje, quién se beneficiará de él o qué sucederá después. La fábrica se anticipa mediante su actividad visible. La lealtad y el conocimiento del guía siguen abiertos.

Las indicaciones de interacción y los estados de la instalación conservan su función práctica. El guía tiene blips; la instalación muestra texto sin voz y los demás Q-bits mantienen sus reacciones de texto. Las frases importantes del nuevo tramo esperan una acción deliberada. Leer, detenerse y pedir ayuda no reducen una puntuación ni agotan un plazo.

La negativa a continuar ahora permite quedarse: «Claro. Estoy aquí». Ya no reprocha la decisión ni obliga a repetir. Despertar, encontrar al guía, tomarlo, moverlo y cuidarlo preceden al suministro.

## Alcance real

| Estado | Contenido |
| --- | --- |
| Existente conservado | Prólogo voluntario, mano física, cuidado en enfriador, órdenes, unión y separación, niveles anteriores, tableta y banco. |
| Integrado en este incremento | S01 pedir/tomar/colocar un compañero; S02 devolución física y explícita; cierre simple en reserva; paseo acompañado entre las misiones existentes 1 y 2. |
| Soporte lógico disponible, sin misión integrada | Ledger finito con cola de hasta cuatro, cancelación de pendientes, cuota de dos despachos por identidad y oferta temporal optativa. El intento jugable utiliza una sola pieza y `offerSeconds:null`. |
| Diseño pendiente | S03 observar el retorno de una ofrecida; S04 lote para una construcción conocida; S05 cierre entre varios inventarios; ciclo 12 integrador de la propuesta. |

El cuadrado del lote se introduce después de aprender y practicar unión. En la base actual, esa enseñanza empieza en el nivel 5; no se exige una construcción desconocida junto con la primera petición. El nivel 12 anterior permanece disponible y no representa la ficha integradora futura.

## Recorrido implementado

Campaña nueva → prólogo y cuidado → S01 → S02 → cierre de reserva → misión existente 1 de órdenes → galería → misión existente 2.

La selección de capítulos y los guardados antiguos conservan el acceso a las misiones anteriores. Un jugador que entra directamente al nivel 1 también accede al paseo al terminarlo; no se le inventa retrospectivamente una reserva ni se le acreditan S01/S02.

### QBI-S01 · Un lugar para dos

| Campo | Guion y comportamiento actual |
| --- | --- |
| Prerrequisitos | Despertar voluntario, encuentro, agarre, traslado y cuidado del guía en la campaña nueva. |
| Necesidad visible | Una escotilla, una bandeja vacía y un aro de colocación. |
| Escena | Sala blanca inicial; guía presente, escotilla accesible y puerta de continuación cerrada. |
| Recursos | Un compañero presupuestado de 1 u, con ID propio, en `reserva-inicial`. El guía queda fuera del manifiesto. |
| Acción nueva | Pedir un compañero mediante la acción remapeable de interacción. |
| Secuencia | Cerrar la lectura → apuntar a la escotilla → pedir → esperar salida disponible → agarrar el cuerpo real → soltarlo sobre el aro. |
| Textos y desencadenantes | Entrada: «¿Me ayudas? Hay un compañero en la escotilla». Salida física terminada: «Ahí está. Puedes dejarlo en el aro». El HUD muestra las asignaciones vigentes para interactuar y tomar/soltar. |
| Éxito físico | Petición registrada, agarre real y cuerpo individual libre sobre el aro, a altura del suelo y estable durante 0,5 s. Mirarlo o recuperarlo técnicamente no basta. |
| Diagnóstico | Salida ocupada conserva la cola; pieza sostenida no cuenta como colocada; pieza unida necesita separarse antes de devolverla. |
| Recuperación | «Recuperar al compañero» en pausa lo coloca junto a la entrada conservando ID, materia y estado. No añade hechos de agarre, colocación o devolución. |
| Guardado | Conserva reserva/sala/tránsito, solicitud, reclamación, cuota, hechos reales y pieza física. Guardar con la pieza en la mano exige retomarla y soltarla después de cargar para acreditar una colocación pendiente. |

La primera entrega no caduca. La reclamación comienza con la petición y permanece al soltar, pausar, abrir la tableta y guardar/cargar. Una devolución posterior no repone la cuota de despachos.

### QBI-S02 · De vuelta a la bandeja

| Campo | Guion y comportamiento actual |
| --- | --- |
| Prerrequisitos | S01 acreditada por sus acciones físicas. |
| Necesidad visible | Bandeja disponible y compañero localizado en la sala. |
| Escena | La misma sala; se conserva el cuerpo y el estado de la pieza. |
| Recursos | La misma identidad de S01. No hay fabricación ni segundo ejemplar. |
| Acción nueva | Confirmar voluntariamente una devolución después de colocar la pieza en la bandeja. |
| Secuencia | Cerrar la lectura → tomar/trasladar → soltar en bandeja → dejar estabilizar → apuntar a la escotilla → confirmar Devolver. |
| Textos y desencadenantes | Inicio: «Ahora, de vuelta a la bandeja. Tú confirmas la devolución». Tras recepción física: «Todo en su sitio. Por aquí». |
| Éxito físico | Cuerpo individual completo sobre la bandeja, libre y estable durante 0,5 s; confirmación explícita; traslado y recepción terminados. |
| Diagnóstico | Una pieza en la mano, junto a la bandeja, unida al guía o aún en tránsito no satisface reserva. El estado indica su localización y aparece un marcador sobre el compañero pendiente. |
| Recuperación | Recolocación técnica junto a la entrada; mantiene la fase y todos los pasos pendientes. Una devolución iniciada conserva la reclamación hasta la aceptación. |
| Guardado | Conserva también una devolución en curso. Cargar reanuda esa única transacción, sin reemitir ni duplicar el ejemplar. |

### Cierre simple del primer incremento

La puerta abre cuando la observación física y el ledger coinciden: una pieza en reserva, ninguna pendiente en sala o tránsito, ninguna solicitud en cola y devolución voluntaria registrada. El HUD distingue **1 pieza** de **1 u de materia**. La pieza devuelta ya está incluida en la reserva; no vuelve a sumarse como un inventario adicional.

El archivo de esa reserva se conserva al continuar la campaña. Sus IDs se reservan al restaurar y al abrir el selector, sin crear cuerpos. Si una identidad aparece simultáneamente en el archivo y los inventarios físicos, se rechaza ese guardado y se mantiene la copia anterior. El guía acompaña al jugador y no se reclama como recurso. No existe una instalación construida que deba desarmarse en este tramo.

Reiniciar una práctica activa o volver al prólogo desde una reserva cerrada requiere el aviso de reinicio del intento. Cancelar conserva la situación. Esto incluye una práctica pendiente al reabrir el juego y elegir un capítulo antes de pulsar Continuar: el selector consulta la partida guardada y cancelar vuelve al selector sin reemplazarla. La opción explícita de campaña nueva anuncia también el reinicio de intentos y piezas.

## Paseo 01 → 02

La única frase de entrada es **«Acompáñame»**. Tras avanzar esa lectura, el jugador camina libremente. El guía conserva ID, nombre, carga y cansancio; espera cuando el jugador se queda atrás y se puede tomar con la mano existente. Soltarlo permite que retome suavemente su recorrido.

La ruta tiene galería superior, ventanas a la derecha, giro a la izquierda, primer descenso, descanso horizontal, segundo descenso y puerta inferior. La cámara usa una altura continua sobre los peldaños. La mirada inicial permite localizar al guía; después no se gira la cámara hacia la fábrica ni se exige mirarla durante cierto tiempo.

Detrás del vidrio hay dos cintas, dos brazos y dos drones. Son geometría animada, sin cuerpos Cannon, inventario, navegación, sensores, consumo ni producción de piezas jugables. Sus ciclos se calculan desde el reloj suspendible del paseo. Las geometrías estáticas se agrupan por material; las poses animadas reutilizan sus objetos y participan en el descarte de dibujo.

Las máquinas decorativas cumplen una función de ambientación. Una futura misión de automatización tendrá que usar mecanismos físicos reales y validación propia; esta vista no constituye esa integración.

El menú principal, la lectura modal, la pausa y la pestaña oculta suspenden guía, fase decorativa, física y evaluación. La tableta operativa y las listas del clic secundario mantienen la situación activa. El guardado conserva el punto del paseo, el reloj y el mismo guía; el tiempo fuera de la aplicación no se aplica al volver.

## Ayudas y controles

- «Releer la indicación» permite repetir la lectura del paso actual sin penalización.
- «Recuperar al compañero» es una recuperación técnica identificada como tal.
- Las acciones existentes de tomar, soltar, unir y separar siguen disponibles. Las etiquetas nuevas usan el dispositivo y las asignaciones vigentes.
- Durante la práctica finita y el paseo, las herramientas del banco que crearían, borrarían, cambiarían masa o regalarían energía están protegidas en sus operaciones reales y en la interfaz. El banco conserva su comportamiento fuera de estos tramos.
- La tableta y las listas del clic secundario no introducen una pausa por sí mismas. Un diálogo modal abierto sí mantiene la suspensión correspondiente.

## Dependencias del siguiente incremento

**S03.** Antes de activar retorno temporal, integrar oferta explícitamente no asignada, observación voluntaria, estabilidad física, zona válida, ausencia de uso y persistencia. Diez segundos sigue siendo una hipótesis para experimentar, no un valor aprobado por esta entrega. Un reclamo deliberado cancela su elegibilidad durante la misión.

**S04.** Enseñar y practicar la construcción elegida antes del lote. Integrar solicitud acotada, salida bloqueada sin ráfaga de recuperación y «Cancelar y devolver pendientes» para identidades aún no emitidas. Ese retorno administrativo no acredita la devolución física de S02.

**S05.** Ampliar la matriz por origen y materia a reserva, sala, tránsito, entregas, familias, repisas y demás depósitos. Mostrar localización de faltantes y distinguir cuerpos visibles de materia equivalente. Estar localizado no equivale a cumplir el destino. Preservar guía e instalación aceptada.

**Ciclo 12 de la propuesta.** Recuperar materiales reales de familias y repisas; montar brazo y cinta estacionarios; validar una sola condición de sensor; preparar carga y batería; mantener vehículo o dron independiente con pinza simple. Precargar durante preparación y evaluar autonomía después. La ruta QR vigente admite soltar, no tomar. No fabricar enganches mediante división, añadir lógica general de sensores ni ofrecer recarga automática. En variante aérea, aterrizar y detener vuelo manual antes de iniciar QR, volviendo a verificar esa condición en el código del incremento correspondiente.

Una fuente que convierta materia presupuestada debe registrar una única transformación: no contar a la vez la entrada consumida y su salida. Reserva, generación y división conservan contratos distintos.

## Evidencia y límites

La implementación está en [`game.js`](../assets/js/game.js), [`campaign-supply.js`](../assets/js/campaign-supply.js), [`factory-passage.js`](../assets/js/factory-passage.js) y [`save-games.js`](../assets/js/save-games.js). Las nuevas dependencias forman parte del arranque real de [`boot.js`](../assets/js/boot.js).

Pruebas reproducibles:

```bash
node --test tests/*.test.cjs
python3 tests/validate-focus-gles.py
python3 tests/validate-factory-passage-gles.py /tmp/qbits-opening-review
```

Los ensayos de Node ejecutan lógica y Cannon con DOM/GPU instrumentados. Cubren transacciones, conservación, protección, guardado/carga, entrada existente, locomoción y limpieza de recursos. Las capturas GLES reproducen comandos y shaders de producción; no reconstruyen una interfaz ficticia. Su alcance es geometría, dibujo y píxeles de poses concretas.

Chromium intentó arrancar en esta sesión y terminó al crear su socket con `Operation not permitted`. No hay certificación de manejo, audio audible, comodidad, FPS ni ausencia de tirones en navegador. La comprobación en el dispositivo del jugador sigue siendo el siguiente gate antes de ampliar el tramo.

### Criterios de evaluación con jugadores

1. Puede despertar, cuidar y decidir continuar sin sentirse apurado.
2. Reconoce escotilla, bandeja y aro mediante la escena y los estados, sin una explicación del propósito de la instalación.
3. Distingue pedir, tomar, devolver y recuperar técnicamente; puede recuperar un error sin perder materia ni recibir crédito indebido.
4. Puede detenerse ante una ventana, retroceder, guardar y reanudar sin perder al guía.
5. Recorre ambos descensos y su descanso sin saltos molestos de cámara ni confusión de destino.
6. Interpreta por sí mismo lo observado en la fábrica. No se le pregunta por una respuesta narrativa correcta ni se evalúa duración de mirada.
7. La interfaz sigue siendo legible con controles remapeados y lectura pausada; las ayudas no penalizan.
8. La fluidez se mide en navegador y equipo reales, con la fábrica visible y fuera de vista, antes de afirmar un objetivo de rendimiento.

## Fundamento de las decisiones

- Henry Jenkins, [Game Design as Narrative Architecture](https://web.mit.edu/~21fms/People/henry3/games&narrative.html): el espacio y sus acontecimientos pueden sostener interpretación narrativa. Aquí fundamenta la vista ambiental sin exposición del propósito.
- W3C, [Understanding SC 2.2.1: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable): dar tiempo suficiente para leer e interactuar. Se aplica como referencia de accesibilidad, sin declarar una certificación WCAG del juego.
- MDN, [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices): agrupación de dibujos y reducción de trabajo innecesario. Justifica compartir geometría y acotar la escena; no prueba un FPS concreto.
- MDN, [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame): la frecuencia de pantalla varía. La animación se deriva del tiempo autorizado de simulación y no de contar fotogramas.

Estas fuentes respaldan principios. El tamaño del corredor, sus velocidades y sus encuadres son decisiones revisables de Q-bits y necesitan la comprobación indicada.
