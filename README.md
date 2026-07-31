# Avalon Online — Full Online Server (Phases 1–3)

Room-based, host-authoritative online Avalon over WebSockets. Each player joins
from their own phone; the server deals secretly, delivers each person **only their
own role and knowledge**, optionally runs a synchronised narrated night, and now
**referees the full game** — team proposals, voting, quests, and the assassination
— on everyone's phones. Built on the shared, tested `avalon-core` rules module.

Scope, by phase (all built):
- **Phase 1** — create/join a room, lobby with host settings, shuffle + deal,
  private role reveal, random first quest leader.
- **Phase 2** — optional server-driven synchronised narration + music.
- **Phase 3** — the online referee: proposals, approve/reject voting, quest
  success/fail cards, the five-reject rule, the two-fails quest, and the
  assassination endgame, ending with a full role reveal.

---

## What's here

```
avalon-server/
├── index.js            the server (HTTP static + WebSocket)
├── package.json        deps + start script
├── lib/
│   ├── avalon-core.js  shared rules module (copy of Phase 0)
│   └── rooms.js        rooms, sessions, host authority, dealing
├── public/
│   └── index.html      the online client (join-from-phone page)
└── test-harness.js     end-to-end multi-client security test
```

---

## Run it on your own computer first (recommended before Render)

You need Node.js 18+ installed. Then, in this folder:

```
npm install
npm start
```

You'll see `listening on http://localhost:3000`. Open that in a browser to host a
game. To simulate other players, open more browser tabs (or other devices on the
same Wi-Fi using your computer's local IP, e.g. `http://192.168.1.20:3000`). Host
a game in one tab, join with the code in the others, set roles, and deal.

Run the automated proof at any time:

```
npm test
```

Expected: **`Phase 1 server: 12 passed, 0 failed`** — including the core security
assertion that no client ever receives another player's role.

---

## Deploying to Render

1. Put this `avalon-server` folder in its **own GitHub repository** (separate from
   your GitHub Pages app repo). Commit everything **except** `node_modules/`
   (a `.gitignore` with `node_modules` is included).
2. On Render: **New → Web Service**, connect that repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Render assigns a public `https://…onrender.com` address and provisions TLS
   automatically. The client is served from that same address, and it connects
   back to it over `wss://` on its own — no configuration needed.
5. Free instances sleep after inactivity; the first person to open the app after a
   quiet spell waits a few seconds while it wakes, then everyone joins normally.

**Note:** the server sets its port from `process.env.PORT` (which Render provides),
so you don't hard-code it.

---

## How this relates to your existing app

- Your **offline** single-file app on GitHub Pages is untouched and still works
  with no server. This online server is a **separate, additive** thing.
- Both share the **same rules** via `lib/avalon-core.js`, so online deals follow
  the identical logic your local pass-and-play already uses and that is unit- and
  parity-tested.

---

## The security model (why secrets stay secret)

- The server holds the authoritative deal. It computes each player's knowledge and
  sends it **only to that player's own socket** (`private_state`). It is never
  broadcast.
- The broadcast room view (`room_state`) contains names, seats, connection status,
  settings, and — after dealing — the public first-leader announcement. It contains
  **no roles**, ever. The test harness asserts this.
- Reconnecting with your saved session token re-delivers your own secret and no one
  else's. Because secrets live on the server, a dropped phone loses nothing.
- All traffic is `wss://` (TLS) once deployed.
- The one thing software can't prevent, in any online hidden-role game: a player
  voluntarily showing their own screen. That's social, not technical.

---

## How to play online (Phase 3 flow)

1. Host taps **Host a New Game**, others **Join** with the code (or QR / link).
2. In the lobby the host picks player count, roles, and options, then **Deal**.
3. Each phone privately shows its own role + knowledge.
4. The host then chooses either **Begin the Synchronised Night** (optional
   narration) or **Play the Game Online** — which starts the refereed game.
5. The board appears on every phone: the current leader picks a team; everyone
   approves or rejects; the team plays secret success/fail cards; the quest track
   fills in. Three successes trigger the Assassin's guess; three failures (or five
   rejected teams in a row) win it for evil. The game ends with a full reveal.

The server enforces every rule (only the leader proposes, only team members play
cards, Good can't play Fail, only the Assassin strikes), so no honour system is
needed and nothing secret is ever sent to the wrong phone.

## Phase 2 — synchronised narration (now included)

After the deal, the host sees an optional **"Begin the Synchronised Night"** panel.
When started, the **server owns the sequence cursor**, so every phone shows the same
line — and plays the same audio — at the same moment. It reuses `buildQueue` from
the shared core, so the online night follows the identical rulebook order as the
local app.

- **Host controls:** auto-advance on/off, an adjustable buffer between lines
  (0.5–6 s), and music selection. With auto-advance off, the host taps **Next**.
- **Fixed evil-recognition pause:** the beat right after "evil, open your eyes"
  is always 3 s regardless of the buffer setting — same rule as the local app.
- **Pause/Resume** holds and continues the whole table together.
- **Late/reconnecting players are synced** to the current segment (with elapsed
  time), not restarted from the top.
- **Music** ducks under each narrated line via Web Audio, exactly like the local app.

### Assets served with the client
- `public/audio/` — the complete set of **all 44** recorded narration lines
  (`<segment-id>.mp3`). Every night configuration is fully voiced; the per-line
  fallback (device voice, then a timed pause) remains in place only as a safety
  net if a file is ever removed.
- `public/music/` — the five medieval tracks.

To add or replace recordings later, drop `<segment-id>.mp3` files into
`public/audio/` (names match the local app's kit) and redeploy.

## Still out of scope (by design)

- Advanced variant powers that alter *card play* (Sorcerers' Magic cards, the
  Rogues' and Messengers' special cards, Lancelot allegiance-swaps) are dealt and
  their night knowledge delivered, but the refereed game resolves quests on plain
  success/fail; those special cards are played with the physical components if used.
- Rooms are in-memory: a server restart clears active games. Fine for casual play;
  a future phase would add Redis if ever needed.
