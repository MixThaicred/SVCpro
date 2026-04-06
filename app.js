/* ============================================================
   STRIVE-OPS | OPERATIONS SUPPORT INTELLIGENCE ENGINE v4.2
   Founder: Luis Morales Otero
   ============================================================ */

const GEMINI_API_KEY = "AIzaSyA2bUrOy10bhZE2noBikVET09uoylIdxgA"; // Paste your key here
const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

// Start System
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const sessionRef = db.ref("strive-ops-sessions");

let peer, localStream, screenStream, selfieSegmentation;
let bgMode = 'none';
let customBgImage = new Image();
let isImageLoaded = false;
let activeCalls = [];

const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');
const pLayer = document.getElementById('pointer-layer');
const pCtx = pLayer.getContext('2d');

/* --- 1. OPS AI VISUALS --- */
async function initAI() {
    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });
    selfieSegmentation.onResults(onAIResults);
}

function onAIResults(results) {
    canvasElement.width = 640; canvasElement.height = 480;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, 640, 480);
    
    // Smooth Masking (The "Polished" Look)
    canvasCtx.drawImage(results.segmentationMask, 0, 0, 640, 480);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.filter = 'blur(3px)'; 
    canvasCtx.drawImage(results.image, 0, 0, 640, 480);
    
    canvasCtx.globalCompositeOperation = 'destination-atop';
    canvasCtx.filter = 'none';

    if (bgMode === 'blur') {
        canvasCtx.filter = 'blur(20px) brightness(0.6)';
        canvasCtx.drawImage(results.image, 0, 0, 640, 480);
    } else if (bgMode === 'color') {
        canvasCtx.fillStyle = '#0f172a'; // Strive-Ops Slate
        canvasCtx.fillRect(0, 0, 640, 480);
    } else if (bgMode === 'image' && isImageLoaded) {
        canvasCtx.drawImage(customBgImage, 0, 0, 640, 480);
    } else {
        canvasCtx.drawImage(results.image, 0, 0, 640, 480);
    }
    canvasCtx.restore();
}

/* --- 2. WORKSPACE COLLABORATION --- */
async function toggleScreenShare() {
    try {
        const btn = document.getElementById('btn-share');
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });

            document.getElementById('local-video').srcObject = screenStream;
            btn.innerText = "🛑 STOP SHARING";
            btn.classList.replace('bg-blue-600', 'bg-red-600');

            screenTrack.onended = () => toggleScreenShare();
        } else {
            const videoTrack = localStream.getVideoTracks()[0];
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack);
            });
            document.getElementById('local-video').srcObject = localStream;
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
            btn.innerText = "🖥️ SHARE WORKSPACE";
            btn.classList.replace('bg-red-600', 'bg-blue-600');
        }
    } catch (e) { console.error("Strive-Ops: Share Error", e); }
}

// Coordinate Tracking for Guidance Arrow
document.getElementById('remote-container').addEventListener('mousemove', (e) => {
    const rect = document.getElementById('remote-video').getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    db.ref(`strive-ops-sessions/${peer.id}/pointer`).set({ x, y, active: true });
});

function drawExpertPointer(xPct, yPct, label) {
    pLayer.width = pLayer.offsetWidth;
    pLayer.height = pLayer.offsetHeight;
    const x = xPct * pLayer.width;
    const y = yPct * pLayer.height;

    pCtx.fillStyle = "#3b82f6";
    pCtx.shadowBlur = 10;
    pCtx.shadowColor = "white";
    
    pCtx.beginPath();
    pCtx.moveTo(x, y);
    pCtx.lineTo(x + 15, y + 15);
    pCtx.lineTo(x + 5, y + 20);
    pCtx.closePath();
    pCtx.fill();
    
    pCtx.font = "bold 9px Inter";
    pCtx.fillText(label, x + 20, y + 15);
}

/* --- 3. PEER NETWORKING --- */
const uniqueNodeId = "so-node-" + Date.now().toString().slice(-4);

