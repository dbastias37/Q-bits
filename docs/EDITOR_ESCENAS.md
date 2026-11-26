# Editor de escenas · integración inicial (26-11-2026)

## Objetivo

El menú principal ofrece **Editor de escenas** junto a Campaña y Banco de pruebas. El montaje se realiza en el banco 3D existente: no se inventan máquinas ni cuerpos decorativos, y se conservan los controles nativos de creación, selección, rotación, blueprint y configuración. Es un **modo de autoría basado en el banco**, no un tercer motor gráfico ni un nuevo simulador.

## Uso

1. En el menú principal selecciona **Editor de escenas** y **Nueva escena en el banco**.
2. En la selección nativa del banco elige **Nueva**. Coloca y configura las piezas con los controles habituales.
3. Abre **Esc → Guardar partida** para registrar el estado físico actual. Después utiliza la barra **Capturar y guardar escena**. Se genera un archivo de autoría independiente de la ranura de partida del banco.
4. Pulsa **Códigos / Exportar** para consultar el inventario, copiar su resumen, copiar el código completo o descargar el archivo `.qbits-scene.json`.
5. En otra sesión, importa ese archivo o pega el código completo `QBSCENE1:...`. La opción **Continuar escena guardada** instala temporalmente ese estado en el banco y abre la selección nativa; elige **Continuar**.
6. Al regresar al menú o cerrar la pestaña, el editor recupera la ranura de banco anterior. La campaña no utiliza ni acepta el archivo de escena.

**Importante:** el botón de captura usa el último guardado válido del banco. Debes guardar desde Esc inmediatamente antes de capturar; no se presenta una captura antigua como una lectura instantánea de la escena activa.

## Contrato del archivo

Formato `qbits-scene`, versión 1. Contiene nombre, notas, resumen de piezas y componentes, datos completos del guardado nativo de banco y el código `QBSC1-XXXXXXXXXXXXXXXX`. El resumen es informativo; todas las posiciones, orientaciones, estados energéticos, configuraciones, conexiones, familias y mecanismos admitidos por el guardado nativo se obtienen del campo `data`, no se reconstruyen desde un listado superficial.

Un archivo importado se valida con `QBitsSavedGames.validate('lab', ...)`, conserva límites de tamaño (8 MiB) y se comprueba contra un checksum estable de 64 bits. El checksum **no es una firma criptográfica** y no demuestra autoría. Identifica cambios accidentales y permite asociar una versión de la escena con la conversación. Para reconstruirla se requiere el archivo completo o el texto largo `QBSCENE1:`; un identificador corto no puede contener toda la información espacial y física.

El código largo es una representación Base64 URL de los datos completos. El resumen incluye piezas, formas, componentes marcados por configuraciones y subsistemas detectados. Para revisarlo aquí, adjunta preferentemente el archivo: el código largo de una escena compleja puede superar el límite de texto de algunos chats.

## Integración de seguridad

- Se usa `qbits.editor.scene.v1` para la escena; las ranuras `qbits.save.lab.v1` y `qbits.save.campaign.v1` no son el destino permanente de los archivos.
- La ranura de banco anterior se conserva temporalmente en `sessionStorage` mientras el editor utiliza el banco. Cuando el usuario vuelve al menú o abandona la página, se restaura el contenido original.
- Un archivo inválido se rechaza antes de reemplazar la escena almacenada. La importación no añade recursos a una partida en campaña o galpón.
- La exportación descarga JSON localmente sin hacer ninguna petición a un servidor; el texto copiado permanece bajo control del usuario.
- Los límites del navegador (almacenamiento o permiso de portapapeles) se informan como errores; el guardado independiente no sustituye un respaldo descargado.

## Límites y siguiente bloque

Esta primera integración **no es aún un editor profesional completo de niveles**: usa la geometría y el espacio iniciales del banco, no tiene un catálogo nuevo de objetos de escenario ni creación arbitraria de terreno, no permite colocar puntos de misión con identificadores propios ni convierte el archivo en una misión de campaña con condiciones de victoria. Tampoco se ha cambiado el galpón A/B, que sigue en su rama separada. La entrada **Nueva** utiliza el procedimiento nativo del banco y, por tanto, hereda cualquier dotación inicial que ese modo proporcione.

Para el siguiente bloque deben implementarse estaciones como blueprints hechos con piezas, vínculos semánticos estables de entrada/salida, marcado de aparición, validación de presupuesto de material y el conversor escena→misión. La futura importación de escenas de gran tamaño requiere un flujo de archivos en lugar de únicamente Web Storage.

## Pruebas

`node --test tests/scene-files.test.cjs` cubre ida y vuelta del formato, checksum, importación alterada, aislamiento de ranuras y estabilidad frente al orden de claves. Las comprobaciones de sintaxis y la verificación de empaquetado se pueden ejecutar por separado. **No se afirma una prueba completa en Chromium ni la suite del juego en este entorno**, que sólo dispone del código obtenido mediante el conector de GitHub.

La rama `main` mantiene las modificaciones aisladas en módulos nuevos y el registro de sus scripts en `index.html`.
