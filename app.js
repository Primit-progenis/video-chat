// app.js - client logic for WebRTC room mesh + chat
// Uses a minimal WebSocket signaling server (server.js) to exchange offers/answers/candidates.

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const preview = document.getElementById('preview');
const msg = document.getElementById('msg');
const muteAudio = document.getElementById('muteAudio');
const videoSelect = document.getElementById('videoSelect');
const audioSelect = document.getElementById('audioSelect');
const joinBtn = document.getElementById('connectBtn');
const roomInput = document.getElementById('peerId'); // repurposed as room name
const callBtn = document.getElementById('callBtn');
const remotePeerId = document.getElementById('remotePeerId');

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatText = document.getElementById('chatText');

let localStream = null;
let ws = null;
const pcMap = new Map(); // peerId -> {pc, dc}
let myId = null;
let room = null;

const MAX_PEERS = 5;
const MIN_PEERS = 2;

// Debug: log if DOM elements are found
console.log('DOM check:', { startBtn, stopBtn, preview, msg, chatMessages, chatForm, chatText, joinBtn });
if(!chatMessages || !chatForm || !chatText){ console.error('Missing chat DOM elements!'); }

async function listDevices(){
    try{
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vids = devices.filter(d=>d.kind==='videoinput');
        const auds = devices.filter(d=>d.kind==='audioinput');
        videoSelect.innerHTML = vids.map((v,i)=>`<option value="${v.deviceId}">${v.label||'Camera '+(i+1)}</option>`).join('');
        audioSelect.innerHTML = auds.map((a,i)=>`<option value="${a.deviceId}">${a.label||'Mic '+(i+1)}</option>`).join('');
    }catch(e){}
}

async function startLocal(){
    stopLocal();
    msg.textContent = '';
    const constraints = {
        video: videoSelect.value ? { deviceId: { exact: videoSelect.value } } : { facingMode: 'user' },
        audio: audioSelect.value ? { deviceId: { exact: audioSelect.value }, echoCancellation:true, noiseSuppression:true, autoGainControl:true } : { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
    };
    try{
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        localStream = s;
        preview.srcObject = s;
        preview.muted = muteAudio.checked;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        await listDevices();
    }catch(err){
        msg.textContent = 'Permission required for camera/mic: '+(err.message||err);
    }
}

function stopLocal(){
    if(!localStream) return;
    localStream.getTracks().forEach(t=>t.stop());
    preview.srcObject = null;
    localStream = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
}

muteAudio.addEventListener('change', ()=>{ preview.muted = muteAudio.checked; });
startBtn.addEventListener('click', startLocal);
stopBtn.addEventListener('click', stopLocal);

// Chat helpers
function addChatMessage(text, cls='chatMsg'){
    const el = document.createElement('div'); el.className = cls; el.textContent = text;
    chatMessages.appendChild(el); chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const txt = chatText.value.trim(); if(!txt) return;
    addChatMessage('You: '+txt);
    // broadcast to peers via data channels
    let sent = 0;
    pcMap.forEach(({dc}, pid)=>{
        if(dc && dc.readyState==='open'){
            try{ dc.send(JSON.stringify({type:'chat', text:txt})); sent++; }
            catch(e){ console.warn('Failed to send chat to', pid, e); }
        }
    });
    if(sent === 0){ msg.textContent = 'No open data channels — waiting for peers to connect'; }
    else { msg.textContent = 'Message sent to '+sent+' peer(s)'; }
    chatText.value='';
});

