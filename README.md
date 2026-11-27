# Kurve

Classic **Achtung Die Kurve** for LAN parties — up to 8 players on the same Wi‑Fi. Play on desktop (keyboard) or phone (joystick).

---

## Requirements

- **Host PC:** Node.js 20+ (22 recommended)
- Everyone on the **same Wi‑Fi** (not guest/isolated Wi‑Fi)
- Port **3847** reachable on the local network

---

## Party night — get it running

### 1. On the host computer

```bash
cd C:\Dev\2026\Kurve
npm install
npm run build
npm start
```

You should see something like:

```text
Local:   http://localhost:3847
LAN:     http://192.168.x.x:3847
```

Leave this terminal open while you play.

### 2. Open the host lobby

On the **same PC**, open:

**http://localhost:3847**

That browser session can claim **Host** controls (start match, reset, kick). The host does **not** need to play — spectating is fine.

### 3. Friends join on the network

Everyone else (phones / other PCs) opens the **LAN** address, for example:

**http://192.168.x.x:3847**

Ways to share it:

- Use the **link list + QR code** in the lobby (“LAN invite”)
- Or copy the `LAN:` URL printed in the host terminal
- Or tap **Copy join link** in the lobby

They pick a **color**, set **keys** (desktop) or use the **joystick** (phone), press **Ready**. When everyone is ready, the host presses **Start match**.

### 4. Several players on one computer

On any joined browser (usually the host PC):

1. Pick a color and left/right keys  
2. Click **Join as player**  
3. Repeat with **Add another local player** and different keys  

Classic couch multiplayer on one keyboard.

---

## Network checklist (if join fails)

1. **Same Wi‑Fi** — phone and host must be on the same network name. Avoid hotel/guest Wi‑Fi with client isolation.
2. **Use the LAN IP, not localhost** — `http://localhost:3847` only works on the host machine. Others need `http://<host-lan-ip>:3847`.
3. **Confirm the IP** — on the host, the lobby and `npm start` output show the current address. It can change if Wi‑Fi reconnects.
4. **Windows Firewall** — the first time you run the server, allow Node.js on **Private** networks. Or open TCP port **3847**:
   ```powershell
   New-NetFirewallRule -DisplayName "Kurve LAN" -Direction Inbound -Protocol TCP -LocalPort 3847 -Action Allow -Profile Private
   ```
5. **VPN** — turn off VPN on host or guests; it often blocks LAN discovery/routing.
6. **Test from the phone** — open the LAN URL in the phone browser. If it never loads, it is almost always Wi‑Fi isolation or firewall.

### Find the host IP yourself (Windows)

```powershell
ipconfig
```

Look for **IPv4 Address** under your Wi‑Fi adapter (often `192.168.x.x`). Join URL:

`http://THAT_IP:3847`

---

## Development mode

For coding (two processes: Vite client + game server):

```bash
npm install
npm run dev
```

| Who | URL |
|-----|-----|
| Host PC | http://127.0.0.1:5173 |
| Phones / other PCs | http://\<LAN-IP\>:5173 (shown in lobby + QR) |
| API only | port 3847 (not the game UI in dev) |

Opening `:3847` in the browser during `npm run dev` redirects to `:5173`.

For real parties, prefer a single port:

```bash
npm run build
npm start
```

Then everyone (including phones) uses **http://\<LAN-IP\>:3847**.

---

## Controls

| Mode | Steer |
|------|--------|
| Desktop | Choose left / right keys per local player |
| Mobile | Hold on-screen **LEFT** / **RIGHT** pads |

---

## Rules (classic)

- Curves leave a trail with occasional **gaps**
- Hit a **wall** or any **trail** → out
- Surviving players score when someone dies
- First to the win score wins the match

---

## Useful commands

```bash
npm run build    # build the web client into dist/
npm start        # production party server on 0.0.0.0:3847
npm run dev      # local development
npm run typecheck
```

---

## Stack

TypeScript · Canvas · Express · Socket.IO · Vite
