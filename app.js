/* ============================================================
   STRIVE-OPS | FINAL SYNC ENGINE
   ============================================================ */

if (!firebase.apps.length) firebase.initializeApp(STRIVE_CONFIG.firebase);
const db = firebase.database();
const chatRef = db.ref("strive-ops-chat");
const memberRef = db.ref("strive-ops-members");

let peer, localStream, selfieSegmentation, bgMode = 'none', pendingCall = null;
const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');
let activeCalls = new Map();

window.onload = async () => {
    await updateDeviceList();
    try { await getMedia(); } catch(e) { console.warn("Camera busy."); }
    initNetworking();
};

/* --- 1. THE GRID INJECTOR --- */
function addRemoteVideo(stream, peerId) {
    console.log("Injecting Remote Video for:", peerId);
    const grid = document.getElementById('video-grid');
    
    // Prevent duplicates
    if (document.getElementById(`container-${peerId}`)) return;

    const container = document.createElement('div');
    container.id = `container-${peerId}`;
    container.className = "video-container";
    
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    
    container.appendChild(v);
    grid.appendChild(container);
    
    // FORCE SPLIT VIEW
    if (grid.children.length > 1) {
        grid.classList.add('split');
    }
}

/* --- 2. THE HANDSHAKE & LOBBY --- */
function initNetworking() {
    const id = "so-" + Math.random().toString(36).substr(2, 5);
    peer = new Peer(id, { 
        host: '0.peerjs.com', port: 443, secure: true,
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    
    peer.on('open', nid => {
        document.getElementById('my-id').innerText = "NODE: " + nid;
        memberRef.child(nid).set({ id: nid, online: true });
        memberRef.child(nid).onDisconnect().remove();
    });

    peer.on('call', call => {
        pendingCall = call;
        document.getElementById('knocker-id').innerText = "ID: " + call.peer;
        document.getElementById('lobby-gate').classList.replace('hidden', 'flex');
    });
}

async function acceptExpert() {
    if (!pendingCall) return;
    const call = pendingCall;
    activeCalls.set(call.peer, call);
    
    // Ensure we send our stream
    call.answer(localStream);
    
    call.on('stream', r => {
        addRemoteVideo(r, call.peer);
        document.getElementById('lobby-gate').classList.replace('flex', 'hidden');
    });
}

function startCall() {
    const rId = document.getElementById('remote-id').value;
    if(!rId || rId === peer.id) return;
    const call = peer.call(rId, localStream);
    activeCalls.set(rId, call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

/* --- 3. HARDWARE & AI --- */
async function getMedia() {
    const vId = document.getElementById('video-source').value;
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: vId ? {exact: vId} : undefined, width: 1280, height: 720 },
        audio: true
    });

    selfieSegmentation = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
    selfieSegmentation.setOptions({ modelSelection: 1 });
    selfieSegmentation.onResults(onAIResults);

    const v = document.createElement('video');
    v.srcObject = stream; v.muted = true; v.play();
    const loop = async () => { if(selfieSegmentation) await selfieSegmentation.send({image: v}); requestAnimationFrame(loop); };
    loop();

    const track = canvasElement.captureStream(30).getVideoTracks()[0];
    localStream = new MediaStream([track, stream.getAudioTracks()[0]]);
    document.getElementById('local-video').srcObject = localStream;
}

function onAIResults(r) {
    canvasElement.width = 1280; canvasElement.height = 720;
    canvasCtx.save();
    canvasCtx.clearRect(0,0,1280,720);
    canvasCtx.drawImage(r.segmentationMask, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.drawImage(r.image, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'destination-atop';
    canvasCtx.filter = (bgMode === 'blur') ? 'blur(20px) brightness(0.6)' : 'none';
    canvasCtx.drawImage(r.image, 0,0,1280,720);
    canvasCtx.restore();
}

async function updateDeviceList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vSelect = document.getElementById('video-source');
    devices.forEach(d => {
        if(d.kind === 'videoinput') {
            const opt = document.createElement('option');
            opt.value = d.deviceId; opt.text = d.label || "Camera"; vSelect.add(opt);
        }
    });
}

function setBgMode(m) { bgMode = m; }
function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }

// --- CHAT ---
chatRef.limitToLast(10).on('child_added', snap => {
    const d = snap.val();
    const msg = document.createElement('div');
    msg.className = "p-2 bg-gray-800 rounded border border-gray-700 mb-2";
    msg.innerHTML = `<p class="text-blue-400 font-bold text-[8px] mb-1">${d.sender.slice(-3)}</p><p>${d.text}</p>`;
    document.getElementById('chat-box').appendChild(msg);
});

document.getElementById('chat-input').addEventListener('keypress', e => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        chatRef.push({ sender: peer.id, text: e.target.value });
        e.target.value = "";
    }
});
