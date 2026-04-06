/* ============================================================
   STRIVE-OPS | FINAL SYNC BUILD
   ============================================================ */

const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const chatRef = db.ref("strive-ops-chat");
const memberRef = db.ref("strive-ops-members");

let peer, localStream, selfieSegmentation, bgMode = 'none', screenStream;
const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');
let activeCalls = new Map();

window.onload = async () => {
    await updateDeviceList();
    await getMedia();
    initNetworking();
};

async function getMedia() {
    const vId = document.getElementById('video-source')?.value;
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

function initNetworking() {
    const id = "so-" + Math.random().toString(36).substr(2, 5);
    peer = new Peer(id, { 
        host: '0.peerjs.com', port: 443, secure: true,
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    
    peer.on('open', nid => {
        document.getElementById('my-id').innerText = "NODE: " + nid;
        // SYNC ME TO MEMBER LIST
        const myPresence = memberRef.child(nid);
        myPresence.set({ id: nid, name: "Host-" + nid.slice(-3), online: true });
        myPresence.onDisconnect().remove();
    });

    peer.on('call', call => {
        activeCalls.set(call.peer, call);
        call.answer(localStream);
        call.on('stream', r => addRemoteVideo(r, call.peer));
    });
}

// MEMBER LIST LISTENER
memberRef.on('value', snap => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snap.forEach(child => {
        const m = child.val();
        list.innerHTML += `<div class="p-2 bg-gray-800 rounded text-[9px] uppercase font-bold border border-gray-700">${m.name}</div>`;
    });
});

// CHAT LISTENER
chatRef.limitToLast(15).on('child_added', snap => {
    const d = snap.val();
    const msg = document.createElement('div');
    msg.className = "p-2 bg-gray-800 rounded border border-gray-700";
    msg.innerHTML = `<p class="text-blue-400 font-bold uppercase text-[8px] mb-1">${d.sender.slice(-3)}</p><p>${d.text}</p>`;
    document.getElementById('chat-box').appendChild(msg);
});

document.getElementById('chat-input').addEventListener('keypress', e => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        chatRef.push({ sender: peer.id, text: e.target.value });
        e.target.value = "";
    }
});

function addRemoteVideo(stream, peerId) {
    const grid = document.getElementById('video-grid');
    if (document.getElementById(`container-${peerId}`)) return;
    const container = document.createElement('div');
    container.id = `container-${peerId}`;
    container.className = "video-container";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    container.appendChild(v);
    grid.appendChild(container);
    // SIDE BY SIDE TOGGLE
    if (grid.children.length > 1) grid.classList.add('side-by-side');
}

function startCall() {
    const rId = document.getElementById('remote-id').value;
    if(!rId || rId === peer.id) return;
    const call = peer.call(rId, localStream);
    activeCalls.set(rId, call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

// UI HELPERS
function setBgMode(m) { bgMode = m; }
function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }
async function updateDeviceList() { /* Already covered in logic */ }
