// ===================================================
// ================ FAKE 3D SCENE SETUP ==============
// ===================================================
import * as THREE from "three";

let scene, camera, renderer;
let lights = {};
let seats = [];            // chairs
let figures = [];          // low-poly AI bodies/heads
let nameplates = [];       // each AI name sign
let tablets = [];          // per-seat tablets (player + AI)
let jumbotron = null;      // 4-face cube
let jumbotronGroup = null; // cube + pole
let resultsMode = false;   // if true: show cube, hide question UI vibe

// Two separate canvases/textures:
// 1) playerTabletTexture -> shown on all personal tablets (your Q/opts/timer)
// 2) scoreboardTexture   -> shown on all jumbotron faces during results
let playerTabletTexture, playerCtx;
let scoreboardTexture, scoreCtx;

// a small helper
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===================================================
// ======= DRAWING: PLAYER TABLET (QUESTION VIEW) ====
// ===================================================
function drawPlayerTablet({
  title = "MAJORITY LOSS — SOLO",
  question = "",
  options = [],
  timer = 0,
  aiLines = [],
}) {
  if (!playerCtx) return;

  const w = 1024, h = 768;
  playerCtx.clearRect(0, 0, w, h);

  // panel background
  playerCtx.fillStyle = "#111214";
  playerCtx.fillRect(0, 0, w, h);

  // header
  playerCtx.fillStyle = "#f7d046";
  playerCtx.font = "bold 42px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  playerCtx.fillText(title, 36, 70);

  // question
  playerCtx.fillStyle = "#ffffff";
  playerCtx.font = "700 34px Inter, system-ui, sans-serif";
  wrapText(playerCtx, question, 36, 140, 950, 42);

  // options (visual only — your DOM buttons still handle input)
  playerCtx.font = "600 30px Inter, system-ui, sans-serif";
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    const y = 330;
    drawButton(playerCtx, x, y, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  // timer
  playerCtx.fillStyle = "#c6c6c6";
  playerCtx.font = "bold 28px ui-monospace, SFMono-Regular, Menlo";
  playerCtx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 430);

  // AI chatter (latest 6)
  playerCtx.font = "600 26px Inter, system-ui, sans-serif";
  let y = 480;
  aiLines.slice(-6).forEach((line) => {
    playerCtx.fillStyle = "#94a3b8";
    wrapText(playerCtx, line, 36, y, 950, 30);
    y += 44;
  });

  playerTabletTexture.needsUpdate = true;
}

// ===================================================
// ======= DRAWING: JUMBOTRON (SCOREBOARD VIEW) ======
// ===================================================
/**
 * scoreboard = {
 *   round: number,
 *   winnersText: "Yumeko & L win the round",
 *   rows: [{ name: "You", points: 2 }, { name: "Yumeko", points: 3 }, ...] // sorted or not; we’ll format
 * }
 */
function drawScoreboard(scoreboard = { round: 1, winnersText: "", rows: [] }) {
  if (!scoreCtx) return;

  const w = 1024, h = 768;
  scoreCtx.clearRect(0, 0, w, h);

  // background
  scoreCtx.fillStyle = "#0f1114";
  scoreCtx.fillRect(0, 0, w, h);

  // title
  scoreCtx.fillStyle = "#60a5fa";
  scoreCtx.font = "bold 40px ui-monospace";
  scoreCtx.fillText(`ROUND ${scoreboard.round} — RESULTS`, 36, 70);

  // winners
  scoreCtx.fillStyle = "#fcd34d";
  scoreCtx.font = "700 34px Inter";
  wrapText(scoreCtx, scoreboard.winnersText || "—", 36, 128, 950, 40);

  // leaderboard header
  scoreCtx.fillStyle = "#94a3b8";
  scoreCtx.font = "bold 28px ui-monospace";
  scoreCtx.fillText("LEADERBOARD", 36, 190);

  // sort by points desc (don’t mutate caller array)
  const rows = [...(scoreboard.rows || [])].sort((a, b) => (b.points || 0) - (a.points || 0));

  // table
  const startY = 230;
  const lineH = 42;
  scoreCtx.font = "600 28px Inter";
  rows.forEach((r, i) => {
    const y = startY + i * lineH;
    const rank = i + 1;

    // zebra stripes for readability
    if (i % 2 === 0) {
      scoreCtx.fillStyle = "rgba(255,255,255,0.04)";
      scoreCtx.fillRect(30, y - 28, w - 60, lineH);
    }

    scoreCtx.fillStyle = "#e5e7eb";
    scoreCtx.fillText(`${rank}. ${r.name}`, 36, y);
    scoreCtx.fillStyle = "#fbbf24";
    const pts = `${r.points ?? 0} pts`;
    const tw = scoreCtx.measureText(pts).width;
    scoreCtx.fillText(pts, w - 36 - tw, y);
  });

  // subtle footer hint
  scoreCtx.fillStyle = "#64748b";
  scoreCtx.font = "600 22px Inter";
  scoreCtx.fillText("Next round starts shortly…", 36, h - 36);

  scoreboardTexture.needsUpdate = true;
}

// shared helpers for both canvases
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function drawButton(ctx, x, y, w, h, fg, bg, label) {
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
export function initScene(aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]) {
  if (document.querySelector("canvas#solo-bg")) return; // build once

  // ----- Scene & Fog -----
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070707);
  scene.fog = new THREE.Fog(0x000000, 9, 16);

  // ----- Camera: first-person (eye level) -----
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60);

  // ----- Renderer -----
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

  // ----- Lights (moody stage) -----
  lights.ambient = new THREE.AmbientLight(0x223043, 1.55); // cool global fill
  scene.add(lights.ambient);

  lights.key = new THREE.SpotLight(0xffd38a, 2.7, 35, 30 * DEG, 0.45, 1.8); // warm top
  lights.key.position.set(0, 8, 0);
  lights.key.castShadow = true;
  scene.add(lights.key);

  lights.rim = new THREE.PointLight(0x86a6ff, 0.8, 18); // cool back light
  lights.rim.position.set(0, 3, -7);
  scene.add(lights.rim);

  // ring points to gently light faces/tablets
  const ringRadius = 4.2;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const pl = new THREE.PointLight(0x334055, 0.35, 6);
    pl.position.set(Math.cos(ang) * ringRadius, 1.5, Math.sin(ang) * ringRadius);
    scene.add(pl);
  }

  // ----- Floor & Table -----
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
  table.receiveShadow = true;
  scene.add(table);

  // ----- Build canvas textures -----
  // Player/question canvas
  {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 768;
    playerCtx = c.getContext("2d");
    playerTabletTexture = new THREE.CanvasTexture(c);
    drawPlayerTablet({ question: "Loading...", options: [], timer: 0, aiLines: [] });
  }
  // Scoreboard canvas
  {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 768;
    scoreCtx = c.getContext("2d");
    scoreboardTexture = new THREE.CanvasTexture(c);
    drawScoreboard({ round: 1, winnersText: "—", rows: [] });
  }

  // ----- Seats, Figures, Nameplates, Tablets -----
  seats = [];
  figures = [];
  nameplates = [];
  tablets = [];

  const radius = 4.4; // spacing
  const chairGeo = new THREE.BoxGeometry(0.72, 0.9, 0.72);
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.85, 6);
  const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
  const seatTabletGeo = new THREE.PlaneGeometry(0.95, 0.7);

  aiNames.forEach((name, i) => {
    // arrange so player (i=0) is near the camera side
    const angle = (i / aiNames.length) * Math.PI * 2 + Math.PI;
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
    scene.add(chair);
    seats.push(chair);

    // low-poly person (skip making the player's own body in first-person)
    if (i !== 0) {
      const body = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ color: 0x3a3d49 })
      );
      body.position.set(x, 1.0, z);
      body.lookAt(0, 1.0, 0);
      body.castShadow = true;
      scene.add(body);

      const head = new THREE.Mesh(
        headGeo,
        new THREE.MeshStandardMaterial({ color: 0x8b90a3 })
      );
      head.position.set(x, 1.55, z);
      head.lookAt(0, 1.0, 0);
      head.castShadow = true;
      scene.add(head);

      figures.push({ body, head });
    } else {
      figures.push({ body: null, head: null });
    }

    // nameplate above head area (even for player seat, it marks "You")
    {
      const plateCanvas = document.createElement("canvas");
      plateCanvas.width = 256; plateCanvas.height = 64;
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
    }

    // personal tablet on the table (all show playerTabletTexture)
    {
      const mat = new THREE.MeshBasicMaterial({ map: playerTabletTexture });
      const tablet = new THREE.Mesh(seatTabletGeo, mat);

      // between seat and center
      const toCenter = new THREE.Vector3(-x, 0, -z).normalize();
      const tabletPos = new THREE.Vector3(x, 1.10, z).addScaledVector(toCenter, 1.3);
      tablet.position.copy(tabletPos);

      // face the sitter (away from center slightly) and tilt
      tablet.lookAt(new THREE.Vector3(x, 1.3, z));
      tablet.rotateX(15 * DEG);

      scene.add(tablet);
      tablets.push(tablet);
    }
  });

  // ----- Jumbotron cube (hidden until resultsMode = true) -----
  {
    const cubeW = 2.6, cubeH = 1.6, cubeD = 2.6;

    // 6 materials: we want 4 sides to show the scoreboard texture,
    // top/bottom stay dark.
    const faceMat = new THREE.MeshLambertMaterial({
      map: scoreboardTexture,
      emissive: new THREE.Color(0x0a2540),   // subtle glow
      emissiveIntensity: 0.25
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });

    // material order: px, nx, py, ny, pz, nz
    const mats = [faceMat, faceMat, darkMat, darkMat, faceMat, faceMat];

    jumbotron = new THREE.Mesh(new THREE.BoxGeometry(cubeW, cubeH, cubeD), mats);
    jumbotron.castShadow = false;
    jumbotron.receiveShadow = false;

    // hang from a short pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12),
      new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7 })
    );
    pole.position.y = (0.9 + cubeH / 2);

    jumbotronGroup = new THREE.Group();
    jumbotronGroup.add(jumbotron);
    jumbotronGroup.add(pole);
    jumbotronGroup.position.set(0, 2.0, 0); // above table center
    scene.add(jumbotronGroup);

    jumbotronGroup.visible = false; // hidden during question phase
  }

  // ----- Camera placement (first-person at player seat) -----
  placeCameraFirstPerson(); // sets initial eye position & look direction

  // ----- Resize handling -----
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// ===================================================
// ================= PUBLIC API ======================
// ===================================================

