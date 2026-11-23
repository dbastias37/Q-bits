# Tablet 2.0 · preparación para integrar

**Estado: diseño del puente; no integrado en el juego principal.** Esta carpeta no se importa desde `index.html`, no reemplaza `#panel` y no modifica controles, Cannon, guardados reales ni parámetros de la simulación. La [auditoría](AUDITORIA.md) identifica las capacidades y fuentes sobre `main@e02afe3d1bd9a0d116c5c915e5efc960caa5a26a`.

## 1. Frontera que debe conservarse

La demostración mantiene su propio estado y sus propios datos de ejemplo. Las funciones de `game.js` están dentro de una IIFE: no existe hoy `window.startRoute`, `window.configureRotor` ni un evento público `selectionchange`. Los nombres de mensajes y snapshots que siguen son una **propuesta de contrato**, no una API existente ni una integración ya probada.

El juego debe continuar siendo el único dueño de cuerpos, selección canónica, uniones, trayectorias, energía y persistencia. La tableta solicita acciones y muestra su resultado. La miniatura no es otro mundo físico; usa IDs y transformaciones de visualización.

Recursos existentes que la demo consume o consulta se tratan como **sólo lectura**: fuentes, `tablet-model.js`, `tablet-view.js`, límites/validadores de `rotor-power.js` y `propeller-power.js`. No se deben copiar y evolucionar sus límites en paralelo sin una prueba contra la fuente original. No cargar `cannon.min.js` ni `game.js` para dibujar una miniatura.

## 2. Contrato mínimo propuesto

```js
// Propuesta para una PR posterior, dentro de la IIFE que posee el estado real.
// No está instalada por Tablet 2.0.
const tabletBridge = {
  readSnapshot(),       // datos planos y revisiones; no objetos CANNON
  dispatch(command),    // {ok, reason?, revision}; usa controladores actuales
  subscribe(listener), // devuelve unsubscribe; sólo cambios relevantes
};
```

El snapshot debería incluir `revision`, `selectionRevision`, IDs de pieza/grupo/mecanismo/familia, tipo de controlador, nombre, selección, geometría/transformaciones simplificadas, estado de marcha, parámetros exactos, restricciones y capacidades disponibles. Cada parámetro debe aportar unidad, mínimo, máximo, paso y valor o estado `mixed`. Una acción no disponible debe aportar una razón breve ya derivada de la lógica real.

No transferir cuerpos físicos, constraints, funciones o inventarios completos de familias a la UI. Una familia visible sólo requiere identidad, pose, nombre, color, cantidad y acciones; retirar contenido sigue materializándolo dentro del controlador original cuando se confirma una colocación válida.

`dispatch` revalida selección y revisión al ejecutar. Una pieza puede haber desaparecido, estar activa o haber cambiado de propietario desde el último render. Ante rechazo, conservar el mundo y refrescar la interfaz, sin intentar aplicar parcialmente una orden.

## 3. Correspondencia de comandos

