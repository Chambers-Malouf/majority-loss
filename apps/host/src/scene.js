// ===================================================
// ================ IMPORTS & SETUP ==================
// ===================================================
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer, controls;
let tabletMesh, tabletTexture, ctx;
let jumbotron, jumbotronTexture, jumboCtx;

// name -> { body, plate, plateCtx, plateTex, baseName }
const playersMap = new Map();

// ===================================================
// =============== CANVAS DRAW HELPERS ===============
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
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, w, h);

  // === TITLE ===
  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace";
  ctx.fillText(title, 36, 65);

  // === QUESTION ===
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter";
  wrapText(question, 36, 125, 950, 42);

  // === OPTIONS (moved up) ===
  ctx.font = "600 30px Inter";
  const buttonY = 210;
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    button(ctx, x, buttonY, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  // === TIMER ===
  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 305);

  // (results hidden on tablet to reduce clutter)

  tabletTexture.needsUpdate = true;
}

// ===================================================
// ================== SCOREBOARD =====================
// ===================================================
function drawScoreboard(leaderboard = []) {
  if (!jumboCtx) return;
  const w = 512, h = 256;
  jumboCtx.clearRect(0, 0, w, h);
  jumboCtx.fillStyle = "#000";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#f7d046";
  jumboCtx.font = "bold 34px ui-monospace";
  jumboCtx.fillText("SCOREBOARD", 120, 50);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.font = "600 26px Inter";
  leaderboard.forEach((p, i) => {
    jumboCtx.fillText(`${p.name}: ${p.points}`, 100, 100 + i * 30);
  });

  jumbotronTexture.needsUpdate = true;
}

// ===================================================
// =============== JUMBOTRON RESULTS =================
// ===================================================
function drawJumbotronResults(results, roundNo) {
  if (!jumboCtx) return;
  const w = 512, h = 256;
  jumboCtx.clearRect(0, 0, w, h);

  // solid red background
  jumboCtx.fillStyle = "#a00000";
  jumboCtx.fillRect(0, 0, w, h);

  // bright white text with black outline for readability
  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.strokeStyle = "#000000";
  jumboCtx.lineWidth = 3;
  jumboCtx.font = "bold 34px ui-monospace";
  jumboCtx.strokeText(`ROUND ${roundNo} RESULTS`, 60, 60);
  jumboCtx.fillText(`ROUND ${roundNo} RESULTS`, 60, 60);

  jumboCtx.font = "700 26px Inter";
  let y = 110;
  results.counts.forEach(c => {
    const line = `${c.text}: ${c.count}`;
    jumboCtx.strokeText(line, 80, y);
    jumboCtx.fillText(line, 80, y);
    y += 32;
  });

  jumboCtx.font = "900 28px ui-monospace";
  jumboCtx.strokeText(results.winnersText, 80, y + 40);
  jumboCtx.fillText(results.winnersText, 80, y + 40);

  jumbotronTexture.needsUpdate = true;
}

// ===================================================
// =============== DRAW JUMBOTRON ====================
// ===================================================
function drawJumbotronIdle() {
  if (!jumboCtx) return;
  const w = 512, h = 256;
  jumboCtx.clearRect(0, 0, w, h);

  jumboCtx.fillStyle = "#a00000";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.strokeStyle = "#000000";
  jumboCtx.lineWidth = 3;
  jumboCtx.font = "bold 34px ui-monospace";
  jumboCtx.strokeText("MAJORITY LOSS", 110, 90);
  jumboCtx.fillText("MAJORITY LOSS", 110, 90);

  jumboCtx.font = "600 22px Inter";
  jumboCtx.strokeText("Waiting for results…", 150, 150);
  jumboCtx.fillText("Waiting for results…", 150, 150);

  jumbotronTexture.needsUpdate = true;
}

// ===================================================
// =============== TEXT / UI HELPERS =================
// ===================================================
function wrapText(text, x, y, maxWidth, lh) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lh;
    } else line = test;
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
  ctx.font = "700 26px Inter";
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 9);
}

// ===================================================
// ======= AI DIALOGUE -> WRITE INTO NAMEPLATES ======
// ===================================================
function showAIDialogue(name, text) {
  const player = playersMap.get(name);
  if (!player) return;

  const { plateCtx, plateTex, baseName } = player;
  if (!plateCtx) return;

  // Redraw background
  plateCtx.fillStyle = "#000";
  plateCtx.fillRect(0, 0, 256, 64);

  // Name
  plateCtx.fillStyle = "#f7d046";
  plateCtx.font = "bold 22px ui-monospace";
  plateCtx.textAlign = "left";
  plateCtx.textBaseline = "alphabetic";
  plateCtx.fillText(`${baseName}:`, 12, 26);

  // Dialogue (trim to fit)
  const msg = (text || "…").trim();
  const short = msg.length > 42 ? msg.slice(0, 39) + "..." : msg;
  plateCtx.fillStyle = "#ffffff";
  plateCtx.font = "500 18px Inter";
  plateCtx.fillText(short, 12, 52);

  plateTex.needsUpdate = true;

  // Restore just the name after 4s
  setTimeout(() => {
    plateCtx.fillStyle = "#000";
    plateCtx.fillRect(0, 0, 256, 64);
    plateCtx.fillStyle = "#f7d046";
    plateCtx.font = "bold 28px ui-monospace";
    plateCtx.textAlign = "center";
    plateCtx.textBaseline = "middle";
    plateCtx.fillText(baseName, 128, 32);
    plateTex.needsUpdate = true;
  }, 4000);
}

// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene(aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]) {
  if (document.querySelector("#solo-bg")) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  document.body.appendChild(renderer.domElement);

  // Player camera behind table looking in
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, -3.8);
  camera.lookAt(0, 1.2, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI / 3;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(0, 1.2, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0x9090c0, 1.3));
  const spot = new THREE.SpotLight(0xffffff, 1.4, 20, Math.PI / 3);
  spot.position.set(0, 5, 0);
  scene.add(spot);
  const fill = new THREE.PointLight(0xffc870, 0.6, 10);
  fill.position.set(0, 2, 0);
  scene.add(fill);

  // Floor / table
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7, 64),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 0.25, 40),
    new THREE.MeshStandardMaterial({ color: 0x151515 })
  );
  table.position.y = 0.9;
  scene.add(table);

  // Chairs + bodies + nameplates
  const radius = 3.4;
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
  aiNames.slice(1).forEach((name, i) => {
    const a = THREE.MathUtils.degToRad(-70 + i * 45);
    const chair = new THREE.Mesh(chairGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    chair.position.set(Math.sin(a) * radius, 0.45, Math.cos(a) * radius);
    chair.lookAt(0, 0.45, 0);
    scene.add(chair);

    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x222228 }));
    body.position.set(chair.position.x, 1.1, chair.position.z);
    scene.add(body);

    // nameplate canvas
    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256; plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "#000";
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046";
    pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);

    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({
        map: plateTex,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    plate.position.set(chair.position.x, 1.7, chair.position.z);
    plate.lookAt(0, 1.3, 0);
    scene.add(plate);

    playersMap.set(name, { body, plate, plateCtx: pctx, plateTex, baseName: name });
  });

  // Tablet
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 768;
  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);
  const tabletMat = new THREE.MeshBasicMaterial({
    map: tabletTexture,
    side: THREE.DoubleSide,
  });
  const tabletGeo = new THREE.PlaneGeometry(0.95, 0.72);
  tabletMesh = new THREE.Mesh(tabletGeo, tabletMat);
  tabletMesh.position.set(0, 1.2, -2.3);
  tabletMesh.rotation.set(0.18, Math.PI, 0);
  scene.add(tabletMesh);
  drawTablet({ question: "Loading..." });

  // === JUMBOTRON (solid red display with visible white text) ===
  const jumboCanvas = document.createElement("canvas");
  jumboCanvas.width = 512;
  jumboCanvas.height = 256;
  jumboCtx = jumboCanvas.getContext("2d");
  jumbotronTexture = new THREE.CanvasTexture(jumboCanvas);

  // Unlit material: shows the text exactly as drawn
  const jumboMat = new THREE.MeshBasicMaterial({
    map: jumbotronTexture,
    color: 0xffffff,
    transparent: false,
    side: THREE.DoubleSide,
  });

  jumbotron = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), jumboMat);
  jumbotron.position.set(0, 2.6, 0);
  scene.add(jumbotron);

  // Subtle external lighting so the cube has presence
  const jumboHalo = new THREE.PointLight(0xff4444, 0.25, 5);
  jumboHalo.position.set(0, 2.6, 0);
  scene.add(jumboHalo);
  const jumboAmbient = new THREE.AmbientLight(0x330000, 0.2);
  scene.add(jumboAmbient);

  drawJumbotronIdle();

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
export function updatePlayerTablet(payload) { drawTablet(payload || {}); }
export function updateScoreboard(lb) { drawScoreboard(lb || []); }
export function updateJumbotronResults(results, roundNo) { drawJumbotronResults(results, roundNo); }
export function triggerAIDialogue(name, text) { showAIDialogue(name, text); }
export function showResultsMode(on) { if (jumbotron) jumbotron.visible = on; }

// ===================================================
// ===================== ANIMATE =====================
// ===================================================
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // slow spin for the cube
  if (jumbotron && jumbotron.visible) {
    jumbotron.rotation.y += 0.002;
  }

  renderer.render(scene, camera);
}

export const updateSoloTablet = updatePlayerTablet;
