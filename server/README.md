# Multiplayer server

## Deploy on Render
1. Create a new **Web Service** and connect this GitHub repository.
2. Set **Root Directory** to `server`.
3. Set **Build Command** to `npm install`.
4. Set **Start Command** to `npm start`.
5. Deploy, then copy the public service URL (for example, `https://your-service.onrender.com`).
6. Paste that URL into the game lobby on both devices.

The service exposes `/` and `/health` health endpoints. Rooms are held in memory, so restarting the service closes active rooms. This is an initial prototype, not a hardened production game server.
