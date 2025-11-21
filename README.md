# Majority Loss — 3D Multiplayer Psychological Party Game
Backend: Node.js + Socket.IO + PostgreSQL
Frontend: Vite + Three.js + Modular UI System

## Overview
Majority Loss is a real-time multiplayer psychological deception party game where players aim to be in the minority vote to score points.
This version uses the V2 modular architecture designed for clean code, scalability, and long-term growth.

## Features
- 3D animated environment (Three.js)
- Multiplayer networking (Socket.IO)
- PostgreSQL persistence
- Modular frontend and backend separation
- Real-time questions, voting, scoring
- Secret missions
- Extensible AI Solo Mode (future)

## Project Structure (V2 Architecture)
majority-loss/
  apps/server/src
    ├─ index.js
    ├─ db.js
    ├─ rooms.js
    ├─ gameLoop.js
    ├─ missions.js
    ├─ ai.js
    ├─ utils.js

  apps/host/src
    ├─ table.js
    ├─ net/socket.js
    ├─ scene/scene.js
    ├─ scene/avatar.js
    ├─ ui/overlay.js
    ├─ ui/lobby.js (future)

## Environment Variables
apps/server/.env:

# Server
PORT=8080

# Render PostgreSQL Database (FULL URL REQUIRED — DO NOT SPLIT INTO MULTIPLE LINES)
RENDER_DATABASE_URL="postgresql://majority_loss_db_user:XiDzhJ28EKMTZpxnJquLVWvXX5CQWVK3@dpg-d2vr98vdiees738m5pc0-a.oregon-postgres.render.com/majority_loss_db"

# SSL for Render PostgreSQL
PGSSL=true

# DeepSeek AI
DEEPSEEK_API_KEY=YOUR_KEY_HERE

# Frontend CORS
CORS_ORIGIN=http://localhost:5173
FRONTEND_ORIGIN=http://localhost:5173

## PostgreSQL Schema
Tables:
users, profiles, games, player_game, questions, options, votes, missions, rounds

## Backend Responsibilities
Room management, round engine, scoring, mission engine, AI (future)

## Frontend Responsibilities
table.js, overlay.js, scene.js, avatar.js

## Commands
npm run dev
npm --prefix apps/server run dev
npm --prefix apps/host run dev

## Deployment Notes
Render backend + Vercel frontend configuration.

## Design Goals
Fully modular, scalable, DB-driven, mission support, AI-ready.
