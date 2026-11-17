# Q-bits · Cables y depósito de energía

Estas herramientas están disponibles en el banco de pruebas. Un cable conduce energía entre baterías y mecanismos separados: no necesita positivo/negativo, no pierde energía y no une físicamente sus extremos. El depósito queda apoyado en el piso; su peso no se suma a la máquina que alimenta.

## Primera conexión

1. Entra al banco. Mantén **Q**, pulsa **Tab** para abrir **Banco rápido**, elige **Depósito de energía**, suelta Q y haz clic. Aparece delante de ti, en un lugar libre del suelo, con **12.000 J** y la salida apagada.
2. Crea cerca una máquina, por ejemplo **Cinta recta**, con el mismo catálogo. Déjala detenida.
3. Vuelve a **Q → Tab** y elige **Cable · 4 cubos**. Suelta Q y haz clic: aparecen los cuatro cubos y comienza el tendido. Todavía no se consumen.
4. Apunta al depósito y haz clic para fijar la **Salida**.
5. Si necesitas rodear algo, haz clic en el suelo o en una pared para colocar apoyos. Puedes caminar mientras lo haces. Si el camino directo por el piso está libre, pasa al siguiente paso.
6. Apunta a una pieza de la máquina y haz clic para fijar la **Entrada**. El cable baja al suelo, recorre los apoyos y sube hasta la entrada. Al aceptar la conexión, los cubos se convierten en la cinta conductora.
7. Clic derecho en el depósito → **Encender salida**. Después inicia la máquina desde sus propios controles. Conectar el cable no ordena arrancar.

El líquido verde muestra la carga disponible. Al apuntar cerca de los extremos aparecen **Entrada** o **Salida**; sobre el cable se muestran estado y longitud. El conductor usa el acabado de las rutas de los Q-bits: línea fina con halo y giros de circuito a 90°. Su color inicial es ámbar. En **Configuración → Apariencia → Color del cable eléctrico** puedes elegir cualquier color; **Grosor de trayectorias y cables** regula ambos. La vista previa muestra el resultado; pulsa Guardar para aplicarlo. El color se conserva por estilo visual, independientemente del color de la ruta de movimiento. Los cables inactivos se atenúan y sus terminales se marcan en rojo.

## Cuánto alcanza

| Material | Longitud disponible |
| --- | ---: |
| Un cubo con 0,5 u de materia | 1 m |
| Un cubo normal de 1 u | 2 m |
| Un cubo con 2 u de materia | 4 m |
| Cuatro cubos normales | 8 m |
| Ocho cubos normales | 16 m |

Cada unidad de material aporta **2 m**. El cálculo usa la suma de los pesos de los cubos y admite hasta **8 cubos por cable**. La longitud incluye bajadas, subidas, giros a 90° y desvíos; no es solo la distancia entre máquinas. En Banco rápido encontrarás paquetes de 1, 4 y 8 cubos normales, además de cables de 1 y 4 m con distinta reserva de materia.

También puedes usar tus cubos existentes: selecciona de 1 a 8 cubos normales, sueltos o unidos, y abre su menú con clic derecho → **Desenrollar como cable**. Deben estar libres, sin baterías, sensores, agarres ni otras adaptaciones. Sus identidades, nombres, pesos y carga se conservan dentro del cable.

## Corregir el tendido

- **Clic derecho** retira el último apoyo. Si no hay apoyos, cancela el tendido.
- **Esc** cancela. Los cubos siguen disponibles; un cable que estabas cambiando conserva su conexión anterior.
- Si falta longitud o el recorrido atraviesa un obstáculo, no se consume material. Corrige el camino o cancela para preparar más cubos.
- Puedes marcar hasta **12 apoyos** manuales. Los cambios entre suelo y pared añaden las esquinas necesarias. La previsualización usa el mismo recorrido que se confirma. Los cables de partidas anteriores conservan su trazado y longitud; usa Prolongar / cambiar entrada si quieres volver a tenderlos con giros de circuito.

## Alargar un cable

1. Deja un cubo normal, o un conjunto de cubos normales unidos, a menos de **3 m de la Entrada** del cable.
2. Apunta al conductor y haz clic derecho → **Añadir cubos cercanos**. La acción incorpora el conjunto válido más cercano. Puedes repetir hasta llegar a 8 cubos en total.
3. Para llevarlo más lejos o cambiar de máquina, abre el menú del conductor → **Prolongar / cambiar entrada**. Marca los nuevos apoyos y haz clic en la nueva máquina. La salida original se mantiene.

Si mueves una máquina más allá del alcance disponible, el cable queda inactivo y lo indica. Acerca la máquina o añade material. El cable no tira físicamente de ella. Un rotor sin una fuente externa activa puede usar sus reservas internas; revisa su estado si esperabas que se detuviera al desconectar.

## Ver conexiones y recuperar cubos

Mantén **Alt** para destacar el tendido y las conexiones internas de los mecanismos conectados. Al soltarlo, vuelven a ocultarse las conexiones internas; el cable exterior permanece visible. Con una red eléctrica presente, **Alt + X** conserva el acceso a separar piezas. Si cambiaste los controles, revisa la acción **Inspeccionar / separar** en Configuración.

Clic derecho en el conductor → **Recoger cable y recuperar cubos**. Los cubos reaparecen delante de ti con sus identidades y carga original. Necesitas espacio libre y plazas disponibles dentro del límite de piezas de la sala; si no caben, el cable se conserva completo.

## Energía y varios depósitos

Puedes conectar varias máquinas y varios depósitos. Las fuentes encendidas de una misma red comparten su energía; un circuito con varios caminos no duplica la carga ni el consumo. El cable no gasta julios por sí mismo: los gastan los motores, las bandas, los agarres y las demás herramientas activas.

Cada depósito almacena hasta **12.000 J**. Su duración depende de las máquinas conectadas, su carga y el trabajo que realizan. Un depósito vacío y encendido mantiene la red sin energía; los motores no cambian automáticamente a sus reservas internas mientras siga siendo su fuente activa.

Para recargarlo en este banco: clic derecho → **Apagar salida** → **Recargar · banco de pruebas**. Es una recarga manual e instantánea de prueba, disponible únicamente con la salida apagada. El depósito no se recarga solo por estar en el suelo.

La sala admite hasta **12 depósitos** y **128 cables**. Para retirar un depósito, recoge primero los cables conectados. Al salir hacia otra escena y volver al banco se conservan depósito, carga, conexiones y material de los cables. El tendido que todavía no habías confirmado se cancela conservando sus cubos.
