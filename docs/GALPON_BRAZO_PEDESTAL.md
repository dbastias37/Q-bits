# Brazo del segundo frío al alimentador B

Medido el 26 de noviembre de 2026. Esta alternativa coloca el brazo nativo sobre una torre de cubos existentes. El enfriador, las dos bancadas de alimentación y la ensambladora conservan sus posiciones originales.

La prueba física completa tres recogidas, entregas y retornos a 60 y 120 Hz. Es un ensayo aislado: la producción inicial, la colocación del equipo vacío y las colas de entrada/salida se preparan como fixtures. El alimentador B permanece detenido para medir el ciclo del brazo. No acredita una partida completa ni el funcionamiento de esta alternativa durante las ochenta entregas.

## Material y colocación

| Elemento | Material del ensayo | Colocación o función |
| --- | --- | --- |
| Brazo nativo | 18 cubos y 8 enganches | Sus cuatro rotores y la pinza conservan los componentes del plano. |
| Torre independiente | 96 cubos de 9 cm, unidos en una retícula de 4 × 3 × 8 | Huella de 36 × 27 cm y altura de 72 cm; centro de la huella en X = 4,005 m, Z = −0,35 m. |
| Cable | 8 unidades de material en la prueba | Desde la fuente existente hasta la base del brazo, con el recorrido elevado a 1,4 m. No se ha buscado el mínimo de material de cable. |
| Fuente | La fuente existente de 240 W | Utiliza la misma reserva de la partida. |

La torre se construye con uniones normales entre los cubos. El brazo se apoya sobre ella como mecanismo independiente; su base no se suelda a la torre en esta receta. El primer pivote queda inicialmente en **(4,05; 0,945; −0,35) m**. Antes de iniciar, Cannon observa contacto entre la base y la torre. El anclaje normal del brazo mantiene el equipo durante el programa y la espera.

Los 96 cubos del soporte cuestan **2 112 J** en la fabricación del ensayo: extracción, conversión y carga técnica conservada. Esa cifra corresponde sólo al soporte; el brazo, el cable y los productos también utilizan materia y energía pagadas. Las coordenadas son una referencia de montaje del escenario, no un traslado de la carga durante su recorrido.

## Programa comprobado

1. Enseñar A sobre la tapa del cubo situado en el segundo enfriador, cerca de **X = 4,04 m, Z = 0,45 m**. El cubo descansa sobre la superficie de Y = 0,575 m; su cara superior queda cerca de Y = 0,665 m. Usar **4,5 cm** de separación para la pinza.
2. Enseñar B apuntando a los primeros rodillos del alimentador B, cerca de **X = 4,20 m, Z = −1,10 m**, con **18,5 cm** de separación sobre la superficie observada. La altura real de los rodillos cambia unos milímetros al asentarse, por lo que se enseña sobre la cara física.
3. Configurar los cuatro ejes a **12 rpm**, **4 N·m** y capacidad de **64 u**, y activar repetición. La carga de la prueba es un cubo de 1 u.
4. Iniciar con el soporte apoyado. El programa recoge la carga, rodea la baranda del enfriador con el planificador normal, suelta sobre B, regresa y espera con los motores apagados.

El fantasma de enseñanza comprueba cada postura. La prueba conserva también las colisiones del recorrido: no reduce la baranda, no atraviesa obstáculos y no desplaza cuerpos para completar un agarre. Un soporte de 54 cm permitió enseñar ambos extremos, pero el recorrido cargado se bloqueó en la baranda; la altura de 72 cm pertenece a la configuración que sí completó los ciclos.

Para medir la repetición, el ensayo introduce el siguiente cubo en el frío y retira el anterior de B únicamente cuando el brazo ya terminó su retorno y está esperando. Esa preparación explícita de las colas no equivale a abastecimiento autónomo. El programa permanece activo durante los tres ciclos y conserva el mismo mecanismo.

## Mediciones

