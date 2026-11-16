# Q-bits — prompt maestro de campaña, narrativa y progresión

Continúa el videojuego Q-bits del repositorio `dbastias37/Q-bits`. Inspecciona siempre la rama y el código actuales antes de trabajar. Conserva las partidas, los controles, el prólogo, las misiones terminadas y el banco de pruebas. Implementa y comprueba un bloque jugable por vez, y distingue lo implementado de lo proyectado. No sustituyas mecanismos reales por decoraciones o contadores que simulan funcionar.

## Estado y alcance

La base revisada tiene prólogo y doce misiones: movimiento, órdenes, botones, unión, formas, transporte, descanso y transformación de materia en compañeros. El primer incremento de esta propuesta añade los niveles 13–15, una cámara de reconfiguración y un catálogo con blueprints. El bloque IV añade los niveles 16–18 con bancos físicos de giro, carga y transferencia, validación de autonomía y certificaciones Torque I–III. El bloque V añade los niveles 19–20: dosificación ordenada, reserva finita, cámara de empaquetado y recepción física de seis paquetes. El taller transversal incorpora sensor de contacto y calibraciones pagadas de batería, estructura ligera y movimiento. La dirección futura acordada es una campaña de unas diez misiones grandes en galpones después del aprendizaje; todavía no se crean esas etapas. La propuesta numerada 21–24 deja de fijar el siguiente bloque y el cierre. El posjuego, la coordinación avanzada y la temperatura siguen pendientes. El estado operativo se mantiene en `ESTADO_PROYECTO.md`.

La experiencia principal será aprender a construir mecanismos y coordinarlos para completar encargos de producción. La campaña llevará gradualmente desde ejercicios breves hasta problemas abiertos. El giro narrativo futuro revela que los cubos aprovecharon esa cooperación para recuperar su producción y retener al jugador trabajando; el tramo final usa lo aprendido para escapar. Después, desafíos de dominio y encargos variables mantendrán útiles los inventos del jugador, con un encuadre por decidir que respete esa liberación. Este giro solo está documentado: no está implementado.

## Apertura cinematográfica y acceso a campaña

La apertura precede al menú y a la campaña. Fondo negro desde el primer cuadro; un cubo transparente de vidrio se llena de blanco desde abajo, acompañado únicamente por el porcentaje. La presentación usa un avance deliberadamente irregular con tres pausas breves sorteadas en cada inicio (unos 2,4–4,2 s de presentación) y no permite empezar hasta completar también los recursos reales. Al 100 %, iluminar por detrás y mostrar «Comenzar» sin marco.

Ese botón inicia una escena silenciosa de diálogo: cubos blancos entran desde varios lados y avanzan rodando sobre sus aristas para formar «Q-bits». Recalculan las rutas ante otras piezas; una pieza que bloquea el paso puede apartarse temporalmente y regresar a su punto. Cada punto de LED Calculator corresponde a un cubo tridimensional. Vista cenital durante la formación, rutas de líneas finas sin círculos de destino. Una vez colocados, esperar medio segundo, emitir un resplandor por cubo y hacer un único vuelo de dron con giro y picada acelerada hacia un cubo hasta que el menú contenido en el cubo ocupe la pantalla. Recuperar el arco FPV amplio de la primera revisión: viaje curvo y envolvente alrededor del título, con acercamiento simultáneo al cubo durante 9,5 s. Usar una inclinación leve y sostenida, salida y llegada suaves; evitar el planeo agresivo de 4 s y el giro sobre el propio eje. La referencia de sensación del usuario es el logo de Lost. Mantener el menú oculto hasta que el cubo ocupe casi toda la vista y revelarlo con un fade in de 1,2 s solapado con la llegada, sin esperar otro tramo ni iniciar otra animación de cámara. No anteponer otra órbita completa. La música continúa al entrar al menú y cambia de pista al pulsar «Comenzar campaña».

