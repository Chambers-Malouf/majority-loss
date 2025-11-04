// ===================================================
// ================ FAKE 3D SCENE SETUP ==============
// ===================================================
import * as THREE from "three";

let scene, camera, renderer;
let lights = {};
let tabletTexture, ctx;                // shared canvas for now (player + center)
let seats = [];                        // chair meshes
let figures = [];                      // low-poly people (body/head)
let nameplates = [];                   // floating name signs
let tablets = [];                      // one tablet mesh per seat
let centerDisplay = null;              // the jumbotron in the middle

// small helpers we reuse
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===================================================
// =============== CANVAS TEXTURE DRAWING ============
// ===================================================
function drawTablet({
  title = "MAJORITY LOSS — SOLO",
  question = "",
  options = [],
  timer = 0,
  aiLines = [],
  results = null,
}) {
  if (!ctx) return;

  const w = 1024, h = 768;
  ctx.clearRect(0, 0, w, h);

  // background panel
  ctx.fillStyle = "#111214";
  ctx.fillRect(0, 0, w, h);

  // header
  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(title, 36, 70);

  // question
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter, system-ui, sans-serif";
  wrapText(question, 36, 140, 950, 42);

  // options (visual only on this texture; real buttons live in your DOM)
  ctx.font = "600 30px Inter, system-ui, sans-serif";
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    const y = 330;
    button(ctx, x, y, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  // timer
  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace, SFMono-Regular, Menlo";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 430);

  // AI lines
  ctx.font = "600 26px Inter, system-ui, sans-serif";
  let y = 480;
  aiLines.slice(-6).forEach((line) => {
    ctx.fillStyle = "#94a3b8";
    wrapText(line, 36, y, 950, 30);
    y += 44;
  });

  // results (if any)
  if (results) {
    ctx.fillStyle = "#f7d046";
    ctx.font = "700 32px ui-monospace, SFMono-Regular, Menlo";
    ctx.fillText("RESULTS", 36, 580);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28px Inter, system-ui, sans-serif";
    let ry = 620;
    results.counts.forEach((c) => {
      ctx.fillText(`${c.text}: ${c.count}`, 36, ry);
      ry += 34;
    });

    ctx.fillStyle = "#a7f3d0";
    ctx.font = "700 28px ui-monospace, SFMono-Regular, Menlo";
    ctx.fillText(results.winnersText, 36, ry + 10);
  }

  // push pixels to GPU
  tabletTexture.needsUpdate = true;
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function button(ctx, x, y, w, h, fg, bg, label) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = fg;
  ctx.font = "700 26px Inter, system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 9);
}

// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene(
  aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]
) {
  // only build once
  if (document.querySelector("canvas#solo-bg")) return;

  // --- scene & fog (depth falloff) ---
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070707);
  scene.fog = new THREE.Fog(0x000000, 9, 16);

  // --- camera: over-the-shoulder of the player (index 0) ---
  camera = new THREE.PerspectiveCamera(
    55,                                  // slightly tighter than 60 for punchier frame
    window.innerWidth / window.innerHeight,
    0.1,
    60
  );

  // --- renderer (with shadows for stage feel) ---
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Object.assign(renderer.domElement.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
  });
  document.body.appendChild(renderer.domElement);

  // --- lights: moody game-show ---
  lights.ambient = new THREE.AmbientLight(0x222222, 1.5); // soft general fill
  scene.add(lights.ambient);

  // warm key spotlight from above center
  lights.key = new THREE.SpotLight(0xffd38a, 2.7, 35, 30 * DEG, 0.45, 1.8);
  lights.key.position.set(0, 8, 0);
  lights.key.castShadow = true;
  scene.add(lights.key);

  // cool rim from behind player
  lights.rim = new THREE.PointLight(0x86a6ff, 0.8, 18);
  lights.rim.position.set(0, 3, -7);
  scene.add(lights.rim);

  // subtle ring of low point lights around table edge (soft face light)
  const ringRadius = 4.2;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const pl = new THREE.PointLight(0x334055, 0.35, 6);
    pl.position.set(Math.cos(ang) * ringRadius, 1.5, Math.sin(ang) * ringRadius);
    scene.add(pl);
  }

  // --- floor & table ---
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 0.28, 64),
    new THREE.MeshStandardMaterial({ color: 0x101010, metalness: 0.15, roughness: 0.85 })
  );
  table.position.y = 0.9;
  table.castShadow = false;
  table.receiveShadow = true;
  scene.add(table);

  // --- seating ring & props ---
  seats = [];
  figures = [];
  nameplates = [];
  tablets = [];

  const radius = 4.4; // a bit wider so the camera can see all AI
  const chairGeo = new THREE.BoxGeometry(0.72, 0.9, 0.72);

  // low-poly person parts
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.85, 6);
  const headGeo = new THREE.SphereGeometry(0.22, 12, 12);

  // tablet geometry/material (one per seat)
  const seatTabletGeo = new THREE.PlaneGeometry(0.95, 0.7);
  const seatTabletMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // build a shared canvas/texture for now (player + center show same content)
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);

  // place all seats (0 = player, then 4 AI)
  aiNames.forEach((name, i) => {
    // angle arrangement: put player at the "near" side, AI across the table
    // player faces +Z -> we'll offset angles so player sits closest to camera
    const angle = (i / aiNames.length) * Math.PI * 2 + Math.PI; // rotate so index 0 is near camera
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // chair
    const chair = new THREE.Mesh(
      chairGeo,
      new THREE.MeshStandardMaterial({ color: i === 0 ? 0x2b3340 : 0x1f1f22 })
    );
    chair.position.set(x, 0.45, z);
    chair.lookAt(0, 0.45, 0);
    chair.castShadow = true;
    chair.receiveShadow = true;
    scene.add(chair);
    seats.push(chair);

    // low-poly person (body + head)
    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({ color: i === 0 ? 0x49546c : 0x3a3d49 })
    );
    body.position.set(x, 1.0, z);
    body.lookAt(0, 1.0, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);

    const head = new THREE.Mesh(
      headGeo,
      new THREE.MeshStandardMaterial({ color: i === 0 ? 0x9aa4bf : 0x8b90a3 })
    );
    head.position.set(x, 1.55, z);
    head.lookAt(0, 1.0, 0);
    head.castShadow = true;
    head.receiveShadow = true;
    scene.add(head);

    figures.push({ body, head });

    // nameplate above head
    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256;
    plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "black";
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046";
    pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: plateTex, transparent: true })
    );
    plate.position.set(x, 2.0, z);
    plate.lookAt(0, 2.0, 0);
    scene.add(plate);
    nameplates.push(plate);

    // personal tablet on table, angled toward sitter
    const tablet = new THREE.Mesh(
      seatTabletGeo,
      new THREE.MeshBasicMaterial({ map: tabletTexture }) // same content on all for now
    );
    // put tablet between seat and table center
    const toCenter = new THREE.Vector3(-x, 0, -z).normalize();
    const tabletPos = new THREE.Vector3(x, 1.10, z).addScaledVector(toCenter, 1.3);
    tablet.position.copy(tabletPos);
    // tilt toward sitter (i.e., away from center a bit)
    const lookTarget = new THREE.Vector3(x, 1.3, z);
    tablet.lookAt(lookTarget);
    // lay it down slightly like a real tablet
    tablet.rotateX(15 * DEG);
    scene.add(tablet);
    tablets.push(tablet);
  });

  // --- center jumbotron (big screen visible to all) ---
  centerDisplay = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.6),
    new THREE.MeshBasicMaterial({ map: tabletTexture })
  );
  centerDisplay.position.set(0, 1.9, 0.2);
  centerDisplay.lookAt(0, 1.6, 0);       // subtly lean toward viewers
  scene.add(centerDisplay);

  // draw initial content once
  drawTablet({
    title: "MAJORITY LOSS — SOLO",
    question: "Loading...",
    options: [],
    timer: 0,
    aiLines: [],
  });

  // --- place camera behind/above the player's head (seat index 0) ---
  placeCameraOverShoulder();

  // --- resize handling ---
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // run loop
  animate();
}

