/* ============================================================
   STRIVE VIDEO CENTER (SVC) - FINAL MASTER ENGINE
   ============================================================ */

// 1. API & FIREBASE CONFIG
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${GEMINI_API_KEY}`;

const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center",
    storageBucket: "strive-video-center.firebasestorage.app",
    messagingSenderId: "866547736090",
    appId: "1:866547736090:web:e0dfb727ad0ff134e87ba3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const sessionRef = db.ref("svc-active-members");

// App State
let peer, localStream, mediaRecorder, selfieSegmentation;
let bgMode = 'none'; 
let customBgImage = new Image();
let isImageLoaded = false;
let participants = new Map();

const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');

/* 2. AUDIO CLEANING (Noise Gate & Echo)
   -------------------------------------------------- */
async function createCleanAudio(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 8000;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-45, audioContext.currentTime);
    compressor.knee.setValueAtTime(40, audioContext.currentTime);

    const destination = audioContext.createMediaStreamDestination();
    source.connect(filter);
    filter.connect(compressor);
    compressor.connect(destination);

    return destination.stream.getAudioTracks()[0];
}

/* 3. AI VIDEO ENGINE (Background Removal)
   -------------------------------------------------- */
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
        // AI Masking
        canvasCtx.filter = 'blur(2px)'; // Feather edges
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

/* 4. MEDIA & PEER INITIALIZATION
   -------------------------------------------------- */
async function getMedia() {
    try {
        const rawStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const cleanAudio = await createCleanAudio(rawStream);
        
        await initAI();
        const inputVideo = document.createElement('video');
        inputVideo.srcObject = rawStream;
        inputVideo.muted = true;
        inputVideo.play();

        async function process() {
            await selfieSegmentation.send({image: inputVideo});
            requestAnimationFrame(process);
        }
        process();

        const aiVideoTrack = canvasElement.captureStream(30).getVideoTracks()[0];
        localStream = new MediaStream([aiVideoTrack, cleanAudio]);
        document.getElementById('local-video').srcObject = localStream;
        document.getElementById('local-video').muted = true;
    } catch (e) { console.error("Hardware Error", e); }
}

peer = new Peer();

peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    
    // Sync with Firebase
    const myRef = sessionRef.child(id);
    myRef.set({ peerId: id, timestamp: Date.now() });
    myRef.onDisconnect().remove();

    // Invite Logic
    const joinId = new URLSearchParams(window.location.search).get('join');
    if(joinId) {
        document.getElementById('remote-id').value = joinId;
        document.getElementById('lobby-overlay').classList.remove('hidden');
        setTimeout(startCall, 2000);
    }
});

// Incoming Call Handler
peer.on('call', (call) => {
    participants.set(call.peer, call);
    // Auto-admit for this simple version
    admitPeer(call.peer);
});

async function admitPeer(peerId) {
    const call = participants.get(peerId);
    if (!localStream) await getMedia();
    call.answer(localStream);
    call.on('stream', (remoteStream) => {
        document.getElementById('remote-video').srcObject = remoteStream;
    });
}

async function startCall() {
    const rId = document.getElementById('remote-id').value;
    if (!localStream) await getMedia();
    const call = peer.call(rId, localStream);
    call.on('stream', (rStream) => {
        document.getElementById('remote-video').srcObject = rStream;
        document.getElementById('lobby-overlay').classList.add('hidden');
    });
}

/* 5. FIREBASE REAL-TIME MEMBER LIST
   -------------------------------------------------- */
sessionRef.on("value", (snapshot) => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snapshot.forEach((child) => {
        const val = child.val();
        const isMe = val.peerId === peer.id;
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 mb-2 rounded-xl bg-white bg-opacity-5 border border-white border-opacity-10 text-[10px] font-bold">
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-green-500' : 'bg-blue-500'}"></span> 
                    ${isMe ? 'You' : 'Guest (' + val.peerId.substring(0,4) + ')'}
                </div>
                ${!isMe ? `<button onclick="kickPeer('${val.peerId}')" class="text-red-500 hover:text-white uppercase tracking-tighter">Kick</button>` : ''}
            </div>`;
    });
});

function kickPeer(id) {
    sessionRef.child(id).remove();
    alert("User removed from session.");
}

/* 6. UI TOGGLES & TRANSCRIPTION
   -------------------------------------------------- */
function setBgMode(mode) { 
    bgMode = mode; 
    document.querySelectorAll('.btn-svc').forEach(b => b.classList.remove('btn-svc-active'));
    document.getElementById('btn-' + mode).classList.add('btn-svc-active');
    document.getElementById('bg-status').innerText = mode.toUpperCase() + " ACTIVE";
}

function loadCustomBackground(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        customBgImage.src = ev.target.result;
        customBgImage.onload = () => { isImageLoaded = true; setBgMode('image'); };
    };
    reader.readAsDataURL(e.target.files[0]);
}

function toggleMic() {
    localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
    document.getElementById('toggle-mic').classList.toggle('bg-red-600');
}

function toggleCam() {
    localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
    document.getElementById('toggle-cam').classList.toggle('bg-red-600');
}

async function startTranscription() {
    const status = document.getElementById('ai-status');
    status.innerText = "ONLINE"; status.style.color = "#10b981";
    document.getElementById('trans-btn').innerText = "ANALYZING SESSION...";

    mediaRecorder = new MediaRecorder(localStream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = async (e) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            const response = await fetch(GEMINI_URL, {
                method: "POST",
                body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe this audio precisely:" }, { inline_data: { mime_type: "audio/webm", data: base64 } }] }] })
            });
            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            if(text.trim() && text !== "...") {
                const box = document.getElementById('transcript-box');
                if(box.innerText.includes("Waiting")) box.innerHTML = "";
                box.innerHTML += `<div class="p-3 bg-gray-800 bg-opacity-40 rounded-lg border-l-2 border-blue-500 text-xs mb-3">
                    <span class="text-[9px] text-gray-500 block mb-1">${new Date().toLocaleTimeString()}</span>${text}</div>`;
                box.scrollTop = box.scrollHeight;
            }
        };
        reader.readAsDataURL(e.data);
    };
    mediaRecorder.start();
    setInterval(() => { if(mediaRecorder.state === "recording") mediaRecorder.requestData(); }, 10000);
}

// Kick off
getMedia();