# Q-bits — prompt maestro de campaña, narrativa y progresión

Continúa el videojuego Q-bits del repositorio `dbastias37/Q-bits`. Inspecciona siempre la rama y el código actuales antes de trabajar. Conserva las partidas, los controles, el prólogo, las misiones terminadas y el banco de pruebas. Implementa y comprueba un bloque jugable por vez, y distingue lo implementado de lo proyectado. No sustituyas mecanismos reales por decoraciones o contadores que simulan funcionar.

## Estado y alcance

La base revisada tiene prólogo y doce misiones: movimiento, órdenes, botones, unión, formas, transporte, descanso y transformación de materia en compañeros. El primer incremento de esta propuesta añade los niveles 13–15, una cámara de reconfiguración y un catálogo con blueprints. El bloque IV añade los niveles 16–18 con bancos físicos de giro, carga y transferencia, validación de autonomía y certificaciones Torque I–III. Las misiones 19–24, el posjuego, la construcción ligera, la coordinación avanzada y la temperatura siguen pendientes. El estado operativo se mantiene en `ESTADO_PROYECTO.md`.

La experiencia principal será aprender a construir mecanismos y coordinarlos para completar encargos de producción. La campaña llevará gradualmente desde ejercicios breves hasta problemas abiertos. Después, desafíos de dominio y encargos variables mantendrán útiles los inventos del jugador.

## Geometría y límites del sistema

Usa la geometría real del repositorio, no la propuesta preliminar de dos cuñas: un Q-bit cúbico de 9 cm se divide en seis pirámides de base cuadrada y 4,5 cm de altura. Cada pirámide se subdivide en dos triangulares complementarios, que son tetraedros no regulares. Seis pirámides o doce triangulares cierran un cubo. Una pirámide equivale a 1/6 y un triangular a 1/12 de la materia original.

Estas son las tres familias de formas de la primera campaña. La subdivisión termina en el triangular. No crees subdivisiones infinitas ni añadas cilindros o placas como requisito para avanzar sin revisar primero el alcance. El enganche es una pieza mecánica especializada que ya existe, con base y punta: no es otra subdivisión gratuita del Q-bit.

Las caras completas compatibles producen uniones rígidas. Dos puntas de enganche alineadas forman una articulación de rotor: ambos lados mantienen cuerpos separados y pueden girar sobre un eje. Un enganche no debe soldarse accidentalmente con su compañero. Preserva sentido de giro, lado móvil, montaje fijo/rueda libre, torque, carga máxima, batería y comportamiento contra el suelo.

Define hasta cuatro familias funcionales para diseñar la campaña: giro, transporte, elevación/empuje y dosificación/distribución. Cada una debe empezar con un prototipo comprobado y una pequeña misión que demuestre su utilidad. No anuncies como implementada una cinta transportadora, pinza o dosificador si aún no existe. Construye las misiones definitivas alrededor de capacidades efectivamente verificadas.

Los presupuestos distinguen materia, cantidad de cuerpos y número de mecanismos. Dividir aumenta el número de piezas, pero no la masa ni la fuerza total del equipo. Mantén el límite global de cuerpos del juego y fija límites menores y explícitos en cada desafío.

## Lore y personaje guía

La instalación guarda un conocimiento de construcción que se ha fragmentado. Los Q-bits son materia organizada alrededor de un patrón de identidad. La forma cúbica es compacta y estable; las divisiones permiten distribuir esa misma materia en funciones diferentes. Las partes recuerdan su origen. Recombinar recupera la forma sin borrar el nombre, los recuerdos narrativos, la energía ni un descanso pendiente.

La fuente transforma materia externa en nuevos compañeros. La cámara de reconfiguración reorganiza a un compañero existente. Haz visible esa diferencia: producir, dividir, ensamblar y recomponer son acciones distintas.

El NPC conserva la energía del prólogo: curioso, cómplice, ligeramente satírico y capaz de sorprenderse. Tiene conocimientos parciales y los contrasta con lo que observa. Su humor nace de la situación, de los carteles demasiado solemnes y de la distancia entre una instrucción y su resultado. Evita chistes aleatorios, explicaciones interminables, insultos al jugador, absurdo gratuito y la misma broma en cada misión.

