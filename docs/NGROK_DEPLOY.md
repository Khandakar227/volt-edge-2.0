# VoltEdge ngrok deployment

This setup makes your PC the server:

- FastAPI runs locally on `127.0.0.1:8787`.
- A small Node public server runs locally on `127.0.0.1:8080`.
- The public server serves `frontend/dist` and proxies `/api/*` to FastAPI.
- ngrok exposes `127.0.0.1:8080` at your ngrok domain.

Using one public origin keeps the frontend API calls simple because the app already
uses relative paths such as `/api/projects` and `/api/projects/:id/events`.

## 1. Keep secrets in `.env`

`.env` is already ignored by git. Use this shape:

```bash
NGROK_AUTH_TOKEN=your_real_token_here
NGROK_DOMAIN=elective-reoccupy-unknown.ngrok-free.dev
PUBLIC_PORT=8080
BACKEND_PORT=8787
```

Do not commit the real token. `.env.example` is safe to commit because it contains
only placeholders.

## 2. Install ngrok

Install ngrok with the Linux/Apt command from the ngrok dashboard. After that,
confirm the binary is available:

```bash
ngrok version
```

## 3. Run VoltEdge through ngrok

From the repo root:

```bash
./scripts/start-ngrok.sh
```

The script will:

1. Build the frontend.
2. Start the FastAPI backend.
3. Start the local public server on `127.0.0.1:8080`.
4. Configure ngrok with `NGROK_AUTH_TOKEN`.
5. Start ngrok for your `NGROK_DOMAIN`.

Open:

```text
https://elective-reoccupy-unknown.ngrok-free.dev
```

Health check:

```text
https://elective-reoccupy-unknown.ngrok-free.dev/api/health
```

## Troubleshooting

### `EADDRINUSE: address already in use 127.0.0.1:8080`

An old local public server is already using the port. Find it:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Stop the old terminal/process, then rerun:

```bash
./scripts/start-ngrok.sh
```

Or choose a different local public port in `.env`:

```bash
PUBLIC_PORT=8081
```

The public ngrok URL can stay the same; ngrok will forward to the new local port.

### `Backend port 127.0.0.1:8787 is already in use`

An old FastAPI backend is still running. Find it:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

Stop it:

```bash
kill <PID>
```

Then rerun:

```bash
./scripts/start-ngrok.sh
```

Or choose a different backend port in `.env`:

```bash
BACKEND_PORT=8788
```

### `ERR_NGROK_334 endpoint is already online`

Your ngrok domain is already attached to another running ngrok agent. Stop the old
ngrok process or close the old terminal that is running it. You can also stop it
from the ngrok dashboard endpoints page.

If you intentionally want multiple local agents behind the same ngrok endpoint,
add this to `.env`:

```bash
NGROK_POOLING_ENABLED=true
```

For a single-PC development deployment, stopping the old ngrok process is usually
cleaner than pooling.

If the browser console shows blocked requests to `postpig.tscircuit.com`, those
come from tscircuit/PostHog browser instrumentation and do not by themselves
mean VoltEdge failed. The important failure to investigate is any `/api/...`
request returning `500`.

If a workspace was partially created before a process stopped, the backend now
repairs missing root files on the next `/fsmap` load or agent session startup.
If the original editable `index.circuit.tsx` was already deleted, start a new
chat and resend the prompt after restarting the ngrok script.

## Why not local port 80?

You can expose any local port with ngrok. Using local `8080` avoids running your
app as root. The public URL is still HTTPS on the normal browser port.

## Optional: add ngrok OAuth protection

The backend can create workspaces and run agent turns on your PC, so avoid leaving
it open to the whole Internet. Copy the example policy and edit the email/domain:

```bash
cp deploy/ngrok-policy.example.yml deploy/ngrok-policy.yml
```

Then add this to `.env`:

```bash
NGROK_TRAFFIC_POLICY_FILE=deploy/ngrok-policy.yml
```

Run `./scripts/start-ngrok.sh` again.

## Running in the background

The ngrok `service install` command only keeps ngrok alive. VoltEdge also needs
the backend and local public server alive, so for a true background deployment use
a systemd service for `scripts/start-ngrok.sh`, or run it inside `tmux`.
