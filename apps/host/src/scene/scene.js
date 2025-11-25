// apps/host/src/scene/scene.js
console.log("📸 scene.js loaded (3D courtroom)");

import * as THREE from "three";
import { createAvatar } from "./avatar.js";
import { myPlayerId } from "../state.js";

let scene, camera, renderer;
const avatars = new Map(); // playerId -> THREE.Group
const readyBadges = new Map(); // playerId -> { sprite, state }
const clock = new THREE.Clock();

// Look state (per device, only applied to my avatar)
let pointerDown = false;
let lastPointerX = 0;
let lastPointerY = 0;
let yaw = 0; // rotate left/right
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
  const end = Math.PI * 0.35; // right
  const step = (end - start) / (TOTAL_SEATS - 1);
  const arr = [];
  for (let i = 0; i < TOTAL_SEATS; i++) arr.push(start + step * i);
  return arr;
})();

/* ---------------- BADGE HELPERS (unchanged) ---------------- */

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
  const x = 8;
  const y = 8;

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
  ctx.font = "bold 30px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createReadySprite(state = "not-ready") {
  const isReady = state === "ready";
  const tex = makeBadgeTexture(
    isReady ? "READY ✔" : "NOT READY",
    isReady ? "#16a34a" : "#b45309",
    "#ffffff"
  );

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.7, 1);
  sprite.position.set(0, 2.1, 0);
  sprite.userData.state = state;
  return sprite;
}

/* -------------- ORIENTATION OVERLAY (unchanged) -------------- */

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
    overlay.style.padding = "24px";
    overlay.innerHTML =
      "<div style='font-size:4rem;margin-bottom:1rem;'>📱↻</div>" +
      "<div><strong>Rotate your device</strong><br/>Landscape mode works best.</div>";
    document.body.appendChild(overlay);
  }
}

/* -------------- INPUT: LOOK AROUND (unchanged) -------------- */

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

  const sensitivity = 0.004;
  yaw -= dx * sensitivity;
  pitch -= dy * sensitivity;

  pitch = Math.max(-0.6, Math.min(0.6, pitch));
}

function onPointerUp() {
  pointerDown = false;
}

/* -------------- INIT SCENE — REAL 3D COURTROOM ------------------------ */

export function initScene(containerId = "table-app") {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Missing container: #${containerId}`);

  console.log("🎬 initScene() — 3D Courtroom loaded");

  scene = new THREE.Scene();
  // light neutral background so corners don't go to black
  scene.background = new THREE.Color(0xe9edf5);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.pointerEvents = "auto";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

/* ---------------- CAMERA (new establishing shot) ---------------- */

camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

// High, far, behind benches
camera.position.set(0, 8, -18);

// Look at the judge bench area (roughly center front)
camera.lookAt(0, 4, 10);

  /* ---------------- LIGHTING — BRIGHT BUT WITH DEPTH ---------------- */

  // Sky + ground light for bright cartoon feel
  const hemi = new THREE.HemisphereLight(0xffffff, 0xf5e7d0, 0.9);
  scene.add(hemi);

  // Soft overall ambient to lift shadows
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  // Main "sun" from front-right, casting shadows
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(10, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -10;
  scene.add(sun);

  // Fill from left / right so faces aren’t harshly lit
  const fillLeft = new THREE.PointLight(0xfff1c1, 0.7, 35);
  fillLeft.position.set(-12, 10, 4);
  scene.add(fillLeft);

  const fillRight = new THREE.PointLight(0xd6ecff, 0.7, 35);
  fillRight.position.set(12, 10, 4);
  scene.add(fillRight);

  /* ---------------- FLOOR & CARPETED WELL ---------------- */

  // Big rectangular floor for the whole room
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 26),
    new THREE.MeshStandardMaterial({
      color: 0xe3e0da, // light stone / wood
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Raised red carpet "well" where players sit & move
  const wellCarpet = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.3, 10),
    new THREE.MeshStandardMaterial({
      color: 0xe54747,
      roughness: 0.6,
      metalness: 0.05,
    })
  );
  wellCarpet.position.set(0, 0.15, 3.5);
  wellCarpet.castShadow = true;
  wellCarpet.receiveShadow = true;
  scene.add(wellCarpet);

  // Gold trim around the well
  const wellTrim = new THREE.Mesh(
    new THREE.BoxGeometry(18.6, 0.15, 10.6),
    new THREE.MeshStandardMaterial({
      color: 0xf9d548,
      roughness: 0.4,
      metalness: 0.2,
    })
  );
  wellTrim.position.set(0, 0.3, 3.5);
  wellTrim.receiveShadow = true;
  scene.add(wellTrim);

  /* ---------------- RAIL (bar between players and gallery) ---------------- */

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.7, 0.25),
    new THREE.MeshStandardMaterial({
      color: 0xc49a5a,
      roughness: 0.6,
      metalness: 0.05,
    })
  );
  rail.position.set(0, 0.9, 0); // roughly in front of avatars
  rail.castShadow = true;
  scene.add(rail);

  // Simple posts on the rail
  for (let i = -4; i <= 4; i++) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 1.2, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xb07d3b,
        roughness: 0.6,
        metalness: 0.05,
      })
    );
    post.position.set(i * 1.0, 0.6, 0.1);
    post.castShadow = true;
    post.receiveShadow = true;
    scene.add(post);
  }

  /* ---------------- AUDIENCE BENCHES (left/right) ---------------- */

  function createBench(x, z) {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.4, 2.2),
      new THREE.MeshStandardMaterial({
        color: 0xc49a5a,
        roughness: 0.7,
        metalness: 0.05,
      })
    );
    bench.position.set(x, 0.4, z);
    bench.castShadow = true;
    bench.receiveShadow = true;

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 1.0, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0xad8042,
        roughness: 0.7,
        metalness: 0.05,
      })
    );
    back.position.set(0, 0.9, -0.9);
    back.castShadow = true;
    bench.add(back);

    scene.add(bench);
  }

  createBench(-5.5, -4);
  createBench(5.5, -4);
  createBench(-5.5, -7);
  createBench(5.5, -7);

