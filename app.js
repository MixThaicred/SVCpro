let peer;
let localStream = null;
let currentCall = null;
let viewerMode = false;
let pendingRemoteStream = null;

window.onload = () => {
  initPeer();
  bindUi();
  autofillJoinId();
};

function bindUi() {
  document.getElementById("enable-media-btn").addEventListener("click", enableMedia);
  document.getElementById("viewer-btn").addEventListener("click", enableViewerMode);
  document.getElementById("connect-btn").addEventListener("click", startCall);
  document.getElementById("hangup-btn").addEventListener("click", hangUp);
  document.getElementById("copy-link-btn").addEventListener("click", copyInviteLink);
  document.getElementById("tap-play-remote").addEventListener("click", forcePlayRemote);
}

function setStatus(message) {
  document.getElementById("status").innerText = message;
}

function showLocalVideo(show) {
  document.getElementById("local-video").style.display = show ? "block" : "none";
  document.getElementById("local-placeholder").style.display = show ? "none" : "flex";
}

function showRemoteVideo(show) {
  document.getElementById("remote-video").style.display = show ? "block" : "none";
  document.getElementById("remote-placeholder").style.display = show ? "none" : "flex";
}

function showTapPlay(show) {
  document.getElementById("tap-play-remote").style.display = show ? "block" : "none";
}

async function enableMedia() {
  try {
    setStatus("Requesting camera and microphone...");
    viewerMode = false;

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.playsInline = true;
    await localVideo.play();

    showLocalVideo(true);
    setStatus("Camera and microphone enabled.");
  } catch (err) {
    console.error("enableMedia error:", err);
    setStatus("Could not access camera/microphone.");
    alert("Could not access camera/microphone.");
  }
}

function enableViewerMode() {
  viewerMode = true;
  setStatus("Viewer mode enabled. This device will receive video without sending its own camera.");
  showLocalVideo(false);
}

function initPeer() {
  const id = "user-" + Math.random().toString(36).substring(2, 8);

  peer = new Peer(id, {
    host: "0.peerjs.com",
    port: 443,
    secure: true
  });

  peer.on("open", (id) => {
    document.getElementById("my-id").innerText = id;
    setStatus("Ready.");
  });

  peer.on("call", (call) => {
    console.log("Incoming call from", call.peer);

    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }

    currentCall = call;

    if (localStream) {
      call.answer(localStream);
      setStatus("Incoming call answered with local camera.");
    } else {
      call.answer();
      setStatus("Incoming call answered in viewer mode.");
    }

    attachCallEvents(call);
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    setStatus("Peer error: " + (err.type || "unknown"));
  });
}

function startCall() {
  const remoteId = document.getElementById("remote-id").value.trim();

  if (!remoteId) {
    alert("Enter remote ID.");
    return;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  setStatus("Calling...");

  if (localStream) {
    currentCall = peer.call(remoteId, localStream);
  } else {
    currentCall = peer.call(remoteId);
  }

  attachCallEvents(currentCall);
}

function attachCallEvents(call) {
  call.on("stream", (remoteStream) => {
    console.log("Remote stream received");
    pendingRemoteStream = remoteStream;
    attachRemoteStream(remoteStream);
  });

  call.on("close", () => {
    console.log("Call closed");
    clearRemote();
    setStatus("Call ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    setStatus("Call error.");
  });
}

function attachRemoteStream(stream) {
  const remoteVideo = document.getElementById("remote-video");
  remoteVideo.srcObject = stream;
  remoteVideo.playsInline = true;

  showRemoteVideo(true);

  const playAttempt = remoteVideo.play();

  if (playAttempt && typeof playAttempt.then === "function") {
    playAttempt
      .then(() => {
        showTapPlay(false);
        setStatus("Connected.");
      })
      .catch((err) => {
        console.error("Remote autoplay blocked:", err);
        showTapPlay(true);
        setStatus("Remote stream received. Tap button to start video.");
      });
  } else {
    setStatus("Connected.");
  }
}

function forcePlayRemote() {
  const remoteVideo = document.getElementById("remote-video");

  if (pendingRemoteStream && !remoteVideo.srcObject) {
    remoteVideo.srcObject = pendingRemoteStream;
  }

  remoteVideo.play()
    .then(() => {
      showTapPlay(false);
      setStatus("Connected.");
    })
    .catch((err) => {
      console.error("Manual remote play failed:", err);
      setStatus("Tap again to start remote video.");
    });
}

function clearRemote() {
  const remoteVideo = document.getElementById("remote-video");
  remoteVideo.srcObject = null;
  pendingRemoteStream = null;
  showRemoteVideo(false);
  showTapPlay(false);
}

function hangUp() {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  clearRemote();
  setStatus("Ready.");
}

function autofillJoinId() {
  const params = new URLSearchParams(window.location.search);
  const joinId = params.get("join");
  if (joinId) {
    document.getElementById("remote-id").value = joinId;
  }
}

async function copyInviteLink() {
  const myId = document.getElementById("my-id").innerText;
  if (!myId || myId === "Connecting...") return;

  const link = `${window.location.origin}${window.location.pathname}?join=${myId}`;

  try {
    await navigator.clipboard.writeText(link);
    setStatus("Invite link copied.");
  } catch (err) {
    console.error("Clipboard error:", err);
    prompt("Copy this link:", link);
  }
}