// ===================================================
// ================= PUBLIC API ======================
// ===================================================
export function updateSoloTablet(payload) {
  // For now we mirror the same canvas to: all seat tablets + center jumbotron.
  // Later you can split player/private vs public/center if you want.
  drawTablet(payload || {});
}

// ===================================================
// =============== CAMERA & ANIMATION LOOP ===========
// ===================================================
let mouseX = 0, mouseY = 0;
document.addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

function placeCameraOverShoulder() {
  // player seat is index 0
  const seat = seats[0];
  if (!seat) return;

  // vector from center to seat (where the player faces)
  const dir = new THREE.Vector3().copy(seat.position).normalize();

  // place camera slightly BEHIND the player along dir, then raise it
  const back = new THREE.Vector3().copy(dir).multiplyScalar(1.0); // behind distance
  const pos = new THREE.Vector3().copy(seat.position).add(back);
  pos.y = 1.65; // eye height

  camera.position.copy(pos);

  // camera looks toward table center but a hair above for pleasing angle
  camera.lookAt(0, 1.25, 0);
}

function animate() {
  requestAnimationFrame(animate);

  // breathing/sway
  const swayX = clamp(mouseX * 0.6, -0.8, 0.8);
  const swayY = clamp(-mouseY * 0.3, -0.4, 0.6);

  if (seats[0]) {
    // keep camera tethered to player's seat each frame
    const seat = seats[0];
    const dir = new THREE.Vector3().copy(seat.position).normalize();
    const base = new THREE.Vector3().copy(seat.position).addScaledVector(dir, 1.0);
    base.y = 1.65;

    camera.position.lerp(
      new THREE.Vector3(base.x + swayX, base.y + swayY, base.z),
      0.08
    );
    camera.lookAt(0, 1.25, 0);
  }

  // subtle pulsing of key light like a stage dimmer
  if (lights.key) {
    lights.key.intensity = 2.5 + Math.sin(Date.now() * 0.0018) * 0.3;
  }

  renderer.render(scene, camera);
}