// Signaling via WebSocket
function connectSignaling(){
    if(!room){ msg.textContent='Enter a room name first'; return; }
    if(!localStream){ msg.textContent='Start camera/mic before joining a room'; return; }
    // Use hostname (not host) so we don't accidentally include the static server port.
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${location.hostname}:3000`;
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', ()=>{
        msg.textContent = 'Connected to signaling server';
        ws.send(JSON.stringify({type:'join', room}));
    });
    ws.addEventListener('error', (e)=>{
        console.error('Signaling WS error', e);
        msg.textContent = 'Signaling connection error';
    });
    ws.addEventListener('message', async (ev)=>{
        const data = JSON.parse(ev.data);
        // id response when joining
        if(data.type === 'id'){
            myId = data.id;
            msg.textContent = 'Joined room: '+room+' (you: '+myId+')';
            return;
        }

        // initial peers list
        if(data.type === 'peers'){
            if(data.peers.length+1 > MAX_PEERS){ msg.textContent='Room full (max '+MAX_PEERS+')'; try{ ws.close(); }catch(e){} return; }
            for(const peerId of data.peers){ if(peerId===myId) continue; await createPeerConnection(peerId, true); }
            return;
        }

        // a peer that joined after us
        if(data.type === 'new_peer'){
            const peerId = data.id;
            if(!peerId || peerId === myId) return;
            if(pcMap.size+1 > MAX_PEERS){ msg.textContent='Room full (max '+MAX_PEERS+')'; return; }
            if(!localStream){ msg.textContent='Start camera/mic before peers can connect.'; return; }
            await createPeerConnection(peerId, true);
            msg.textContent = 'Peer joined: '+peerId;
            return;
        }

        // peer left notification
        if(data.type === 'peer_left'){
            const pid = data.id; if(pid) cleanupPeer(pid); msg.textContent = 'Peer left: '+(pid||''); return;
        }

        // standard offer/answer/candidate handling
        if(data.type === 'offer'){
            const { from, sdp } = data; await handleOffer(from, sdp); return;
        }

        if(data.type === 'answer'){
            const { from, sdp } = data; const pc = pcMap.get(from)?.pc; if(pc){ await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } return;
        }

        if(data.type === 'candidate'){
            const { from, candidate } = data; const pc = pcMap.get(from)?.pc; if(pc){ try{ await pc.addIceCandidate(new RTCIceCandidate(candidate)); }catch(e){} } return;
        }

        // room/server level messages
        if(data.type === 'room_full'){
            msg.textContent = 'Room is full'; try{ ws.close(); }catch(e){} return;
        }

        if(data.type === 'room_closed'){
            msg.textContent = 'Room closed by server'; try{ ws.close(); }catch(e){} return;
        }
    });
    ws.addEventListener('close', ()=>{ msg.textContent = 'Signaling disconnected'; });
}

async function createPeerConnection(peerId, makeOffer=false){
    if(pcMap.has(peerId)) return;
    const pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    // add local tracks
    localStream.getTracks().forEach(t=>pc.addTrack(t, localStream));

    // data channel for chat
    let dc = null;
    if(makeOffer){
        dc = pc.createDataChannel('chat');
        setupDataChannel(peerId, dc);
    } else {
        pc.ondatachannel = (e)=>{ dc = e.channel; setupDataChannel(peerId, dc); };
    }

    // remote stream element
    const container = document.getElementById('remoteVideos');
    const vid = document.createElement('video'); vid.id = 'remote-'+peerId; vid.autoplay=true; vid.playsInline=true; vid.muted=true; vid.className='remoteVideo';
    const frame = document.createElement('div'); frame.className='videoFrame'; frame.appendChild(vid);
    const label = document.createElement('div'); label.className='label'; label.textContent = peerId; frame.appendChild(label);
    container.appendChild(frame);

    pc.ontrack = (e)=>{ vid.srcObject = e.streams[0];
        // try autoplay then unmute on user gesture
        vid.play().then(()=>{ vid.muted=false; }).catch(()=>{ msg.textContent='Tap the page to enable remote audio/video'; document.body.addEventListener('click', ()=>{ vid.play().catch(()=>{}); },{once:true}); });
    };

    pc.onicecandidate = (e)=>{ if(e.candidate && ws && ws.readyState===1){ ws.send(JSON.stringify({type:'candidate', to:peerId, candidate:e.candidate})); } };

    pc.onconnectionstatechange = ()=>{ if(pc.connectionState==='failed' || pc.connectionState==='disconnected' || pc.connectionState==='closed'){ cleanupPeer(peerId); } };

    pcMap.set(peerId, {pc, dc});

    if(makeOffer){
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({type:'offer', to:peerId, sdp:pc.localDescription}));
    }
}

function setupDataChannel(peerId, channel){
    channel.onopen = ()=>{
        console.debug('DC open', peerId);
        msg.textContent = 'Data channel open with '+peerId;
    };
    channel.onmessage = (e)=>{
        try{
            const d = JSON.parse(e.data);
            if(d.type==='chat'){
                addChatMessage(peerId+': '+d.text);
            }
        }catch(err){ console.warn('Invalid DC message from', peerId, err); }
    };
    channel.onclose = ()=>{ console.debug('DC closed', peerId); msg.textContent = 'Data channel closed: '+peerId; };
    const rec = pcMap.get(peerId); if(rec) rec.dc = channel; else pcMap.set(peerId, {pc:null, dc:channel});
}

async function handleOffer(from, sdp){
    if(pcMap.size+1 > MAX_PEERS){ msg.textContent='Rejecting offer: room full'; return; }
    await createPeerConnection(from, false);
    const { pc } = pcMap.get(from);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    ws.send(JSON.stringify({type:'answer', to:from, sdp:pc.localDescription}));
}

function cleanupPeer(peerId){
    const rec = pcMap.get(peerId); if(!rec) return;
    try{ rec.pc?.close(); }catch(e){}
    try{ rec.dc?.close(); }catch(e){}
    pcMap.delete(peerId);
    document.getElementById('remote-'+peerId)?.closest('.videoFrame')?.remove();
}

joinBtn.addEventListener('click', ()=>{
    room = roomInput.value.trim(); if(!room) { msg.textContent='Enter a room name'; return; }
    connectSignaling();
});

// optional: start call button will just ensure peers connect (signaling handles it)
callBtn.addEventListener('click', ()=>{ if(!ws || ws.readyState!==1) msg.textContent='Not connected to signaling'; else msg.textContent='Call in progress'; });

// populate devices on load
listDevices();

// Helpful note for insecure origins
if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    const note = document.createElement('div'); note.style.marginTop='.6rem'; note.style.color='#666';
    note.textContent = 'Note: getUserMedia typically requires HTTPS or localhost. Run the included signaling server and open via http://localhost.';
    document.body.appendChild(note);
}
