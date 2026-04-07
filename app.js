let peer = null;
let localStream = null;          // raw mic/camera from getUserMedia
let outboundStream = null;       // processed outgoing stream
let currentCall = null;
let pendingIncomingCall = null;
let pendingRemoteStream = null;
let currentAudioProfile = "standard";
let currentVideoEffect = "none";
let customBackgroundImage = null;

let selfieSegmentation = null;
let processingActive = false;
let processingCanvasStream = null;

const myIdEl = document.getElementById("my-id");
const remoteIdInput = document.getElementById("remote-id-input");
const statusEl = document.getElementById("status");

const localCanvas = document.getElementById("local-canvas");
const localCtx = localCanvas.getContext("2d");
const rawVideo = document.getElementById("raw-video");
const bgCanvas = document.getElementById("bg-canvas");
const bgCtx = bgCanvas.getContext("2d");

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

const speakerSelect = document.getElementById("speaker-select");
const applySpeakerBtn = document.getElementById("apply-speaker-btn");

const audioProfileSelect = document.getElementById("audio-profile-select");
const applyAudioProfileBtn = document.getElementById("apply-audio-profile-btn");

const effectSelect = document.getElementById("effect-select");
const applyEffectBtn = document.getElementById("apply-effect-btn");
const uploadBgBtn = document.getElementById("upload-bg-btn");
const bgUploadInput = document.getElementById("bg-upload-input");

const muteMicBtn = document.getElementById("mute-mic-btn");
const muteRemoteBtn = document.getElementById("mute-remote-btn");