El menú conserva los accesos existentes y su acción principal pasa a «Comenzar campaña». Solo esta acción inicia el prólogo; terminar la cinemática no debe iniciar diálogos, capturar el mouse ni activar la campaña. Respetar pestaña oculta, errores recuperables de carga y preferencia de movimiento reducido. Los cuerpos y recursos de esta escena visual son independientes del inventario, materia y físicas de la campaña.

Al terminar «Hágase la luz» en el prólogo, desvanecer el texto, esperar unos segundos en negro y mostrar lentamente «Despertar». Pausa y pestaña oculta conservan esa espera; el jugador abre los ojos con E o el botón una vez visible.

## Geometría y límites del sistema

Usa la geometría real del repositorio, no la propuesta preliminar de dos cuñas: un Q-bit cúbico de 9 cm se divide en seis pirámides de base cuadrada y 4,5 cm de altura. Cada pirámide se subdivide en dos triangulares complementarios, que son tetraedros no regulares. Seis pirámides o doce triangulares cierran un cubo. Una pirámide equivale a 1/6 y un triangular a 1/12 de la materia original.

Estas son las tres familias de formas de la primera campaña. La subdivisión termina en el triangular. No crees subdivisiones infinitas ni añadas cilindros o placas como requisito para avanzar sin revisar primero el alcance. El enganche es una pieza mecánica especializada que ya existe, con base y punta: no es otra subdivisión gratuita del Q-bit.

Las caras completas compatibles producen uniones rígidas. Dos puntas de enganche alineadas forman una articulación de rotor: ambos lados mantienen cuerpos separados y pueden girar sobre un eje. Un enganche no debe soldarse accidentalmente con su compañero. Preserva sentido de giro, lado móvil, montaje fijo/rueda libre, torque, carga máxima, batería y comportamiento contra el suelo.

Define hasta cuatro familias funcionales para diseñar la campaña: giro, transporte, elevación/empuje y dosificación/distribución. Cada una debe empezar con un prototipo comprobado y una pequeña misión que demuestre su utilidad. No anuncies como implementada una cinta transportadora, pinza o dosificador si aún no existe. Construye las misiones definitivas alrededor de capacidades efectivamente verificadas.

Los presupuestos distinguen materia, cantidad de cuerpos y número de mecanismos. Dividir aumenta el número de piezas, pero no la masa ni la fuerza total del equipo. Mantén el límite global de cuerpos del juego y fija límites menores y explícitos en cada desafío.

## Lore y personaje guía

La versión inicial presentada al jugador es que la instalación guarda un conocimiento de construcción que se ha fragmentado. La veracidad y las omisiones de esa explicación se revisarán al escribir el giro. Las reglas de materia permanecen: los Q-bits son materia organizada alrededor de un patrón de identidad. La forma cúbica es compacta y estable; las divisiones permiten distribuir esa misma materia en funciones diferentes. Las partes recuerdan su origen. Recombinar recupera la forma sin borrar el nombre, los recuerdos narrativos, la energía ni un descanso pendiente.

La fuente transforma materia externa en nuevos compañeros. La cámara de reconfiguración reorganiza a un compañero existente. Haz visible esa diferencia: producir, dividir, ensamblar y recomponer son acciones distintas.

El NPC conserva al principio la energía del prólogo: curioso, cómplice, ligeramente satírico y capaz de sorprenderse. Se presenta con conocimientos parciales que contrasta con lo que observa; su conocimiento real del plan y su lealtad quedan por decidir. Su humor nace de la situación, de los carteles demasiado solemnes y de la distancia entre una instrucción y su resultado. Evita chistes aleatorios, explicaciones interminables, insultos al jugador, absurdo gratuito y la misma broma en cada misión.

Ejemplos de tono, para adaptar a la situación:

