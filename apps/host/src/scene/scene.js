// apps/host/src/scene/scene.js
console.log("📸 scene.js loaded (fresh)");

import * as THREE from "three";
import { createAvatar } from "./avatar.js";
import { myPlayerId } from "../state.js";

let scene, camera, renderer;
const avatars = new Map();           // playerId -> THREE.Group
const readyBadges = new Map();       // playerId -> { sprite, state }
const clock = new THREE.Clock();

// Look state (per device, only applied to my avatar)
let pointerDown = false;
let lastPointerX = 0;
let lastPointerY = 0;
let yaw = 0;   // rotate left/right
let pitch = 0; // look up/down

// Debug flags so we don’t spam logs
let loggedNoPlayerId = false;
let loggedNoAvatar = false;
let loggedCameraAttached = false;

// Landscape overlay
const ORIENTATION_OVERLAY_ID = "orientation-overlay";

// Fixed 5-seat layout (you + 4 others)
const TOTAL_SEATS = 5;
const SEAT_ANGLES = (() => {
  const start = -Math.PI * 0.35; // left
  const end = Math.PI * 0.35;    // right
  const step = (end - start) / (TOTAL_SEATS - 1);
  const arr = [];
  for (let i = 0; i < TOTAL_SEATS; i++) {
    arr.push(start + step * i);
  }
  return arr;
})();

/* ---------------- BADGE HELPERS ---------------- */

function makeBadgeTexture(text, bgColor, textColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = bgColor;
  const r = 24;
  const w = canvas.width - 16;
  const h = canvas.height - 16;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = "bold 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createReadySprite(state = "not-ready") {
  const isReady = state === "ready";
  const text = isReady ? "READY ✔" : "NOT READY";
  const bg = isReady ? "#16a34a" : "#b45309";
  const fg = "#ffffff";

  const tex = makeBadgeTexture(text, bg, fg);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
  });

  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.7, 1);
  sprite.position.set(0, 2.1, 0);
  sprite.userData.state = state;
  return sprite;
}

/* -------------- ORIENTATION OVERLAY -------------- */

function updateOrientationOverlay() {
  let overlay = document.getElementById(ORIENTATION_OVERLAY_ID);
  const isPortrait = window.innerHeight > window.innerWidth;

  if (!isPortrait) {
    if (overlay) overlay.remove();
    return;
  }

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = ORIENTATION_OVERLAY_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "9999";
    overlay.style.background = "rgba(3,7,18,0.96)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.flexDirection = "column";
    overlay.style.color = "#e5e7eb";
    overlay.style.fontFamily =
      'system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
    overlay.style.textAlign = "center";
    overlay.style.padding = "24px";

    const icon = document.createElement("div");
    icon.textContent = "📱↻";
    icon.style.fontSize = "4rem";
    icon.style.marginBottom = "1rem";

    const text = document.createElement("div");
    text.innerHTML =
      "<strong>Rotate your device</strong><br/>Majority Loss plays best in landscape mode.";

    overlay.appendChild(icon);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
  }
}

/* -------------- INPUT: LOOK AROUND ---------------- */

function onPointerDown(e) {
  pointerDown = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  // Debug so we know this device is actually receiving input
  console.log("🖱 pointerdown", e.clientX, e.clientY);
}

function onPointerMove(e) {
  if (!pointerDown) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  const sensitivity = 0.004; // tweak if too fast/slow
  yaw -= dx * sensitivity;
  pitch -= dy * sensitivity;

  const maxPitch = 0.6;
  const minPitch = -0.6;
  pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
}

function onPointerUp() {
  pointerDown = false;
}

/* -------------- INIT SCENE ------------------------ */

