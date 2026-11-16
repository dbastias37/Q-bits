# Pisadas de los Q-bits

Coloca aquí tus ocho variantes de una pisada, con estos nombres exactos:

- `step_01.wav`
- `step_02.wav`
- `step_03.wav`
- `step_04.wav`
- `step_05.wav`
- `step_06.wav`
- `step_07.wav`
- `step_08.wav`

Una pisada por archivo, sin silencio al inicio, sin música ni reverberación larga y con un volumen parecido entre variantes. Preferir WAV PCM de 16 bits, mono, 44,1 o 48 kHz. Duración aconsejada: 60–300 ms. El reproductor limita cada impacto a 450 ms con una salida suave; descarta archivos de más de 512 KiB o 2 segundos. No renombres un MP3 como WAV: expórtalo en el formato correcto. `steps.json` admite también nombres `.ogg` o `.mp3` si actualizas las ocho entradas.

Los ocho sonidos tienen la misma función: son variantes de una pisada y se alternan sin repetición inmediata. No corresponden a ocho cubos ni a ocho distancias. Basta uno disponible para empezar; los faltantes quedan en silencio sin bloquear la carga. No se incluyen sonidos de ejemplo.

El impacto ocurre al terminar un giro sobre una cara. Un conjunto unido genera una pisada por giro, no una por cada pieza. El equipo de arrastre genera pasos por cada 11 cm recorridos realmente sobre el suelo. Estar quieto, en el aire o en la mano no genera pasos.

Audio relativo a la cámara: izquierda/derecha y volumen por distancia 3D. Volumen pleno hasta 1,8 m, caída suave hasta silencio a 6 m. Se priorizan tres conjuntos cercanos, con margen para no alternarlos constantemente y fundidos de unos 180 ms al cambiar. Máximo seis impactos simultáneos y seis canales reutilizables incluyendo los que salen. No hay reverberación ni oclusión de paredes; la prioridad es una espacialización ligera.

Configuración → Audio → Pisadas de los Q-bits / Volumen de pisadas (55 % inicial). Las muestras se cargan y decodifican una vez por sesión y comparten el contexto de audio del guía. El banco es opcional y se carga sin retrasar Despertar. Al añadir o cambiar clips, vuelve a cargar la página. Los originales largos pueden guardarse fuera de esta carpeta, en `audio-source/footsteps/qbits/`.
