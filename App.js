/* ============================================================
   STRIVE VIDEO CENTER (SVC) - PRODUCTION ENGINE
   ============================================================ */

const GEMINI_API_KEY = "YOUR_GEMINI_KEY";
const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center",
    storageBucket: "strive-video-center.firebasestorage.app",
    messagingSenderId: "866547736090",
    appId: "1:866547736090:web:e0dfb727ad0ff134e87ba3"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const sessionRef = db.ref("svc-active-members");

let peer, localStream, selfieSegmentation;
let bgMode = 'none';
let customBgImage = new Image();
let isImageLoaded = false;
let participants = new Map();

const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');

/* AI RENDERING ENGINE */
async function initAI() {
    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    selfieSegmentation.setOptions({ modelSelection: 1, selfieMode: false });
    selfieSegmentation.onResults(onAIResults);
}

function onAIResults(results) {
    canvasElement.width = 640; canvasElement.height = 480;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, 640, 480);
    
    if (bgMode === 'none') {
        canvasCtx.drawImage(results.image, 0, 0, 640, 480);
    } else {
        canvasCtx.filter = 'blur(2px)';
        canvasCtx.drawImage(results.segmentationMask, 0, 0, 640, 480);
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.filter = 'none';
        canvasCtx.drawImage(results.image, 0, 0, 640, 480);
        canvasCtx.globalCompositeOperation = 'destination-atop';
        
        if (bgMode === 'blur') {
            canvasCtx.filter = 'blur(15px)';
            canvasCtx.drawImage(results.image, 0, 0, 640, 480);
        } else if (bgMode === 'color') {
            canvasCtx.fillStyle = '#0a0f1d';
            canvasCtx.fillRect(0, 0, 640, 480);
        } else if (bgMode === 'image' && isImageLoaded) {
            canvasCtx.drawImage(customBgImage, 0, 0, 640, 480);
        }
    }
    canvasCtx.restore();
}

/* HARDWARE INITIALIZATION */
async function getMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        await initAI();
        const inputVideo = document.createElement('video');
        inputVideo.srcObject = stream;
        inputVideo.muted = true;
        inputVideo.play();

        async function process() {
            await selfieSegmentation.send({image: inputVideo});
            requestAnimationFrame(process);
        }
        process();

        const aiTrack = canvasElement.captureStream(30).getVideoTracks()[0];
        localStream = new MediaStream([aiTrack, stream.getAudioTracks()[0]]);
        document.getElementById('local-video').srcObject = localStream;
    } catch (e) { console.error("Hardware Error:", e); }
}

/* SECURE NETWORKING (The "Connecting..." Fix) */
peer = new Peer({
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    debug: 3
});

peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    const myRef = sessionRef.child(id);
    myRef.set({ peerId: id, ts: firebase.database.ServerValue.TIMESTAMP });
    myRef.onDisconnect().remove();

    const invite = new URLSearchParams(window.location.search).get('join');
    if(invite) {
        document.getElementById('remote-id').value = invite;
        document.getElementById('lobby-overlay').classList.remove('hidden');
        setTimeout(startCall, 3000);
    }
});

peer.on('call', (call) => {
    participants.set(call.peer, call);
    if (!localStream) getMedia().then(() => call.answer(localStream));
    else call.answer(localStream);
    call.on('stream', (r) => document.getElementById('remote-video').srcObject = r);
});

async function startCall() {
    const rId = document.getElementById('remote-id').value;
    if (!localStream) await getMedia();
    const call = peer.call(rId, localStream);
    call.on('stream', (r) => {
        document.getElementById('remote-video').srcObject = r;
        document.getElementById('lobby-overlay').classList.add('hidden');
    });
}

/* FIREBASE SYNC */
sessionRef.on("value", (snap) => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snap.forEach((child) => {
        const val = child.val();
        const isMe = val.peerId === peer.id;
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 mb-2 rounded-xl bg-white bg-opacity-5 border border-white border-opacity-10 text-[10px] font-bold">
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-green-500 online-pulse' : 'bg-blue-500'}"></span> 
                    ${isMe ? 'You' : 'Guest (' + val.peerId.substring(0,4) + ')'}
                </div>
                ${!isMe ? `<button onclick="kickPeer('${val.peerId}')" class="text-red-500 hover:text-white uppercase">Kick</button>` : ''}
            </div>`;
    });
});

function kickPeer(id) { sessionRef.child(id).remove(); alert("User Disconnected"); }

/* UI CONTROLS */
function setBgMode(m) { 
    bgMode = m; 
    document.querySelectorAll('.btn-svc').forEach(b => b.classList.remove('btn-svc-active'));
    document.getElementById('btn-'+m).classList.add('btn-svc-active');
    document.getElementById('bg-status').innerText = 'Feed: ' + m.toUpperCase();
}

function loadCustomBackground(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        customBgImage.src = ev.target.result;
        customBgImage.onload = () => { isImageLoaded = true; setBgMode('image'); };
    };
    reader.readAsDataURL(e.target.files[0]);
}

function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; document.getElementById('toggle-mic').classList.toggle('bg-red-600'); }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; document.getElementById('toggle-cam').classList.toggle('bg-red-600'); }

async function startTranscription() {
    const status = document.getElementById('ai-status');
    status.innerText = "ONLINE"; status.style.color = "#10b981";
    
    const rec = new MediaRecorder(localStream, { mimeType: 'audio/webm' });
    rec.ondataavailable = async (e) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base = reader.result.split(',')[1];
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${GEMINI_API_KEY}`, {
                method: "POST", body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe:" }, { inline_data: { mime_type: "audio/webm", data: base } }] }] })
            });
            const data = await res.json();
            const text = data.candidates[0].content.parts[0].text;
            if(text.trim() && text !== "...") {
                const box = document.getElementById('transcript-box');
                if(box.innerText.includes("Awaiting")) box.innerHTML = "";
                box.innerHTML += `<div class="p-3 bg-gray-800 bg-opacity-40 rounded-lg border-l-2 border-blue-500 text-xs mb-3">
                    <span class="text-[9px] text-gray-500 block mb-1 font-mono">${new Date().toLocaleTimeString()}</span>${text}</div>`;
                box.scrollTop = box.scrollHeight;
            }
        };
        reader.readAsDataURL(e.data);
    };
    rec.start();
    setInterval(() => { if(rec.state === "recording") rec.requestData(); }, 10000);
}

// Boot up
getMedia();
