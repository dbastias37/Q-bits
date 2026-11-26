# Editor de escenas · integración inicial (26-11-2026)

## Objetivo

El menú principal ofrece **Editor de escenas** junto a Campaña y Banco de pruebas. El montaje se realiza en el banco 3D existente: no se inventan máquinas ni cuerpos decorativos, y se conservan los controles nativos de creación, selección, rotación, blueprint y configuración. Es un **modo de autoría basado en el banco**, no un tercer motor gráfico ni un nuevo simulador.

## Uso actualizado · motor nativo de autoría

1. En el menú principal selecciona **Editor de escenas → Nueva escena vacía**. El motor entra directamente en la sala con **cero piezas, cero cargas y sin mesa de trabajo preinstalada**. No se abre el selector de partidas normales.
2. Presiona **F8** para desplegar el catálogo lateral. Selecciona un elemento y pulsa **Colocar con la mira en 3D**. La vista previa aparece en el mundo sin crear todavía ninguna pieza física. Camina y mira a una superficie: **azul indica colocación válida y rojo indica posición bloqueada**.
3. **Rueda del ratón** gira el fantasma en pasos de 90°; **Shift + rueda** permite giro libre; **Shift** al apuntar al suelo ajusta a la cuadrícula. **Clic izquierdo** confirma una colocación real y mantiene la herramienta para colocar más. **Clic derecho o Esc** cancela. Cuando termines, pulsa **Guardar montaje** en la barra del editor. Esta operación consulta directamente el mundo físico y sus configuraciones, verifica el resultado y lo guarda en la biblioteca independiente. **No necesitas abrir Esc ni guardar la partida del banco.**
4. En **Códigos / Exportar** puedes seleccionar versiones, editar marcadores, copiar el inventario, copiar el código completo o descargar un archivo `.qbits-scene.json`.
5. Para recuperar un diseño elige **Continuar escena guardada**. El motor descarta la instancia anterior y restaura exactamente los cuerpos, configuraciones y material persistido por el formato del banco.
6. Para trasladar escenas entre equipos importa el archivo o pega el código completo `QBSCENE1:...`.

La sesión de edición **no escribe en la ranura nativa del banco**. Los autoguardados de banco se suspenden en autoría; salir al menú o ir a selección de nivel abandona el mundo del editor, preservando los guardados del banco y la campaña.

Además existe una **copia de recuperación automática cada 60 segundos** cuando el mundo está en estado capturable. Esta copia se almacena por separado en `qbits.editor.recovery.v1`. Desde el menú del editor, **Recuperar último borrador** valida esa versión y la incorpora a la biblioteca antes de volver a abrirla. Una operación de física no capturable no pisa la última copia correcta. La recuperación no sustituye una exportación a disco.

## Sala inicial y catálogo físico

La nueva escena reutiliza la sala blanca, cámara, física y controles del banco. Las herramientas de creación no alteran el sistema de piezas; no se inyectan máquinas industriales decorativas ni colores ajenos. La mesa nativa del banco **no aparece por defecto**.

El panel **Catálogo de construcción nativa** sólo selecciona la pieza o blueprint: **ya no hay campos de coordenadas para colocar objetos**. La sala utiliza la mira, rayos contra superficies, fantasma 3D con color de validez, giro y una confirmación mediante clic. El catálogo incluye:

- **Piezas:** Q-bit cúbico, pirámide, T-bit tetraédrico y enganche.
- **Blueprints físicos:** brazo robótico articulado, servo pivote, servo bisagra, hélice, dron con batería descargada y cintas rectas o de esquina izquierda/derecha.

Los blueprints no son mallas falsas: el motor ejecuta la ruta `spawnSavedMechanism` y reconstruye cuerpos, masa, enganches, articulaciones y controladores. El verificador de geometría comprueba límites de habitación, otras construcciones, suelo y espacio antes de aceptar la colocación. El creador puede rotar y cambiar los mecanismos después con los controles normales.

En modo autoría la materia se puede generar libremente para **diseñar**. Esto no autoriza el comando de creación de piezas en una misión ni acredita energía gratuita. La colocación de un blueprint grande agrega la cantidad real de partes al archivo y se refleja en su manifiesto. Sus baterías empiezan descargadas cuando así lo define la plantilla. No se ofrecen todavía estaciones industriales especiales que no existan como construcciones nativas válidas.

El editor no introduce aún una herramienta para crear geometría de suelo, diseñar edificios de varios tamaños ni un catálogo de estaciones industriales hechas completamente con planos de construcción. Esas estaciones deben tener recetas, puertos y capacidades reales antes de ponerse a disposición.

## Marcadores de diseño y vínculos

El editor permite marcar **inicio del jugador, origen de materia, destino, recepción, zona de trabajo y referencia visual**. Desde F8 eliges el nombre y la función y pulsas **Marcar en el mundo 3D**. Apuntas a una superficie y confirmas con clic; un indicador ligero muestra el lugar. Si el rayo apunta a una pieza, la marca se enlaza a su ID nativo. Cada marca tiene identidad única, posición guardada y función, puede editarse o retirarse y aparece también en el plano orientativo X/Z. No es necesario escribir coordenadas. El plano no sustituye una vista de ingeniería con las dimensiones reales de la sala.