| Intención de interfaz | Funciones originales que debe usar el puente | Condiciones de implementación |
|---|---|---|
| Seleccionar pieza | La misma transición de `selected`, `multiSelection`, `clearRotorSelection` que `onCanvasMouseDown` | Extraer una función compartida en una PR posterior; no simular un clic ni hacer otro raycast de física. IDs vivos antes de aplicar. |
| Seleccionar conjunto rotor | `selectRotorSet` / `toggleRotorSelection` | No seleccionar sólo un cuerpo del mecanismo por accidente. |
| Deseleccionar | `clearSelection` | Debe limpiar también estados asociados del sistema actual. |
| Mover/tomar | `takeSelection` o `takeFamily` | Conserva mano física, alcance y carga; la tableta se guarda cuando el gesto lo necesite. |
| Girar/colocar | Entrada a manipulación existente / `beginCreationPlacement` / `beginBlueprintPlacement` / `beginFamilyPlacement` | Mantener rueda, Shift, confirmación/cancelación y guías actuales. |
| Agrupar familia | `editFamily` → `startFamilyGrouping` | Preservar trabajo cooperativo por pasos y cancelación antes de transferencia. |
| Desagrupar familia | `beginFamilyPlacement(f,'withdraw',f.items.length)` | No reconstruir inventario en el render de la tableta. |
| Separar | `detachPart`, `detachConveyorModule` o `disconnectRotor` según selección | Nombre de botón acorde con lo que va a separarse. |
| Duplicar | `duplicateSelection` / `duplicateMechanism` | Todas sus restricciones originales y copias de batería vacías. |
| Borrar | `deleteQubit` / controlador de cuerpo | Mantener las protecciones de escena. |
| Crear/renombrar/disolver conjunto | `createRotorSet`, `renameRotorSet`, `dissolveRotorSet` | Sólo agrupa referencias a motores; no toca uniones. |
| Rotor: iniciar/detener/invertir/ajustar | `runRotorControls`, `configureRotorSet`, `configureRotor` | Seleccionar controlador propietario antes de usar esta vía; no sirve para iniciar brazos/cintas/servos. |
| Servo: configurar/iniciar/detener | `configureServo`, `startServo`, acción de `QBitsServoPanel` | Respetar detenido para editar; `speed` en °/s y validación completa de límites/target. |
| Marcha de conjunto servo | `servoMarchAction`, `startServoMarch`, `stopServoMarch` | Conservar fase por articulación y la lógica de apoyos existente. |
| Reiniciar | `restartSelection` / `restartMechanism` | Recuperar pose/órdenes iniciales, no settings iniciales ni batería llena. |
| Batería | `toggleExternalBattery` | Cambio de alimentación detiene motores como ahora. |
| Sensor | `linkContactSensor`, `unlinkContactSensor` y misma actualización validada de `sensorConfig` | Respetar destinos vivos, distancia y `sensorCanReverse`. |
| Brazo | Callbacks reales de `QBitsRobotArmPanel` a `startRobotArm` / `stopRobotArm` / funciones de poses | Mantener secuencia y filtros; no accionar cada motor por detrás del secuenciador. |
| Cinta | `startConveyorLine`, `stopConveyor`, `configureConveyor` | Detener tramo y detener línea no son equivalentes; etiquetar con precisión. |
| Vuelo | `configureFlight`, `startFlight`, `requestFlightLanding`, `stopFlight` | Aterrizar usa energía para descenso; apagar corta sustentación. |
| Ruta terrestre | `startRoute(g,goal)` o `moveTeamTo(team,goal)`; `stopRoute` | No escribir `route.steps`, `preview`, `segment` ni posición del cuerpo. |
| Ruta de vuelo | `QBitsPropellerPower.validConfig({...flightConfig(f),route})`, después `configureFlight(f,{route})` | Misma validación que `editFlightRoute`; bloquear edición activo; máximo 48. |
| Poses del brazo | Controladores originales de `#arm-pose-*`, `#arm-teach-*`, `#arm-goto-*` | IDs `home/pick/place`; representación diferenciada de puntos del dron. |
| Mesa | `workshopPanelSnapshot`, `workshopPanelInspect`, `workshopPanelApply` | Ya proporcionan un buen patrón de preview/aplicar; revalidan pieza y cercanía de mesa. |
| Forma/mecanismo | `saveShape`, `saveMechanism`, import/export actuales | Mantener formatos y política de reemplazo. |
| Partida | `saveCurrentGame({manual:true})`, `continueSavedGame` | Mantener `bankSaveBlocked`, capturas diferidas, validación y checkpoints. |

## 4. Presets sin perder precisión

Los valores del modelo original son la fuente de verdad. Cada botón de preset genera un único patch explícito; abrir el panel o seleccionar otro objeto no genera patches. Leer un valor ajeno a los presets produce `Personalizado`. Selecciones heterogéneas producen `Varios` hasta una elección explícita.

```js
// Ejemplo de intención, no de llamada global actualmente disponible.
{ type: 'rotor.configure', ids: [rotorId], patch: { rpm: 30 } }
{ type: 'rotor.configure', ids: [rotorId], patch: { maxTorque: 3.2 } }
{ type: 'servo.configure', id: servoId, patch: { speed: 45 } }
```

La fuerza antigua 320 equivale exactamente a torque 3,2 N·m: no hay dos variables independientes. No cambiar `capacity` al modificar fuerza. No aplicar rpm a un servo, ni velocidad/fuerza a batería o pieza normal. Conservar cap de campaña, restricciones de ensayo, reducciones del brazo, bloqueos durante marcha y valores individuales de cada instancia. El catálogo de servos tiene defaults diferentes de una unión manual; se leen de la selección.