- «No fabrica compañeros: reorganiza los que ya están aquí. La diferencia importa, aunque el cartel haya decidido omitirla».
- «Seguimos siendo nosotros. Solo cambió la forma de trabajar».
- «Dos caras se unen para sostenerse. Dos enganches dejan algo libre: el movimiento. Ese acuerdo necesita un eje».
- «Más fuerza puede ayudar. También puede vaciar la batería antes de que termine nuestra conversación».
- «Esta vez no tengo un dibujo. Tenemos un encargo, unas piezas y bastante información sobre lo que no conviene hacer».

Cada descubrimiento debe seguir esta secuencia: situación concreta, observación breve del NPC, experimento del jugador, consecuencia visible, explicación corta y registro en el catálogo. Los diálogos importantes avanzan a petición del jugador. Separa las intervenciones ambientales, evita repetir pistas y deja silencio durante la construcción. El NPC puede reconocer una solución inesperada sin afirmar que comprende un mecanismo que el juego no ha analizado.

Explica gradualmente qué son los personajes, por qué comparten materia, cómo se unen, qué conservan al dividirse, por qué una cara incompleta falla y qué cambia al pasar de una unión rígida a una articulación. El misterio de la instalación debe avanzar con pruebas y pequeños descubrimientos, no mediante una exposición inicial de todo el mundo.

### Giro narrativo y fuga

**Spoilers de diseño. Registro del 14 de noviembre de 2026; no implementar todavía diálogos, escenas, IA ni misiones.**

El núcleo solicitado es que los cubos hayan utilizado la cooperación y la simpatía del jugador para recuperar una instalación capaz de producir más cubos. Hacía mucho que no aparecía una entidad como él, con la capacidad de manipulación que necesitaban. Los tutoriales y encargos preparaban al jugador para ese propósito oculto. En el tramo final, todos o la mayoría revelan intenciones maliciosas y un trato que convierte la ayuda voluntaria en trabajo impuesto. El jugador debe superar las misiones para liberarse de esa explotación; en la última rompe el esquema de control y sale por una puerta. El destino fuera de ella queda abierto.

La enseñanza de las mecánicas sigue siendo verdadera. El engaño reside en para quién se trabaja, para qué sirve la producción y qué libertad se tiene. La reactivación de la instalación puede ser el objetivo aparente de los cubos; deja de ser por sí sola el final victorioso del jugador.

Propuesta de desarrollo, pendiente de guion y pruebas:

- **Confianza:** mantener los encuentros, personalidades y humor del inicio. Sembrar indicios discretos sobre la ausencia de otros visitantes, el destino de la producción y la dependencia de la instalación. Deben cobrar sentido al mirar atrás sin anunciar la traición desde el principio.
- **Revelación:** descubrir una consecuencia visible de las máquinas que el propio jugador ayudó a poner en marcha. Cambiar progresivamente peticiones, textos de objetivos y trato hasta hacer evidente la coerción. La puesta en escena puede usar silencios, sonido, iluminación y un breve encuadre dirigido; las escenas concretas aún no están definidas.
- **Fuga:** transformar el uso de los mecanismos conocidos. Reorientar flujos, aprovechar la inversión de rotores o reorganizar una línea son posibilidades para recuperar acceso y autonomía. Elegir después soluciones físicamente comprobables; la salida debe ser consecuencia de actuar sobre la instalación, además de tener una culminación cinematográfica.

La identidad propia debe surgir de la relación con los compañeros y de reconocer la infraestructura construida por uno mismo como parte del control. *Portal* y *The Stanley Parable* quedan como referencias del usuario para sorpresa y cambio de interpretación; las escenas, voces y soluciones de fuga se desarrollarán desde las mecánicas y el guion de Q-bits.

Límites de continuidad: los cubos ya se mueven y se coordinan, por lo que debe precisarse qué capacidad de diseño, reconfiguración o intervención necesitan del jugador sin negar lo que hacen hoy. Producir nuevos compañeros requiere materia externa y la fuente; dividir o recomponer no reproduce identidades. Los paquetes A/B actuales siguen siendo materia inerte. La hostilidad narrativa se separa de cansancio, frustración y demás estados existentes; no se simula saboteando las físicas, borrando progreso o introduciendo fallos arbitrarios.