export function initScene(containerId = "table-app") {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Missing container: #${containerId}`);

  console.log("🎬 initScene() with container:", containerId);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070711);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100vw";
  renderer.domElement.style.height = "100vh";
  renderer.domElement.style.pointerEvents = "auto";
  renderer.domElement.style.touchAction = "none"; // prevent scrolling on drag
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  // Initial "director" view before we know myPlayerId
  camera.position.set(0, 5.4, 13);
  camera.lookAt(0, 2.2, 0);

  /* -------- LIGHTING -------- */
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
  mainLight.position.set(4, 6, 3);
  scene.add(mainLight);

  const fill1 = new THREE.PointLight(0xffcc55, 1.5, 30);
  fill1.position.set(-3, 3, -2);
  scene.add(fill1);

  const fill2 = new THREE.PointLight(0x55aaff, 1.3, 30);
  fill2.position.set(3, 2, 3);
  scene.add(fill2);

  const rim = new THREE.PointLight(0xff6699, 1.7, 20);
  rim.position.set(0, 3, -6);
  scene.add(rim);

  /* -------- FLOOR & DAIS -------- */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 80),
    new THREE.MeshStandardMaterial({
      color: 0x050509,
      roughness: 0.7,
      metalness: 0.15,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.4, 0.8, 48),
    new THREE.MeshStandardMaterial({
      color: 0x11111b,
      roughness: 0.35,
      metalness: 0.5,
    })
  );
  dais.position.y = 1.2;
  scene.add(dais);

  const trimOuter = new THREE.Mesh(
    new THREE.TorusGeometry(5.5, 0.14, 24, 120),
    new THREE.MeshBasicMaterial({
      color: 0xffdd55,
      transparent: true,
      opacity: 0.9,
    })
  );
  trimOuter.rotation.x = Math.PI / 2;
  trimOuter.position.y = 1.6;
  scene.add(trimOuter);

  const trimInner = new THREE.Mesh(
    new THREE.TorusGeometry(4.6, 0.08, 24, 90),
    new THREE.MeshBasicMaterial({
      color: 0xff9b2f,
      transparent: true,
      opacity: 0.85,
    })
  );
  trimInner.rotation.x = Math.PI / 2;
  trimInner.position.y = 1.4;
  scene.add(trimInner);

  const underGlow = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 7.5, 54),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
    })
  );
  underGlow.rotation.x = -Math.PI / 2;
  underGlow.position.y = 0.01;
  scene.add(underGlow);

  const daisGlow = new THREE.PointLight(0xffb347, 1.4, 22);
  daisGlow.position.set(0, 2.2, 0);
  scene.add(daisGlow);

  /* -------- SHELL -------- */
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 10, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x080812,
      roughness: 0.95,
      metalness: 0.2,
      side: THREE.BackSide,
    })
  );
  wall.position.y = 4;
  scene.add(wall);

  const neonArc = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.25, 24, 120, Math.PI),
    new THREE.MeshBasicMaterial({
      color: 0xff335f,
      transparent: true,
      opacity: 0.9,
    })
  );
  neonArc.position.set(0, 6.2, -6.2);
  neonArc.rotation.set(Math.PI / 2.5, 0, 0);
  scene.add(neonArc);

  const neonLight = new THREE.PointLight(0xff335f, 1.3, 40);
  neonLight.position.set(0, 6.3, -6.8);
  scene.add(neonLight);

  const judgeDesk = new THREE.Mesh(
    new THREE.BoxGeometry(7, 1.2, 1),
    new THREE.MeshStandardMaterial({
      color: 0x151520,
      roughness: 0.45,
      metalness: 0.35,
    })
  );
  judgeDesk.position.set(0, 1.0, 6.5);
  scene.add(judgeDesk);

  const deskGlow = new THREE.PointLight(0x66c7ff, 1.1, 15);
  deskGlow.position.set(0, 2.2, 6.2);
  scene.add(deskGlow);

  /* -------- INPUT + ORIENTATION -------- */
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("resize", updateOrientationOverlay);
  updateOrientationOverlay();

  animate();
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* -------------- PLAYER AVATARS -------------------- */

export function setPlayersOnTable(players) {
  console.log("🎯 setPlayersOnTable called", { players, myPlayerId });

  // Reset debug flags each time we get a fresh table state
  loggedNoPlayerId = false;
  loggedNoAvatar = false;
  loggedCameraAttached = false;

  if (!scene) {
    console.warn("⚠️ Scene not ready yet, cannot place players");
    return;
  }

  const limited = players.slice(0, TOTAL_SEATS);
  const currentIds = new Set(limited.map((p) => p.id));

  console.log("🧍 Current players in scene:", limited.map((p) => p.id));

  // Remove avatars no longer present
  for (const [id, group] of avatars.entries()) {
    if (!currentIds.has(id)) {
      console.log("❌ Removing avatar for ID:", id);
      scene.remove(group);
      avatars.delete(id);
    }
  }

  const radius = 4.8;
  limited.forEach((p, idx) => {
    let group = avatars.get(p.id);

    if (!group) {
      console.log("➕ Adding new avatar:", p.id, p.name);
      group = createAvatar(p.name || "BOT");
      avatars.set(p.id, group);
      scene.add(group);
    } else {
      console.log("🔁 Reusing avatar:", p.id);
    }

    const angle = SEAT_ANGLES[idx];
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius * 0.65;

    group.position.set(x, 1.6, z);
    group.lookAt(0, 2.0, 0);

    const isMe = myPlayerId && p.id === myPlayerId;
    console.log(`💡 isMe for ${p.id}:`, isMe);
  });
}

