// ===================================================
// ================ FAKE 3D SCENE SETUP ==============
// ===================================================
import * as THREE from "three";

let scene, camera, renderer, lights = {};
let tabletMesh, tabletTexture, ctx;
let seats = [], nameplates = [], figures = [];

// ===================================================
// =============== CANVAS TEXTURE DRAWING ============
// ===================================================
function drawTablet({ title = "MAJORITY LOSS — SOLO", question = "", options = [], timer = 0, aiLines = [], results = null }) {
  if (!ctx) return;
  const w = 1024, h = 768;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace";
  ctx.fillText(title, 36, 70);

  ctx.fillStyle = "#fff";
  ctx.font = "700 34px Inter";
  wrapText(question, 36, 140, 950, 42);

  ctx.font = "600 30px Inter";
  options.forEach((t, i) => button(ctx, 36 + i * 250, 330, 220, 60, "#f7d046", "#1b1b1b", t));

  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 430);

  ctx.font = "600 26px Inter";
  let y = 480;
  aiLines.slice(-6).forEach(line => {
    ctx.fillStyle = "#94a3b8";
    wrapText(line, 36, y, 950, 30);
    y += 44;
  });

  if (results) {
    ctx.fillStyle = "#f7d046";
    ctx.font = "700 32px ui-monospace";
    ctx.fillText("RESULTS", 36, 580);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28px Inter";
    let ry = 620;
    results.counts.forEach(c => ctx.fillText(`${c.text}: ${c.count}`, 36, ry += 34));
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "700 28px ui-monospace";
    ctx.fillText(results.winnersText, 36, ry + 10);
  }

  tabletTexture.needsUpdate = true;
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else line = testLine;
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
// ================== INIT SCENE =====================
// ===================================================
export function initScene(aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]) {
  if (document.querySelector("canvas#solo-bg")) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070707);
  scene.fog = new THREE.Fog(0x000000, 8, 14);

  // CAMERA
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 3, 9);
  camera.lookAt(0, 1.2, 0);

  // RENDERER
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0
  });

  // LIGHTS
  lights.ambient = new THREE.AmbientLight(0x222222, 1.6);
  scene.add(lights.ambient);

  lights.spot = new THREE.SpotLight(0xffd580, 3, 30, Math.PI / 4, 0.5, 2);
  lights.spot.position.set(0, 8, 0);
  lights.spot.castShadow = true;
  scene.add(lights.spot);

  lights.rim = new THREE.PointLight(0x88aaff, 0.8, 10);
  lights.rim.position.set(0, 3, -6);
  scene.add(lights.rim);

  // FLOOR + TABLE
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 0.25, 40),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.8 })
  );
  table.position.y = 0.9;
  scene.add(table);

  // CHAIRS + AI FIGURES + NAMEPLATES
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const bodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6);
  const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
  const radius = 4.0;

  aiNames.forEach((name, i) => {
    const angle = (i / aiNames.length) * Math.PI * 2 - Math.PI / 2;
    const color = i === 0 ? 0x303742 : 0x222222;
    const chair = new THREE.Mesh(chairGeo, new THREE.MeshStandardMaterial({ color }));
    chair.position.set(Math.cos(angle) * radius, 0.45, Math.sin(angle) * radius);
    chair.lookAt(0, 0.45, 0);
    scene.add(chair);

    // low-poly person
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x444466 }));
    body.position.set(chair.position.x, 1.0, chair.position.z);
    body.lookAt(0, 1.0, 0);
    scene.add(body);

    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x8888aa }));
    head.position.set(chair.position.x, 1.55, chair.position.z);
    head.lookAt(0, 1.0, 0);
    scene.add(head);

    figures.push({ body, head });

    // nameplate above head
    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256; plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "black"; pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046"; pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(plateCanvas);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3),
                                 new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    plate.position.set(chair.position.x, 2.0, chair.position.z);
    plate.lookAt(0, 2.0, 0);
    scene.add(plate);
    nameplates.push(plate);
  });

  // TABLET
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 768;
  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);
  const tabletMat = new THREE.MeshBasicMaterial({ map: tabletTexture });
  tabletMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.45), tabletMat);
  tabletMesh.position.set(0, 1.6, 1.8);
  tabletMesh.rotation.x = -0.22;
  scene.add(tabletMesh);
  drawTablet({ question: "Loading..." });

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
export function updateSoloTablet(payload) {
  drawTablet(payload || {});
}

// ===================================================
// =============== CAMERA ANIMATION LOOP =============
// ===================================================
let mouseX = 0, mouseY = 0;
document.addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

function animate() {
  requestAnimationFrame(animate);
  lights.spot.intensity = 2.6 + Math.sin(Date.now() * 0.002) * 0.4;
  camera.position.x += (mouseX * 2.2 - camera.position.x) * 0.03;
  camera.position.y += (3 - mouseY * 0.4 - camera.position.y) * 0.03;
  camera.lookAt(0, 1.2, 0);
  renderer.render(scene, camera);
}