/* ===== FIXED AUDIENCE ROBOTS ===== */

function spawnAudienceRobot(x, z, rotationY = 0) {
  const bot = createAvatar("BOT");

  // Smaller so they fit benches better
  bot.scale.set(0.7, 0.7, 0.7);

  // Sit ON bench (bench seat is at y = 0.4)
  bot.position.set(x, 0.75, z);

  // Face judge bench (toward +Z direction)
  bot.rotation.y = rotationY;

  scene.add(bot);
}

/* ---- LEFT BENCHES (face forward → rotationY = 0) ---- */
spawnAudienceRobot(-8.0, -3.3, 0);   // row 1 left seat A
spawnAudienceRobot(-5.5, -3.3, 0);   // row 1 left seat B
spawnAudienceRobot(-3.0, -3.3, 0); 

spawnAudienceRobot(-8.0, -6.0, 0);   // row 2 left seat A
spawnAudienceRobot(-5.5, -6.0, 0); 
spawnAudienceRobot(-3.0, -6.0, 0);   // row 2 left seat B

spawnAudienceRobot(8.0, -3.3, 0);   // row 1 left seat A
spawnAudienceRobot(5.5, -3.3, 0);   // row 1 left seat B
spawnAudienceRobot(3.0, -3.3, 0); 