Al usar un ID asociado, el archivo valida que ese ID exista entre las piezas físicas de la escena. Una exportación no puede acreditar un receptor cuyo objeto no existe. Los marcadores son **datos semánticos de autoría**; todavía no activan una misión, disparan un sensor ni mueven físicamente una máquina. La futura integración de reglas debe resolver los IDs de objetos y sus transformaciones en el motor.

El código corto identifica tanto el guardado de piezas como el conjunto de marcadores. Las escenas anteriores sin el campo `design` siguen siendo compatibles con esta versión de archivo.

## Principio de fabricación del nivel

No se crea un segundo catálogo de estructuras decorativas que aparente ser una fábrica. Los objetos jugables siguen siendo los grupos físicos, materiales y blueprints que admite el banco. Para añadir estaciones industriales faltantes primero habrá que implementar las recetas y puertos en el motor, y sólo después incorporarlas al catálogo de autoría. La edición no otorga masa ni energía a una partida de campaña. La construcción en el editor no impone todavía presupuesto inicial: el control estricto de cuota y la fabricación real son responsabilidad del modo misión.

## Contrato del archivo

Formato `qbits-scene`, versión 1. Contiene nombre, notas, resumen de piezas y componentes, datos completos del guardado nativo de banco y el código `QBSC1-XXXXXXXXXXXXXXXX`. El resumen es informativo; todas las posiciones, orientaciones, estados energéticos, configuraciones, conexiones, familias y mecanismos admitidos por el guardado nativo se obtienen del campo `data`, no se reconstruyen desde un listado superficial.

Un archivo importado se valida con `QBitsSavedGames.validate('lab', ...)`, conserva límites de tamaño (8 MiB) y se comprueba contra un checksum estable de 64 bits. El checksum **no es una firma criptográfica** y no demuestra autoría. Identifica cambios accidentales y permite asociar una versión de la escena con la conversación. Para reconstruirla se requiere el archivo completo o el texto largo `QBSCENE1:`; un identificador corto no puede contener toda la información espacial y física.

El código largo es una representación Base64 URL de los datos completos. El resumen incluye piezas, formas, grupos con sus identidades y posiciones, masa nominal, fracción de carga por pieza, componentes configurados y referencias de los mecanismos encontrados. No convierte fracciones de carga en julios ni deduce automáticamente recetas a partir de objetos sin tipado. Para revisarlo aquí, adjunta preferentemente el archivo: el código largo de una escena compleja puede superar el límite de texto de algunos chats.

## Integración de seguridad

- Se usan `qbits.editor.scene.v1` como selector, `qbits.editor.library.v1` como índice y `qbits.editor.document.<código>` para las versiones. La cantidad depende del espacio de almacenamiento disponible en el navegador; no equivale a una copia de seguridad. Las ranuras `qbits.save.lab.v1` y `qbits.save.campaign.v1` no son el destino permanente de los archivos.
- El motor no escribe la ranura del banco durante la edición. Las copias de autoría se guardan en su biblioteca propia. Un respaldo temporal de versiones antiguas se recupera una única vez si existe.
- Un archivo inválido se rechaza antes de reemplazar la escena almacenada. La importación no añade recursos a una partida en campaña o galpón.
- La exportación descarga JSON localmente sin hacer ninguna petición a un servidor; el texto copiado permanece bajo control del usuario.
- Los límites del navegador (almacenamiento o permiso de portapapeles) se informan como errores; el guardado independiente no sustituye un respaldo descargado.

## Límites y siguiente bloque

Esta primera integración **no es aún un editor profesional completo de niveles**: usa la geometría y el espacio iniciales del banco, no tiene un catálogo nuevo de objetos de escenario ni creación arbitraria de terreno; las marcas de misión existen como datos verificables, pero todavía no ejecutan objetivos, activadores o condiciones de victoria. La escena vacía se crea directamente en el motor y su captura no requiere un guardado previo. Tampoco se ha cambiado el galpón A/B, que sigue en su rama separada. La entrada **Nueva** utiliza el procedimiento nativo del banco y, por tanto, hereda cualquier dotación inicial que ese modo proporcione.

Para el siguiente bloque deben implementarse estaciones como blueprints hechos con piezas, puertos semánticos de entrada/salida, colocación visual directa de marcadores en 3D, validación de presupuesto de material y el conversor escena→misión. Los marcadores actuales documentan posiciones y referencias a identidades nativas, sin gobernar aún la lógica del nivel. La futura importación de escenas de gran tamaño requiere un flujo de archivos en lugar de únicamente Web Storage.

## Pruebas

`node --test tests/scene-files.test.cjs` cubre ida y vuelta del formato, checksum, importación alterada, aislamiento de ranuras y estabilidad frente al orden de claves. Las comprobaciones de sintaxis y la verificación de empaquetado se pueden ejecutar por separado. **No se afirma una prueba completa en Chromium ni la suite del juego en este entorno**, que sólo dispone del código obtenido mediante el conector de GitHub.

Las pruebas nuevas de autoría están en `tests/scene-authoring.test.cjs` y `tests/scene-editor-native.test.cjs`. Comprueban el formato real de guardado vacío, referencias de marcador, retrocompatibilidad e integridad. Su ejecución en la suite completa y una sesión gráfica siguen pendientes de certificación. La rama `main` mantiene las modificaciones aisladas en módulos nuevos y el registro de sus scripts en `index.html`.
