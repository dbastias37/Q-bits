# Música de Q-bits

Esta carpeta está conectada al juego. Aún no contiene canciones: la lista vacía es válida y el juego funciona en silencio.

## Subir tus temas

1. En GitHub abre `assets/audio/music/` y usa **Add file → Upload files**.
2. Sube tus archivos de audio. Para simplificar las rutas puedes llamarlos `ambiente-01.mp3`, `ambiente-02.mp3`, etc. Conserva esos mismos nombres, incluidas mayúsculas y extensión, en la lista.
3. Edita `playlist.json` y reemplaza su contenido por una lista como esta, incluyendo solamente archivos que ya subiste:

```json
{
  "volume": 0.3,
  "fadeSeconds": 3,
  "tracks": [
    { "file": "ambiente-01.mp3", "title": "Ambiente 1" },
    { "file": "ambiente-02.mp3", "title": "Ambiente 2" }
  ]
}
```

4. Guarda los cambios en `main`. Cuando termine la publicación, recarga el juego.

`volume` va de `0` a `1`; `0.3` es el volumen inicial. `fadeSeconds` controla la entrada y salida suaves de cada tema, entre `0` y `10` segundos. Los temas se reproducen en el orden escrito y la lista vuelve al principio al terminar. El título no cambia el nombre del archivo.

Usa MP3 para una compatibilidad amplia. También se admiten OGG, M4A y WAV si el navegador puede reproducirlos. Para temas largos conviene usar archivos comprimidos: la precarga descarga las canciones completas. Por ejemplo, un WAV largo ocupa mucho más que su MP3 equivalente. No subas ZIP ni pegues enlaces de páginas de Suno en `file`: tiene que ser el archivo de audio exportado.

El porcentaje de carga espera a que se descarguen los archivos configurados y comprueba que el navegador pueda reproducir cada uno. Si un archivo falta o falla, aparece el error de carga; no se simula un 100 %. El sistema usa reproducción de audio del navegador, sin decodificar todas las canciones en grandes buffers de memoria.

La música comienza con **Jugar**, se pausa cuando la pestaña queda oculta y se reanuda al volver si estaba activa. El volumen y el silencio que elija el jugador quedan guardados en ese navegador. Una configuración previa de volumen tiene prioridad sobre el valor inicial del JSON.

## Integración en el código

`assets/js/music.js` expone `window.QBitsMusic`:

```js
await QBitsMusic.preload({
  onProgress: ({ progress, label }) => actualizarCarga(progress, label)
});
// Llamar directamente desde el clic del jugador, sin esperar antes otra promesa.
QBitsMusic.start();
QBitsMusic.setPaused(true); // Pausa explícita; false reanuda si se había iniciado.
QBitsMusic.setVolume(0.25);
QBitsMusic.setMuted(true);
```

`preload` rechaza su promesa ante errores. Un reintento vuelve a cargar la configuración y libera las URL temporales anteriores. `getState()` informa si hay pistas, si está preparado, si está reproduciendo y cualquier error. `dispose()` detiene el reproductor y libera sus recursos.
