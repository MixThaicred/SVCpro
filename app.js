/* ============================================================
   STRIVE-OPS | STABLE 1-ON-1 VIDEO ENGINE (GITHUB SAFE)
   ============================================================ */

let peer;
let localStream;
let currentCall = null;

// INIT
window.onload = async () => {
    console.log("App starting...");

    await initMedia();
    initPeer();

    // Auto-fill join link (?join=ID)
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (joinId) {
        document.getElementById("remote-id").value = joinId;
    }
};

// ===============================
// CAMERA + MIC SETUP
// ===============================
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        const localVideo = document.getElementById("local-video");

        // 🔥 IMPORTANT FIX — prevent duplicate stream rendering
        if (localVideo.srcObject !== localStream) {
            localVideo.srcObject = localStream;
        }

        await localVideo.play();

        console.log("Local stream ready");

    } catch (err) {
        console.error("Media error:", err);
        alert("Camera/Microphone access required.");
    }
}

// ===============================
// PEER SETUP
// ===============================
function initPeer() {
    const id = "so-" + Math.random().toString(36).substring(2, 7);

    peer = new Peer(id, {
        host: "0.peerjs.com",
        port: 443,
        secure: true
    });

    peer.on("open", (id) => {
        console.log("My ID:", id);
        document.getElementById("my-id").innerText = id;
    });

    // 🔥 INCOMING CALL (AUTO ANSWER)
    peer.on("call", (call) => {
        console.log("Incoming call");

        // Close previous call safely
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }

        currentCall = call;

        // Answer with local stream
        call.answer(localStream);

        // Receive remote stream
        call.on("stream", (remoteStream) => {
            console.log("Remote stream received");
            attachRemoteStream(remoteStream);
        });

        call.on("close", () => {
            console.log("Call ended");
            clearRemote();
        });

        call.on("error", (err) => {
            console.error("Call error:", err);
        });
    });

    peer.on("error", (err) => {
        console.error("Peer error:", err);
    });
}

// ===============================
// START CALL
// ===============================
function startCall() {
    const remoteId = document.getElementById("remote-id").value.trim();

    if (!remoteId) {
        alert("Enter remote ID");
        return;
    }

    console.log("Calling:", remoteId);

    // Close existing call
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }

    const call = peer.call(remoteId, localStream);
    currentCall = call;

    call.on("stream", (remoteStream) => {
        console.log("Connected — receiving stream");
        attachRemoteStream(remoteStream);
    });

    call.on("close", () => {
        console.log("Call closed");
        clearRemote();
    });

    call.on("error", (err) => {
        console.error("Outgoing call error:", err);
    });
}

// ===============================
// ATTACH REMOTE VIDEO
// ===============================
function attachRemoteStream(stream) {
    const remoteVideo = document.getElementById("remote-video");

    if (!remoteVideo) {
        console.error("remote-video element missing");
        return;
    }

    // 🔥 IMPORTANT FIX — avoid overwriting with same stream
    if (remoteVideo.srcObject !== stream) {
        remoteVideo.srcObject = stream;
    }

    remoteVideo.onloadedmetadata = () => {
        remoteVideo.play().catch(err => {
            console.error("Remote play error:", err);
        });
    };
}

// ===============================
// CLEAR REMOTE
// ===============================
function clearRemote() {
    const remoteVideo = document.getElementById("remote-video");
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
}
