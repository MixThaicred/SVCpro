/* ============================================================
   STRIVE-OPS | STABILITY BUILD
   ============================================================ */

if (!firebase.apps.length) firebase.initializeApp(STRIVE_CONFIG.firebase);
const memberRef = firebase.database().ref("strive-ops-members");

let peer, localStream, pendingCall = null;
let activeCalls = new Map();

window.onload = async () => {
    await getMedia();
    initNetworking();
};

async function getMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;
    } catch (e) {
        console.error("Camera Fail:", e);
        alert("Camera blocked. Please enable permissions.");
    }
}

function initNetworking() {
    const id = "so-" + Math.random().toString(36).substr(2, 5);
    peer = new Peer(id, { host: '0.peerjs.com', port: 443, secure: true });
    
    peer.on('open', nid => {
        document.getElementById('my-id').innerText = "NODE: " + nid;
    });

    peer.on('call', call => {
        pendingCall = call;
        document.getElementById('lobby-gate').style.display = 'flex';
    });
}

function acceptExpert() {
    if (!pendingCall) return;
    pendingCall.answer(localStream);
    
    pendingCall.on('stream', remoteStream => {
        addRemoteVideo(remoteStream, pendingCall.peer);
        document.getElementById('lobby-gate').style.display = 'none';
    });
}

function startCall() {
    const rId = document.getElementById('remote-id').value;
    if(!rId) return;
    
    const call = peer.call(rId, localStream);
    call.on('stream', remoteStream => {
        addRemoteVideo(remoteStream, rId);
    });
}

function addRemoteVideo(stream, peerId) {
    const grid = document.getElementById('video-grid');
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
    
    // FORCE SIDE-BY-SIDE
    grid.classList.add('split');
}
