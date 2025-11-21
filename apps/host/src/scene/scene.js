// apps/host/src/scene/scene.js
import * as THREE from "three";
import { createAvatar } from "./avatar.js";

let scene, camera, renderer;
const avatars = new Map(); // playerId -> THREE.Group
const readyBadges = new Map(); // playerId -> { sprite, state }
const clock = new THREE.Clock();

// 🔹 Which player is "me" on THIS device
let myPlayerIdGlobal = null;

// 🔹 Head look state (per device, only applied to my avatar)
let pointerDown = false;
let lastPointerX = 0;
let lastPointerY = 0;
let yaw = 0;   // rotate left/right
let pitch = 0; // look up/down

// Landscape overlay
const ORIENTATION_OVERLAY_ID = "orientation-overlay";

// Fixed 5-seat layout (you + 4 others)
const TOTAL_SEATS = 5;
/**
 * Angles for a curved jury bench, facing the camera.
 * We use a gentle arc from left to right.
 */
const SEAT_ANGLES = (() => {
  const start = -Math.PI * 0.35; // left
  const end = Math.PI * 0.35; // right
  const step = (end - start) / (TOTAL_SEATS - 1);
  const arr = [];
  for (let i = 0; i < TOTAL_SEATS; i++) {
    arr.push(start + step * i);
  }
  return arr;
})();

/**
 * Helper: create a canvas texture with text for READY / NOT READY
 */
function makeBadgeTexture(text, bgColor, textColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background rounded pill
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

  // Text
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

/**
 * Create a sprite for READY / NOT READY badge.
 * state: "ready" | "not-ready"
 */
function createReadySprite(state = "not-ready") {
  const isReady = state === "ready";
  const text = isReady ? "READY ✔" : "NOT READY";
  const bg = isReady ? "#16a34a" : "#b45309"; // green vs amber
  const fg = "#ffffff";

  const tex = makeBadgeTexture(text, bg, fg);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
  });

  const sprite = new THREE.Sprite(mat);
  // width, height in world units (wider than tall = pill)
  sprite.scale.set(2.4, 0.7, 1);
  // Default position relative to avatar root; we can tweak later
  sprite.position.set(0, 2.1, 0);
  sprite.userData.state = state;
  return sprite;
}

/**
 * Create / update the "rotate to landscape" overlay on phones.
 */
function updateOrientationOverlay() {
  let overlay = document.getElementById(ORIENTATION_OVERLAY_ID);
  const isPortrait = window.innerHeight > window.innerWidth;

  if (!isPortrait) {
    // Remove overlay if present
    if (overlay) {
      overlay.remove();
    }
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

// ---------------- INPUT HANDLERS FOR LOOKING AROUND ----------------
function onPointerDown(e) {
  pointerDown = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
}

function onPointerMove(e) {
  if (!pointerDown) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  const sensitivity = 0.005; // tweak if too fast/slow
  yaw -= dx * sensitivity;
  pitch -= dy * sensitivity;

  // Clamp pitch so you can't snap your neck
  const maxPitch = 0.6;
  const minPitch = -0.6;
  pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
}

function onPointerUp() {
  pointerDown = false;
}

/**
 * Initialize the robot courtroom scene inside the given container.
 */
export function initScene(containerId = "table-app") {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Missing container: #${containerId}`);

  // ---------------- SCENE & RENDERER ----------------
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070711);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if ("outputColorSpace" in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  container.appendChild(renderer.domElement);

  // ---------------- CAMERA ----------------
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  // Default director view (fallback when not attached to an avatar)
  camera.position.set(0, 5.4, 13);
  camera.lookAt(0, 2.2, 0);

  // ---------------- LIGHTING ----------------
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

  // ---------------- FLOOR & DAIS ----------------
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

  // Raised circular "jury platform"
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

  // Glowing trim ring
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

  // Soft under-glow on floor
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

  // ---------------- COURTROOM SHELL ----------------
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

  // Neon arc behind the avatars (like a goofy "court of chaos" logo)
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

  // "Judge desk" in front of camera (low, just flavor)
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

  // ---------------- INPUT + ORIENTATION HANDLERS ----------------
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("resize", updateOrientationOverlay);
  updateOrientationOverlay();

  // ---------------- START LOOP ----------------
  animate();
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Place up to 5 avatars around the dais.
 * players: [{ id, name }, ...]
 * myPlayerId: id of "you" (passed from table.js as myId)
 */
export function setPlayersOnTable(players, myPlayerId = null) {
  if (!scene) return;
  const limited = players.slice(0, TOTAL_SEATS);
  const currentIds = new Set(limited.map((p) => p.id));

  // Track who "I" am for POV cam on this device
  myPlayerIdGlobal = myPlayerId || null;

  // Remove avatars (and badges) for players who left
  for (const [id, group] of avatars.entries()) {
    if (!currentIds.has(id)) {
      scene.remove(group);
      avatars.delete(id);

      const badgeInfo = readyBadges.get(id);
      if (badgeInfo) {
        group.remove(badgeInfo.sprite);
        if (badgeInfo.sprite.material.map) {
          badgeInfo.sprite.material.map.dispose();
        }
        badgeInfo.sprite.material.dispose();
        readyBadges.delete(id);
      }
    }
  }

  // Position avatars into fixed seat slots
  const radius = 4.8;
  const seatCount = TOTAL_SEATS;

  limited.forEach((p, idx) => {
    let group = avatars.get(p.id);
    if (!group) {
      group = createAvatar(p.name || "BOT");
      avatars.set(p.id, group);
      scene.add(group);
    }

    const seatIndex = Math.min(idx, seatCount - 1);
    const angle = SEAT_ANGLES[seatIndex];

    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius * 0.65; // squish toward camera
    const baseY = 1.6; // standing on dais

    group.position.set(x, baseY, z);
    group.userData.baseY = baseY;
    group.userData.phase ??= Math.random() * Math.PI * 2;

    // Make them scoot slightly inward and face center
    group.lookAt(0, 2.0, 0);

    // Highlight "you" with blue emissive
    const isMe = myPlayerId && p.id === myPlayerId;
    group.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.emissive) {
        obj.material.emissive.setHex(isMe ? 0x3b82f6 : 0x111111);
      }
    });
  });
}

