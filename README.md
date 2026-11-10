# Video Chat Room

A browser-based, room-style video chat demo. The browser sends audio and video directly between participants with WebRTC. A small Node.js WebSocket server coordinates room membership and exchanges WebRTC offers, answers, and ICE candidates; it does not relay media.

## How it works

1. Start the local signaling server and serve the project files from localhost or an HTTPS site.
2. Allow camera and microphone access with **Start**. The page can list available camera and microphone devices.
3. Enter a room name and choose **Connect**. The signaling server assigns an ID and notifies other room members.
4. WebRTC peer connections negotiate direct media streams. The browser uses Google's public STUN server to discover network routes.
5. Chat messages travel over WebRTC data channels to connected peers.

The server allows up to five participants in a room. The interface also includes local preview, stop, mute, device selectors, and connection status.

## Run locally

Requires Node.js and npm. In the project root:

```sh
npm install
npm start
```

This starts the WebSocket signaling service on port 3000. In another terminal, serve the project root on localhost, for example:

```sh
npx http-server . -p 8000
```

Open the local page in your browser, start the camera and microphone, then join the same room name from another browser or device.

## Notes

Camera and microphone access generally requires localhost or HTTPS. The project configures a STUN server but no TURN server, so direct connections may fail on some networks. The signaling server is a minimal demo and does not provide authentication or private-room access controls.