// Called by your game loop to update the QUESTION view.
// Mirrors onto *all* seat tablets (including yours).
export function updatePlayerTablet(payload) {
  drawPlayerTablet(payload || {});
}

// Called by your game loop when you have round RESULTS/LEADERBOARD.
export function updateScoreboard(scoreboard) {
  drawScoreboard(scoreboard || {});
}

// Toggle between normal question phase (false) and results phase (true).
export function showResultsMode(on) {
  resultsMode = !!on;
  // During results: keep per-seat tablets showing last state, but reveal cube.
  if (jumbotronGroup) jumbotronGroup.visible = resultsMode;
}

// ===================================================
// =============== CAMERA & ANIMATION LOOP ===========
// ===================================================
let mouseX = 0, mouseY = 0;
document.addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

function placeCameraFirstPerson() {
  // player seat is index 0
  const seat = seats[0];
  if (!seat) return;

  // unit vector from center to seat
  const dir = new THREE.Vector3().copy(seat.position).normalize();

  // put eyes slightly inside the arc toward center so your tablet is visible
  const eye = new THREE.Vector3().copy(seat.position).addScaledVector(dir, 0.35); // a little toward seat back
  eye.addScaledVector(dir, -0.8); // nudge inward toward table
  eye.y = 1.58; // eye height at table

  camera.position.copy(eye);
  camera.lookAt(0, 1.2, 0); // look toward table center
}

function animate() {
  requestAnimationFrame(animate);

  // gently vary the key light like a stage dimmer
  if (lights.key) {
    lights.key.intensity = 2.5 + Math.sin(Date.now() * 0.0018) * 0.25;
  }

  // keep camera tethered to player seat with subtle head sway
  const seat = seats[0];
  if (seat) {
    const dir = new THREE.Vector3().copy(seat.position).normalize();
    const base = new THREE.Vector3().copy(seat.position)
      .addScaledVector(dir, -0.45); // a bit inward toward table
    base.y = 1.58;

    const swayX = clamp(mouseX * 0.3, -0.4, 0.4);
    const swayY = clamp(-mouseY * 0.2, -0.25, 0.35);
    const target = new THREE.Vector3(base.x + swayX, base.y + swayY, base.z);

    camera.position.lerp(target, 0.08);
    camera.lookAt(0, 1.2, 0);
  }

  // spin jumbotron slowly only when visible (results phase)
  if (jumbotronGroup && jumbotronGroup.visible) {
    jumbotronGroup.rotation.y += 0.0035;
  }

  renderer.render(scene, camera);
}
