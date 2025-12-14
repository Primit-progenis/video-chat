// Simple WebSocket signaling server for rooms
// Usage: node server.js

const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

// rooms: roomName -> Set of ws clients
const rooms = new Map();

function send(ws, obj){ try{ ws.send(JSON.stringify(obj)); }catch(e){} }

server.on('connection', (ws, req) => {
    ws.id = Math.random().toString(36).slice(2,9);
    ws.room = null;
    console.log('New WS connection from', req.socket.remoteAddress, 'assigned id', ws.id);

    ws.on('message', (raw) => {
        try{
            const data = JSON.parse(raw.toString());
            console.log('Received message from', ws.id, data.type || '(unknown)');
            if(data.type === 'join'){
                const r = data.room;
                if(!r) return;
                let set = rooms.get(r);
                if(!set) { set = new Set(); rooms.set(r, set); }
                // enforce max 5
                if(set.size >= 5){ send(ws, {type:'room_full'}); ws.close(); return; }
                ws.room = r;
                set.add(ws);
                // send id and list of peers
                const peers = Array.from(set).filter(s=>s!==ws).map(s=>s.id);
                send(ws, {type:'id', id:ws.id});
                send(ws, {type:'peers', peers});
                // notify others of new peer
                for(const client of set){ if(client!==ws) send(client, {type:'new_peer', id:ws.id}); }
                console.log('Client', ws.id, 'joined room', r, 'peers:', peers);
                return;
            }

            // route offer/answer/candidate to specific peer
            if(data.type==='offer' || data.type==='answer' || data.type==='candidate'){
                const { to } = data; if(!to) return;
                const set = rooms.get(ws.room); if(!set) return;
                for(const client of set){ if(client.id === to) send(client, Object.assign({}, data, {from: ws.id})); }
                console.log('Routed', data.type, 'from', ws.id, 'to', to);
                return;
            }

        }catch(e){ }
    });

    ws.on('close', ()=>{
        console.log('Connection closed for', ws.id, 'room', ws.room);
        if(ws.room){ const set = rooms.get(ws.room); if(set){ set.delete(ws); if(set.size===0) rooms.delete(ws.room); else{ // notify remaining
            for(const client of set){ send(client, {type:'peer_left', id:ws.id}); }
        } } }
    });
});

console.log('Signaling server running on ws://localhost:3000');
