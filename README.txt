SPACE CREW MULTIPLAYER — FULL REPLACEMENT BUILD

This folder is the COMPLETE replacement set for the GitHub repo.

UPLOAD THESE FILES TO THE ROOT OF THE REPOSITORY:
- index.html
- server.js
- package.json
- Dockerfile
- Procfile
- render.yaml
- README.txt

IMPORTANT:
1. Delete the old files from the GitHub repository first.
2. Upload ALL files from this folder to the repository root (not the ZIP itself).
3. Commit the changes.
4. Railway should automatically redeploy from the same repository.
5. KEEP the same Railway domain — you do not need to generate a new one.
6. Wait for Railway to show Online, then refresh your existing game link.

This build includes the multiplayer ship/gameplay fix:
- solid rooms and corridors for living players
- ghosts can phase through walls
- physical task stations and assigned tasks
- server-side task distance checks
- physical vents for Engineer/Impostor
- server-side vent distance/role checks
- bodies and nearby reporting
- emergency meeting console distance check
- timed task framework including wiring, data transfer, vent maintenance and trash sorting
- role privacy remains server-side
- room codes and multiplayer synchronization
