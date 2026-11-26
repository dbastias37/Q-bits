# Galpón de prueba · La primera línea

## Entrar y jugar

Abre el menú principal y elige **Galpón · primera línea**. Empieza con cuatro Q-bits o elige **Un Q-bit** para la variante individual. Las plazas de trabajo se configuran al empezar. **Continuar partida** recupera el guardado del galpón en ese navegador. En Windows, extrae el ZIP de la rama y abre **Abrir-galpon.cmd**. Mantén esa ventana abierta mientras juegas. También puedes servir la raíz con `python -m http.server 8000` y abrir `http://localhost:8000/#galpon`. Cada dirección y puerto tienen su propio guardado.

1. Abre **P → Galpón → Iniciar extracción**. Sin selección, la orden asigna los trabajadores disponibles. El equipo recoge materia en la fuente y la lleva al convertidor. **Incorporar compañero** reserva una unidad del próximo lote para ampliar el turno si queda una plaza.
2. Deja **Preparar siguiente tramo o pedido** como orden de fabricación. La bancada recibe cubos nuevos y el conformador convierte parte de ellos en enganches. Espera el enfriamiento pasivo. La tableta muestra las piezas disponibles.
3. Pulsa **Montar siguiente tramo** cuando tengas el material. Repite hasta completar ocho. El plano emplea piezas de la escena y coloca la banda con sus rodillos y motores en el soporte. La toma de la primera cinta permite a los trabajadores acortar el viaje de la materia.
4. Mantén la línea en marcha y en el sentido de recepción. Comprueba los tramos con clic derecho o **P → Mecanismos**. Los siguientes cubos cruzan el enfriador y caen a la bandeja. Allí pasan a una familia al llegar. El cierre dice **Primer ciclo completado** al recibir doce.
5. Si una salida está ocupada, despeja espacio y deja avanzar la carga pendiente. Si levantas un producto en tránsito, colócalo de nuevo en la entrada del primer tramo para iniciar un recorrido íntegro. **Retomar recorridos** vuelve a planificar las órdenes de transporte.

Los mandos de selección, agarre, uniones y giro por caras se utilizan también en el galpón. **Esc → Guardar partida** guarda el estado en este navegador. Al probar una segunda variante guarda primero todo lo que quieras conservar: **Nueva partida** solicita reemplazar el guardado del galpón.

## Comprobaciones

La verificación automatizada parte de la pantalla principal y prueba el recorrido hasta recibir doce cubos. El equipo de cuatro y el trabajador individual completaron el mismo pedido. Los ensayos focalizados cubren ocupación de salidas, pausa, reconfiguración, intervención manual, energía y recarga desde otra instancia. [Hitos, capturas y mediciones](mediciones/galpon-20261126/README.md).

El acceso local por `#galpon`, la descarga de los recursos, la apertura de la tableta y la continuación tras recargar se probaron con el servidor PowerShell 7.4.19 en Linux y Chromium. El archivo CMD utiliza Windows PowerShell 5.1. Su apertura desde el Explorador de Windows queda pendiente de prueba en Windows.

## Continuar con el bloque B

La segunda parte se abre en **P → Galpón → Continuar · brazo y energía**, desde el guardado que ya alcanzó **Primer ciclo completado**. Reutiliza el mismo equipo, los recursos realmente presentes, las familias y sus miembros, los ocho tramos que el jugador montó, la energía restante y el crédito de los doce orígenes únicos. Un trabajador adicional, la reserva restante de materia y la carga de cada pieza dependen de lo que hizo el jugador. [Instrucciones del bloque B](GALPON_CADENA_ROTORES.md).

| Componente | Contrato que recibe la segunda parte |
| --- | --- |
| Fuente y convertidor | Una extracción registrada aporta 1 u de materia base. El convertidor fabrica un cubo de esa procedencia. Un compañero ocupa una plaza. |
| Conformador | 1 cubo entero de 1 u pasa a 1 enganche de 1 u. Mantiene identidad y carga, y cobra el proceso a la instalación. |
| Plano de recta | 18 cubos y 12 enganches por tramo. Sobre bancada, ocho rectas incorporan 144 cubos y 96 enganches. La versión con patas añade cuatro cubos por tramo. |
| Calor | El primer pedido utiliza el umbral manipulable. El segundo enfriador de B alcanza el umbral estabilizado para el láser y la ensambladora. El calor y la carga eléctrica se guardan por separado. |
| Destino | Una unidad acredita una vez tras el recorrido físico válido y el enfriamiento. El crédito persiste al retirar la familia o reconfigurar después sus piezas. |
| Escena | El menú abre un prototipo independiente. Los planos del usuario, el banco y la campaña mantienen guardados propios. |

El encargo B añade un brazo de 18 cubos y 8 enganches, la fuente cableada, transporte QR, segundo enfriamiento, dos entradas y una ensambladora. Un cubo y las seis pirámides completas de otro cubo producen un rotor de dos enganches articulados. El pedido inicial es de cuatro tandas de veinte y la instalación sigue disponible después.
