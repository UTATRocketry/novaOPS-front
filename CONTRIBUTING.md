# Contributing to novaOPS-front

**The rules for all Nova repos are in
[Nova-Collected/CONTRIBUTING.md](https://github.com/UTATRocketry/Nova-Collected/blob/main/CONTRIBUTING.md).
Read that first.** In short:

- `dev` collects finished work for hardware testing; `main` is what prod runs.
- Branch from `dev` as `feature/...`, `bugfix/...` or `chore/...`, e.g. `bugfix/fas-port-reconnect`.
- Open a PR **into `dev`**, titled `type(scope): what changed`, and fill in the template.
- CI green + 1 approval (a lead's if it can move hardware), then **Squash and merge**.
- Leads bring tested releases into `main`; you never merge into `main` yourself.

**Where to work:** clone this repo into the `dev/` folder of a Nova-Collected
clone, e.g. `Nova/dev/frontend` (see "Getting started as a developer" in the
Nova-Collected README), or anywhere else you like. Branch from `dev` there.
Never work in the `prod/` or `pi/` submodules of Nova-Collected: they show the
released version and are overwritten when it changes.

This file only covers what is specific to this repo.

## Before you open a PR

```bash
npm ci
npm run typecheck
npm run build
```

CI runs the same checks on every PR.

## Simulator Test (level 2)

Run the backend with its simulators (see novaOps-back `CONTRIBUTING.md`), then
`npm run dev`, and go through the testing procedure
([testing procedure](https://github.com/UTATRocketry/Nova-Collected/blob/main/docs/development/testing-procedure.md)). The UI talks to the backend
URL in `.env.local`; copy `.env.example` to start.

## Scopes for PR titles

`ui`, `plots`, `diagram`, `commands`, `config`, `api`, `ws`

## Things to know

- Controls that command actuators are hardware changes even though they're
  "just UI": tick the actuator box in the PR template.
- Never commit `.env.local` or `.env.production` (`Nova.ps1` generates the
  latter on the ground station).