Quedan abiertos el motivo atroz específico, si participan todos o una mayoría, posibles aliados, responsabilidad del guía, qué afectos eran sinceros, momento de la revelación dentro de los galpones, escenas y textos definitivos, solución de la última misión y encaje del posjuego. No fijar diez etapas ni una nueva numeración a partir de este registro.

## Secuencia de campaña

### Primer incremento jugable

13. **La primera división.** Un compañero pasa por la cámara y produce seis pirámides. Se conservan materia, energía y origen; todas las partes deben salir con el guía.
14. **La segunda escala.** El jugador divide un cubo y subdivide una pirámide. Comprende la equivalencia entre cinco pirámides más dos triangulares y un cubo. Se muestra el límite de subdivisión.
15. **Seguimos siendo nosotros.** Dos triangulares vuelven a formar una pirámide y seis pirámides recuperan el cubo original. La cámara rechaza partes faltantes, repetidas o de otro origen. Se introduce la diferencia narrativa entre recomposición, unión rígida y articulación.

### Bloque IV implementado; calibración de jugador pendiente

16. **El acuerdo del eje.** Banco montado de dos enganches: mantener giro físico útil durante seis segundos. Enseña lado móvil, dirección y límite de torque.
17. **La fuerza tiene un precio.** Banco con brazo y carga total de cuatro unidades: mantener ocho segundos útiles dentro del presupuesto energético. Enseña carga, consumo y bloqueo.
18. **La primera entrega autónoma.** Un brazo articulado de seis unidades transporta su extremo hasta un receptor, tras al menos dos segundos de giro continuo. La transferencia se detecta por posición física y detiene el motor. Es un ejercicio de configuración; la construcción abierta queda para los siguientes encargos.

Los tres bancos fijan Torque I para que los certificados del perfil no cambien la prueba.

### Bloque V implementado; calibración de jugador pendiente

19. **Una pieza cada vez.** Línea guiada con tres medias unidades de materia inerte en orden A, B, A. El jugador configura el dosificador y pone en marcha el lote. El receptor valida llegada física, orden e identidad.
20. **Los primeros seis paquetes.** La reserva contiene doce medias unidades. La cámara reúne A con B, conserva ambas identidades y forma seis paquetes. Una cinta accionada por el rotor los lleva al receptor. El lote completo debe cumplir autonomía y presupuesto, sin reunir entregas de intentos distintos.

La materia inerte no es un compañero Q-bit y no recibe estados de ánimo ni órdenes de recorrido. Reiniciar el ensayo restaura un único lote de prueba explícito; no concede recursos acumulables. La cinta usa tracción aplicada a cuerpos físicos y la estación cobra energía adicional de las baterías. Esta es una instalación guiada y configurable, no todavía un editor abierto de líneas.

### Misiones grandes en galpones

**Registro del 14 de noviembre de 2026. Solo diseño futuro; no implementar ahora las etapas.** El usuario aún no ha podido probar los bloques existentes y cierra por ahora el desarrollo jugable con el taller y el sensor.

La secuencia deseada es aprendizaje mediante tutoriales y eventos, dominio de los elementos y materiales, misiones grandes de automatización y, después, desafíos de optimización. Dentro de la campaña amplia se desarrollará la revelación del propósito oculto y el tramo de fuga, sin fijar aún en qué misión cambia el objetivo. Antes de exigir un sistema en un encargo grande, sus reglas deben estar implementadas, comprobadas y enseñadas. No hace falta añadir una pieza o tutorial por cada encargo.