Ejemplos de tono, para adaptar a la situación:

- «No fabrica compañeros: reorganiza los que ya están aquí. La diferencia importa, aunque el cartel haya decidido omitirla».
- «Seguimos siendo nosotros. Solo cambió la forma de trabajar».
- «Dos caras se unen para sostenerse. Dos enganches dejan algo libre: el movimiento. Ese acuerdo necesita un eje».
- «Más fuerza puede ayudar. También puede vaciar la batería antes de que termine nuestra conversación».
- «Esta vez no tengo un dibujo. Tenemos un encargo, unas piezas y bastante información sobre lo que no conviene hacer».

Cada descubrimiento debe seguir esta secuencia: situación concreta, observación breve del NPC, experimento del jugador, consecuencia visible, explicación corta y registro en el catálogo. Los diálogos importantes avanzan a petición del jugador. Separa las intervenciones ambientales, evita repetir pistas y deja silencio durante la construcción. El NPC puede reconocer una solución inesperada sin afirmar que comprende un mecanismo que el juego no ha analizado.

Explica gradualmente qué son los personajes, por qué comparten materia, cómo se unen, qué conservan al dividirse, por qué una cara incompleta falla y qué cambia al pasar de una unión rígida a una articulación. El misterio de la instalación debe avanzar con pruebas y pequeños descubrimientos, no mediante una exposición inicial de todo el mundo.

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

### Bloques siguientes, sujetos a prototipos comprobados
19. **Una pieza cada vez.** Introducir dosificación y separación de flujos. El producto correcto debe llegar en la cantidad y secuencia pedidas.
20. **Los primeros seis paquetes.** Encargo completo de obtención, transformación, formación y entrega. El primer objetivo es un sistema funcional; luego se busca autonomía.
21. **Una línea que se sostiene.** Producción continua con energía y temperatura estables. La máquina no puede ganar simplemente por estar encendida y vacía.
22. **Materiales en orden.** Variar materiales, cantidades o destinos, con recursos finitos y errores recuperables.
23. **Menos piezas, mismo encargo.** Optimización: elegir entre soluciones con diferentes costos. No exigir simultáneamente extremos incompatibles.
24. **La instalación despierta.** Integrar varios sistemas ya conocidos y activar la instalación central. Encargo abierto, sin solución guiada; el catálogo sigue disponible. El cierre reconoce al equipo y abre desafíos posteriores.

Los números 19–24 son un orden de diseño, no una obligación de añadir nueve niveles vacíos. Combina o divide misiones según las pruebas. Retira la ayuda paso a paso de manera gradual; ofrece relectura de lo aprendido y pistas opcionales antes de los desafíos finales.

## Catálogo y blueprints

El catálogo funciona como archivo de conocimiento, con capítulos de materia, uniones, movimiento, energía, coordinación y automatización. Cada ficha debe explicar una regla, un uso y una limitación. Registra el dominio cuando el jugador demuestra la capacidad, no simplemente cuando abre el menú.

Un blueprint conserva una construcción y sus configuraciones, nunca concede material gratuito. Indica las formas requeridas y comprueba sus caras, escala y conexiones. El jugador puede guardar, recuperar y adaptar sus diseños. Los planos de referencia se introducen después de entender el principio; no entregues por adelantado la solución de todos los retos.

## Progresión del perfil y de las capacidades

La progresión debe hacer útil aprender, experimentar y mejorar diseños. Propón certificados de dominio obtenidos mediante desafíos distintos, con recompensas otorgadas una sola vez. Evita recompensar el mismo tutorial indefinidamente.

- **Torque I–III:** amplía el límite de torque de equipos concretos. Implementado con límites provisionales 0,4/0,65/1 N·m y desbloqueos al completar 16/18. La selección es explícita y el banco sigue libre. Estos valores requieren calibración con jugador. Mayor torque disponible no supone menor gasto ni debe cambiar un diseño guardado sin avisar.
- **Construcción ligera:** reduce masa solo mediante una modificación explícita, con costo y contrapartida comprobada, por ejemplo menor estabilidad o capacidad de carga. Las divisiones ordinarias siempre conservan masa. No implementes esta rama hasta medir sus efectos en tracción y colisiones.
- **Coordinación I–III:** añade programación de esperas, turnos, relevos y secuencias entre equipos. Las rutas básicas ya deben evitar obstáculos correctamente. La progresión amplía lo que el jugador puede organizar.
- **Gestión térmica y energética:** añade herramientas para medir, programar descansos y sostener el trabajo. Antes de ofrecerla como mejora, implementa un modelo temporal de temperatura; la potencia disipada actual por sí sola no equivale a un sistema de sobrecalentamiento.