spawnAudienceRobot(8.0, -6.0, 0);   // row 2 left seat A
spawnAudienceRobot(5.5, -6.0, 0); 
spawnAudienceRobot(3.0, -6.0, 0);   // row 2 left seat B

  /* ---------------- JUDGE PLATFORM & BENCH ---------------- */

  // Raised platform
  const judgePlatform = new THREE.Mesh(
    new THREE.BoxGeometry(18, 1.0, 4),
    new THREE.MeshStandardMaterial({
      color: 0xd9d3c7,
      roughness: 0.6,
      metalness: 0.05,
    })
  );
  judgePlatform.position.set(0, 0.5, 11);
  judgePlatform.receiveShadow = true;
  scene.add(judgePlatform);

  // Steps up to platform
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.4, 1.3),
    new THREE.MeshStandardMaterial({
      color: 0xc8bba6,
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  step1.position.set(0, 0.2, 9.4);
  step1.receiveShadow = true;
  scene.add(step1);

  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.4, 1.3),
    new THREE.MeshStandardMaterial({
      color: 0xc0b19b,
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  step2.position.set(0, 0.6, 10.3);
  step2.receiveShadow = true;
  scene.add(step2);

  // Judge bench
  const judgeBench = new THREE.Mesh(
    new THREE.BoxGeometry(10, 2.4, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0xb27b3a,
      roughness: 0.6,
      metalness: 0.05,
    })
  );
  judgeBench.position.set(0, 1.6, 12.1);
  judgeBench.castShadow = true;
  judgeBench.receiveShadow = true;
  scene.add(judgeBench);

  // Bench top lip
  const benchTop = new THREE.Mesh(
    new THREE.BoxGeometry(10.4, 0.25, 1.6),
    new THREE.MeshStandardMaterial({
      color: 0xd9a868,
      roughness: 0.5,
      metalness: 0.1,
    })
  );
  benchTop.position.set(0, 2.9, 12.1);
  benchTop.castShadow = true;
  scene.add(benchTop);

  // Simple circular emblem behind judge
  const emblem = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshStandardMaterial({
      color: 0xf9d548,
      emissive: 0xf9d548,
      emissiveIntensity: 0.35,
    })
  );
  emblem.position.set(0, 5.5, 14.6);
  emblem.rotation.y = Math.PI; // face the room
  scene.add(emblem);

/* ============================================================
   JUDGE ROBOT — correct size, correct position, correct wig
   ============================================================ */

function spawnJudgeRobot() {
  const judge = createAvatar("JUDGE");

  // Perfect judge scale
  judge.scale.set(0.55, 0.55, 0.55);

  // Correct podium height + correct Z placement
  // Platform top is around y = 1.0, bench top around y = 2.9
  // So the judge feet should be at ~y = 2.95
  judge.position.set(0, 2.95, 12);

  // Face the audience
  judge.rotation.y = Math.PI;

  scene.add(judge);
  
}

// CALL IT
spawnJudgeRobot();



/* ---------------- FULL COURTROOM WALLS (Rectangular Room) ---------------- */

// ===== FRONT WALL (behind judge desk) =====
const frontWall = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 12),
  new THREE.MeshStandardMaterial({
    color: 0xdde1f2,
    roughness: 0.9,
    metalness: 0.0,
  })
);
frontWall.position.set(0, 6, 15);   // centered, facing players
frontWall.rotation.y = Math.PI;     // flip so visible side faces inward
scene.add(frontWall);


// ===== BACK WALL (behind the jury / benches) =====
const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 12),
  new THREE.MeshStandardMaterial({
    color: 0xdde1f2,
    roughness: 0.9,
    metalness: 0.0,
  })
);
backWall.position.set(0, 6, -15);
backWall.rotation.y = 0;            // faces inward automatically
scene.add(backWall);


// ===== LEFT WALL =====
const leftWall = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 12),
  new THREE.MeshStandardMaterial({
    color: 0xd1dbf0,
    roughness: 0.9,
    metalness: 0.0,
  })
);
leftWall.position.set(-15, 6, 0);
leftWall.rotation.y = Math.PI / 2;
scene.add(leftWall);


// ===== RIGHT WALL =====
const rightWall = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 12),
  new THREE.MeshStandardMaterial({
    color: 0xd1dbf0,
    roughness: 0.9,
    metalness: 0.0,
  })
);
rightWall.position.set(15, 6, 0);
rightWall.rotation.y = -Math.PI / 2;
scene.add(rightWall);


// ===== TOP WHITE TRIM =====
const trimMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.4,
  metalness: 0.1,
});

const trimFront = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.3), trimMat);
trimFront.position.set(0, 12.1, 15);
scene.add(trimFront);

const trimBack = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.3), trimMat);
trimBack.position.set(0, 12.1, -15);
scene.add(trimBack);

const trimLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 30), trimMat);
trimLeft.position.set(-15, 12.1, 0);
scene.add(trimLeft);

const trimRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 30), trimMat);
trimRight.position.set(15, 12.1, 0);
scene.add(trimRight);

  /* ---------------- WINDOWS ON BACK WALL ---------------- */

  function createWindow(x) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(4, 6, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0xf3f4f6,
        roughness: 0.4,
        metalness: 0.1,
      })
    );
    frame.position.set(x, 7, 14.75);
    frame.castShadow = true;
    frame.receiveShadow = true;

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 5.2),
      new THREE.MeshStandardMaterial({
        color: 0xbfe3ff,
        emissive: 0xbfe3ff,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.9,
      })
    );
    glass.position.set(0, 0, 0.22);
    glass.rotation.y = Math.PI; // facing inward
    frame.add(glass);

    return frame;
  }

  scene.add(createWindow(-7));
  scene.add(createWindow(0));
  scene.add(createWindow(7));

  /* ---------------- INPUT + ORIENTATION ---------------- */

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("resize", updateOrientationOverlay);
  updateOrientationOverlay();

  animate();
}