peer = new Peer(uniqueNodeId, {
    host: '0.peerjs.com', port: 443, secure: true
});

peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    const myRef = sessionRef.child(id);
    myRef.set({ peerId: id, ts: firebase.database.ServerValue.TIMESTAMP });
    myRef.onDisconnect().remove();

    const invite = new URLSearchParams(window.location.search).get('join');
    if(invite) {
        document.getElementById('remote-id').value = invite;
        setTimeout(startCall, 2000);
    }
});

peer.on('call', (call) => {
    activeCalls.push(call);
    call.answer(localStream);
    call.on('stream', (r) => document.getElementById('remote-video').srcObject = r);
});

async function startCall() {
    const rId = document.getElementById('remote-id').value;
    if (!localStream) await getMedia();
    const call = peer.call(rId, localStream);
    activeCalls.push(call);
    call.on('stream', (r) => document.getElementById('remote-video').srcObject = r);
}

/* --- 4. DATA SYNCHRONIZATION --- */
sessionRef.on("value", (snap) => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    pCtx.clearRect(0,0,pLayer.width,pLayer.height);

    snap.forEach((child) => {
        const val = child.val();
        const isMe = val.peerId === peer.id;
        
        list.innerHTML += `<div class="p-3 mb-2 rounded-lg bg-white bg-opacity-5 text-[10px] font-bold border-l-2 ${isMe ? 'border-green-500' : 'border-blue-500'}">
            ${isMe ? 'LOCAL HOST' : 'EXPERT (' + val.peerId.slice(-4) + ')'}
        </div>`;

        if (!isMe && val.pointer && val.pointer.active) {
            drawExpertPointer(val.pointer.x, val.pointer.y, "EXPERT");
        }
    });
});

/* --- 5. CORE LOGIC --- */
async function getMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        await initAI();
        const v = document.createElement('video');
        v.srcObject = stream; v.muted = true; v.play();
        const loop = async () => { if(selfieSegmentation) await selfieSegmentation.send({image: v}); requestAnimationFrame(loop); };
        loop();
        const track = canvasElement.captureStream(30).getVideoTracks()[0];
        localStream = new MediaStream([track, stream.getAudioTracks()[0]]);
        document.getElementById('local-video').srcObject = localStream;
    } catch (e) { console.error("Strive-Ops Hardware Denied."); }
}

function setBgMode(m) { 
    bgMode = m; 
    document.querySelectorAll('.bg-gray-800').forEach(b => b.classList.remove('ring-1', 'ring-blue-500'));
    document.getElementById('btn-'+m).classList.add('ring-1', 'ring-blue-500');
}

function loadCustomBackground(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        customBgImage.src = ev.target.result;
        customBgImage.onload = () => { isImageLoaded = true; setBgMode('image'); };
    };
    reader.readAsDataURL(e.target.files[0]);
}

function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }

async function startTranscription() {
    document.getElementById('ai-status').classList.add('bg-green-500');
    const rec = new MediaRecorder(localStream, { mimeType: 'audio/webm' });
    rec.ondataavailable = async (e) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base = reader.result.split(',')[1];
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${GEMINI_API_KEY}`, {
                    method: "POST", body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe professionally:" }, { inline_data: { mime_type: "audio/webm", data: base } }] }] })
                });
                const data = await res.json();
                const text = data.candidates[0].content.parts[0].text;
                if(text.trim()) {
                    const box = document.getElementById('transcript-box');
                    if(box.innerText.includes("Awaiting")) box.innerHTML = "";
                    box.innerHTML += `<div class="p-3 bg-gray-800 bg-opacity-40 rounded-lg text-[10px] mb-2 border-b border-gray-700">${text}</div>`;
                    box.scrollTop = box.scrollHeight;
                }
            } catch(e) {}
        };
        reader.readAsDataURL(e.data);
    };
    rec.start();
    setInterval(() => { if(rec.state === "recording") rec.requestData(); }, 12000);
}

getMedia();