/**
 * Update READY / NOT READY holograms above each avatar.
 * readyById: { [playerId]: boolean }
 */
export function updateReadyBadges(readyById = {}) {
  if (!scene) return;

  for (const [playerId, group] of avatars.entries()) {
    const isReady = !!readyById[playerId];
    const desiredState = isReady ? "ready" : "not-ready";

    let badgeInfo = readyBadges.get(playerId);

    if (!badgeInfo) {
      // Create new badge and attach to avatar
      const sprite = createReadySprite(desiredState);
      group.add(sprite);
      badgeInfo = { sprite, state: desiredState };
      readyBadges.set(playerId, badgeInfo);
    } else if (badgeInfo.state !== desiredState) {
      // Update existing badge texture / colors
      const sprite = badgeInfo.sprite;
      const tex = makeBadgeTexture(
        desiredState === "ready" ? "READY ✔" : "NOT READY",
        desiredState === "ready" ? "#16a34a" : "#b45309",
        "#ffffff"
      );
      if (sprite.material.map) {
        sprite.material.map.dispose();
      }
      sprite.material.map = tex;
      sprite.material.needsUpdate = true;
      badgeInfo.state = desiredState;
    }

    // Ensure badge stays at correct offset (just in case)
    badgeInfo.sprite.position.set(0, 5.0, 0);
  }
}

/**
 * Apply yaw/pitch to MY robot's head only.
 */
function updateHeadLook() {
  if (!myPlayerIdGlobal) return;
  const avatar = avatars.get(myPlayerIdGlobal);
  if (!avatar) return;

  const headGroup = avatar.userData.headGroup;
  if (!headGroup) return;

  headGroup.rotation.y = yaw;
  headGroup.rotation.x = pitch;
}

/**
 * Attach the camera to *my* avatar (on this device only).
 */
function updateCameraFollow() {
  if (!camera) return;

  if (!myPlayerIdGlobal || !avatars.has(myPlayerIdGlobal)) {
    // Fallback: classic director view
    camera.position.set(0, 5.4, 13);
    camera.lookAt(0, 2.2, 0);
    return;
  }

  const avatar = avatars.get(myPlayerIdGlobal);
  if (!avatar) return;

  const headGroup = avatar.userData.headGroup || avatar;

  // Make sure world matrix is up to date
  headGroup.updateWorldMatrix(true, false);

  // Camera a bit in front of the face
  const camOffset = new THREE.Vector3(0, 0.1, 0.8);
  const lookOffset = new THREE.Vector3(0, 0.0, 2.0);

  const worldCamPos = camOffset.clone();
  const worldLookPos = lookOffset.clone();

  headGroup.localToWorld(worldCamPos);
  headGroup.localToWorld(worldLookPos);

  // Smooth follow
  camera.position.lerp(worldCamPos, 0.25);
  camera.lookAt(worldLookPos);
}

/**
 * Main render loop – handles idle animation, head look, and camera follow.
 */
function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !camera || !scene) return;

  const t = clock.getElapsedTime();

  // Bobble + idle motion for each avatar
  for (const [playerId, group] of avatars.entries()) {
    const baseY = group.userData.baseY ?? group.position.y;
    const phase = group.userData.phase ?? 0;
    const bob = Math.sin(t * 2 + phase) * 0.08;
    group.position.y = baseY + bob;

    // Tiny "listening" sway for OTHER robots only
    if (playerId !== myPlayerIdGlobal) {
      group.rotation.y = Math.sin(t * 0.6 + phase) * 0.15;
    }
  }

  // Apply yaw/pitch to my robot's head
  updateHeadLook();

  // Follow my avatar with the camera
  updateCameraFollow();

  renderer.render(scene, camera);
}