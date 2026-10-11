# 🏛️ Biblioteca de Alejandría

App web progresiva (PWA) en español para llevar el control de lo que lees y ves: **manhwas, mangas, animes, series, películas** y tus **equipos de fútbol**. Funciona en el teléfono Android, se instala en la pantalla de inicio, sirve sin internet y es 100 % gratis.

**👉 Abrir la app:** https://juanph-m.github.io/biblioteca-de-alejandria/

> La app **solo guarda los links que tú pegas** y los abre en tu navegador. Nunca aloja, descarga, copia ni muestra capítulos, episodios ni videos.

---

## ✨ Qué hace

- **Catálogo** por tipo (Manhwa, Manga, Anime, Serie, Película) y estado (Pendiente, Viendo/Leyendo, En emisión, Pausado, Terminado, Abandonado), con filtros por tipo, estado, plataforma y favoritos, buscador, orden y vista en cuadrícula o lista.
- **Contador** grande de un toque (+1 / −1 / edición manual). Botón +1 también en cada tarjeta.
- **Series y películas: solo registro.** Eliges la plataforma (Netflix, Prime Video, Disney+, HBO Max, YouTube o Crunchyroll) y llevas por dónde vas, sin links que abrir. En series con datos de TVmaze la app conoce cuántos episodios tiene cada temporada y pasa sola a la siguiente; en películas guarda la fecha en que la viste.
- **Calificación** de 1 a 5 estrellas y **favoritos**.
- **Portadas e información automática** al escribir el nombre:
  - Manhwa, manga y anime: [AniList](https://anilist.co) (gratis, sin clave).
  - Series: [TVmaze](https://www.tvmaze.com) y [Wikipedia](https://es.wikipedia.org) (gratis, sin clave).
  - Películas: [Wikipedia](https://es.wikipedia.org) (gratis, sin clave): nombre, sinopsis y póster.
  - Portada propia por link o desde la galería del teléfono.
- **Dónde lo lees**: links de lectura por obra (manhwa, manga y anime), una sección por plataforma y botón **Continuar** que abre el siguiente capítulo.
- **Reconocimiento de links de lectura**: detecta la obra y el capítulo, y arma el link del siguiente capítulo:
  | Sitio | Qué reconoce |
  |---|---|
  | `mhscans.com/series/{nombre}/capitulo-{N}/` | capítulo N, siguiente = N+1 |
  | `leercapitulo.co/leer/{código}/{nombre}/{N}/` | capítulo N, siguiente = N+1 |
  | `manhwaweb.com/leer/{nombre}-_{id}-{N}_{sufijo}` | probable capítulo N (tú lo confirmas una vez) |
  | `olympusxyz.com/capitulo/{id}/{nombre}` | nombre y link; el número es interno, capítulo manual |
  | Sitios nuevos | te muestra los números del link para que toques el del capítulo y recuerda el patrón |
- Si pegas el link de un capítulo nuevo de una obra que ya tienes, **actualiza el progreso** en vez de duplicarla.
- **Compartir desde Chrome**: con la app instalada, en Chrome toca *Compartir → Alejandría* sobre un capítulo y se abre lista para actualizar.
- **Fútbol**: busca y agrega equipos; próximos partidos y últimos resultados con [TheSportsDB](https://www.thesportsdb.com). Sin escudos oficiales: iniciales con colores.
- **Notas** por obra y **spoilers** ocultos y borrosos que se revelan al tocarlos.
- **Importar marcadores de Chrome**, **respaldo JSON** (unir o reemplazar) y recordatorio del último respaldo.
- **Estadísticas**: totales por tipo y estado, capítulos leídos, episodios vistos, favoritas, racha diaria y mapa de actividad.
- Modo oscuro moderno (con opción AMOLED y 5 colores), animaciones suaves, portadas con efecto 3D y respeto a "reducir movimiento".

---

## 📲 Instalar en Android ("Agregar a pantalla de inicio")

1. Abre **https://juanph-m.github.io/biblioteca-de-alejandria/** en **Google Chrome**.
2. Toca el menú **⋮** (arriba a la derecha).
3. Elige **Instalar app** o **Agregar a pantalla de inicio**.
4. Confirma con **Instalar**. Aparecerá el ícono del templo dorado.

También puedes ir a **Ajustes → Instalar app** dentro de la aplicación.

---

## 🔖 Exportar los marcadores de Chrome desde el computador

1. En el computador abre Chrome y presiona **Ctrl + Shift + O** (Administrador de marcadores).
2. Toca **⋮** (arriba a la derecha, en la barra azul/gris) → **Exportar marcadores**.
3. Guarda el archivo `.html` (por ejemplo `bookmarks_11_10_26.html`).
4. Pásalo al teléfono (Google Drive, WhatsApp, correo o cable).
5. En la app: **Ajustes → Importar marcadores → Elegir archivo .html**.
6. Revisa la lista: la app junta los marcadores de la misma obra dejando el capítulo más alto y sugiere el estado según el nombre de la carpeta (por ejemplo *Leyendo*, *Terminados*, *Pendientes*). Quita lo que no quieras, ajusta tipo/estado y toca **Guardar**.
7. Opcional: deja que busque portadas automáticamente.

---

## 💾 Respaldos

Tus datos viven **solo en tu teléfono** (IndexedDB). Haz respaldos para no perderlos si borras el navegador o cambias de celular.

- **Exportar**: *Ajustes → Exportar respaldo (JSON)*. Se descarga `biblioteca-alejandria-AAAA-MM-DD.json` con obras, progreso, notas, spoilers, links, patrones de sitios, equipos y ajustes. Guárdalo en Drive o en tu computador.
- **Importar**: *Ajustes → Importar respaldo* y elige:
  - **Unir**: agrega lo nuevo y conserva la versión más reciente de cada obra.
  - **Reemplazar**: borra lo actual y deja exactamente lo del respaldo.
- En Ajustes verás la **fecha del último respaldo**; si pasan más de 2 semanas, la app te lo recuerda.

---

## 🔄 Cómo actualizar la app

**Como usuario:** la app revisa sola si hay versión nueva. Cuando la haya, verás el aviso *"Hay una nueva versión de la app"* → toca **Actualizar**. Si no aparece, cierra la app por completo y vuelve a abrirla.

**Como desarrollador (publicar cambios):**

1. Edita los archivos (HTML, CSS y JS sin compilación).
2. Sube el número `VERSION` en `sw.js` (por ejemplo `v1.0.1`) y `APP_VERSION` en `js/app.js`. Esto hace que los teléfonos descarguen la nueva versión.
3. Haz commit y push a la rama `main`:
   ```bash
   git add -A
   git commit -m "Describe el cambio"
   git push
   ```
4. GitHub Pages publica en 1–2 minutos.

Para probar en tu computador: `python tools/dev-server.py` y abre http://127.0.0.1:5173 (el service worker se desactiva en `localhost`, pero funciona en `127.0.0.1` para probar sin conexión). Los íconos se regeneran con `node tools/generate-icons.mjs`.

---

## 🧱 Tecnología

- HTML, CSS y JavaScript (módulos ES) **sin paso de compilación** ni dependencias.
- **IndexedDB** para los datos, **service worker** para funcionar sin internet, `manifest.json` con íconos propios, accesos directos y *share target*.
- Publicada gratis en **GitHub Pages**.

## ⚖️ Avisos legales y atribuciones

- La app no aloja ni muestra contenido de terceros: solo guarda y abre los links que tú agregas.
- Datos e imágenes de manhwa/manga/anime: **AniList**. Datos de series: **TVmaze** (CC BY-SA 4.0).
- Textos de películas y series: **Wikipedia** (CC BY-SA 4.0).
- Datos de fútbol: **TheSportsDB**. No se muestran escudos de clubes.

## 📄 Licencia

[MIT](LICENSE) © 2026 JuanPH-M
