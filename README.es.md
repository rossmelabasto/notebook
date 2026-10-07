<div align="center">

<img src="public/icon-192.png" width="72" alt="Logo de Notebook" />

# Notebook

**Tus apuntes como un chat contigo mismo, con memoria.**<br/>
Escribe, pega, sácale foto a la pizarra o graba una nota de voz. Después pregúntale a tus apuntes, búscalos al instante y estudia con flashcards hechas con lo que *tú* escribiste.

[Demo en vivo](https://notebook.rossmel.top) · [Instalarlo](#instalarlo-en-tu-servidor) · [Cómo funciona](docs/ARCHITECTURE.md) · [English](README.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/desktop-dark.webp" />
  <img src="docs/screenshots/desktop-light.webp" alt="Un apunte en Notebook" width="900" />
</picture>

</div>

## Qué hace

- **Un chat contigo mismo:** cada apunte es un hilo de texto, imágenes y notas de voz. Los mensajes aparecen al instante y se envían en orden en segundo plano, así que escribir nunca se traba, aunque la red esté lenta. Los borradores sobreviven a recargar.
- **Pregúntale a tus apuntes:** la respuesta llega en vivo, usa **solo** tus apuntes y trae citas que te llevan al mensaje exacto. Las conversaciones recuerdan el contexto.
- **Fotos y voz que se leen:** la IA transcribe las fotos de la pizarra y las notas de voz, así también se pueden buscar y preguntar.
- **Estudiar:** resúmenes, flashcards y quizzes de opción múltiple de un apunte o una materia, opcionalmente enfocados en un tema.
- **Búsqueda al instante:** `Ctrl+K` busca palabras en todos los apuntes (sin importar tildes), también dentro de fotos y audios.
- **Importar WhatsApp:** trae el chat del grupo del curso (`.zip` con fotos y audios, o el `.txt` pegado).
- **Tuyo:** corre en tu servidor con un solo archivo SQLite, varios usuarios aislados entre sí, exportación a Markdown/zip, se instala como app, tema claro/oscuro y en español/inglés.
- **Gratis:** pensado para los planes gratuitos de Groq (chat y voz) y Gemini (búsqueda por significado y lectura de imágenes). El panel de admin muestra la cuota gratis del día (exacta para Groq, estimada para Gemini).
- **Demo pública (opcional):** con `DEMO_ENABLED=1` aparece *Probar la demo*: una cuenta temporal de 24 h con apuntes de ejemplo, flashcards y un quiz, con límites estrictos (pocas preguntas a la IA, archivos chicos, sin importar) y un tope diario global para no gastar la cuota de los usuarios reales.

## Instalarlo en tu servidor

Necesitas Node.js 24+, Linux o macOS (x64 o arm64: alcanza con una Raspberry Pi o una PC vieja) y claves gratuitas de [Groq](https://console.groq.com/keys) y [Google AI Studio](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/rossmelabasto/notebook.git
cd notebook
npm ci --omit=dev
cp .env.example .env      # pon GROQ_API_KEY, GEMINI_API_KEY y un SETUP_TOKEN al azar
npm start                 # http://127.0.0.1:8094
```

Abre la página, toca **Entrar** y usa el `SETUP_TOKEN` para crear la cuenta de administrador. Desde *Cuenta → Usuarios* creas las demás.

El servidor solo escucha en `127.0.0.1`: publícalo con un proxy o túnel que ponga HTTPS (Caddy, nginx, Cloudflare Tunnel…). En `deploy/` hay ejemplos de unidades systemd para el servicio y el backup diario, y `npm run deploy` actualiza tu servidor por SSH con copia de la base y vuelta atrás automática si algo falla. Todas las variables están explicadas en [`.env.example`](.env.example) y en el [README en inglés](README.md#configuration).

## Desarrollo

```bash
npm ci
npm test       # 30 tests con base temporal e IA falsa (sin red)
DATA_DIR=/tmp/nb EMBED_PROVIDER=fake CHAT_PROVIDER=fake SETUP_TOKEN=dev PORT=8394 node server.js
```

Estructura: `routes/` (API), `lib/` (base y migraciones, RAG, proveedores de IA, trabajos en segundo plano) y `public/js/` (frontend en módulos, textos en `i18n.js`). Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[MIT](LICENSE) © Rossmel Abasto — [portfolio.rossmel.top](https://portfolio.rossmel.top)
