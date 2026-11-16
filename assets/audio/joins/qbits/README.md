# Unión de bloques

Coloca aquí las cuatro variantes con estos nombres exactos:

- `join_01.wav`
- `join_02.wav`
- `join_03.wav`
- `join_04.wav`

Cada archivo contiene un único impacto de encaje. Los cuatro sirven para cualquier unión: no se asignan por tipo de bloque. Se eligen sin repetición inmediata mientras haya al menos dos disponibles. Si falta alguno se utilizan los restantes; si no hay ninguno válido la unión funciona en silencio.

Exportación sugerida: WAV PCM de 16 bits, mono, 44,1 o 48 kHz; 100–600 ms, sin silencio inicial y con niveles parecidos entre las cuatro variantes. No cambies simplemente la extensión de un MP3: expórtalo como WAV. El banco acepta también `.ogg` o `.mp3` actualizando `joins.json`. Se rechazan archivos de más de 512 KiB o 2 segundos; cada reproducción dura hasta 800 ms con salida suave.

Se activa únicamente después de confirmar una unión válida: caras de cubos o T-bits, enganches de rotor, ampliaciones de estructuras o mecanismos. Un encaje grande produce un solo impacto. Los planos completos y el empaquetado de producción generan un evento al completar el ensamblaje; la extensión de cinta no duplica el evento. Aproximar, chocar, intentar una unión inválida, crear piezas o recuperar guardados no reproduce este sonido.

Se comparte el contexto de audio existente y se reutilizan las cuatro muestras decodificadas. Audio estéreo relativo a la cámara, atenuado hasta 6 m, con hasta tres impactos simultáneos y separación mínima de 40 ms para evitar ráfagas. Pausar, ocultar la pestaña o cambiar escena cancela los sonidos activos; no se acumulan eventos.

Configuración → Audio → Unión de bloques / Volumen de uniones (60 % inicial), independiente del guía y las pisadas. Tras añadir archivos, recarga el juego. Los originales opcionales van en `audio-source/joins/qbits/` y no se cargan durante la partida.
