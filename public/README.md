# 📁 Directorio Multimedia Unificado (`public/media`)

Este directorio concentra y organiza todos los activos visuales, tipográficos y audiovisuales utilizados por la aplicación tanto en la **Vista del Espectador (Cliente)** como en el **Panel de Producción (Anfitrión / Admin)**.

---

## 📋 Catálogo de Archivos Multimedia

| Archivo | Tipo / Formato | Función y Uso en la Aplicación | Ubicación en el Código |
| :--- | :--- | :--- | :--- |
| **`video-offline-mario.mp4`** | Video MP4 (1080×1920) | Video de fondo en bucle para el estado **OFFLINE / Espera** con animación de Mario en pijama y letrero neón. | `index.html` (`#client-offline-video`) |
| **`logo-el-tio-mario.png`** | Imagen PNG Transparente | Logotipo oficial de cabecera de la marca **"El Tío Mario"**. | `index.html`, `admin.html`, `stage.js` |
| **`fondo-escenario-mario.jpg`** | Imagen JPG Vertical (9:16) | Fondo temático predeterminado para el Lienzo de Transmisión (Stage). | `stage.js` (Capa fondo), `client.css` |
| **`fondo-admin-mario.jpg`** | Imagen JPG Horizontal | Fondo decorativo de atmósfera Mario para la cabecera y consola de producción. | `admin.css` (`.host-header`) |
| **`fondo-alternativo-mario.jpg`** | Imagen JPG | Textura y fondo Mario alternativo de reserva para eventos temáticos. | Disponible en `public/media/` |
| **`fuente-mario-kart-ds.ttf`** | Fuente TrueType (TTF) | Tipografía retro oficial pixelada estilo **Mario Kart DS** para los nombres del chat y rótulos. | `chat.css` y `admin.css` (`@font-face`) |
| **`banner-jugador-amarillo.png`** | Imagen PNG Transparente | Rótulo / cintillo gráfico identificador de jugador en color **Amarillo**. | Selector de fuentes (+) y perfiles |
| **`banner-jugador-rojo.png`** | Imagen PNG Transparente | Rótulo / cintillo gráfico identificador de jugador en color **Rojo**. | Selector de fuentes (+) y perfiles |
| **`banner-jugador-verde.png`** | Imagen PNG Transparente | Rótulo / cintillo gráfico identificador de jugador en color **Verde**. | Selector de fuentes (+) y perfiles |
| **`banner-jugador-celeste.png`** | Imagen PNG Transparente | Rótulo / cintillo gráfico identificador de jugador en color **Celeste**. | Selector de fuentes (+) y perfiles |
| **`banner-jugador-morado.png`** | Imagen PNG Transparente | Rótulo / cintillo gráfico identificador de jugador en color **Morado**. | Selector de fuentes (+) y perfiles |
| **`banner-jugador-naranja.png`** | Imagen PNG Transparente | Rótulo / cintillo gráfico identificador de jugador en color **Naranja**. | Selector de fuentes (+) y perfiles |
| **`avatar-mario-retro.png`** | Imagen PNG | Ilustración / Sticker retro complementario de Mario. | Selector de fuentes (+) |

---

## 🚀 Cómo Referenciar estos Archivos en el Código

Al estar ubicados dentro de la carpeta `public/media/`, el empaquetador de Vite los copia directamente a la carpeta de salida `dist/media/`.

- **En archivos HTML (`index.html`, `admin.html`):**
  ```html
  <img src="./media/logo-el-tio-mario.png" alt="El Tio Mario">
  <video src="./media/video-offline-mario.mp4" autoplay loop muted playsinline></video>
  ```

- **En hojas de estilo CSS (`style.css`, `chat.css`, `admin.css`):**
  ```css
  @font-face {
    font-family: 'Mario Kart DS';
    src: url('./media/fuente-mario-kart-ds.ttf') format('truetype');
  }
  ```

- **En JavaScript (`stage.js`, `admin.js`, `script.js`):**
  ```javascript
  const logoUrl = './media/logo-el-tio-mario.png';
  const stageBgUrl = './media/fondo-escenario-mario.jpg';
  ```
