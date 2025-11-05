// ===================================================
// ================ IMPORTS & SETUP ==================
// ===================================================
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer, controls;
let tabletMesh, tabletTexture, ctx;
let jumbotron, jumbotronTexture, jumboCtx;
let pulseClock = new THREE.Clock();


// floating AI name-to-object & dialogue maps
const playersMap = new Map();
const aiLabels = new Map();

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


  /* === RESULTS (stay near bottom) ===
  if (results) {
    ctx.fillStyle = "#f7d046";
    ctx.font = "700 32px ui-monospace";
    ctx.fillText("RESULTS", 36, 550);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28px Inter";
    let ry = 590;
    results.counts.forEach(c => {
      ctx.fillText(`${c.text}: ${c.count}`, 36, ry);
      ry += 34;
    });
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "700 28px ui-monospace";
    ctx.fillText(results.winnersText, 36, ry + 10);
  }*/

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

  // opaque dark red background
  jumboCtx.fillStyle = "#250000";
  jumboCtx.fillRect(0, 0, w, h);

  // add a faint glow behind the title area
  const gradient = jumboCtx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 260);
  gradient.addColorStop(0, "rgba(255,80,80,0.35)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  jumboCtx.fillStyle = gradient;
  jumboCtx.fillRect(0, 0, w, h);

  // === TITLE ===
  jumboCtx.shadowColor = "rgba(255,255,255,0.6)";
  jumboCtx.shadowBlur = 15;
  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.font = "900 36px 'Inter', ui-monospace";
  jumboCtx.fillText(`ROUND ${roundNo} RESULTS`, 55, 65);

  // === COUNTS ===
  jumboCtx.shadowBlur = 8;
  jumboCtx.fillStyle = "#f8f8f8";
  jumboCtx.font = "700 26px 'Inter', sans-serif";
  let y = 115;
  results.counts.forEach(c => {
    jumboCtx.fillText(`${c.text}: ${c.count}`, 75, y);
    y += 34;
  });

  // === WINNERS ===
  jumboCtx.shadowColor = "rgba(255,100,100,0.8)";
  jumboCtx.shadowBlur = 20;
  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.font = "900 30px ui-monospace";
  jumboCtx.fillText(results.winnersText, 75, y + 45);

  jumboCtx.shadowBlur = 0;
  jumbotronTexture.needsUpdate = true;
}



// ===================================================
// =============== DRAW JUMBOTRON ====================
// ===================================================
function drawJumbotronIdle() {
  if (!jumboCtx) return;
  const w = 512, h = 256;
  jumboCtx.clearRect(0, 0, w, h);

  jumboCtx.fillStyle = "#250000";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.shadowColor = "rgba(255,100,100,0.8)";
  jumboCtx.shadowBlur = 18;

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.font = "900 34px ui-monospace";
  jumboCtx.fillText("MAJORITY LOSS", 100, 95);

  jumboCtx.shadowColor = "rgba(255,255,255,0.5)";
  jumboCtx.shadowBlur = 12;
  jumboCtx.font = "700 22px Inter";
  jumboCtx.fillText("Waiting for results…", 150, 150);

  jumboCtx.shadowBlur = 0;
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
// =============== AI DIALOGUE LABELS ================
// ===================================================
function showAIDialogue(name, text) {
  let label = aiLabels.get(name);
  if (!label) {
    const div = document.createElement("div");
    div.className = "ai-dialogue";
    div.style.position = "absolute";
    div.style.color = "#ffffffff";
    div.style.fontFamily = "Inter, sans-serif";
    div.style.fontSize = "16px";
    div.style.maxWidth = "260px";
    div.style.textAlign = "center";
    div.style.textShadow = "0 0 8px rgba(0,0,0,0.9)";
    div.style.lineHeight = "1.4";
    div.style.pointerEvents = "none";
    div.style.transition = "opacity 1s, transform 0.4s ease-out";
    document.body.appendChild(div);
    aiLabels.set(name, div);
    label = div;
  }

  // Break long text into multiple lines (wrap every ~70–80 characters)
  const wrapped =
    text.length > 80
      ? text.match(/.{1,80}(?:\s|$)/g)?.join("\n")
      : text;

  label.textContent = `${name}: ${wrapped || "…"}`;
  label.style.opacity = "1";
  label.style.transform = "translateY(0px)";

  // Smooth fade-out and lift after a few seconds
  setTimeout(() => {
    label.style.opacity = "0";
    label.style.transform = "translateY(-20px)";
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

  // Chairs + bodies
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
    playersMap.set(name, body);

    // nameplate
    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256; plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "#000";
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046";
    pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(plateCanvas),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    plate.position.set(chair.position.x, 1.7, chair.position.z);
    plate.lookAt(0, 1.3, 0);
    scene.add(plate);
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

// === JUMBOTRON (deep red cube with white glow) ===
const jumboCanvas = document.createElement("canvas");
jumboCanvas.width = 512;
jumboCanvas.height = 256;
jumboCtx = jumboCanvas.getContext("2d");
jumbotronTexture = new THREE.CanvasTexture(jumboCanvas);

const jumboMat = new THREE.MeshStandardMaterial({
  map: jumbotronTexture,
  color: 0x200000,           // deep red body
  emissive: 0xff4d4d,        // soft red glow
  emissiveIntensity: 0.35,   // gentle inner light
  transparent: true,
  opacity: 1.0,
  roughness: 0.7,
  metalness: 0.3,
  side: THREE.DoubleSide,
});

jumbotron = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), jumboMat);
jumbotron.position.set(0, 2.6, 0);
scene.add(jumbotron);

// --- Lighting tweaks ---
const jumboSpot = new THREE.SpotLight(0xff4d4d, 0.4, 10, Math.PI / 3);
jumboSpot.position.set(0, 5, 1);
jumboSpot.target = jumbotron;
scene.add(jumboSpot);

const jumboHalo = new THREE.PointLight(0xff6666, 0.25, 6);
jumboHalo.position.copy(jumbotron.position).add(new THREE.Vector3(0, 0.2, 0));
scene.add(jumboHalo);

const jumboAmbient = new THREE.AmbientLight(0x331111, 0.4);
scene.add(jumboAmbient);

// draw idle screen
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

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // === Keep dialogue labels following each AI’s head ===
  for (const [name, div] of aiLabels.entries()) {
    const obj = playersMap?.get(name);
    if (!obj) continue;
    const pos = obj.position.clone();
    pos.y += 2.2;
    pos.project(camera);
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
  }

  // === Jumbotron animation ===
  if (jumbotron && jumbotron.visible) {
    // slow spin
    jumbotron.rotation.y += 0.002;

    // smooth emissive pulse between 0.35 → 0.55
    const t = pulseClock.getElapsedTime();
    const pulse = 0.45 + Math.sin(t * 1.5) * 0.1;
    jumbotron.material.emissiveIntensity = pulse;
  }

  // === Render frame ===
  renderer.render(scene, camera);
}

export const updateSoloTablet = updatePlayerTablet;

