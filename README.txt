SPACE CREW MULTIPLAYER — EASY HOST BUILD

WHAT THIS IS
Real server-backed multiplayer. Everyone opens the SAME hosted URL, then one player presses Host and shares the room code.

EASIEST INTERNET HOSTING
1. Put this folder in a GitHub repository.
2. In Render, create a new Blueprint/Web Service from that repository.
3. The included render.yaml supplies the build/start settings automatically.
4. Open the HTTPS address Render gives you. Share that same address with your friends.
5. One person hosts a room; everyone else joins with the displayed room code.

OTHER HOSTS
This project also includes a Dockerfile and Procfile. Any Node.js/WebSocket host that runs `npm start` and provides a PORT environment variable can run it.

LOCAL / SAME WI-FI TEST
1. Install Node.js 20+.
2. In this folder run: npm install
3. Run: npm start
4. Computer: http://localhost:3000
5. Other devices on the same Wi-Fi: http://YOUR-COMPUTER-LAN-IP:3000

IMPORTANT
- Do not open public/index.html directly. Multiplayer needs server.js running.
- Roles are server-authoritative and only each player's own role is privately sent to that player.
- Rooms currently live in server memory. If the host service restarts, active rooms reset.
- For reliable internet play, use a host that supports WebSockets.
