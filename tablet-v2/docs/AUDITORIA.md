# Tablet 2.0 · auditoría de la interfaz original

Base inspeccionada: [`e02afe3d1bd9a0d116c5c915e5efc960caa5a26a`](https://github.com/dbastias37/Q-bits/commit/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a), `main`, 23 de noviembre de 2026. Esta auditoría corresponde al código de esa revisión, no a una deducción a partir de capturas antiguas.

## Alcance y frontera del prototipo

La carpeta `tablet-v2/` contiene una demostración independiente. El juego original no la importa. La demo permite evaluar distribución, selección visual y estados; no certifica física, consumo, colisiones, carga admisible o marcha de una construcción. La ubicación propuesta de una capacidad en esta matriz tampoco significa que su controlador de juego esté conectado: la conexión se describe en [INTEGRACION.md](INTEGRACION.md) y requiere una etapa posterior.

No se deben confundir tres operaciones que ya tienen significados diferentes:

- **Estructura física:** piezas unidas dentro de un cuerpo o mecanismo articulado. Separar modifica las uniones mediante los controladores existentes.
- **Conjunto de rotores:** nombre y referencias a motores para enviarles órdenes coordinadas. Disolver el conjunto no desmonta los cuerpos ni borra ajustes.
- **Familia:** contenedor de inventario de hasta 100 piezas base. Conserva IDs, materia, energía, origen y módulos; retirar contenido pasa por su colocador y su validación de espacio.

Fuentes: [`game.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/game.js), símbolos `createRotorSet`, `dissolveRotorSet`, `startFamilyGrouping`, `beginFamilyPlacement`, `confirmFamilyPlacement`; [`families.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/families.js); [Familias Q-bits](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/docs/FAMILIAS_QBITS.md).

## Archivos que gobiernan la tableta

| Archivo | Responsabilidad real |
|---|---|
| [`index.html`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/index.html) | DOM de `#panel.tablet`, pantallas `page-catalog`, `page-cube`, `page-mechanisms`, `page-route`, `page-cargo`, `page-puzzle`, `page-alpha`, `page-manual`; controles numéricos y paneles especializados. |
| [`assets/js/game.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/game.js) | Estado, selección, eventos, disponibilidad contextual, apertura/cierre, arrastre de tableta, catálogo, controladores y guardados. Está encerrado en una IIFE; sus funciones internas no son una API pública de `window`. |
| [`assets/css/tablet.css`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/css/tablet.css) | Cristal, rejilla de tres columnas, tipografía, estados, paneles y adaptación por `@container`. |
| [`assets/js/tablet-model.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/tablet-model.js) | Malla del cuerpo sólido biselado, extraída del tablero SciFi Desk; incluye reverso. |
| [`assets/js/tablet-view.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/tablet-view.js) | `QBitsTabletView.placement` y `renderer`: proyección WebGL y matriz compartida por los controles DOM. |
| [`assets/js/preferences.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/preferences.js), [`settings.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/settings.js) | Estilos Cristal/Industrial, tamaño 75–125, mano, posición horizontal/vertical 0–100, persistencia y restauración. |
| [`assets/js/controls.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/controls.js) | Controles configurables; la UI debe respetar `inputLabel` y la configuración del jugador. |
| [`assets/js/servo-panel.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/servo-panel.js) | Editor servo, diagrama angular, marcha del conjunto, callbacks `onApply`, `onAction`, `onMarch`. |
| [`assets/js/robot-arm-panel.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/robot-arm-panel.js) | Agarre, poses, ejes, prueba y secuencia del brazo. |
| [`assets/js/conveyor-panel.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/conveyor-panel.js) | Cintas, planos, sentido, carga, estado y telemetría. |
| [`assets/js/workshop-panel.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/workshop-panel.js), [`workshop.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/workshop.js) | Baterías, adaptaciones, investigación y cuerpos; modelo de previsualización/aplicación ya separado del DOM. |
| [`assets/js/rotor-power.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/rotor-power.js) | Límites exactos de rpm, torque y carga; evaluación de energía. Los límites se pueden leer sin iniciar Cannon. |
| [`assets/js/propeller-power.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/propeller-power.js) | Configuración y validación de vuelo, `maxPoints`, límites y modelo de potencia. |
| [`assets/js/families-ui.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/families-ui.js), [`families.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/families.js) | Editor de nombre/color, inventario y reglas de familias. |
| [`assets/js/save-games.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/save-games.js) | Formato y validación del guardado de escena/campaña, escritura que conserva el guardado anterior ante un fallo. |
| CSS especializados | `servo-panel.css`, `robot-arm-panel.css`, `conveyor-panel.css`, `workshop-panel.css`, `saved-games.css`, `families.css`, `selection-hud.css`, `glass-panels.css`. |

## Navegación existente y destino propuesto

Actualmente `tabletSections` organiza **Cuerpos** (Catálogo/Piezas/Recorrido/Cuerpos), **Mecanismos**, **Archivo** (Archivo del banco/Puzle) y **Ayuda**. Además, **Banco/Mesa** cambia el contexto de trabajo. `drawMachineLinks` añade accesos Servos/Vuelo/Brazo/Cintas/Sensor/Rotores dentro de Mecanismos. La Tablet 2.0 reduce la navegación principal a **Construir / Controlar / Recorrido / Guardados**; la ayuda y la configuración del dispositivo siguen siendo accesos secundarios.

### Matriz de correspondencia funcional

Las rutas y símbolos indicados son del código original. Salvo que se indique otro archivo, se encuentran en `assets/js/game.js`. «Más ajustes» conserva precisión; no debe alterar valores al abrirlo, cambiar de selección o cambiar de pestaña.

| Capacidad existente | Activación y controlador actual | Ubicación Tablet 2.0 | Restricción que se conserva |
|---|---|---|---|
| Mostrar/guardar tableta | Control configurable; `toggleTablet`, `showTablet`, `stowTablet`, `openPanel` | Cabecera / cerrar | No interrumpir transiciones ni capturar teclas mientras se escribe. |
| Cambiar mano, posición y tamaño | Cabecera, `layoutTablet`, `tabletPreferences`, `saveTabletPosition`; Configuración → Juego | Ajustar tableta | Misma proporción, perspectiva y hit testing; guardar preferencias aparte en demo. |
| Seleccionar pieza, añadir selección, limpiar | Secundario, Ctrl+clic, selección por arrastre; `selectedTeam`, `clearSelection`, `toggleRotorSelection` | Construir → vista central y Seleccionar | Selección visual adicional; IDs canónicos, límites y controles del mundo intactos. |
| Seleccionar desde el mundo con tableta abierta | `onCanvasMouseDown` → `aimQubit`, selección y `updatePanel` | Todas las secciones | La vista central debe reflejar esta misma selección, no crear otra selección de juego. |
| Tomar/mover y soltar | `takeSelection`, `grabQubit`, `releaseQubit`; menú secundario | Construir → Mover | Delegar en mano física, restricciones de carga y detención de motores. |
| Girar/orientar | Shift y controles configurables sobre el objeto sostenido | Construir → Girar | Abrir el gesto existente; no teletransportar ni sustituir cuaterniones desde el DOM. |
| Catálogo: piezas/máquinas/equipo/guardados | `refreshQuickEntries`, `drawTabletCatalog`, `creationChoiceAllowed`, `startCreationTool` | Construir → catálogo contextual | Mantener desbloqueos, materiales y restricciones de escena. |
| Crear Q-bit/T-bit/enganche/rotor | `#create`, `createMechanismChoice`, `startCreationTool` | Construir → pieza | Mismo colocador; crear en demo no concede materia al juego. |
| Blueprint / confirmar / cancelar | `beginCreationPlacement`, `beginBlueprintPlacement`, `placeBlueprint`, `activateBlueprint` | Construir → Colocar | Mismas guías azul/roja, rueda, Shift, confirmación y validación de obstáculos. |
| Duplicar | V → `duplicateSelection`, `duplicateMechanism` | Construir → Duplicar | Bloqueado en contextos restringidos y con adaptaciones; baterías copiadas vacías; límites de población/espacio. |
| Borrar pieza/cuerpo | `#remove` → `deleteQubit`; `#delete-cargo` | Construir → Eliminar | Respetar puzle/campaña, dependencias y selección. |
| Separar pieza, módulo o toda estructura | Alt/menú; `detachPart`, `detachConveyorModule`, `applyDetachMenu` | Construir → Separar | Distinguir pieza, módulo completo, desarme inmediato/por etapas. |
| Agrupar piezas en familia | Menú contextual → `editFamily`, `startFamilyGrouping` | Construir → Agrupar en familia | Preparación cancelable, hasta 100 piezas por familia y conservación de inventario. |
| Nombre y color de familia | `editFamily` → `QBitsFamilies` sanitización | Construir → familia | Máximo 40 caracteres, color válido; conservar identidad. |
| Tomar/colocar familia | `takeFamily`, `grabFamily`, `beginFamilyPlacement(f,'move')` | Construir → Mover / Colocar | Mismo agarre de cubos, masa del inventario, volumen exterior y obstáculos. |
| Retirar contenido/desagrupar familia | `beginFamilyPlacement(f,'withdraw',n)`, `confirmFamilyPlacement` | Construir → familia → Retirar / Desagrupar | Validar el destino antes de descontar; no perder módulos ni duplicar piezas. |
| Dividir/unir familias | `splitFamily(f,10)`, `mergeFamilies` | Construir → familia → Más acciones | No familias anidadas; no sobrepasar 100; conservar módulos indivisibles. |
| Nombrar Q-bit | `#rename-qubit` → `renameQubit` | Construir → pieza → Nombre | Máximo 24 caracteres; el nombre acompaña a la pieza al unir/separar. |
| Crear/renombrar/disolver conjunto de rotores | `createRotorSet`, `renameRotorSet`, `dissolveRotorSet` | Controlar → Conjunto | Es una lista de motores, no una soldadura. Cada rotor pertenece a un conjunto. |
| Seleccionar conjunto por nombre | `selectRotorSet`, `activeRotorSet` | Controlar → selector de conjunto | Mantener la identidad aunque se reorganicen los cuerpos. |
| Arrancar/detener/invertir rotor o conjunto | `runRotorControls` → `configureRotorSet` / `configureRotor` | Controlar → controles principales | Revisar energía, carga, ejes fijos, pieza sostenida y controlador propietario. |
| Velocidad/fuerza/carga de rotor | `#rotor-rpm`, `#rotor-force`, `#rotor-capacity` | Controlar → presets + Más ajustes | Fuerza es torque ×100; carga es límite por motor, nunca suma del conjunto. |
| Montaje/lado/sentido/torque | `#rotor-mount`, `#rotor-side`, `#rotor-clockwise`, `#rotor-counterclockwise`, `#rotor-torque` | Controlar → rotor → Más ajustes | Sólo selección individual; detenido para editar desde tableta. |
| Separar enganches del rotor | `disconnectRotor` | Construir → rotor → Separar | Detiene marcha sincronizada y actualiza referencias/conjuntos. |
| Límites/mode/objetivo del servo | `configureServo`, `servoConfigValid`; `QBitsServoPanel` | Controlar → servo → Más ajustes | Ángulos, objetivo y velocidad conservan validación y unidad. |
| Iniciar/detener/invertir servo | `startServo`, `configureRotor({enabled:false})`, `configureServo` | Controlar → servo | Detener conserva ángulo/bloqueo; no equivale a volver al origen. |
| Marcha sincronizada de servos | `servoMarchAction`, `startServoMarch`, `stopServoMarch` | Controlar → conjunto articulado | Fase mínimo/máximo por articulación; no iniciar como conjunto genérico de rotores. |
| Reiniciar mecanismo/recorrido | R → `restartSelection`, `restartMechanism` | Controlar / Recorrido → Reiniciar | Restaura pose y órdenes del inicio, verifica espacio, no repone energía ni resetea parámetros. |
| Activar/apagar batería externa | Menú o `#connected-batteries`; `toggleExternalBattery` | Controlar → batería | Cambio de fuente detiene motores; batería activa vacía no cae automáticamente a reserva interna. |
| Información de energía/carga | `rotorPowerState`, `externalBatterySummary`, `externalBatteryPackInfo` | Controlar → estado + Más ajustes | Estado simple arriba; lecturas precisas cuando se solicitan. No inventar autonomía en la demo. |
| Sensor: modo, rango, umbral, acción, destino | `refreshSensorPanel`, `sensorConfig`, `linkContactSensor`, `unlinkContactSensor` | Controlar → sensor | Contacto/movimiento/láser/peso; no toda máquina admite invertir; mantener validación de enlace. |
| Agarre: filtro, carga, alcance, tomar/soltar | `QBitsRobotArmPanel`, `gripperGrab`, `releaseGripper`, funciones `robot*` | Controlar → agarre | Filtro any/color/piece/shape/form y alcance real; no atraer objetos a distancia. |
| Brazo: crear plano/registrar montaje | `robotArmBlueprintTemplate`, `beginBlueprintPlacement`, `createRobotArm` | Construir → Brazo | Consume piezas existentes; misma topología de ejes. |
| Brazo: posición inicial y A/B | `beginRobotPoseDraft`, controladores `robot*`; `#arm-pose-*`, `#arm-teach-*` | Recorrido → Brazo | Poses con significado fijo; no tratarlas como lista libre de puntos. |
| Brazo: ejes manuales / reducción | `#arm-motor-*`, `#arm-joints`, callbacks de `robot-arm-panel.js` | Controlar → Brazo → Más ajustes | Reducir 3:1 donde corresponde; rpm del motor y velocidad de salida no son lo mismo. |
| Brazo: secuencia, repetir, detener | `startRobotArm`, `stopRobotArm` | Controlar → Brazo | Detectar → tomar → B → soltar → volver; detener suelta carga. |
| Cintas: plano recto/esquinas/extender | `conveyorBlueprintTemplate`, `beginBlueprintPlacement`, `QBitsConveyorPanel` | Construir → Cinta | Mismos materiales, orientación, altura, apoyos y puertos. |
| Cintas: marcha/sentido/capacidad | `startConveyorLine`, `stopConveyor`, `configureConveyor` | Controlar → Cinta | Controlador propio; no arrancar sus rotores con el control genérico. |
| Dron: altura/velocidad/rumbo | `configureFlight`, `flightConfig`, `QBitsPropellerPower.config` | Controlar → Vuelo | Velocidad cero conserva su significado; altura afecta esfuerzo real, no a la demo. |
| Dron: despegar/aterrizar/apagar | `startFlight`, `requestFlightLanding`, `stopFlight` | Controlar → Vuelo | Aterrizar y apagar motores son acciones diferentes. |
| Dron: trayectoria y paradas | `routeOf`, `editFlightRoute`, `drawFlightRoute`, `configureFlight` | Recorrido → Vuelo | Misma estructura de puntos, máximo 48, edición detenido. |
| Q-bit: destino terrestre | Menú suelo → `openFloorOrders`, `startRoute`, `moveTeamTo` | Recorrido → Suelo | Un destino; el planificador produce los pasos. No hay editor manual de esos pasos. |
| Detener ruta/transporte | `#stop`, `stopRoute`, `leaveHaul`, `stopHaul` | Recorrido → Detener | Cancelar la orden pendiente y mantener la lógica de cansancio/bloqueo. |
| Cuerpo de carga: crear/color/peso/tamaño | `#page-cargo`, `startCreationTool('quick-cargo')` | Construir → Cuerpo de carga | No confundir tamaño con peso/requisito de Q-bits. |
| Carga: equipo/destino/entrega | `beginHaul`, `addCrew`, `sendMaterial`, `deliverSelectedCargo` | Recorrido → Transporte | Mantener número de participantes, restricciones y destino de entrega. |
| Mesa: abrir y elegir Baterías/Mejoras/Cuerpos | `openWorkshopPanel`, `workshopPanelSnapshot/Inspect/Apply` | Construir → Mesa | Mesa desplegada a distancia válida; pieza sobre mesa y liberada. |
| Mesa: fabricar/restaurar batería I/II/III | `createExternalBattery`, `restoreExternalBattery`, `batteryWorkshopCheck` | Construir → Mesa → Baterías | Uno/dos/tres cubos en línea; conservar julios y materia; bloquear restauración con exceso de carga. |
| Mesa: adaptaciones / investigación | `applyWorkshopUpgrade`, `purchaseWorkshopResearch`, `QBitsWorkshop` | Construir → Mesa → Mejoras | Sensor, reserva, ligereza, movimiento; créditos/desbloqueos y propiedad de reservas. |
| Mesa: redistribuir cuerpo | `workshopBodyPreview`, `workshopBodyApply` | Construir → Mesa → Cuerpos | Reacomoda cubos existentes; no estira collider, no crea materia. |
| Cable y red eléctrica | `beginPowerCable`, `reroutePowerCable`, `openPowerCableMenu`, `openPowerReservoirMenu` | Construir → Equipo / Controlar → Red | Trayectos, suministro y material existentes; no confundir con recorridos de movimiento. |
| Repisas: colocar, guardar, retirar, eliminar | `beginShelfPlacement`, `storeShelfSelection`, `withdrawShelf`, `requestDeleteShelf` | Construir → Equipo → Repisas | Los compartimentos contienen inventario real; no son plantillas ni familias. |
| Enfriadores | `place-cooler`, `createCooler`, `alphaSettings` | Construir → Equipo → Enfriador | Capacidad, calma y energía existentes, sin inventar una carga completa. |
| Guardar forma | `saveShape`, `persistShapes` | Guardados → Formas | Biblioteca local de hasta 64; guardar plantilla no duplica construcción. |
| Guardar mecanismo | `saveMechanism`, `mechanismSnapshot`, `persistMechanisms` | Guardados → Mecanismos | Mismo montaje conectado, topología/configuración/conjuntos conservados. |
| Colocar plantilla guardada | `showSavedShapes`, `beginBlueprintPlacement`, `spawnSavedMechanism` según contexto | Guardados → Colocar | Distinguir blueprint que integra piezas y copia permitida en banco. |
| Importar/exportar biblioteca | `exportShapes`, `importShapesData`, `exportMechanisms`, `importMechanismsData` | Guardados → Importar / Exportar | Formatos versión 1 existentes; importación reemplaza lista validada. |
| Guardar/continuar banco o campaña | `saveCurrentGame`, `continueSavedGame`, `QBitsSavedGames` | Guardados → Partida | Banco = instantánea; campaña = checkpoint. No intercambiar con plantillas. |
| Puzle de prueba / volver al banco | `startPuzzle`, `leavePuzzle`, `#page-puzzle` | Construir → Pruebas → Puzle | Guardar/restaurar banco previo; condiciones y tiempos originales. |
| Física, agarre y límites del banco | `#page-cube`, `updatePanel`, `settings` | Construir → Más ajustes del banco | Mantener parámetros existentes; el prototipo no simula ni aplica física. |
| Ánimo/energía/diálogos y pruebas de agotamiento | `moodSettings`, `#mood-test-tired`, `#mood-test-rested` | Controlar → Más ajustes del banco | Pruebas sólo banco libre; estados reales se leen desde el juego en futura integración. |
| Manual, guías de cada mecanismo | `#page-manual`, `#arm-help`, `#battery-guide` | Ayuda contextual junto a cada sección | No exigir leer un manual para iniciar acciones básicas. |

## Parámetros verificados y accesos descriptivos

### Rotor y servo

| Campo | Límite original | Valor de origen | Presentación propuesta |
|---|---|---|---|
| Rotor `rpm` | 1–360 | 30 en `mechanismDefaults` | Lento 15 / Normal 30 / Rápido 90; edición precisa en Más ajustes. |
| Rotor `maxTorque` | 0,02–32 N·m en banco | 3,2 | Suave 0,8 / Normal 3,2 / Fuerte 8 N·m. |
| UI de fuerza | 2–3200, igual a `maxTorque × 100` | 320 | Los mismos presets equivalen a 80 / 320 / 800. No guardar otro campo de fuerza independiente. |
| Rotor `capacity` | 2–16000 u | 256 al crear en banco; fallback de `QBitsRotorPower` 128 | Sólo Más ajustes; no cambia al elegir Fuerza. |
| Rotor montaje | `wheel` / `fixed` | `wheel` | Rueda libre / Eje fijo; sólo rotor individual detenido. |
| Rotor lado móvil | `a` / `b` | `b` | Lado A / B; separado del sentido. |
| Rotor dirección | 1 / −1 | 1 | Horario / Antihorario conforme al lado móvil. |
| Servo `speed` | 5–540 °/s | 45 | Lento 15 / Normal 45 / Rápido 135; no usa los valores rpm del rotor. |
| Servo `min` / `max` | −90 a 90°, `min < max` | Manual: −60/+60. Receta de catálogo: −40/+40. | Recorrido angular visible y números en Más ajustes. |
| Servo `target` | Dentro de `[min,max]` | 30° | Posición objetivo cuando corresponda. |
| Servo `mode` | `hold` / `once` / `repeat` | Manual `once`; receta de catálogo `repeat` | Mantener / Una vez / Ida y vuelta. |
| Servo torque y carga | Los límites del rotor subyacente | Manual 3,2 N·m / 256 u; receta del catálogo 0,4 N·m / 32 u | Leer los valores de la instancia; no imponer un valor por defecto al seleccionarla. |

Fuentes: `mechanismDefaults`, `connectRotorTips`, `configureRotor`, `configureRotorSet`, listeners `#rotor-force`/`#rotor-torque`, `servoConfig`, `servoConfigValid`, `connectServoTips`, `servoBlueprintTemplate`, `configureServo`; [`rotor-power.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/rotor-power.js). `configureServo` deriva internamente `rpm = max(1, speed / 6)`; la UI conserva °/s. La campaña impone un límite de torque según progreso y ensayos; los presets del banco no autorizan superarlo.

Los presets son atajos nuevos de interfaz sobre números válidos. **No constituyen un nuevo modelo físico ni garantizan velocidad real, carga o eficiencia.** Al abrir una construcción con un valor que no coincide, debe aparecer **Personalizado**, sin ajustar/redondear ese valor. En una selección con distintos valores, debe aparecer **Varios** y no aplicarse un preset hasta pulsarlo.

### Recorridos: tres sistemas existentes

| Sistema | Datos reales | Edición existente y límite | Tratamiento Tablet 2.0 |
|---|---|---|---|
| Suelo | `startRoute(g, goal)`; `g.route.steps/preview/strides` calculados | Un destino; velocidad base 0,12–0,70, default 0,32. Los puntos intermedios pertenecen al planificador. | Mostrar origen/destino y trayecto calculado; cambiar destino llama al mismo controlador. No editar `steps` ni prometer waypoints manuales. |
| Vuelo | `{loop, points:[{x,z,height,action,wait}]}` | Hasta 48 puntos. X/Z ±28 m; altura 0,15–3 m; espera 0–120 s; `pass`, `wait`, `land`. UI actual añade y quita el último. | Seleccionar, mover y eliminar en la representación mantiene exactamente esta estructura. Es un nuevo acceso visual al mismo dato, no otro motor de rutas. No reordenar: no hay acción de reordenación en la UI original. |
| Brazo | Poses `home`, `pick`, `place` y secuencia fija | Enseñar A/B desde la postura o marcar con la mira. | Mostrar Inicial/A/B con significado fijo. No convertirlas en recorrido de dron. |

`QBitsPropellerPower.config` y `validConfig` se pueden reutilizar sin Cannon. La altura general de vuelo es 0,15–3 m (default 0,5), velocidad 0–1,2 m/s (default 0). Con velocidad cero, la trayectoria existente emplea 0,5 m/s; fuera de ruta mantiene posición. Presets de vuelo propuestos: **Lento 0,25 / Normal 0,5 / Rápido 1 m/s**. No mostrar Fuerza en un dron: ese control no existe. La edición de una ruta de vuelo se bloquea mientras está activo, como en `editFlightRoute`.

### Otros ajustes que deben seguir accesibles

| Contexto | Campos actuales que se conservan |
|---|---|
| Banco, piezas y agarre | Masa 0,25–3; gravedad 1–20; rebote 0–0,65; fricción 0,05–0,8; amortiguación 0,01–0,8; fuerza de agarre 4–300; estabilidad 0–1; giro con Shift 1–5; carga/selección 1–2000; guía ghost/dot/x/none; línea dashed/solid/none. |
| Ánimo/energía del banco | Gasto 0,005–0,08; recuperación 0,02–0,15; inactividad 45–180 s; diálogos; agotar/recargar seleccionado sólo banco. |
| Sensor | Contacto/movimiento/láser/peso; alcance 25/50/100/200 cm; velocidad mínima 1–500 cm/s; peso 0,25–2000 u; destino y acción start/stop/reverse según compatibilidad. |
| Agarre | Filtro any/color/piece/shape/form; carga 1–2000 u; alcance 1,8–5 cm; comprobar, tomar, soltar, aprender pieza/forma. |
| Brazo | Eje, rpm 1–360, torque 0,02–32, capacidad 2–16000; paso 5/15/45/90°; repetir; enseñar/probar home/A/B. |
| Cinta | Plano recto/izquierda/derecha, extender, orientación, altura 0–6 m, patas, carga 1–2000 u, sentido y marcha de línea/tramo. No hay slider independiente de Fuerza para cinta. |
| Cuerpo de carga | Lado 1–12 Q-bits, requisito 1–2000, color; arrastre base 0,08–0,4; fuerza por Q-bit 1,5–5. |
| Enfriador/blueprint | Radio integración 0,5–3 m; capacidad 1–2000; enfriamiento 5–60 s; energía salida 0,25–0,75; calma 15–180 s; activar; brillo 0–1. |
| Puzle | Tiempo de marco/energía 1–30 s; iniciar/salir; permitir crear Q-bits sólo mediante opción existente. |
| Mesa | Dimensiones enteras 1–16 por eje y mismo número de cubos; baterías 1/2/3 cubos; adaptaciones niveles I/II/III; investigaciones con sus requisitos originales. |

Fuente de estos controles: `index.html` y sus controladores de `game.js`. Son controles originales del banco, **no una autorización para alterar la física dentro de esta entrega**.

### Baterías y estados sin cifras innecesarias

La capacidad externa se obtiene de `externalBatteryCapacity = 60 × batterySceneScale`: 1800 J por celda en banco (escala 30) y 900 J en campaña (escala 15). Las versiones I/II/III contienen uno/dos/tres cubos; la conversión conserva la energía existente, por lo que no comienzan necesariamente llenas. La reserva interna normal es `QBitsWorkshop.SPEC.battery[1] × escala` (600 J en banco), y las adaptaciones internas mantienen sus proporciones. Una barra de nivel y estados **Activa / Apagada / Sin carga** pueden sustituir la cifra inicial; los julios exactos permanecen en Más ajustes. No añadir velocidad ni fuerza a una batería.

Fuentes: `batterySceneScale`, `externalBatteryCapacity`, `createExternalBattery`, `restoreExternalBattery`, `toggleExternalBattery`; [`workshop.js`](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/assets/js/workshop.js).

## Recursos visuales reutilizables

| Recurso | Uso y conservación |
|---|---|
| `assets/fonts/spaceman/Spaceman-Regular.ttf` | Tipografía de menús. Copiar el `unicode-range` de `index.html` para que los signos y glifos vacíos usen respaldo legible. No modificar el TTF. |
| `assets/fonts/led-calculator/LEDCalculator.ttf` | Título Q-bits. Mantener el uso limitado al título y los avisos existentes. |
| `assets/fonts/tengoku/Tengoku.ttf` | Diálogos y burbujas; no usar para saturar controles ni cargarla si la demo no la necesita. |
| `tablet-model.js` / `tablet-view.js` | Cuerpo físico biselado, reverso, cristal turquesa oscuro e industrial grafito. La perspectiva pertenece al cuerpo; controles y cara frontal deben compartirla. |
| `UNIT_PROFILES` de `game.js` | Q-bit cúbico de 0,09 m; T-bit triangular, pirámide cuadrada y enganche. Usar geometría de representación, sin crear colisiones. |
| Colores del juego | Cubos oscuros; T-bits grises; enganches grafito/acero; batería con líquido verde; selección/colocador cian/azul y rojo al bloquearse. |
| Iconos | SVG geométricos ya presentes en `index.html` (cubo, mecanismo, archivo, ayuda). Se puede ampliar el vocabulario sin descargar biblioteca de iconos. |

El cuerpo original de la tableta adapta la malla superior de [SciFi Desk](https://sketchfab.com/3d-models/scifi-desk-d4a09022a8874ae6bdc44b3e42a6ea6c), de [Sousinho](https://sketchfab.com/sousinho). El repositorio registra [Sketchfab Standard](https://sketchfab.com/licenses) en los metadatos aportados. La demo conserva la atribución y no asigna otra licencia. Procedencia completa: [THIRD_PARTY_NOTICES.md](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/THIRD_PARTY_NOTICES.md) y [FURNITURE_MODELS.md](https://github.com/dbastias37/Q-bits/blob/e02afe3d1bd9a0d116c5c915e5efc960caa5a26a/docs/FURNITURE_MODELS.md).

## Comparación funcional con la tableta actual

| Aspecto | Actual, verificado en código | Tablet 2.0, decisión de diseño |
|---|---|---|
| Orientación | Rueda Cuerpos/Mecanismos/Archivo/Ayuda y Banco/Mesa | Cuatro acciones principales: Construir/Controlar/Recorrido/Guardados. |
| Elemento central | Página de controles/textos del panel | Representación seleccionable del mecanismo; el control depende de la pieza. |
| Parámetros básicos | Rpm/fuerza/carga visibles al entrar a rotor | Opciones descriptivas y estado; precisión disponible en Más ajustes. |
| Contexto | Panel Mecanismos reúne varios controladores y enlaces internos | Panel derecho muestra el controlador de la selección; catálogo y ayuda preservan acceso a los demás. |
| Recorridos | Suelo por menú del mundo; vuelo en plano/lista; brazo por A/B | Sección común de acceso que mantiene separados sus tres significados. |
| Guardados | Archivo, Mecanismos y pantalla de partidas | Una sección distingue Formas, Mecanismos y Partida, sin cambiar formatos. |
| Volumen | Malla WebGL biselada con DOM proyectado | Conserva dispositivo volumétrico y superficies alineadas; no reemplaza el juego en esta etapa. |
| Coste | Tableta en el render del juego | Prototipo sin mundo físico, sin Cannon ni `game.js`; render de representación y cambios de estado. |

## Riesgos concretos de una integración futura

1. Arrancar un rotor que pertenece a brazo/cinta/servo desde un botón genérico puede saltarse su secuenciador. El adaptador debe resolver primero el controlador propietario.
2. Convertir «Agrupar» en soldar, crear conjunto de rotores o contener en familia indistintamente cambia la mecánica. La etiqueta debe precisar la operación.
3. Editar los waypoints calculados de suelo o convertir las poses del brazo en puntos libres crea otro sistema de rutas. La UI sólo representa las capacidades del tipo seleccionado.
4. Aplicar presets al seleccionar o al cargar elimina valores personalizados. Los presets deben ser comandos explícitos, nunca normalización silenciosa.
5. Reutilizar `qbits.save.*`, `qbits.shapes.v1` o `qbits.mechanisms.v1` en la demo arriesga datos reales. Usar namespace separado y no presentar sus archivos como compatibles con el juego.
6. Calcular selección/topología cada frame o crear un mundo Cannon para la miniatura revierte optimizaciones. El puente entrega snapshots y revisiones; el render sólo consume geometría simplificada.