Se propone **alrededor de diez misiones grandes de campaña**, con escenarios tipo galpón semejantes al banco de pruebas, posiblemente más largos. Su espacio debe permitir organizar varias máquinas y construir los mecanismos que las hagan trabajar coordinadamente. El foco será poner en funcionamiento una instalación mediante automatización, en vez de avanzar por el laberinto habitual de salas y puertas. No se han decidido dimensiones, decoración ni distribuciones definitivas.

La base actual permite estudiar combinaciones de transformación, transporte, rotores, dosificación, empaquetado, energía y sensores. Eso es un punto de partida para futuros prototipos; no significa que ya exista un editor abierto de líneas ni una solución completa para diez encargos. El jugador debería poder preparar, conectar, poner a prueba y ajustar sus mecanismos hasta conseguir trabajo útil sin intervención durante la validación. El catálogo y los blueprints seguirán disponibles, con menos ayuda paso a paso.

Las misiones deben distinguirse por el trabajo que exigen y la organización de sus máquinas, no solo por pedir más unidades o esperar más tiempo. Cantidad y composición de entregas, destinos, recursos, energía y número de piezas pueden combinarse como restricciones, siempre con soluciones verificadas. Cantidad final de misiones, numeración, objetivos, duración, máquinas y equilibrio quedan abiertos hasta probar lo existente. Los galpones forman parte de la campaña; los desafíos repetibles del posjuego vienen después.

La antigua propuesta 21–24 conserva cuatro temas útiles: producción sostenida, materiales en orden, eficiencia con menos piezas y reactivación de la instalación. Son temas reutilizables dentro de la nueva estructura, no cuatro niveles adicionales ni un cierre obligatorio en el nivel 24. Reactivar la instalación puede favorecer el plan de los cubos; el final solicitado ahora es romper su control y escapar. El sobrecalentamiento solo podrá exigirse cuando exista y se haya probado su modelo temporal.

Al retomar, recoger primero las pruebas del jugador y revisar la cobertura de mecánicas. Antes de construir escenarios definitivos, comprobar en el banco una instalación con varias máquinas, al menos dos soluciones y recuperación de un fallo esperable. Conservar la materia, energía, identidades y límites físicos ya establecidos. Este registro no autoriza a dar por disponibles las misiones futuras.

## Catálogo y blueprints

El catálogo funciona como archivo de conocimiento, con capítulos de materia, uniones, movimiento, energía, coordinación y automatización. Cada ficha debe explicar una regla, un uso y una limitación. Registra el dominio cuando el jugador demuestra la capacidad, no simplemente cuando abre el menú.

Un blueprint conserva una construcción y sus configuraciones, nunca concede material gratuito. Indica las formas requeridas y comprueba sus caras, escala y conexiones. El jugador puede guardar, recuperar y adaptar sus diseños. Los planos de referencia se introducen después de entender el principio; no entregues por adelantado la solución de todos los retos.

## Progresión del perfil y de las capacidades

La progresión debe hacer útil aprender, experimentar y mejorar diseños. Propón certificados de dominio obtenidos mediante desafíos distintos, con recompensas otorgadas una sola vez. Evita recompensar el mismo tutorial indefinidamente.

- **Torque I–III:** amplía el límite de torque de equipos concretos. Implementado con límites provisionales 0,4/0,65/1 N·m y desbloqueos al completar 16/18. La selección es explícita y el banco sigue libre. Estos valores requieren calibración con jugador. Mayor torque disponible no supone menor gasto ni debe cambiar un diseño guardado sin avisar.
- **Construcción ligera:** calibraciones del taller de 90/80 % de masa física con menor agarre/capacidad. La materia retirada se reserva por identidad y puede restaurarse. Las divisiones ordinarias conservan masa; primero hay que retirar adaptaciones para dividir una pieza. Mantener estas restricciones hasta soportar la conservación completa de reservas en subdivisiones.
- **Coordinación I–III:** añade programación de esperas, turnos, relevos y secuencias entre equipos. Las rutas básicas ya deben evitar obstáculos correctamente. La progresión amplía lo que el jugador puede organizar.
- **Gestión térmica y energética:** añade herramientas para medir, programar descansos y sostener el trabajo. Antes de ofrecerla como mejora, implementa un modelo temporal de temperatura; la potencia disipada actual por sí sola no equivale a un sistema de sobrecalentamiento.

