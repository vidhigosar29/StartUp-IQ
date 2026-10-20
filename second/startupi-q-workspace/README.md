# StartupIQ Workspace — React + Express + MongoDB

Standalone green StartupIQ Workspace prototype with a React/Vite frontend and Express/Mongoose API.

## Project structure
- `src/` — React frontend, setup flow, dashboard, local/API service adapter.
- `backend/` — Express API, MongoDB models, workspace and record CRUD routes.

## Run the frontend
From the project root:

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`. The default API URL is `http://localhost:5000/api`.

## Run the backend in a second terminal
Open a second terminal and run:

```bash
cd backend
npm install
Copy-Item .env.example .env  # PowerShell; on macOS/Linux use: cp .env.example .env
```

Set `MONGODB_URI` in `backend/.env` to your MongoDB Atlas URI. Keep `.env` private. Then run:

```bash
npm run dev
```

Test `http://localhost:5000/api/health`. The backend needs a valid MongoDB connection to start. The frontend and backend must both be running for MongoDB mode.

## Frontend/API behaviour
- New workspace setup sends `POST /api/workspaces`.
- Existing MongoDB workspace is loaded on startup.
- A browser-only workspace created by the earlier prototype is migrated to MongoDB, including its local records, when the API is reachable.
- Products, inventory, sales, expenses, customers and experiments use the workspace-scoped records API.
- If the API is unavailable, the UI falls back to browser storage and shows `Local mode`.
- The top bar shows `MongoDB connected` or `Local mode`.

## Important
No authentication is included, per the current prototype requirement. Keep this local. Before deploying publicly, add authentication/authorization and enforce workspace ownership on every API route. Workspace IDs are identifiers, not access controls.
