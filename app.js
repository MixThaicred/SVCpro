/* ============================================================
   STRIVE-OPS | CLEAN 1-ON-1 VIDEO SYSTEM
   ============================================================ */

let peer;
let localStream;
let currentCall = null;

// START
window.onload = async () => {
    await setupCamera();
    setupPeer();
};

// CAMERA
async function setupCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        const video = document.getElementById("local-video");
        video.srcObject = localStream;
        await video.play();

        console.log("Camera ready");

    } catch (err) {
        alert("Camera access required");
        console.error(err);
    }
}

// PEER
function setupPeer() {
    const id = "user-" + Math.random().toString(36).substring(2, 7);

    peer = new Peer(id);

    peer.on("open", (id) => {
        document.getElementById("my-id").innerText = id;
        console.log("My ID:", id);
    });

    // 🔥 AUTO ANSWER
    peer.on("call", (call) => {
        console.log("Incoming call");

        if (currentCall) currentCall.close();

        currentCall = call;

        call.answer(localStream);

        call.on("stream", (remoteStream) => {
            console.log("Remote stream received");
            setRemote(remoteStream);
        });

        call.on("close", clearRemote);
    });
}

// CALL
function startCall() {
    const remoteId = document.getElementById("remote-id").value.trim();

    if (!remoteId) return alert("Enter ID");

    if (currentCall) currentCall.close();

    const call = peer.call(remoteId, localStream);
    currentCall = call;

    call.on("stream", (remoteStream) => {
        console.log("Connected");
        setRemote(remoteStream);
    });

    call.on("close", clearRemote);
}

// SET REMOTE VIDEO
function setRemote(stream) {
    const video = document.getElementById("remote-video");

    video.srcObject = stream;

    video.onloadedmetadata = () => {
        video.play();
    };
}

// CLEAR
function clearRemote() {
    document.getElementById("remote-video").srcObject = null;
}
