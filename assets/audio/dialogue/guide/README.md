# Voz del guía

Sube aquí tus clips con estos nombres exactos, en minúsculas:

- `blip_01.wav`: basta este archivo para empezar.
- `blip_02.wav` a `blip_05.wav`: variantes opcionales.
- `end.wav`: remate opcional, una vez al finalizar la escritura natural.

Los clips no vienen incluidos. Mientras falten, el guía permanece en silencio y el juego funciona normalmente. No subas archivos vacíos como sustitutos.

Recomendado: WAV PCM mono de 16 bits, 44,1 o 48 kHz; blips de 50–120 ms y final de 100–220 ms. Sin silencios iniciales, con niveles similares y sin saturación. El motor añade pequeñas entradas/salidas y limita la reproducción a 120 ms por blip y 220 ms por final. Rechaza archivos de más de 512 KiB o más de 2 segundos. Conserva las grabaciones originales en `audio-source/dialogue/guide/`.

Después de subirlos a main y terminar la publicación, recarga el juego. Pulsa **º** (tecla física bajo Esc / a la izquierda del 1) durante la carga, presentación, menú principal o narración inicial para llegar a **Despertar**. Durante la carga espera los recursos reales. Luego haz clic en **Despertar** o pulsa **E**: se abren los ojos y el primer diálogo del guía reproduce tus clips.

El atajo no reinicia una partida activa ni borra progreso. El inicio normal continúa disponible. En Configuración → Audio puedes desactivar **Voz del guía** o ajustar su volumen, independientemente de la música. Guarda para aplicar.

Solo se sonorizan los diálogos narrativos del guía; la invocación sobre negro y las burbujas de otros Q-bits quedan en silencio. El ritmo sigue las letras nuevas, con pausa en puntuación, variación sutil de tono, sin repetir inmediatamente una variante cuando hay más de una y como máximo dos fuentes cortas simultáneas. Completar texto con E/clic, cambiar escena, pausar o esconder la pestaña detiene el sonido. No hay una pista de audio generada por frase.

Los nombres se configuran en `voice.json`. Para usar MP3 u OGG, cambia ahí la extensión real; no renombres un MP3 como WAV. Máximo ocho variantes, sin rutas externas. El navegador no puede descubrir por sí solo archivos arbitrarios de una carpeta estática.
