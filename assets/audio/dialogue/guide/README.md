# Voz del guía

Sube aquí tus clips con estos nombres exactos, en minúsculas:

- `blip_01.wav` y `blip_02.wav`: tus dos sonidos base.
- `blip_03.wav` a `blip_06.wav`: tus cuatro variantes opcionales.
- `end_01.wav`, `end_02.wav` y `end_03.wav`: tus tres finales opcionales.

La selección depende de la longitud de la palabra completa (las tildes cuentan como una letra):

| Palabra | Clips |
| --- | --- |
| 1–3 letras | `blip_01.wav`, `blip_02.wav` |
| 4–6 letras | `blip_03.wav`, `blip_04.wav` |
| 7–9 letras | `blip_05.wav` |
| 10 letras o más | `blip_06.wav` |

Cada palabra mantiene su variante mientras aparecen sus letras. Si falta su variante se utiliza una base disponible; si faltan ambas bases, cualquier blip válido. En cada final natural se elige un solo remate disponible, sin repetir el anterior si hay varios. Nunca se reproducen los tres finales seguidos. Basta un blip válido para empezar; los huecos se omiten.

Los clips no vienen incluidos. Mientras falten, el guía permanece en silencio y el juego funciona normalmente. No subas archivos vacíos como sustitutos.

Recomendado: WAV PCM mono de 16 bits, 44,1 o 48 kHz; blips de 50–120 ms y final de 100–220 ms. Sin silencios iniciales, con niveles similares y sin saturación. El motor añade pequeñas entradas/salidas y limita la reproducción a 120 ms por blip y 220 ms por final elegido. Rechaza archivos de más de 512 KiB o más de 2 segundos. Conserva las grabaciones originales en `audio-source/dialogue/guide/`.

Después de subirlos a main y terminar la publicación, recarga el juego. Pulsa **º** (tecla física bajo Esc / a la izquierda del 1) durante la carga, presentación, menú principal o narración inicial para llegar a **Despertar**. Durante la carga espera los recursos reales. Luego haz clic en **Despertar** o pulsa **E**: se abren los ojos y el primer diálogo del guía reproduce tus clips.

El atajo no reinicia una partida activa ni borra progreso. El inicio normal continúa disponible. En Configuración → Audio puedes desactivar **Voz del guía** o ajustar su volumen, independientemente de la música. Guarda para aplicar.

Solo se sonorizan los diálogos narrativos del guía; la invocación sobre negro y las burbujas de otros Q-bits quedan en silencio. El ritmo sigue las letras nuevas, con pausa en puntuación, variación sutil de tono, evitando repetir la variante entre palabras cuando su grupo ofrece otra opción y como máximo dos fuentes cortas simultáneas. Completar texto con E/clic, cambiar escena, pausar o esconder la pestaña detiene el sonido. No hay una pista de audio generada por frase.

El texto tiene velocidad variable por palabra y una aceleración interna suave. Hay pausas de aproximadamente 160 ms en comas, 260–300 ms en exclamaciones/preguntas/puntos y 440 ms en puntos suspensivos, además del intervalo de escritura. La pausa se agrupa al encontrar `...`; no se multiplica por tres. Texto y sonido usan el reloj de la historia: pausar no acumula letras ni sonidos. Completar texto revela la frase entera inmediatamente y cancela su voz.

Los nombres y grupos de longitud se configuran en `voice.json`. Para usar MP3 u OGG, cambia ahí la extensión real; no renombres un MP3 como WAV. Máximo ocho blips y tres finales, sin rutas externas. La propiedad antigua `end` sigue siendo compatible con configuraciones anteriores; la configuración actual usa la lista `ends`. El navegador no puede descubrir por sí solo archivos arbitrarios de una carpeta estática.
