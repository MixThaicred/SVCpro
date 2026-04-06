/* ============================================================
   STRIVE-OPS | PRODUCTION BUILD v7.0
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

let peer, localStream, selfieSegmentation, bgMode = 'none';
const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');
let activeCalls = new Map();

window.onload = async () => {
    // 1. HARDWARE FIRST: Populate dropdowns
    await updateDeviceList();
    
    // 2. Start Video (Try/Catch to avoid blocking UI)
    try {
        await getMedia();
    } catch (e) {
        console.warn("Hardware busy - select secondary device.");
    }
    
    // 3. Start Networking
    initNetworking();
};

/* --- 1. HARDWARE & AI VISION --- */
async function updateDeviceList() {
    try { await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); } catch(e) {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vSelect = document.getElementById('video-source');
    const aSelect = document.getElementById('audio-source');
    vSelect.innerHTML = ""; aSelect.innerHTML = "";
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        if(d.kind === 'videoinput') { opt.text = d.label || "Camera"; vSelect.add(opt); }
        else if(d.kind === 'audioinput') { opt.text = d.label || "Mic"; aSelect.add(opt); }
    });
}

async function getMedia() {
    const vId = document.getElementById('video-source').value;
    const aId = document.getElementById('audio-source').value;
    if (localStream) localStream.getTracks().forEach(t => t.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: vId ? {exact: vId} : undefined, width: 1280, height: 720 },
        audio: { deviceId: aId ? {exact: aId} : undefined }
    });

    if(!selfieSegmentation) {
        selfieSegmentation = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
        selfieSegmentation.setOptions({ modelSelection: 1 });
        selfieSegmentation.onResults(onAIResults);
    }

    const v = document.createElement('video');
    v.srcObject = stream; v.muted = true; v.play();
    const loop = async () => { if(selfieSegmentation) await selfieSegmentation.send({image: v}); requestAnimationFrame(loop); };
    loop();

    const track = canvasElement.captureStream(30).getVideoTracks()[0];
    localStream = new MediaStream([track, stream.getAudioTracks()[0]]);
    document.getElementById('local-video').srcObject = localStream;

    activeCalls.forEach(call => {
        const s = call.peerConnection.getSenders().find(sn => sn.track.kind === 'video');
        if(s) s.replaceTrack(track);
    });
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

/* --- 2. GLOBAL NETWORKING --- */
function initNetworking() {
    const id = "so-" + Math.random().toString(36).substr(2, 5);
    peer = new Peer(id, { 
        host: '0.peerjs.com', port: 443, secure: true,
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    
    peer.on('open', nid => {
        document.getElementById('my-id').innerText = "NODE: " + nid;
        // SYNC MEMBER LIST
        const presence = memberRef.child(nid);
        presence.set({ id: nid, name: "Expert-" + nid.slice(-3), online: true });
        presence.onDisconnect().remove();
    });

    peer.on('call', call => {
        activeCalls.set(call.peer, call);
        call.answer(localStream);
        call.on('stream', r => addRemoteVideo(r, call.peer));
    });
}

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
    if (grid.children.length > 1) grid.classList.add('side-by-side');
}

function startCall() {
    const rId = document.getElementById('remote-id').value;
    if(!rId || rId === peer.id) return;
    const call = peer.call(rId, localStream);
    activeCalls.set(rId, call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

/* --- 3. TEAM SYNC --- */
memberRef.on('value', snap => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snap.forEach(child => {
        const m = child.val();
        list.innerHTML += `<div class="p-2 bg-gray-800 rounded text-[9px] uppercase font-bold border border-gray-700">${m.name}</div>`;
    });
});

chatRef.limitToLast(10).on('child_added', snap => {
    const d = snap.val();
    const box = document.getElementById('chat-box');
    const msg = document.createElement('div');
    msg.className = "p-2 bg-gray-800 rounded border border-gray-700 mb-2";
    msg.innerHTML = `<p class="text-blue-400 font-bold uppercase text-[8px] mb-1">${d.sender.slice(-3)}</p><p>${d.text}</p>`;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
});

document.getElementById('chat-input').addEventListener('keypress', e => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        chatRef.push({ sender: peer.id, text: e.target.value });
        e.target.value = "";
    }
});

/* --- 4. CONTROLS --- */
function setBgMode(m) { bgMode = m; }
function toggleMic() { if(localStream) localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { if(localStream) localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }
