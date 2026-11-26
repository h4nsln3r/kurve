# Kurve

Classic **Achtung Die Kurve** for LAN parties — up to 8 players on the same Wi‑Fi, desktop keyboard or mobile joystick.

## Quick start (party night)

On the host computer:

```bash
npm install
npm run build
npm start
```

Then open **http://localhost:3847** on that PC.

- The lobby shows your **LAN link + QR code**
- Friends join on phone or laptop via that link (same Wi‑Fi)
- Host can spectate or also join as a player
- Several people can play on one keyboard with different key bindings

## Development

```bash
npm install
npm run dev
```

- Game client: http://localhost:5173  
- Socket server: http://localhost:3847  

## Controls

| Mode | Steer |
|------|--------|
| Desktop | Choose left/right keys per local player |
| Mobile | On-screen joystick (horizontal) |

## Rules (classic)

- Curves leave a trail with occasional gaps
- Hit a wall or any trail and you’re out
- Surviving players score when someone dies
- First to the win score takes the match

## Stack

TypeScript · Canvas · Express · Socket.IO · Vite
