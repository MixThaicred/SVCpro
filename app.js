/* ============================================================
   STRIVE-OPS | FIXED 1-ON-1 VIDEO ENGINE
   ============================================================ */

if (!firebase.apps.length) {
    firebase.initializeApp(STRIVE_CONFIG.firebase);
}

let peer;
let localStream;
let currentCall = null;

window.onload = async () => {
    await getMedia();
    initPeer();

    // Auto-join support (?join=ID)
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (joinId) {
        document.getElementById("remote-id").value = joinId;
    }
};

async function getMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        const localVideo = document.getElementById("local-video");
        localVideo.srcObject = localStream;
        await localVideo.play();

    } catch (err) {
        console.error(err);
        alert("Camera access required");
    }
}

function initPeer() {
    const id = "so-" + Math.random().toString(36).slice(2, 7);

    peer = new Peer(id, {
        host: "0.peerjs.com",
        port: 443,
        secure: true
    });

    peer.on("open", (id) => {
        document.getElementById("my-id").innerText = id;
    });

    // INCOMING CALL
    peer.on("call", (call) => {
        if (currentCall) currentCall.close();

        currentCall = call;

        call.answer(localStream);

        call.on("stream", (remoteStream) => {
            setRemoteStream(remoteStream);
        });

        call.on("close", clearRemote);
    });
}

// OUTGOING CALL
function startCall() {
    const id = document.getElementById("remote-id").value.trim();
    if (!id) return;

    if (currentCall) currentCall.close();

    const call = peer.call(id, localStream);
    currentCall = call;

    call.on("stream", (remoteStream) => {
        setRemoteStream(remoteStream);
    });

    call.on("close", clearRemote);
}

// SET REMOTE VIDEO
function setRemoteStream(stream) {
    const remoteVideo = document.getElementById("remote-video");
    remoteVideo.srcObject = stream;
    remoteVideo.play().catch(() => {});
}

// CLEAR REMOTE
function clearRemote() {
    const remoteVideo = document.getElementById("remote-video");
    remoteVideo.srcObject = null;
}