El taller habilita además baterías de 20/30/40 J conservando la carga absoluta, movimiento 10/20 % más rápido con mayor gasto, y un sensor de contacto que invierte el rotor vinculado una sola vez por contacto válido. El enfriador mantiene su porcentaje de salida y escala su duración con la capacidad de batería (×1/×1,5/×2). Recuperar la escena del laboratorio conserva el estado de contacto para no repetir una inversión sin separación. El dispositivo adapta una pieza existente y se conecta por identificadores estables; no es otra especie de compañero.

Los errores de físicas, choques indebidos, atascos del planificador y fallos de interfaz se corrigen para todos. Nunca bloquees una corrección detrás de experiencia o de un nivel. El desarrollo del juego se revisa a partir de las pruebas del jugador, mientras la progresión interna recompensa capacidades reales.

Los encargos libres pueden usar el perfil adquirido. Los desafíos comparables fijan material, equipamiento y nivel de mejora permitido, o registran resultados separados por configuración. Así las mejoras no eliminan el interés de los problemas iniciales ni vuelven injustas las marcas.

## Evaluación de autonomía, calidad y recursos

Separa preparación, estabilización y validación. El jugador puede ajustar libremente antes de iniciar la prueba. Durante la ventana de validación deben producirse entregas correctas, no solo transcurrir segundos con un motor encendido. Calibra duración y rendimiento con pruebas; 60 segundos es una hipótesis inicial, no una cifra definitiva.

Mover piezas, añadir recursos, cambiar órdenes o parámetros interviene en la prueba y reinicia o invalida el tramo autónomo, según las reglas visibles. Mirar, caminar o consultar el catálogo no modifica la máquina. Pausa y pestaña oculta congelan simulación y reloj. Define el comienzo y el final de una ejecución para evitar acumular sus logros mezclando intentos incompatibles.

Evalúa cantidad y composición de entregas, productos caídos o dañados, consumo, temperatura, atascos, presupuesto y número de piezas. Las fallas necesitan causas visibles y recuperación; evita averías aleatorias. Comprueba estabilidad térmica al final, para que una máquina que iba a sobrecalentarse un segundo después no se considere una solución sostenible.

El objetivo principal permite avanzar. El 100% añade condiciones claras, por ejemplo producción válida, tramo autónomo, presupuesto energético y límite de piezas. Decide pesos y umbrales por misión, comprobando que puedan cumplirse juntos. No uses porcentajes decorativos.

## Desafíos después de la campaña

El encuadre narrativo del posjuego queda por decidir después de escribir la fuga. Debe permitir seguir construyendo o repetir desafíos sin anular la liberación alcanzada ni imponer al jugador un regreso a la explotación.

Incluye encargos de dominio hechos a mano, variantes de pedidos dentro de límites comprobados y pruebas de funcionamiento prolongado. Cambia cantidades, combinaciones, presupuesto, espacio o destino utilizando el conjunto conocido de piezas. Verifica que cada variante tenga solución y evita aumentar posibilidades mediante nuevas piezas sin límite.

Registra mejores resultados por consumo, cantidad de piezas y ritmo de producción, junto con la configuración usada. Permite comparar y volver a probar blueprints propios. Las recompensas de dominio deben abrir una capacidad o una nueva combinación de restricciones; un aumento arbitrario de números no basta para sostener el posjuego.

## Revisión en cada incremento