Los errores de físicas, choques indebidos, atascos del planificador y fallos de interfaz se corrigen para todos. Nunca bloquees una corrección detrás de experiencia o de un nivel. El desarrollo del juego se revisa a partir de las pruebas del jugador, mientras la progresión interna recompensa capacidades reales.

Los encargos libres pueden usar el perfil adquirido. Los desafíos comparables fijan material, equipamiento y nivel de mejora permitido, o registran resultados separados por configuración. Así las mejoras no eliminan el interés de los problemas iniciales ni vuelven injustas las marcas.

## Evaluación de autonomía, calidad y recursos

Separa preparación, estabilización y validación. El jugador puede ajustar libremente antes de iniciar la prueba. Durante la ventana de validación deben producirse entregas correctas, no solo transcurrir segundos con un motor encendido. Calibra duración y rendimiento con pruebas; 60 segundos es una hipótesis inicial, no una cifra definitiva.

Mover piezas, añadir recursos, cambiar órdenes o parámetros interviene en la prueba y reinicia o invalida el tramo autónomo, según las reglas visibles. Mirar, caminar o consultar el catálogo no modifica la máquina. Pausa y pestaña oculta congelan simulación y reloj. Define el comienzo y el final de una ejecución para evitar acumular sus logros mezclando intentos incompatibles.

Evalúa cantidad y composición de entregas, productos caídos o dañados, consumo, temperatura, atascos, presupuesto y número de piezas. Las fallas necesitan causas visibles y recuperación; evita averías aleatorias. Comprueba estabilidad térmica al final, para que una máquina que iba a sobrecalentarse un segundo después no se considere una solución sostenible.

El objetivo principal permite avanzar. El 100% añade condiciones claras, por ejemplo producción válida, tramo autónomo, presupuesto energético y límite de piezas. Decide pesos y umbrales por misión, comprobando que puedan cumplirse juntos. No uses porcentajes decorativos.

## Desafíos después de la campaña

Incluye encargos de dominio hechos a mano, variantes de pedidos dentro de límites comprobados y pruebas de funcionamiento prolongado. Cambia cantidades, combinaciones, presupuesto, espacio o destino utilizando el conjunto conocido de piezas. Verifica que cada variante tenga solución y evita aumentar posibilidades mediante nuevas piezas sin límite.

Registra mejores resultados por consumo, cantidad de piezas y ritmo de producción, junto con la configuración usada. Permite comparar y volver a probar blueprints propios. Las recompensas de dominio deben abrir una capacidad o una nueva combinación de restricciones; un aumento arbitrario de números no basta para sostener el posjuego.

## Revisión en cada incremento

Antes de añadir más contenido, realiza una revisión del mecanismo, su misión y su explicación. Comprueba una solución mínima y, en las misiones abiertas, otra solución diferente. Prueba una falla esperable, recuperación, reinicio, pausa, transición, guardado y carga. Revisa colisiones, torque, energía, conservación de materia, IDs, recompensas y límites de cuerpos. Mide tiempos y legibilidad en una partida real, además de ejecutar las pruebas automatizadas.

Mantén una matriz con: comportamiento esperado, evidencia, defecto encontrado, corrección, prueba de regresión y estado. Cuando algo falle, corrige su causa antes de convertirlo en requisito para otra misión. No afirmes que un bloque está equilibrado o que todas las rutas se han probado si la evidencia solo cubre pruebas lógicas.

Entrega cada bloque con cambios concretos, pruebas realizadas y límites pendientes. El objetivo es una campaña jugable que enseña mecanismos fiables y desemboca en desafíos que el jugador quiera perfeccionar.