| Resultado de tres ciclos completos | 60 Hz | 120 Hz |
| --- | ---: | ---: |
| Tiempo, incluidos los retornos | 53,80 s | 51,42 s |
| Débito total de la fuente durante el ensayo | 2 456,03 J | 2 242,29 J |
| Transporte del brazo y pinza | 2 450,03 J | 2 236,29 J |
| Tratamiento mínimo del segundo frío | 6,00 J | 6,00 J |
| Transporte medio por ciclo | 816,68 J | 745,43 J |
| Pico conjunto medido de los motores | 163,76 W | 207,00 W |

Los IDs y las masas se conservan, la carga interna de los ocho enganches y la pinza no cambia y todas las bancadas mantienen sus posiciones. El registro contable valida el débito de la fuente. El soporte recibe contacto físico antes del primer ciclo; al terminar el tercero, el brazo continúa en espera con su anclaje y los cuatro motores apagados.

El dron del trayecto mesa–frío consumió **200,79 J en tres ciclos** en su ensayo, además de los 6 J de frío. Son rutas y mecanismos diferentes. El brazo sobre torre es una alternativa física más rápida en esta medición aislada, con un gasto eléctrico mucho mayor. Su consumo no se utiliza para prometer que la reserva de 180 000 J alcance para sustituir el transporte del pedido completo.

Como comparación de presupuesto, 160 transferencias a los costes medidos del brazo gastarían unos **119–131 kJ**. Los 160 vuelos del frío a las entradas usan 12 kJ en la proyección a 75 J por vuelo. Sustituirlos añadiría **107–119 kJ**, además del soporte y del segundo brazo. Este cálculo tampoco acredita que la misma torre pueda alternar entre A y B: el programa comprobado entrega sólo en B. No existe una medición con otro perfil de par, rpm o poses de esta torre que resuelva esa diferencia; reducir esos parámetros sin comprobar el esfuerzo y la trayectoria no permite afirmar un ahorro utilizable.

## Reproducción y alcance

Ejecutar:

```sh
node --test tests/galpon-chain-arm-pedestal.test.cjs
```

La [prueba de Cannon](../tests/galpon-chain-arm-pedestal.test.cjs) verifica los tres ciclos a ambas frecuencias, contacto del soporte, recepción sobre B, retorno a espera, identidades, masa, carga y contabilidad. El [registro de mediciones](mediciones/galpon-cadena-20261126/brazo-pedestal.json) conserva el desglose y cada ciclo. El [balance general](GALPON_ECONOMIA.md) distingue las mediciones de componentes de la proyección de ochenta rotores.

No se ha certificado esta construcción mediante una sesión manual en navegador ni su combinación prolongada con el alimentador en marcha y la flota de drones. El ensayo original de ochenta productos con alimentación preparada y la corrida integrada desde A mantienen sus propios alcances; esta prueba no los sustituye.

### Límite observado hacia la entrada A

La comprobación adicional hacia A no completó una entrega. Se examinaron alturas de 54, 63 y 72 cm en posiciones derivadas de los dos puntos de servicio, manteniendo las bancadas. La disposición de 63 cm —84 cubos— permitió enseñar ambas poses y recoger físicamente una carga desde la zona libre próxima al borde izquierdo del enfriador. Durante el barrido cargado hacia A, la predicción de colisión encontró la bancada original del brazo de recepción, centrada en `(2,59; 0,610; −0,665) m`. El controlador conservó la carga y detuvo los motores.

Girar inicialmente 180° el equipo vacío sobre la misma torre tampoco resolvió el recorrido: tras 40 s no hubo entrega ni retorno completo. No se modificaron fuerzas, alcance, colisiones o soportes para aceptar la postura. El [diagnóstico de A](mediciones/galpon-cadena-20261126/brazo-a-limite.json) conserva las posiciones, la obstrucción y ambos registros. Esta limitación se distingue de los tres ciclos completos del brazo hacia B y de los transportes de dron comprobados hacia ambas entradas; enseñar una pose y cerrar el agarre no acredita la alternativa hacia A.
