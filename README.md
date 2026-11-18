# NovaOps Frontend

The operator UI for the Nova ground station: live engine and flight-computer
data, the interactive P&ID, configuration and analysis tools, in any browser.
Built with Next.js, React and Chakra UI v3. It talks only to the
[NovaOps backend](https://github.com/UTATRocketry/novaOps-back), which checks
every command before anything moves.

> [!IMPORTANT]
> This is a control surface. "No data" always renders as "—", never a made-up
> `0`, so an operator can tell stale from zero. Keep it that way
> ([style guide](https://github.com/UTATRocketry/Nova-Collected/blob/main/docs/development/style.md#typescript-and-react-frontend)).

## Repo structure

```
src/
├── app/            pages: engine, flight, devices, console, config, tools, settings
├── components/     primitives/ (shared), shell/ (app frame), and one folder per page
├── hooks/          data hooks (React Query, store)
└── lib/            no-React logic: api/ (REST), ws/ (WebSocket), store/, theme/, ...
public/             fonts, logos
tools/              backend_API.http: sample requests for the backend
```

Where new code goes: [organization guide](https://github.com/UTATRocketry/Nova-Collected/blob/main/docs/development/organization.md#novaops-front-frontend).

## Getting started

### Set up

Node.js 20+, and a running backend (see the backend's README).

```bash
npm install
cp .env.example .env.local
```

`.env.local` points at the backend. When the UI and backend share a host, the
URLs can be left unset; they're derived from the page's address.

| Variable | Default in `.env.example` |
|---|---|
| `NEXT_PUBLIC_NOVA_API_BASE_URL` | `http://localhost:8000` |
| `NEXT_PUBLIC_NOVA_WS_BASE_URL` | `ws://localhost:8000` |
| `NEXT_PUBLIC_NOVA_FAKE_SIGNAL` | `0` (dev only: fake signal strength) |

### Run

```bash
npm run dev          # development, http://localhost:3000
npm run build && npm run start   # production
```

Check a change the way CI does:

```bash
npm run typecheck
npm run build
```

> [!NOTE]
> On the ground station the UI runs as a Windows service managed by
> Nova-Collected's `ops/Nova.ps1`.

### Troubleshoot

| Symptom | Fix |
|---|---|
| Every value shows "—" | The backend isn't reachable, or nothing is publishing. Check `.env.local` and that the backend and a simulator are running |
| `npm run build` fails fetching fonts | The build downloads Inter and JetBrains Mono from Google Fonts; it needs internet |
| `npm run lint` hangs | There's no ESLint config yet, so it waits for input. Don't run it in scripts |
| Commands do nothing | Your session is a `viewer`. Take a role in Settings |

More: [Nova SUPPORT.md](https://github.com/UTATRocketry/Nova-Collected/blob/main/SUPPORT.md).

## More information

| To... | Read |
|---|---|
| Use the UI as an operator | [Operator guide](https://github.com/UTATRocketry/Nova-Collected/blob/main/docs/user-guides/operator-guide.md) |
| Look up the backend API | [Backend API](https://github.com/UTATRocketry/Nova-Collected/blob/main/docs/api/backend-api.md), or `/docs` on a running backend |
| Follow code style | [Style guide](https://github.com/UTATRocketry/Nova-Collected/blob/main/docs/development/style.md) |
| See what changed in each release | [CHANGELOG.md](CHANGELOG.md) |
| Contribute | [CONTRIBUTING.md](CONTRIBUTING.md) |
| See the whole system | [Nova-Collected](https://github.com/UTATRocketry/Nova-Collected) |
