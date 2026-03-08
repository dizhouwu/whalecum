# WhaleCum

13F tracker for hedge fund holdings and investment insights. Track Whale Rock, Pershing Square, and D1 Capital — latest quarter only.

## Features

- **Cross-section**: Same quarter across funds — Holdings and Insights (consensus / popular).
- **Time-series**: 5 quarters per fund — see History and **Changes**:
  - **Double-downs**: Positions the fund added to (increased size) vs previous quarter.
  - **New entries**: Positions opened this quarter.
  - **Exits**: Positions closed vs previous quarter.
  - **Exits from 5q ago**: Positions that were in the portfolio 5 quarters ago and are now closed (profit-taking or view change).
- **Your fund list**: Edit `backend/funds.json` to track any funds (e.g. value/slower-oriented). No code change needed; list is re-read on each request.

## Tech Stack

- **Backend**: Python FastAPI, httpx, BeautifulSoup — **Pixi**
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Data**: SEC EDGAR API (free, no API key)

## Run with Docker (easiest)

No local Python or Node needed:

```bash
docker compose up --build
```

Then open **http://localhost:5173**. Backend runs on 8000, frontend on 5173 and proxies `/api` to the backend.

## WSL (Ubuntu) — port forwarding so Windows can open the app

The app binds to `0.0.0.0`, but from **Windows** you need a way to reach WSL’s ports.

**Option A — Cursor / VS Code Ports (recommended)**  
1. Open the **Ports** view (Panel → Ports, or `Ctrl+Shift+P` → “Focus on Ports View”).  
2. Click **Forward a Port**, add **5173** and **8000**.  
3. Open **http://localhost:5173** in your Windows browser.

**Option B — Use the WSL IP**  
When you run `npm run dev`, Vite prints a “Network” URL, e.g. `http://172.x.x.x:5173`. From Windows, open that URL in the browser (replace with the IP your terminal shows).

**Option C — Windows localhost (recent WSL2)**  
Newer WSL2 can forward `localhost` automatically. Try **http://localhost:5173** from Windows; if it works, no extra step.

## Run locally

### Backend (Pixi — preferred)

Install [Pixi](https://pixi.sh), then:

```bash
make install-backend   # once: cd backend && pixi install
make backend           # or: ./scripts/run-backend.sh
```

Or from `backend/`: `pixi install && pixi run start`. Pixi manages the environment in `backend/.pixi/`.


### Frontend

Requires Node 12+ (frontend is compatible with Node 12; for Node 18+ you can upgrade to Vite 5 in package.json):

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the backend.

**Note**: SEC requires a User-Agent. Default is `WhaleCum AdminContact@whalecum.local`. Edit `backend/config.py` if needed. The app adds short delays between SEC requests to stay under the 10 req/s limit.

**Caching**: 13F filings are final 45 days after quarter end (plus 1 month reporting window). The backend caches submissions (1 day TTL) and holdings (90 days TTL) under `backend/.cache/` so you can develop without hitting the network. Cache keys are by CIK and accession only — adding more funds in `funds.json` will cache their data on first use. Set `CACHE_ENABLED = False` in `backend/config.py` to always fetch live.

## Fund list

Edit `backend/funds.json` (JSON array of `{"name": "...", "cik": "..."}`). Add any institutional manager’s SEC CIK. Changes apply on next request (no restart). Example for value-oriented names: add CIKs for Baupost, Third Point, etc.

## API

- `GET /api/funds` — List funds (from funds.json) with latest 13F info
- `GET /api/funds/{cik}/history?quarters=5` — Last 5 quarters of holdings (time-series)
- `GET /api/funds/{cik}/changes` — Double-downs, trims, new entries, exits, exits from 5q, stalwarts/fading/new_in_5q
- `GET /api/holdings` — All funds' latest holdings (with total_value, concentration)
- `GET /api/holdings/{cik}` — Single fund latest holdings (with concentration)
- `GET /api/insights/consensus` — Stocks held by all funds
- `GET /api/insights/popular` — Most held stocks across funds
- `GET /api/insights/changes` — Cross-fund: consensus add, consensus exit, divergence