## 5. Recorridos compatibles

La edición visual de vuelo crea una copia del array original, cambia coordenadas de un punto o elimina un elemento y valida **la configuración completa** antes de aplicar. El resultado conserva `loop`, X/Z relativos al despegue, altura, acción y espera. No añade unidades, metadatos de render ni coordenadas de pantalla al archivo real. No ofrece reordenación como capacidad original.

En suelo, una representación del trayecto es una lectura de `preview` y del objetivo. Un arrastre del destino debe solicitar `startRoute`; los puntos calculados siguen sin ser editables. El brazo representa home/A/B y conserva el orden del secuenciador. La tableta escucha cambios que vengan del mundo: no guarda una segunda versión autónoma de esos recorridos.

## 6. Sincronización y rendimiento

- Emitir notificaciones cuando cambia selección, topología, configuración o biblioteca. No recalcular topología ni selección cada frame para decidir qué panel mostrar.
- Cachear geometría por identidad/revisión y compartir mallas/materiales entre piezas. La miniatura requiere sólo transformaciones de vista; no cuerpos ni constraints adicionales.
- Separar datos estáticos de telemetría. Un movimiento activo puede requerir frames de animación; un panel detenido no necesita un bucle permanente.
- Limitar las actualizaciones de lecturas de marcha al ritmo de legibilidad elegido, sin reducir la frecuencia ni alterar la física del juego. No convertir un throttle visual en throttle de simulación.
- Al cerrar: cancelar `requestAnimationFrame`, suscripciones, observadores y listeners del visor; liberar buffers/contexto del prototipo según su propietario. No eliminar recursos compartidos del juego.
- Reabrir debe reconstruir desde un snapshot vivo, conservar preferencias y devolver el foco de forma predecible.
- Medir tiempo de render/update de UI por separado de Cannon. Las cifras de la demo no son FPS del juego ni un porcentaje de ahorro global de CPU.

## 7. Persistencia y datos de ejemplo

La demo usa un namespace de almacenamiento independiente. No escribe en `qbits.save.lab.v1`, `qbits.save.campaign.v1`, `qbits.shapes.v1`, `qbits.mechanisms.v1`, `qbits.workshop.v1` ni en preferencias del juego. Un guardado de ejemplo sólo se carga como ejemplo de Tablet 2.0; no debe ofrecerse como archivo de escena compatible sin un convertidor validado.

La integración futura debe dejar la escritura en las funciones existentes. Guardar una plantilla, guardar el banco, guardar campaña e introducir piezas en una familia son cuatro operaciones distintas. El diseño puede reunir accesos, pero debe mantener sus tipos y sus confirmaciones/restricciones actuales.

## 8. Verificación que exige una PR de integración posterior

1. Mundo y tableta seleccionan el mismo ID. Cambiar selección por teclado/mouse mantiene los controles de siempre.
2. Todo gesto de tomar, girar, colocar, unir y separar pasa por su controlador actual y conserva cuerpos, colisiones, masa e inercia.
3. Una orden de rotor no inicia el motor interno de un brazo/cinta/servo por fuera de su secuenciador. Energía insuficiente, sobrecarga y bloqueo devuelven el mismo resultado.
4. Reiniciar recupera el mismo checkpoint de ejecución y conserva energía y ajustes.
5. Cargar valores personalizados no los redondea. Presets afectan sólo el campo elegido; selecciones mixtas no reciben valores al abrir la UI.
6. Las rutas de vuelo pasan `validConfig`; rutas de suelo y poses de brazo usan sus controladores originales y se reflejan tras cambios en el mundo.
7. Importar/exportar y guardar escena producen los formatos originales; un fallo conserva la versión previa. La campaña sigue siendo checkpoint por nivel.
8. Abrir/cerrar varias veces no incrementa cuerpos/constraints, listeners o memoria de buffers sin límite. En reposo no se acumulan frames de miniatura.
9. Verificar visualmente escritorio, ventana pequeña y móvil; probar foco, zoom del navegador, texto español, `prefers-reduced-motion`, arrastre, escala y restauración.

La demo de esta PR valida la nueva interfaz de forma aislada. Estas comprobaciones de equivalencia del juego quedan expresamente pendientes de una integración autorizada; no se presentan como realizadas por haber probado botones o un modelo de datos de demostración.
