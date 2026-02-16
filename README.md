# Hash-Based Moon Rock Shape Generator

A frontend-only BSV BRC-102 project using React + Vite under `frontend/`.

## Layout

- `deployment-info.json` at project root for BRC-102 tooling.
- `frontend/` contains the app source and package.
- `frontend/src/App.jsx` has the deterministic moon-rock renderer.
- `frontend/src/main.jsx` boots the app.
- `frontend/src/styles.css` styles the UI.

## Tooling scripts

- `npm run install:tooling` installs project CLI tooling (`@bsv/lars`, `@bsv/cars-cli`).
- `npm run install:frontend` installs frontend dependencies.
- `npm run dev` runs the frontend.
- `npm run build` builds the frontend.
- `npm run preview` previews the frontend build.
- `npm run lars` launches LARS for this project.
- `npm run cars` runs CARS CLI commands.

## BRC-102 deployment-info

- `schema`: `bsv-app`
- `schemaVersion`: `1.0`
- `frontend.language`: `react`
- `frontend.sourceDirectory`: `./frontend`
- `configs`
  - `Local LARS` runs `frontend` with provider `LARS` on `testnet`.
  - `production` deploys `frontend` to a CARS provider over HTTPS.

## LARS/CARS setup

1. Update `deployment-info.json` for your real deployment.
2. Replace `deployment-info.json::configs[1].projectID`.
3. Set `CARSCloudURL` to your CARS cloud endpoint.
4. Run `npm run install:tooling` then `npm run lars` or `npm run install:frontend` and `npm run dev` for local UI.
