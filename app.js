let peer = null;
let localStream = null;
let currentCall = null;
let pendingIncomingCall = null;
let pendingRemoteStream = null;

const myIdEl = document.getElementById("my-id");
const remoteIdInput = document.getElementById("remote-id-input");
const statusEl = document.getElementById("status");

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

const localPlaceholder = document.getElementById("local-placeholder");
const remotePlaceholder = document.getElementById("remote-placeholder");

const startCameraBtn = document.getElementById("start-camera-btn");
const copyIdBtn = document.getElementById("copy-id-btn");
const connectBtn = document.getElementById("connect-btn");
const hangupBtn = document.getElementById("hangup-btn");
const tapPlayBtn = document.getElementById("tap-play-btn");

const incomingCallModal = document.getElementById("incoming-call");
const callerIdEl = document.getElementById("caller-id");
const acceptCallBtn = document.getElementById("accept-call-btn");
const declineCallBtn = document.getElementById("decline-call-btn");

const cameraSelect = document.getElementById("camera-select");
const micSelect = document.getElementById("mic-select");
const applyDevicesBtn = document.getElementById("apply-devices-btn");

const muteMicBtn = document.getElementById("mute-mic-btn");
const muteRemoteBtn = document.getElementById("mute-remote-btn");

window.addEventListener("load", () => {
  bindEvents();
  createPeer();
  preloadJoinId();
  setStatus("Page loaded. Waiting for peer connection...");
});

function bindEvents() {
  startCameraBtn.addEventListener("click", startCamera);
  copyIdBtn.addEventListener("click", copyMyId);
  connectBtn.addEventListener("click", startConnectionRequest);
  hangupBtn.addEventListener("click", hangUp);
  tapPlayBtn.addEventListener("click", forcePlayRemote);

  acceptCallBtn.addEventListener("click", acceptIncomingCall);
  declineCallBtn.addEventListener("click", declineIncomingCall);

  applyDevicesBtn.addEventListener("click", applySelectedDevices);

  muteMicBtn.addEventListener("click", toggleMicMute);
  muteRemoteBtn.addEventListener("click", toggleRemoteMute);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function showLocalVideo(show) {
  localVideo.style.display = show ? "block" : "none";
  localPlaceholder.style.display = show ? "none" : "flex";
}

function showRemoteVideo(show) {
  remoteVideo.style.display = show ? "block" : "none";
  remotePlaceholder.style.display = show ? "none" : "flex";
}

function showTapPlay(show) {
  tapPlayBtn.style.display = show ? "block" : "none";
}

function showIncomingModal(show) {
  incomingCallModal.style.display = show ? "flex" : "none";
}

function createPeer() {
  const id = "so-" + Math.random().toString(36).slice(2, 8);

  peer = new Peer(id, {
    host: "0.peerjs.com",
    port: 443,
    secure: true
  });

  peer.on("open", (idValue) => {
    myIdEl.textContent = idValue;
    setStatus("Peer ready. ID assigned: " + idValue);
  });

  peer.on("call", (incomingCall) => {
    console.log("Incoming connection request from:", incomingCall.peer);
    pendingIncomingCall = incomingCall;
    callerIdEl.textContent = incomingCall.peer;
    showIncomingModal(true);
    setStatus("Incoming request received from " + incomingCall.peer);
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    setStatus("Peer error: " + (err.type || "unknown"));
  });
}

async function startCamera() {
  try {
    await startMediaWithConstraints({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    await loadDevices();
    setStatus("Camera started successfully.");
  } catch (err) {
    console.error("Camera error:", err);
    setStatus("Could not start camera.");
    alert("Could not access camera and microphone.");
  }
}

async function startMediaWithConstraints(constraints) {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  localStream = await navigator.mediaDevices.getUserMedia(constraints);

  localVideo.srcObject = localStream;
  localVideo.muted = true;
  localVideo.playsInline = true;
  await localVideo.play();

  showLocalVideo(true);
  updateMuteButtons();
}

async function loadDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const cameras = devices.filter(d => d.kind === "videoinput");
  const mics = devices.filter(d => d.kind === "audioinput");

  cameraSelect.innerHTML = "";
  micSelect.innerHTML = "";

  if (!cameras.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No Camera Found";
    cameraSelect.appendChild(opt);
  } else {
    cameras.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
  }

  if (!mics.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No Microphone Found";
    micSelect.appendChild(opt);
  } else {
    mics.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      micSelect.appendChild(option);
    });
  }

  if (localStream) {
    const currentVideoTrack = localStream.getVideoTracks()[0];
    const currentAudioTrack = localStream.getAudioTracks()[0];

    if (currentVideoTrack) {
      const settings = currentVideoTrack.getSettings();
      if (settings.deviceId) {
        cameraSelect.value = settings.deviceId;
      }
    }

    if (currentAudioTrack) {
      const settings = currentAudioTrack.getSettings();
      if (settings.deviceId) {
        micSelect.value = settings.deviceId;
      }
    }
  }
}