/* -------------- READY BADGES ---------------------- */

export function updateReadyBadges(readyById = {}) {
  if (!scene) return;

  for (const [playerId, group] of avatars.entries()) {
    const isReady = !!readyById[playerId];
    const desiredState = isReady ? "ready" : "not-ready";

    let badgeInfo = readyBadges.get(playerId);

    if (!badgeInfo) {
      const sprite = createReadySprite(desiredState);
      group.add(sprite);
      badgeInfo = { sprite, state: desiredState };
      readyBadges.set(playerId, badgeInfo);
    } else if (badgeInfo.state !== desiredState) {
      const sprite = badgeInfo.sprite;
      const tex = makeBadgeTexture(
        desiredState === "ready" ? "READY ✔" : "NOT READY",
        desiredState === "ready" ? "#16a34a" : "#b45309",
        "#ffffff"
      );
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.map = tex;
      sprite.material.needsUpdate = true;
      badgeInfo.state = desiredState;
    }

    badgeInfo.sprite.position.set(0, 5.0, 0);
  }
}

/* -------------- HEAD LOOK & CAMERA ---------------- */

function updateHeadLook() {
  const id = myPlayerId;
  if (!id) {
    if (!loggedNoPlayerId) {
      console.log("🚫 updateHeadLook: no myPlayerId yet");
      loggedNoPlayerId = true;
    }
    return;
  }

  const avatar = avatars.get(id);
  if (!avatar) {
    if (!loggedNoAvatar) {
      console.log("❌ updateHeadLook: no avatar for myPlayerId", id);
      loggedNoAvatar = true;
    }
    return;
  }

  const headGroup = avatar.userData.headGroup;
  if (!headGroup) {
    if (!loggedNoAvatar) {
      console.log("❌ updateHeadLook: avatar has no headGroup", avatar);
      loggedNoAvatar = true;
    }
    return;
  }

  headGroup.rotation.y = yaw;
  headGroup.rotation.x = pitch;
}

function updateCameraFollow() {
  if (!camera) return;

  const id = myPlayerId;
  if (!id) {
    if (!loggedNoPlayerId) {
      console.log("🚫 updateCameraFollow: no myPlayerId yet");
      loggedNoPlayerId = true;
    }
    return;
  }

  const avatar = avatars.get(id);
  if (!avatar) {
    if (!loggedNoAvatar) {
      console.log("🟥 updateCameraFollow: avatar not found for", id);
      loggedNoAvatar = true;
    }
    return;
  }

  const headAnchor =
    avatar.userData.headAnchor || avatar.userData.headGroup || avatar;

  // Build local offsets (relative to headAnchor) and rotate them by yaw/pitch
  const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");

  const camOffsetLocal = new THREE.Vector3(0, 0, 0.15); // small forward from head
  const lookOffsetLocal = new THREE.Vector3(0, 0, 1.5); // further forward

  camOffsetLocal.applyEuler(euler);
  lookOffsetLocal.applyEuler(euler);

  const worldCamPos = camOffsetLocal.clone();
  const worldLookPos = lookOffsetLocal.clone();

  headAnchor.localToWorld(worldCamPos);
  headAnchor.localToWorld(worldLookPos);

  // Smooth follow
  camera.position.lerp(worldCamPos, 0.3);
  camera.lookAt(worldLookPos);

  if (!loggedCameraAttached) {
    console.log("📸 Camera now following avatar", id, {
      camPos: camera.position.clone(),
      lookPos: worldLookPos.clone(),
    });
    loggedCameraAttached = true;
  }
}

/* -------------- MAIN ANIMATION LOOP -------------- */

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !camera || !scene) return;

  // No bob/sway for anyone — keep them still for clean POV

  updateHeadLook();
  updateCameraFollow();

  renderer.render(scene, camera);
}