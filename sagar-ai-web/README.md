# Sagar AI web

## Testing on a phone

```
phone ──► http(s)://<PC-IP>:5173  Vite (this app)
              │ API calls
              ▼
          <PC-IP>:4000            sagar-ai-server
              │ loopback only
              ▼
          127.0.0.1:11434         Ollama (never reachable from the phone)
```

Leave `VITE_API_BASE_URL` **unset** in development. The API URL follows the
page's host: `localhost:5173` → `localhost:4000`, and a phone opening
`192.168.1.34:5173` → `192.168.1.34:4000`. Setting it to `localhost` would
point the phone at itself. The rules are in `src/services/api/apiBaseUrl.ts`.

### HTTP: chat and marine data (no voice)

```
cd sagar-ai-server && npm run dev
cd sagar-ai-web    && npm run dev:lan      # = npx vite --host 0.0.0.0
```

Open `http://<PC-IP>:5173` on the phone. To check the backend directly, open
`http://<PC-IP>:4000/api/health`.

Voice input can't work over plain http on a phone. Browsers only expose the
microphone on https or `localhost`, so the app says "Voice input requires
HTTPS on this device".

### HTTPS: adds voice input

The setup is done once, with [mkcert](https://github.com/FiloSottile/mkcert).
mkcert creates a local certificate authority (CA) that your PC and phone
trust, so you need no browser flags and get no click-through warnings.

1. Install mkcert: `winget install FiloSottile.mkcert`, then `mkcert -install`.
2. In `sagar-ai-web`:
   ```
   mkdir certs
   mkcert -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem localhost 127.0.0.1 <PC-IP>
   ```
3. Trust the CA on the phone. `mkcert -CAROOT` shows the folder. Copy
   **`rootCA.pem` only** to the phone. Never copy `rootCA-key.pem`.
   - **Android:** Settings → Security → More security settings → Encryption & credentials →
     Install a certificate → CA certificate → `rootCA.pem`. Menu names vary by vendor.
   - **iPhone:** AirDrop the file → Settings → Profile Downloaded → Install, then
     Settings → General → About → Certificate Trust Settings → turn on the mkcert CA.
4. Run `npm run dev:https` and open `https://<PC-IP>:5173` on the phone.

Over https, the app sends API calls to its own origin and Vite proxies `/api`
to the backend on `127.0.0.1:4000`. A direct `http://…:4000` call would be
blocked as mixed content. `npm run dev` (plain http) is unchanged for desktop.
If the PC's IP changes, rerun step 2 with the new IP. `certs/` is gitignored
because it holds a private key.

Browser support for speech recognition:
- Chrome on Android: needs internet, because it uses Google's speech service.
- Safari on iOS: supported from iOS 14.5.
- Firefox: not supported. The app says "Voice recognition is not supported by
  this browser".

### Diagnostics (development only)

Click the **DEV** tab on the right edge to open the diagnostics panel. It shows:
- the frontend and backend URLs
- whether the backend is reachable
- whether the backend can reach Ollama (`GET /api/health/llm`)
- the last API request and its result
- every active fallback, with the failed endpoint and the reason
- voice support, secure context and mic permission

The same facts are logged to the console as `[sagar]` and `[sagar-api]`
lines. The server logs `[cors] Rejected browser origin …` when CORS blocks a
browser origin.

Expected labels: **Sea state**, **Weather** and **Route status** always show
`FALLBACK`, on desktop too, because they come only from Sagar's configured
dataset. Risk, wind, waves and sea temperature show `RECENT` when the backend
returns current model data.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
