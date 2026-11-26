# Diagnóstico de toma con giro acumulado

Esta evidencia registra una inspección de **sólo lectura**, anterior al vuelo físico con un objetivo corregido. Parte de la instalación real detenida con **60 / 80 recibos**, a los **13513,200 s** y con **43798,022655 J**. El receptor 295 seguía en espera; el cubo 902 estaba sobre la mesa, en `(3,016869; 0,619993; −0,295923)`, y la comprobación de toma devolvía «Sin objeto».

`checkpoint-60.json` conserva esa partida. `pickup-readonly.json` contiene las medidas y cada orientación fallida del barrido. `probe.cjs` conserva la sonda original; carga el guardado con el arnés de Cannon, añade funciones de consulta y no avanza el reloj. `manifest.json` fija los hashes de los tres archivos y de la versión de `game.js` inspeccionada.

## Causa medida

El dron había acumulado **66,917081°** de giro horizontal frente a los **−0,003498°** de la enseñanza; su inclinación era sólo **0,000015°**. La pinza está desplazada 21,6 mm respecto al centro del cuerpo. Llevar ese centro al punto fijo de la ruta, manteniendo la orientación física actual, dejaba la cara naranja **13,137 mm más lejos en X y 19,883 mm más lejos en Z** que la cara enseñada.

El centro calculado directamente de las partes serializadas coincide exactamente con el cargado: `(4,006536520378516; 0,14455995105600608; −0,26035355291852225)`. La diferencia es `(0; 0; 0)`: este fallo no viene de un desplazamiento del centro al restaurar.

| Consulta sobre el mismo cubo, sin mover cuerpos | Resultado | Rayos nativos que alcanzan el cubo |
| --- | --- | ---: |
| Objetivo de centro fijo, orientación actual | Sin objeto | 0 de 9 |
| Pose y orientación enseñadas | Cubo 902 al alcance | 2 de 9 |
| Centro de herramienta enseñado, orientación actual | Cubo 902 al alcance | 3 de 9 |
| Cara enseñada, orientación actual | Cubo 902 al alcance | 3 de 9 |
| Posición original, orientación enseñada | Cubo 902 al alcance | 1 de 9 |

La rotación afecta tanto al desplazamiento entre centro y herramienta como a la orientación del cuadrado de contacto. Conservar la cara enseñada funciona aquí sin restaurar artificialmente el giro: la consulta sigue usando la orientación actual y los nueve rayos originales. La distancia medida al cubo es **25,0068 mm**, dentro del alcance nativo de 50 mm.

## Objetivo geométrico evaluado

Para este dron de un solo cuerpo rígido, sea `r` el vector local desde el centro del cuerpo hasta el centro de la cara naranja. Con la posición y orientación enseñadas se obtiene `F = C_enseñado + Q_enseñada · r`. El centro objetivo compatible con la orientación física actual es `C_objetivo = F − Q_actual · r`.

La sonda evalúa ese objetivo sin aplicarlo a ningún cuerpo. Su corrección frente al objetivo original es `(−13,137; +0,024; −19,883)` mm. El chasis trasladado virtualmente está libre y el detector exacto del volumen de giro de la hélice no encuentra obstrucciones en esa pose.

El barrido añade giros virtuales de 0 a 359° a la orientación existente. El objetivo de centro fijo falla en **213 de 360** orientaciones; conservar la cara enseñada con cada orientación actual falla en **0 de 360**. Los gaps del segundo caso quedan entre **25,00675 y 25,00694 mm**. Ningún giro se escribe en el mundo.

## Alcance y límites

La sonda verifica que el tiempo, el saldo exterior, las poses de todos los cuerpos, los registros de producción, las identidades activas y sus cargas internas permanecen exactamente iguales. No aumenta el alcance ni cambia rayos, colisiones, fuerzas o torque. Tampoco acredita una entrega ni ejecuta un vuelo.

El barrido demuestra esta toma con **pinza inferior, un cuerpo rígido y el cubo observado**. No certifica cualquier orientación de una pinza frontal, una geometría articulada ni toda la trayectoria de aproximación. Una herramienta frontal que gire en sentido inadecuado debe seguir rechazándose mediante la comprobación nativa. La continuación física y sus regresiones se registran aparte después de implementar el ajuste del objetivo.
