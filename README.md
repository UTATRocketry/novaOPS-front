# NovaOps — Frontend

Next.js + Chakra UI v3 ground control station.

## Set up

```bash
npm install
cp .env.example .env.local   # point at your backend
npm run build
```

## Run It
```
# for development
npm run dev                  # http://localhost:3000

# for production
npm run start
```


`npm run typecheck` and `npm run build` both pass. (In a sandbox without
network access to Google Fonts the build can't fetch Inter/JetBrains Mono;
on a normal machine this works.)

## Notes / decisions baked in

- Color mode: dark is the default (bunker/night operation).
- Chrome colours (`chrome.*`) are fixed dark and do NOT follow color mode —
  this is what keeps the nav rail and top bar dark in light mode.
- All "no data" states render an explicit dash, never a fabricated `0` —
  important for a control surface (see the resilience section of the plan).
- Icons use the Material Symbols variable font; weight/fill is centralized in
  `Icon.tsx`.
