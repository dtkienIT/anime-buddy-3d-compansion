# 3D Buddy Viewer

Standalone VRM viewer with every `.vrm` model, `.vrma` animation, and room background copied from the main app.

## Run

For the AI companion MVP, create `.env` with your Mistral settings, then double-click:

```bat
start-ai.bat
```

Or run from this folder:

```bat
node server.mjs
```

Then open:

```text
http://127.0.0.1:3001/index.html
```

The Node server serves the static viewer and exposes `POST /api/chat`, so the Mistral API key stays on the backend.

For the original viewer without chatbot backend, double-click:

On Windows, double-click:

```bat
start-mika.bat
```

Or run from this folder:

```bat
python -m http.server 8090 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8090/index.html
```

Do not open `index.html` directly with `file://`; browsers block local 3D asset loading.

## Folder Contents

- `index.html`: the standalone page.
- `app.bundle.js`: bundled Three.js, VRM loader, animation code, and switcher UI logic.
- `chat-client.js`: text chat UI, response validation, and animation state mapping.
- `server.mjs`: local Node backend that calls Mistral and serves the app.
- `src/app.js`: source used to build `app.bundle.js`.
- `vrm-models/`: all 10 VRM models from `frontend/public/vrm-models`.
- `animations/`: all 18 VRMA animations from `frontend/public/animations`.
- `backgrounds/`: all 7 room backgrounds from `frontend/public/backgrounds`.
- `start-mika.bat`: one-click local server launcher for Windows.
- `start-ai.bat`: one-click local AI companion launcher for Windows.

## Controls

- Model buttons switch between Mika, Kato, Sam, Vivi, Tita, Luna, Naruto, Changli, Yinlin, and Carlotta.
- Animation buttons switch between the bundled VRMA actions.
- Background buttons switch between Study Room, Cozy Night, Cozy Lounge, Pastel Study, Forest Path, Lake Meadow, and Neon Tech.
- Buddy Chat sends messages to Mistral, plays Thinking while waiting, reacts with an allowed animation, then returns to Relax.
