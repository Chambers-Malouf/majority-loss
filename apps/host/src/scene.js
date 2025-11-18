// ===================================================
// ================ IMPORTS & SETUP ==================
// ===================================================
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer, controls;
let tabletMesh, tabletTexture, ctx;
let jumbotron, jumbotronTexture, jumboCtx;
let ceilingRing, arena, jumboHalo;

// name -> { body, plate, plateCtx, plateTex, baseName }
const playersMap = new Map();

// ===================================================
// =============== CANVAS DRAW HELPERS ===============
// ===================================================
function drawTablet({ title = "MAJORITY LOSS — SOLO", question = "", options = [], timer = 0 }) {
  if (!ctx) return;
  const w = 1024, h = 768;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace";
  ctx.fillText(title, 36, 65);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter";
  wrapText(question, 36, 125, 950, 42);

  ctx.font = "600 30px Inter";
  const buttonY = 210;
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    button(ctx, x, buttonY, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 305);

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
  jumboCtx.fillStyle = "#a00000";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.strokeStyle = "#000";
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
// =============== TOTAL SCOREBOARD ==================
// ===================================================
function drawJumbotronScoreboard(scoreMap) {
  if (!jumboCtx) return;
  const w = 512, h = 256;

  jumboCtx.clearRect(0, 0, w, h);
  jumboCtx.fillStyle = "#000080";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.strokeStyle = "#000000";
  jumboCtx.lineWidth = 3;
  jumboCtx.font = "bold 32px ui-monospace";

  jumboCtx.strokeText("TOTAL SCOREBOARD", 60, 50);
  jumboCtx.fillText("TOTAL SCOREBOARD", 60, 50);

  jumboCtx.font = "700 26px Inter";
  let y = 110;

  for (const [name, points] of scoreMap.entries()) {
    const line = `${name}: ${points}`;
    jumboCtx.strokeText(line, 80, y);
    jumboCtx.fillText(line, 80, y);
    y += 32;
  }

  jumbotronTexture.needsUpdate = true;
}

// ===================================================
// =============== JUMBOTRON IDLE ====================
// ===================================================
function drawJumbotronIdle() {
  if (!jumboCtx) return;
  const w = 512, h = 256;

  jumboCtx.clearRect(0, 0, w, h);
  jumboCtx.fillStyle = "#a00000";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.strokeStyle = "#000";
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
  const words = (text || "").split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lh;
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
  ctx.font = "700 26px Inter";

  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 9);
}

function showAIDialogue(name, text) {
  const player = playersMap.get(name);
  if (!player) return;

  const { plate, plateCtx, plateTex, baseName } = player;

  const maxWidth = 240;
  const msg = (text || "…").trim();

  // Measure lines BEFORE resizing
  plateCtx.font = "500 18px Inter";
  const words = msg.split(" ");
  let lines = [];
  let line = "";

  for (const w of words) {
    const test = line + w + " ";
    if (plateCtx.measureText(test).width > maxWidth) {
      lines.push(line.trim());
      line = w + " ";
    } else {
      line = test;
    }
  }
  lines.push(line.trim());

  const lineHeight = 22;
  const totalHeight = Math.min(64 + lines.length * lineHeight, 160);

  // ⚠️ Resize canvas — this wipes all context state
  plateCtx.canvas.height = totalHeight;

  // Reapply all styles after resize
  plateCtx.fillStyle = "#000";
  plateCtx.fillRect(0, 0, 256, totalHeight);

  // Draw name
  plateCtx.font = "bold 22px ui-monospace";
  plateCtx.fillStyle = "#f7d046";
  plateCtx.textAlign = "left";
  plateCtx.textBaseline = "top";
  plateCtx.fillText(`${baseName}:`, 12, 8);

  // Draw dialogue
  plateCtx.font = "500 18px Inter";
  plateCtx.fillStyle = "#ffffff";
  let y = 36;

  for (const l of lines) {
    plateCtx.fillText(l, 12, y);
    y += lineHeight;
  }

  // Update texture now that drawing is done
  plateTex.needsUpdate = true;

  // Correct geometry scaling
  const pxToUnits = 0.3 / 64; // default plane height is 0.3 at 64px
  const newHeight = totalHeight * pxToUnits;

  plate.geometry.dispose();
  plate.geometry = new THREE.PlaneGeometry(1.2, newHeight);

  // Auto-collapse after 4 sec
  setTimeout(() => {
    plateCtx.canvas.height = 64;

    plateCtx.fillStyle = "#000";
    plateCtx.fillRect(0, 0, 256, 64);

    plateCtx.font = "bold 28px ui-monospace";
    plateCtx.fillStyle = "#f7d046";
    plateCtx.textAlign = "center";
    plateCtx.textBaseline = "middle";
    plateCtx.fillText(baseName, 128, 32);

    plateTex.needsUpdate = true;

    plate.geometry.dispose();
    plate.geometry = new THREE.PlaneGeometry(1.2, 0.3);
  }, 4000);
}



// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene(aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]) {
  if (document.querySelector("#solo-bg")) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020208);
  scene.fog = new THREE.FogExp2(0x000000, 0.18);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  if ("outputColorSpace" in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }

  renderer.domElement.id = "solo-bg";
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, -3.8);
  camera.lookAt(0, 1.2, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI / 3;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(0, 1.2, 0);

  // ------------------ LIGHTING ------------------
  const hemi = new THREE.HemisphereLight(0x3e4cff, 0x080808, 0.8);
  scene.add(hemi);

  const spot = new THREE.SpotLight(0xffffff, 1.7, 25, Math.PI / 4, 0.3, 1.5);
  spot.position.set(0, 6, 0);
  spot.target.position.set(0, 1, 0);
  scene.add(spot);
  scene.add(spot.target);

  const fill = new THREE.PointLight(0xffc870, 0.8, 12);
  fill.position.set(0, 2, 0);
  scene.add(fill);

  const back = new THREE.PointLight(0x4488ff, 0.6, 18);
  back.position.set(0, 3.5, -6.5);
  scene.add(back);

  // ------------------ FLOOR / TABLE ------------------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7, 64),
    new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0.4, roughness: 0.6 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 0.25, 40),
    new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.3, roughness: 0.5 })
  );
  table.position.y = 0.9;
  scene.add(table);

  const underGlow = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.5, 40),
    new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.35 })
  );
  underGlow.rotation.x = -Math.PI / 2;
  underGlow.position.y = 0.89;
  scene.add(underGlow);

  // ------------------ ARENA ------------------
  const arenaGeo = new THREE.CylinderGeometry(10, 10, 6, 64, 1, true);
  const arenaMat = new THREE.MeshStandardMaterial({
    color: 0x050506,
    metalness: 0.2,
    roughness: 0.9,
    side: THREE.BackSide
  });

  arena = new THREE.Mesh(arenaGeo, arenaMat);
  arena.position.y = 1.5;
  scene.add(arena);

  // ------------------ CEILING RING ------------------
  const ringGeo = new THREE.TorusGeometry(6.8, 0.18, 24, 120);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });

  ceilingRing = new THREE.Mesh(ringGeo, ringMat);
  ceilingRing.position.y = 4.2;
  ceilingRing.rotation.x = Math.PI / 2;
  scene.add(ceilingRing);

  const ringLight = new THREE.PointLight(0xff2244, 0.7, 20);
  ringLight.position.set(0, 4.2, 0);
  scene.add(ringLight);

  // ------------------ JUMBOTRON ------------------
  const jumboCanvas = document.createElement("canvas");
  jumboCanvas.width = 512;
  jumboCanvas.height = 256;
  jumboCtx = jumboCanvas.getContext("2d");

  jumbotronTexture = new THREE.CanvasTexture(jumboCanvas);
  jumbotron = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.9, 1.8),
    new THREE.MeshBasicMaterial({ map: jumbotronTexture, side: THREE.DoubleSide })
  );
  jumbotron.position.set(0, 2.6, 0);
  scene.add(jumbotron);

  jumboHalo = new THREE.PointLight(0xff4444, 0.4, 6);
  jumboHalo.position.set(0, 2.6, 0);
  scene.add(jumboHalo);

  const jumboAmbient = new THREE.AmbientLight(0x330000, 0.3);
  scene.add(jumboAmbient);

  drawJumbotronIdle();

  // ------------------ CHAIRS + BODIES ------------------
  const radius = 3.4;
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);

  aiNames.slice(1).forEach((name, i) => {
    const a = THREE.MathUtils.degToRad(-70 + i * 45);
    const cx = Math.sin(a) * radius;
    const cz = Math.cos(a) * radius;

    const chair = new THREE.Mesh(
      chairGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a1a1f, metalness: 0.2, roughness: 0.6 })
    );
    chair.position.set(cx, 0.45, cz);
    chair.lookAt(0, 0.45, 0);
    scene.add(chair);

    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.1, roughness: 0.7 })
    );
    body.position.set(cx, 1.1, cz);
    scene.add(body);

    const rim = new THREE.PointLight(0xff6666, 0.55, 4.5);
    rim.position.set(cx * 1.1, 1.7, cz * 1.1);
    scene.add(rim);

    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256;
    plateCanvas.height = 64;

    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "#000";
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046";
    pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);

    const plateTex = new THREE.CanvasTexture(plateCanvas);

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, side: THREE.DoubleSide })
    );
    plate.position.set(cx, 1.7, cz);
    plate.lookAt(0, 1.3, 0);

    scene.add(plate);
    playersMap.set(name, { body, plate, plateCtx: pctx, plateTex, baseName: name });
  });

  // ------------------ TABLET ------------------
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;

  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);

  tabletMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.72),
    new THREE.MeshBasicMaterial({ map: tabletTexture })
  );
  tabletMesh.position.set(0, 1.2, -2.3);
  tabletMesh.rotation.set(0.18, Math.PI, 0);
  scene.add(tabletMesh);

  drawTablet({ question: "Loading..." });

  // --------------- MAC BRIGHTNESS PATCH ---------------
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  if (isMac) {
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    spot.intensity = 2.2;
    fill.intensity = 1.6;
    back.intensity = 1.3;
    arena.material.color = new THREE.Color(0x101015);
    scene.fog.density = 0.11;
    if (jumboHalo) jumboHalo.intensity = 0.7;
  }

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
export function updateJumbotronResults(r, n) { drawJumbotronResults(r, n); }
export function updateJumbotronScoreboard(scoreMap) { drawJumbotronScoreboard(scoreMap); }
export function triggerAIDialogue(name, text) { showAIDialogue(name, text); }
export function showResultsMode(on) { if (jumbotron) jumbotron.visible = on; }

// ===================================================
// ===================== ANIMATE =====================
// ===================================================
function animate() {
  requestAnimationFrame(animate);

  if (jumbotron && jumbotron.visible) {
    jumbotron.rotation.y += 0.002;
  }

  renderer.render(scene, camera);
}

export const updateSoloTablet = updatePlayerTablet;
