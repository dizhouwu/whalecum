# WhaleCum 13F Tracker — backend: Pixi, frontend: npm

.PHONY: install backend frontend docker-up docker-down

# Backend deps (Pixi)
install-backend:
	cd backend && pixi install

# Frontend deps
install-frontend:
	cd frontend && npm install

install: install-backend install-frontend

# Start backend (Pixi)
backend:
	cd backend && pixi run start

# Start frontend dev server
frontend:
	cd frontend && npm run dev

docker-up:
	docker compose up --build

docker-down:
	docker compose down
