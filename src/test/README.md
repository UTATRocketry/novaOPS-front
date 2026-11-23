# Frontend tests

Vitest tests for novaOPS-front. Each test file sits next to the code it
tests (`Foo.tsx` → `Foo.test.tsx`). This folder holds the helpers they share.
Why Vitest and not Jest is in Nova-Collected's
`docs/design/adr-0001-use-vitest-for-frontend-tests.md`.

## Run them

From the repo root:

```powershell
npm ci
npm test
```

| To | Run |
|---|---|
| Run once | `npm test` |
| Re-run on save | `npm run test:watch` |
| Run with coverage, as CI does | `npm run coverage` |
| Run one file | `npx vitest run src/lib/pid/bridge.test.ts` |
| Run tests whose name matches | `npx vitest run -t "keeps at most 60 steps"` |

> [!TIP]
> The full suite starts one worker per file and can run a machine out of
> memory. If it does, add `--maxWorkers=2`.

Tests run through Vite, not Next, so a passing test run doesn't prove the app
builds. Before a PR, also run:

```powershell
npm run typecheck
npm run build
```

Don't run `npm run lint`: there's no ESLint config, and it waits for input.

## How the tests are set up

`vitest.config.mts` runs every `src/**/*.test.{ts,tsx}` in jsdom, resolves the
`@/` alias from `tsconfig.json`, and turns on `restoreMocks`, so spies are
restored after each test.
`vitest.setup.ts` runs before each file and:

- adds the jest-dom matchers (`toBeInTheDocument()` and the rest);
- replaces `uplot` with the recording fake in `uplotMock.ts`, because uPlot
  needs a real canvas;
- stubs the browser APIs jsdom lacks (`matchMedia`, `ResizeObserver`,
  `IntersectionObserver`, `scrollTo`, `scrollIntoView`);
- unmounts everything and resets the uPlot fake after each test.

## Helpers in this folder

| File | Use it for |
|---|---|
| `render.tsx` | `renderWithProviders(<Component />)`: renders inside the app's providers (Chakra theme, colour mode, React Query). Use it for every component test. |
| `queryWrapper.tsx` | A React Query client that never retries or caches across tests, and a `wrapper` for `renderHook`. Use it for hook tests. |
| `uplotMock.ts` | `FakeUPlot` records what each chart was built with and every call made to it, so a test can assert on what would have been drawn. Installed for every test already. |
| `fakePaper.ts` | A stand-in for JointJS's `dia.Paper`, which doesn't start under jsdom. It lets P&ID tests (`PidBridge`, `PidCanvas`) fire the pointer events a real paper would. |

## Mocking the backend

Never let a test reach a real backend. There are two ways to stand in for it:

- **Components and hooks:** mock the whole API module and give each call
  the answer the test needs.

  ```ts
  import * as api from "@/lib/api";
  vi.mock("@/lib/api");
  const mocked = vi.mocked(api);

  beforeEach(() => {
    mocked.getMqttTopics.mockResolvedValue({ topics: [] });
  });
  ```

  An auto-mocked function returns `undefined`. If the component calls
  `.then()` on it, the test fails with "Cannot read properties of undefined
  (reading 'then')". When a component starts calling a new API function, give
  that function a resolved value in its tests.

- **The REST client itself** (`src/lib/api/*.test.ts`): use MSW
  (`msw/node`) to answer HTTP requests at `http://nova.test`. A request with
  no handler fails the test instead of reaching the network.

The WebSocket is faked by replacing the global: `vi.stubGlobal("WebSocket",
FakeWebSocket)`. `consoleViews.test.tsx` and `src/lib/ws/NovaSocket.test.ts`
show how.

## Known gaps (`it.fails`)

A test written with `it.fails` describes behaviour the app should have but
doesn't yet. The comment above it says what's wrong, usually starting "Known
gap:". Vitest counts these as "expected fail", so they don't fail the run.

When you fix one of those gaps, its test starts passing, and Vitest then fails
it. Change `it.fails` to `it` and delete the comment in the same PR. Write a
new `it.fails` test, with its comment, when you find a gap you aren't fixing.

## Timers and slow tests

- Use fake timers (`vi.useFakeTimers()` and `vi.advanceTimersByTime()`) for
  reconnects, debounces and polling; never wait on real time.
- The default timeout is 5 s. Windows CI runners with coverage on are much
  slower than a laptop. If a heavy test needs longer, give that test its own
  timeout (`it("...", () => { ... }, 20_000)`) with a comment saying why,
  rather than raising the global one.

## CI

`.github/workflows/pr-checks.yml` runs on every PR:

- **build** (Ubuntu, Node 22): `npm run typecheck`, then `npm run build`.
- **test** (Ubuntu and Windows, Node 22): `npm run coverage`. The coverage
  report is uploaded as the `coverage-<os>` artifact. There's no coverage
  floor.
