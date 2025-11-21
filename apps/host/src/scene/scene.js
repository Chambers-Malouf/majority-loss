// ============================================================================
// Majority Loss — 3D Table Scene
// FULL FIRST-PERSON MODE — OPTION A (Camera fully attached to head)
// ============================================================================

console.log("📸 scene.js (FIRST-PERSON MODE A) loaded");

import * as THREE from "three";
import { createAvatar } from "./avatar.js";

// ============================================================================
// GLOBALS
// ============================================================================
let scene, camera, renderer;
const avatars = new Map(); // playerId → THREE.Group
let myPlayerIdGlobal = null;

let yaw = 0;
let pitch = 0;
let pointerDown = false;
let lastX = 0;
let lastY = 0;

let hasLoggedNoAvatar = false;
let hasLoggedAttach = false;

// ============================================================================
// INPUT — LOOK AROUND
// ============================================================================
function onPointerDown(e) {
  pointerDown = true;
  lastX = e.clientX;
  lastY = e.clientY;
}
function onPointerMove(e) {
  if (!pointerDown) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  const sensitivity = 0.0045;
  yaw -= dx * sensitivity;
  pitch -= dy * sensitivity;

  const maxPitch = 0.55;
  const minPitch = -0.55;
  pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
}
function onPointerUp() {
  pointerDown = false;
}

// ============================================================================
// ORIENTATION OVERLAY (phones)
// ============================================================================
const ORIENT_ID = "orientation-overlay";

function updateOrientationOverlay() {
  let o = document.getElementById(ORIENT_ID);
  const portrait = window.innerHeight > window.innerWidth;

  if (!portrait) {
    if (o) o.remove();
    return;
  }

  if (!o) {
    o = document.createElement("div");
    o.id = ORIENT_ID;
    o.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.92);
      color:white;display:flex;flex-direction:column;
      justify-content:center;align-items:center;
      font-size:2rem;font-family:sans-serif;text-align:center;
    `;
    o.innerHTML = "📱↻<br>Rotate to landscape";
    document.body.appendChild(o);
  }
}

// ============================================================================
// INIT SCENE
// ============================================================================
export function initScene(containerId = "table-app") {
  console.log("🎬 initScene first-person mode");

  const container = document.getElementById(containerId);
  if (!container) throw new Error("Missing #table-app");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04040a);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  camera.position.set(0, 3.2, 7);
  camera.lookAt(0, 2.0, 0);

  // INPUT
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  window.addEventListener("resize", onResize);
  window.addEventListener("resize", updateOrientationOverlay);
  updateOrientationOverlay();

  // LIGHTING -------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));

  const d = new THREE.DirectionalLight(0xffffff, 1.5);
  d.position.set(4, 6, -2);
  scene.add(d);

  const r = new THREE.PointLight(0xff5577, 1.7, 20);
  r.position.set(0, 4.2, -4);
  scene.add(r);

  animate();
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// PLAYER AVATARS
// ============================================================================
const TOTAL_SEATS = 5;
const SEAT_ANGLES = (() => {
  const arr = [];
  const start = -Math.PI * 0.35;
  const end = Math.PI * 0.35;
  const step = (end - start) / (TOTAL_SEATS - 1);
  for (let i = 0; i < TOTAL_SEATS; i++) arr.push(start + step * i);
  return arr;
})();

export function setPlayersOnTable(players, myId = null) {
  console.log("🎯 setPlayersOnTable", players, "myId:", myId);
  myPlayerIdGlobal = myId;

  const visible = players.slice(0, TOTAL_SEATS);
  const ids = new Set(visible.map((p) => p.id));

  // Remove missing
  for (const [id, av] of avatars.entries()) {
    if (!ids.has(id)) {
      scene.remove(av);
      avatars.delete(id);
    }
  }

  const radius = 4.9;

  visible.forEach((p, idx) => {
    let av = avatars.get(p.id);

    if (!av) {
      console.log("➕ Creating avatar:", p.id);
      av = createAvatar(p.name);
      avatars.set(p.id, av);
      scene.add(av);
    }

    const ang = SEAT_ANGLES[idx];
    av.position.set(
      Math.sin(ang) * radius,
      1.6,
      Math.cos(ang) * radius * 0.75
    );
    av.lookAt(0, 2.3, 0);
  });

  hasLoggedNoAvatar = false;
  hasLoggedAttach = false;
}

// ============================================================================
// CAMERA FOLLOW + HEAD LOOK
// ============================================================================
function updateHeadLook() {
  if (!myPlayerIdGlobal) return;
  const me = avatars.get(myPlayerIdGlobal);
  if (!me) {
    if (!hasLoggedNoAvatar) {
      console.log("❌ No avatar found for", myPlayerIdGlobal);
      hasLoggedNoAvatar = true;
    }
    return;
  }

  const head = me.userData.headGroup;
  if (!head) return;
  head.rotation.y = yaw;
  head.rotation.x = pitch;
}

function updateCameraFollow() {
  if (!myPlayerIdGlobal) return;
  const me = avatars.get(myPlayerIdGlobal);
  if (!me) return;

  // Camera sits directly IN FRONT of the face
  const head = me.userData.headGroup;
  if (!head) return;

  me.updateWorldMatrix(true, false);

  const camOffset = new THREE.Vector3(0, 0, 1.05);
  const lookOffset = new THREE.Vector3(0, -0.05, 0.3);

  const worldCamPos = camOffset.clone();
  const worldLookPos = lookOffset.clone();

  head.localToWorld(worldCamPos);
  head.localToWorld(worldLookPos);

  camera.position.copy(worldCamPos);
  camera.lookAt(worldLookPos);

  if (!hasLoggedAttach) {
    console.log("📸 Attached camera to:", myPlayerIdGlobal);
    hasLoggedAttach = true;
  }
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================
function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !camera || !scene) return;

  updateHeadLook();
  updateCameraFollow();

  renderer.render(scene, camera);
}