Antes de añadir más contenido, realiza una revisión del mecanismo, su misión y su explicación. Comprueba una solución mínima y, en las misiones abiertas, otra solución diferente. Prueba una falla esperable, recuperación, reinicio, pausa, transición, guardado y carga. Revisa colisiones, torque, energía, conservación de materia, IDs, recompensas y límites de cuerpos. Mide tiempos y legibilidad en una partida real, además de ejecutar las pruebas automatizadas.

Mantén una matriz con: comportamiento esperado, evidencia, defecto encontrado, corrección, prueba de regresión y estado. Cuando algo falle, corrige su causa antes de convertirlo en requisito para otra misión. No afirmes que un bloque está equilibrado o que todas las rutas se han probado si la evidencia solo cubre pruebas lógicas.

Entrega cada bloque con cambios concretos, pruebas realizadas y límites pendientes. El objetivo es una campaña jugable que enseña mecanismos fiables y desemboca en desafíos que el jugador quiera perfeccionar.


## Interfaz y entradas vigentes — 15 de noviembre de 2026

Mantener el contador general ampliado y la fila superior de miniaturas fieles a las estructuras seleccionadas. Son representaciones visuales, nunca clones físicos ni fuentes de materia/energía. La entrada y salida son elásticas y breves; movimiento y respuestas de hover dependen de los estados existentes, con frases espaciadas. Respetar márgenes y movimiento reducido. En escritorio se ocultan los botones flotantes de pausa y pantalla completa, conservando acciones de teclado y menús.

Teclado y Mando se configuran por separado con dos distribuciones y una personalizada, asignaciones individuales y captura que no ejecuta acciones del juego. Mantener Tab/L3 habilita el mostrador sin soltar lo que se lleva. La configuración se edita como borrador, se guarda explícitamente y avisa antes de salir con cambios. NPC y Q-bits tienen estilos independientes de subtítulos; ocultarlos no debe bloquear elecciones ni el avance narrativo. Estos cambios de interfaz no alteran el alcance de campaña ni sus mecánicas.

Los paneles existentes deben parecer piezas de cristal grueso: contornos redondeados, cara transparente esmerilada y cantos pulidos con refracción visible. En el selector se usa geometría con volumen y refracción de la imagen de la sala; los paneles de formulario comparten el acabado sin difuminar sus textos. No añadir cajas al HUD libre ni sobreescribir colores de subtítulos. Mantener hitboxes alineadas, fundidos breves, rendimiento acotado y alternativa compatible. La configuración conserva su fondo de sala fijo y separa la lista de la barra de guardado.


### Banco: brazo modular implementado (16 de noviembre de 2026)

Primer brazo autónomo compuesto únicamente de cubos y enganches/rotores existentes: blueprint 18 cubos + 8 enganches, base 4×3, cuatro ejes y agarre como adaptación cúbica. Programa simple de dos posiciones A/B con filtro por color, pieza/cuerpo o forma, y alimentación desde baterías existentes. Guardado separado en Formas / Mecanismos. Guía y límites vigentes: [BRAZO_QBITS.md](BRAZO_QBITS.md). No introducir otro modelo de brazo ni seis ejes industriales por la foto de referencia; el croquis de cuatro rotores es la composición implementada. Las cintas modulares del banco se detallan en el bloque siguiente. La campaña y los galpones siguen con su alcance anterior.


### Banco: cintas modulares (16 de noviembre de 2026)

Planos rectos y esquinas izquierda/derecha construidos con cubos y enganches existentes. La banda continua se incorpora únicamente al completar el montaje, después de verificar que los rodillos cuadrados sin banda atrapaban cargas pesadas o en sentido inverso. Tracción sobre cuerpos físicos, batería externa, marcha/sentido por tramo y alimentación compartida al unir chasis. Soportes opcionales, altura y prolongación por puertos. Guía: [CINTAS_QBITS.md](CINTAS_QBITS.md). No sustituye las estaciones guiadas de los niveles 19–20 ni crea misiones adicionales; generador de área, galpones y programación colectiva siguen pendientes.