async function applySelectedDevices() {
  try {
    const selectedCameraId = cameraSelect.value;
    const selectedMicId = micSelect.value;

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : true,
      audio: selectedMicId
        ? {
            deviceId: { exact: selectedMicId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];

    if (currentCall && currentCall.peerConnection) {
      const senders = currentCall.peerConnection.getSenders();

      const videoSender = senders.find(sender => sender.track && sender.track.kind === "video");
      const audioSender = senders.find(sender => sender.track && sender.track.kind === "audio");

      if (videoSender && newVideoTrack) {
        await videoSender.replaceTrack(newVideoTrack);
      }

      if (audioSender && newAudioTrack) {
        await audioSender.replaceTrack(newAudioTrack);
      }
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    localStream = newStream;
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    await localVideo.play();

    showLocalVideo(true);
    updateMuteButtons();
    setStatus("Camera and microphone updated.");
  } catch (err) {
    console.error("Apply devices error:", err);
    setStatus("Could not switch devices.");
    alert("Could not switch camera/microphone.");
  }
}

function startConnectionRequest() {
  const remoteId = remoteIdInput.value.trim();

  if (!remoteId) {
    alert("Paste a remote ID first.");
    return;
  }

  if (!peer) {
    alert("Peer is not ready yet.");
    return;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  setStatus("Sending connection request to " + remoteId + "...");

  try {
    if (localStream) {
      currentCall = peer.call(remoteId, localStream, {
        metadata: { wantsConnection: true }
      });
    } else {
      currentCall = peer.call(remoteId, undefined, {
        metadata: { wantsConnection: true }
      });
    }

    attachCallEvents(currentCall);
  } catch (err) {
    console.error("Connection request error:", err);
    setStatus("Failed to send connection request.");
  }
}

function acceptIncomingCall() {
  if (!pendingIncomingCall) return;

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  currentCall = pendingIncomingCall;
  pendingIncomingCall = null;

  showIncomingModal(false);

  if (localStream) {
    currentCall.answer(localStream);
    setStatus("Connection accepted with local camera.");
  } else {
    currentCall.answer();
    setStatus("Connection accepted without local camera.");
  }

  attachCallEvents(currentCall);
}

function declineIncomingCall() {
  if (pendingIncomingCall) {
    pendingIncomingCall.close();
    pendingIncomingCall = null;
  }

  showIncomingModal(false);
  setStatus("Connection request declined.");
}

function attachCallEvents(call) {
  if (!call) return;

  call.on("stream", (remoteStream) => {
    console.log("Remote stream received");
    pendingRemoteStream = remoteStream;
    attachRemoteStream(remoteStream);
  });

  call.on("close", () => {
    clearRemote();
    showIncomingModal(false);
    pendingIncomingCall = null;
    setStatus("Connection ended.");
  });

  call.on("error", (err) => {
    console.error("Call error:", err);
    setStatus("Call error.");
  });
}

function attachRemoteStream(stream) {
  remoteVideo.srcObject = stream;
  remoteVideo.playsInline = true;
  remoteVideo.muted = false;

  showRemoteVideo(true);
  updateRemoteMuteButton();

  const playPromise = remoteVideo.play();

  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        showTapPlay(false);
        setStatus("Remote video connected.");
      })
      .catch((err) => {
        console.error("Autoplay blocked:", err);
        showTapPlay(true);
        setStatus("Remote stream received. Tap the button to start playback.");
      });
  } else {
    setStatus("Remote video connected.");
  }
}

function forcePlayRemote() {
  if (pendingRemoteStream && !remoteVideo.srcObject) {
    remoteVideo.srcObject = pendingRemoteStream;
  }

  remoteVideo.play()
    .then(() => {
      showTapPlay(false);
      setStatus("Remote video connected.");
    })
    .catch((err) => {
      console.error("Manual remote playback failed:", err);
      setStatus("Tap again to start remote playback.");
    });
}

function clearRemote() {
  remoteVideo.srcObject = null;
  pendingRemoteStream = null;
  showRemoteVideo(false);
  showTapPlay(false);
  updateRemoteMuteButton();
}

function hangUp() {
  if (pendingIncomingCall) {
    pendingIncomingCall.close();
    pendingIncomingCall = null;
  }

  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }

  showIncomingModal(false);
  clearRemote();
  setStatus("Ready.");
}

function toggleMicMute() {
  if (!localStream) {
    setStatus("Start your camera first.");
    return;
  }

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) {
    setStatus("No microphone track available.");
    return;
  }

  audioTrack.enabled = !audioTrack.enabled;
  updateMuteButtons();
  setStatus(audioTrack.enabled ? "Microphone unmuted." : "Microphone muted.");
}

function updateMuteButtons() {
  const audioTrack = localStream ? localStream.getAudioTracks()[0] : null;

  if (!audioTrack) {
    muteMicBtn.textContent = "Mute Mic";
    return;
  }

  muteMicBtn.textContent = audioTrack.enabled ? "Mute Mic" : "Unmute Mic";
}

function toggleRemoteMute() {
  remoteVideo.muted = !remoteVideo.muted;
  updateRemoteMuteButton();
  setStatus(remoteVideo.muted ? "Remote audio muted." : "Remote audio unmuted.");
}

function updateRemoteMuteButton() {
  muteRemoteBtn.textContent = remoteVideo.muted ? "Unmute Remote Audio" : "Mute Remote Audio";
}

async function copyMyId() {
  const myId = myIdEl.textContent;

  if (!myId || myId === "Connecting...") return;

  try {
    await navigator.clipboard.writeText(myId);
    setStatus("Your ID was copied.");
  } catch (err) {
    console.error("Clipboard error:", err);
    prompt("Copy this ID:", myId);
  }
}

function preloadJoinId() {
  const params = new URLSearchParams(window.location.search);
  const joinId = params.get("join");
  if (joinId) {
    remoteIdInput.value = joinId;
  }
}
