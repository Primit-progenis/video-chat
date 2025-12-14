# WebRTC Room (mesh) — Local demo

This project separates the UI (`index.html` + `style.css`) from the WebRTC logic (`app.js`) and includes a minimal WebSocket signaling server (`server.js`) to form a room-based mesh. It enforces a minimum/maximum of users in a room (min 2, max 5).

Quick steps:

1. Install dependencies and run the signaling server (required):

```bash
cd "live servo"
npm install
npm start
```

2. Open the UI in your browser at: `http://localhost:3000/` if you serve the static files, or open `index.html` via a simple static server (recommended) e.g.:

```bash
# from project root
npx http-server -c-1 . -p 8000
# then open http://localhost:8000
```

Notes / behavior:
- The app asks for camera and microphone permissions when you press "Start".
- Audio capture uses `echoCancellation`, `noiseSuppression`, and `autoGainControl` to reduce echo and improve clarity.
- The signaling server is minimal — it only routes offers/answers/candidates and enforces up to 5 peers per room.
- Chat uses WebRTC DataChannels to broadcast messages to connected peers.
- The UI includes video on/off, mute (preview), join room, call button and a chat sidebar.

If you'd like, I can:
- Add a small static server to serve the UI from the same Node process.
- Add UI polish (icons, improved layout, participants list).
- Add a TURN server integration for NAT traversal.

Tell me which of those you'd like next or if you want changes to controls/labels.
# Video Chat Room

A simple peer-to-peer video chat application using WebRTC and PeerJS.

## Features
- Video and audio calls
- Camera and microphone selection
- Mute controls
- Peer-to-peer communication
- No server required for calls (uses PeerJS broker)

## Usage
1. Open the website
2. Click "Start Camera & Mic"
3. Click "Connect" to get your ID
4. Share your ID with a friend
5. Enter their ID and click "Call"

The site is hosted at: https://primit-progenis.github.io/video-chat/