window.addEventListener("load", async () => {
  bindEvents();
  createPeer();
  preloadJoinId();
  initSegmentation();
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
  applySpeakerBtn.addEventListener("click", applySelectedSpeaker);
  applyAudioProfileBtn.addEventListener("click", applyAudioProfile);

  applyEffectBtn.addEventListener("click", applyVideoEffect);
  uploadBgBtn.addEventListener("click", () => bgUploadInput.click());
  bgUploadInput.addEventListener("change", handleBackgroundUpload);

  muteMicBtn.addEventListener("click", toggleMicMute);
  muteRemoteBtn.addEventListener("click", toggleRemoteMute);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function showLocalPreview(show) {
  localCanvas.style.display = show ? "block" : "none";
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

function getAudioConstraints(profileName, deviceId = null) {
  const base = deviceId ? { deviceId: { exact: deviceId } } : {};

  if (profileName === "voice") {
    return {
      ...base,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
  }

  if (profileName === "raw") {
    return {
      ...base,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  }

  return {
    ...base,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
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

function initSegmentation() {
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });

  selfieSegmentation.setOptions({
    modelSelection: 1
  });

  selfieSegmentation.onResults(onSegmentationResults);
}

async function startCamera() {
  try {
    await startMediaWithConstraints({
      video: true,
      audio: getAudioConstraints(currentAudioProfile)
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
  stopLocalTracks();

  localStream = await navigator.mediaDevices.getUserMedia(constraints);

  rawVideo.srcObject = localStream;
  rawVideo.muted = true;
  rawVideo.playsInline = true;
  await rawVideo.play();

  await setupProcessedPipeline();
  showLocalPreview(true);
  updateMuteButtons();
}

async function setupProcessedPipeline() {
  const settings = localStream.getVideoTracks()[0]?.getSettings();
  const width = settings?.width || 1280;
  const height = settings?.height || 720;

  localCanvas.width = width;
  localCanvas.height = height;
  bgCanvas.width = width;
  bgCanvas.height = height;

  if (processingCanvasStream) {
    processingCanvasStream.getTracks().forEach(track => track.stop());
    processingCanvasStream = null;
  }

  processingCanvasStream = localCanvas.captureStream(25);
  rebuildOutboundStream();

  if (!processingActive) {
    processingActive = true;
    processFrameLoop();
  }
}

function rebuildOutboundStream() {
  if (!processingCanvasStream) return;

  const canvasVideoTrack = processingCanvasStream.getVideoTracks()[0];
  const audioTrack = localStream?.getAudioTracks()[0] || null;

  if (outboundStream) {
    outboundStream.getTracks().forEach(track => track.stop());
  }

  outboundStream = new MediaStream();

  if (canvasVideoTrack) outboundStream.addTrack(canvasVideoTrack);
  if (audioTrack) outboundStream.addTrack(audioTrack);

  replaceActiveSenders();
}

async function replaceActiveSenders() {
  if (!currentCall || !currentCall.peerConnection || !outboundStream) return;

  const senders = currentCall.peerConnection.getSenders();
  const newVideoTrack = outboundStream.getVideoTracks()[0];
  const newAudioTrack = outboundStream.getAudioTracks()[0];

  const videoSender = senders.find(sender => sender.track && sender.track.kind === "video");
  const audioSender = senders.find(sender => sender.track && sender.track.kind === "audio");

  try {
    if (videoSender && newVideoTrack) {
      await videoSender.replaceTrack(newVideoTrack);
    }
    if (audioSender && newAudioTrack) {
      await audioSender.replaceTrack(newAudioTrack);
    }
  } catch (err) {
    console.error("replaceActiveSenders error:", err);
  }
}

async function processFrameLoop() {
  if (!processingActive) return;

  if (rawVideo.readyState >= 2 && selfieSegmentation) {
    try {
      await selfieSegmentation.send({ image: rawVideo });
    } catch (err) {
      console.error("Segmentation send error:", err);
    }
  }

  requestAnimationFrame(processFrameLoop);
}

function onSegmentationResults(results) {
  const width = localCanvas.width;
  const height = localCanvas.height;

  localCtx.save();
  localCtx.clearRect(0, 0, width, height);

  if (currentVideoEffect === "none") {
    localCtx.drawImage(results.image, 0, 0, width, height);
    localCtx.restore();
    return;
  }

  if (currentVideoEffect === "blur") {
    localCtx.drawImage(results.segmentationMask, 0, 0, width, height);
    localCtx.globalCompositeOperation = "source-out";
    localCtx.filter = "blur(14px)";
    localCtx.drawImage(results.image, 0, 0, width, height);
    localCtx.globalCompositeOperation = "destination-atop";
    localCtx.filter = "none";
    localCtx.drawImage(results.image, 0, 0, width, height);
    localCtx.restore();
    return;
  }

  if (currentVideoEffect === "solid") {
    localCtx.fillStyle = "#0f172a";
    localCtx.fillRect(0, 0, width, height);

    localCtx.globalCompositeOperation = "destination-out";
    localCtx.drawImage(results.segmentationMask, 0, 0, width, height);

    localCtx.globalCompositeOperation = "destination-over";
    localCtx.drawImage(results.image, 0, 0, width, height);

    localCtx.restore();
    return;
  }

  if (currentVideoEffect === "image") {
    if (customBackgroundImage) {
      localCtx.drawImage(customBackgroundImage, 0, 0, width, height);
    } else {
      localCtx.fillStyle = "#1e3a8a";
      localCtx.fillRect(0, 0, width, height);
    }

    localCtx.globalCompositeOperation = "destination-out";
    localCtx.drawImage(results.segmentationMask, 0, 0, width, height);

    localCtx.globalCompositeOperation = "destination-over";
    localCtx.drawImage(results.image, 0, 0, width, height);

    localCtx.restore();
    return;
  }

  localCtx.drawImage(results.image, 0, 0, width, height);
  localCtx.restore();
}

async function loadDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const cameras = devices.filter(d => d.kind === "videoinput");
  const mics = devices.filter(d => d.kind === "audioinput");
  const speakers = devices.filter(d => d.kind === "audiooutput");

  cameraSelect.innerHTML = "";
  micSelect.innerHTML = "";
  speakerSelect.innerHTML = "";

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

  if (!speakers.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Default Speaker";
    speakerSelect.appendChild(opt);
  } else {
    speakers.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Speaker ${index + 1}`;
      speakerSelect.appendChild(option);
    });
  }

  if (localStream) {
    const currentVideoTrack = localStream.getVideoTracks()[0];
    const currentAudioTrack = localStream.getAudioTracks()[0];

    if (currentVideoTrack) {
      const settings = currentVideoTrack.getSettings();
      if (settings.deviceId) cameraSelect.value = settings.deviceId;
    }

    if (currentAudioTrack) {
      const settings = currentAudioTrack.getSettings();
      if (settings.deviceId) micSelect.value = settings.deviceId;
    }
  }

  updateRemoteMuteButton();
}

async function applySelectedDevices() {
  try {
    const selectedCameraId = cameraSelect.value;
    const selectedMicId = micSelect.value;

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
      audio: getAudioConstraints(currentAudioProfile, selectedMicId || null)
    });

    stopLocalTracks();

    localStream = newStream;
    rawVideo.srcObject = localStream;
    rawVideo.muted = true;
    rawVideo.playsInline = true;
    await rawVideo.play();

    await setupProcessedPipeline();
    showLocalPreview(true);
    updateMuteButtons();

    setStatus("Camera and microphone updated.");
  } catch (err) {
    console.error("Apply devices error:", err);
    setStatus("Could not switch devices.");
    alert("Could not switch camera/microphone.");
  }
}

async function applySelectedSpeaker() {
  try {
    const speakerId = speakerSelect.value;

    if (typeof remoteVideo.setSinkId !== "function") {
      setStatus("Speaker switching is not supported in this browser.");
      return;
    }

    await remoteVideo.setSinkId(speakerId || "");
    setStatus("Speaker output updated.");
  } catch (err) {
    console.error("Apply speaker error:", err);
    setStatus("Could not switch speaker output.");
  }
}

async function applyAudioProfile() {
  try {
    currentAudioProfile = audioProfileSelect.value;

    if (!localStream) {
      setStatus("Audio profile saved. Start camera to apply it.");
      return;
    }

    const selectedCameraId = cameraSelect.value;
    const selectedMicId = micSelect.value;

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
      audio: getAudioConstraints(currentAudioProfile, selectedMicId || null)
    });

    stopLocalTracks();

    localStream = newStream;
    rawVideo.srcObject = localStream;
    rawVideo.muted = true;
    rawVideo.playsInline = true;
    await rawVideo.play();

    await setupProcessedPipeline();
    showLocalPreview(true);
    updateMuteButtons();
    await loadDevices();

    setStatus("Audio profile updated.");
  } catch (err) {
    console.error("Audio profile error:", err);
    setStatus("Could not apply audio profile.");
  }
}

function applyVideoEffect() {
  currentVideoEffect = effectSelect.value;

  if (currentVideoEffect === "image" && !customBackgroundImage) {
    setStatus("Custom background selected. Upload an image to use it.");
    return;
  }

  setStatus("Video effect updated.");
}

function handleBackgroundUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    customBackgroundImage = img;
    currentVideoEffect = "image";
    effectSelect.value = "image";
    setStatus("Custom background loaded.");
    URL.revokeObjectURL(url);
  };

  img.src = url;
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
    if (outboundStream) {
      currentCall = peer.call(remoteId, outboundStream, {
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

  if (outboundStream) {
    currentCall.answer(outboundStream);
    setStatus("Connection accepted with local media.");
  } else {
    currentCall.answer();
    setStatus("Connection accepted without local media.");
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

function stopLocalTracks() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
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