/* -------------- WINDOW RESIZE (unchanged) ---------------- */

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* -------------- PLAYER AVATARS (unchanged logic) ---------------- */

export function setPlayersOnTable(players) {
  console.log("🎯 setPlayersOnTable:", players);

  loggedNoPlayerId = false;
  loggedNoAvatar = false;
  loggedCameraAttached = false;

  if (!scene) return;

  const limited = players.slice(0, TOTAL_SEATS);
  const currentIds = new Set(limited.map((p) => p.id));

  // remove missing players
  for (const [id, group] of avatars.entries()) {
    if (!currentIds.has(id)) {
      scene.remove(group);
      avatars.delete(id);
    }
  }

  const radius = 4.8;

  limited.forEach((p, idx) => {
    let group = avatars.get(p.id);
    if (!group) {
      group = createAvatar(p.name || "BOT");
      avatars.set(p.id, group);
      scene.add(group);
    }

    const angle = SEAT_ANGLES[idx];
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius * 0.65;

    group.position.set(x, 1.6, z);
    group.lookAt(0, 2.0, 0);

    group.position.y = 1.6;
    group.castShadow = true;
    group.receiveShadow = true;
  });
}

/* -------------- READY BADGES (unchanged logic) ---------------- */

export function updateReadyBadges(readyById = {}) {
  if (!scene) return;

  for (const [id, avatar] of avatars.entries()) {
    const isReady = !!readyById[id];
    const desiredState = isReady ? "ready" : "not-ready";

    let info = readyBadges.get(id);
    if (!info) {
      const sprite = createReadySprite(desiredState);
      avatar.add(sprite);
      info = { sprite, state: desiredState };
      readyBadges.set(id, info);
    } else if (info.state !== desiredState) {
      const tex = makeBadgeTexture(
        desiredState === "ready" ? "READY ✔" : "NOT READY",
        desiredState === "ready" ? "#16a34a" : "#b45309",
        "#ffffff"
      );
      info.sprite.material.map = tex;
      info.sprite.material.needsUpdate = true;
      info.state = desiredState;
    }

    info.sprite.position.set(0, 5.0, 0);
  }
}

/* -------------- HEAD LOOK & CAMERA (unchanged) ---------------- */

function updateHeadLook() {
  const id = myPlayerId;
  if (!id) return;

  const avatar = avatars.get(id);
  if (!avatar) return;

  const head = avatar.userData.headGroup;
  if (!head) return;

  head.rotation.y = yaw;
  head.rotation.x = pitch;
}

function updateCameraFollow() {
  if (!camera) return;

  const id = myPlayerId;
  const avatar = avatars.get(id);
  if (!avatar) return;

  const headAnchor =
    avatar.userData.headAnchor || avatar.userData.headGroup || avatar;

  // 1. Rotate the ENTIRE body left/right (yaw)
  avatar.rotation.y = yaw;

  // 2. Rotate ONLY the head up/down (pitch)
  const MAX_PITCH = 0.55;
  const MIN_PITCH = -0.35;
  headAnchor.rotation.x = THREE.MathUtils.clamp(pitch, MIN_PITCH, MAX_PITCH);

  // 3. Camera offsets — ALWAYS in front of the face, so never clips
  const CAMERA_FORWARD = 0.25;
  const CAMERA_UP = 0.15;

  // Build world position of the camera
  const camLocal = new THREE.Vector3(0, CAMERA_UP, CAMERA_FORWARD);
  headAnchor.localToWorld(camLocal);

  // Build look target further forward so camera always looks ahead
  const lookLocal = new THREE.Vector3(0, CAMERA_UP, CAMERA_FORWARD + 1.5);
  headAnchor.localToWorld(lookLocal);

  // 4. Smooth follow (optional)
  camera.position.lerp(camLocal, 0.35);
  camera.lookAt(lookLocal);
}


/* -------------- MAIN ANIMATION LOOP ---------------- */

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !camera || !scene) return;

  const t = clock.getElapsedTime();

  // Soft idle floating animation for all avatars
  for (const [id, avatar] of avatars.entries()) {
    avatar.position.y = 1.6 + Math.sin(t * 2 + id.length) * 0.04;
  }

  updateHeadLook();
  updateCameraFollow();

  renderer.render(scene, camera);
}
