// apps/host/src/scene/scene.js
console.log("📸 scene.js loaded (3D courtroom)");

import * as THREE from "three";
import { createAvatar } from "./avatar.js";
import { myPlayerId } from "../state.js";
import { playIntroCutscene } from "../cutscenes/introCutscene.js";
import { playWinnerCutscene } from "../cutscenes/winnerCutscene.js";
import { attachCutsceneCamera } from "../cutscenes/cutsceneCamera.js";
import { cutsceneActive } from "../cutscenes/cutsceneCamera.js";


let scene, camera, renderer;
const avatars = new Map(); // playerId -> THREE.Group
const readyBadges = new Map(); // playerId -> { sprite, state }
const clock = new THREE.Clock();

// Speech bubbles for AI in solo mode: aiName -> { sprite }
const speechBubbles = new Map();

// Look state (per device, only applied to my avatar)
let pointerDown = false;
let lastPointerX = 0;
let lastPointerY = 0;
let dragDistanceSq = 0;
let yaw = 0; // rotate left/right
let pitch = 0; // look up/down

// Debug flags so we don’t spam logs
let loggedNoPlayerId = false;
let loggedNoAvatar = false;
let loggedCameraAttached = false;

// Landscape overlay
const ORIENTATION_OVERLAY_ID = "orientation-overlay";

// Fixed max seats at the well (you + 4 others)
const TOTAL_SEATS = 5;

// Raycaster for chalkboard clicks
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

export function hideCourtroomObjects() {
  if (!scene) return;
  scene.traverse((obj) => {
    if (!obj.userData) obj.userData = {};
    obj.userData._savedVisible = obj.visible;
    obj.visible = false;
  });
}

export function showCourtroomObjects() {
  if (!scene) return;
  scene.traverse((obj) => {
    if (obj.userData && obj.userData._savedVisible !== undefined) {
      obj.visible = obj.userData._savedVisible;
    }
  });
}

/* ------------------------------------------------------------------
   PUBLIC: PLAY INTRO + WINNER CUTSCENES SAFELY
------------------------------------------------------------------- */

// Solo or Multiplayer: BEFORE first question
export function playIntroFromScene(onFinish = () => {}) {
  if (!camera) {
    console.warn("⚠️ No camera available for intro cutscene");
    onFinish();
    return;
  }

  // Disable chalkboard / head movement during cutscene
  renderer.domElement.style.pointerEvents = "none";

  console.log("🎬 Starting INTRO cutscene from scene.js");

  playIntroCutscene(() => {
    renderer.domElement.style.pointerEvents = "auto";
    console.log("🎬 INTRO cutscene complete");
    onFinish();
  });
}

// End of game: winner animation
export function playWinnerFromScene(winnerName, onFinish = () => {}) {
  if (!camera) {
    console.warn("⚠️ No camera available for winner cutscene");
    onFinish();
    return;
  }

  renderer.domElement.style.pointerEvents = "none";

  console.log("🏆 Starting WINNER cutscene from scene.js");

  playWinnerCutscene(winnerName, () => {
    renderer.domElement.style.pointerEvents = "auto";
    console.log("🏆 WINNER cutscene complete");
    onFinish();
  });
}


/* ------------------------------------------------------------------
   BADGE HELPERS
------------------------------------------------------------------- */

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

/* ------------------------------------------------------------------
   SPEECH BUBBLE HELPERS (SOLO AI)
------------------------------------------------------------------- */

function makeSpeechBubbleTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Rounded border
  ctx.strokeStyle = "#fefae0";
  ctx.lineWidth = 8;
  const r = 28;
  const x = 12;
  const y = 12;
  const w = canvas.width - 24;
  const h = canvas.height - 24;
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
  ctx.stroke();

  // Text
  ctx.fillStyle = "#f9fafb";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const marginX = 32;
  const marginY = 26;
  const maxWidth = w - marginX * 2;
  const maxHeight = h - marginY * 2;

  let fontSize = 32;
  const minFont = 16;
  const lineHeightMult = 1.25;
  let lines = [];

  function wrapWithSize(size) {
    ctx.font = `bold ${size}px "Marker Felt", "Chalkboard", system-ui`;
    const words = (text || "…").split(/\s+/);
    const wrapped = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        wrapped.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) wrapped.push(line);
    return wrapped;
  }

  while (fontSize >= minFont) {
    lines = wrapWithSize(fontSize);
    const totalH = lines.length * (fontSize * lineHeightMult);
    const widthOK = lines.every(
      (ln) => ctx.measureText(ln).width <= maxWidth
    );
    const heightOK = totalH <= maxHeight;
    if (widthOK && heightOK) break;
    fontSize -= 2;
  }

  ctx.font = `bold ${fontSize}px "Marker Felt", "Chalkboard", system-ui`;
  const totalH = lines.length * (fontSize * lineHeightMult);
  let ty = y + (h - totalH) / 2;
  const tx = x + marginX;

  for (const ln of lines) {
    ctx.fillText(ln, tx, ty);
    ty += fontSize * lineHeightMult;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------
   ORIENTATION OVERLAY
------------------------------------------------------------------- */

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
// Hide all avatars except the winner(s)
export function hideNonWinners(winnerNames = []) {
  for (const [id, av] of avatars.entries()) {
    const name = av.userData?.playerName;
    if (!name) continue;

    if (winnerNames.includes(name)) {
      av.visible = true;
    } else {
      av.visible = false;
    }
  }
}

// Restore all avatars
export function restoreAllAvatars() {
  for (const [id, av] of avatars.entries()) {
    av.visible = true;
  }
}

/* ------------------------------------------------------------------
   INPUT: LOOK + TAP ON CHALKBOARD
------------------------------------------------------------------- */

function onPointerDown(e) {
  pointerDown = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  dragDistanceSq = 0;
}

function onPointerMove(e) {
  if (!pointerDown) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  dragDistanceSq += dx * dx + dy * dy;

  const sensitivity = 0.004;
  yaw -= dx * sensitivity;
  pitch -= dy * sensitivity;

  pitch = Math.max(-0.6, Math.min(0.6, pitch));
}

function onPointerUp(e) {
  if (!pointerDown) return;
  pointerDown = false;

  const TAP_THRESHOLD_SQ = 12 * 12; // ~12px
  if (dragDistanceSq <= TAP_THRESHOLD_SQ) {
    handleChalkClick(e);
  }
}

/* ------------------------------------------------------------------
   CHALKBOARD BANNERS (left / center / right) — ★ PATCHED FOR LARGE TEXT ★
------------------------------------------------------------------- */

const bannerMeshes = { left: null, center: null, right: null };
const bannerTextures = { left: null, center: null, right: null };
let bannerState = {
  left: "",
  center: "MAJORITY LOSS\nTrial by Chambers Malouf",
  right: "",
};

// Chalk state for question / results / lobby
let chalkMode = "idle"; 
let chalkState = {
  roomId: "------",
  roundNumber: 1,
  questionText: "",
  options: [],
  remaining: null,
  myVoteOptionId: null,
  onOptionClick: null,
  optionBoxes: [],
  winningOptionId: null,
  counts: [],
  leaderboard: [],
};

function createBannerTexture(initialText = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grd.addColorStop(0, "#1f3a2b");
  grd.addColorStop(1, "#163024");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#fefae0";
  ctx.lineWidth = 16;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  drawBannerText(ctx, canvas, initialText);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return { canvas, ctx, tex };
}

/* -------------------------------------------------------------
   ★ PATCHED BANNER TEXT — SEVERELY LARGER AUTO-SCALING ★
------------------------------------------------------------- */

function drawBannerText(ctx, canvas, text) {
  if (!text) return;

  const marginX = canvas.width * 0.05;   // smaller margins = larger text
  const marginY = canvas.height * 0.06;
  const maxWidth = canvas.width - marginX * 2;
  const maxHeight = canvas.height - marginY * 2;

  ctx.fillStyle = "#fefae0";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const paragraphs = text.split(/\n/);

  let fontSize = 110;   // was 70 — now MUCH bigger
  let lines = [];
  const lineHeightMult = 1.05;  // tighter packing
  const minFont = 22;

  function wrapLines(size) {
    ctx.font = `bold ${size}px "Marker Felt", "Chalkboard", system-ui`;
    const wrapped = [];

    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          wrapped.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) wrapped.push(line);
    }
    return wrapped;
  }

  while (fontSize >= minFont) {
    lines = wrapLines(fontSize);
    const totalHeight = lines.length * (fontSize * lineHeightMult);

    const widthOK = lines.every(
      (line) => ctx.measureText(line).width <= maxWidth
    );
    const heightOK = totalHeight <= maxHeight;

    if (widthOK && heightOK) break;
    fontSize -= 2;
  }

  const totalHeight = lines.length * (fontSize * lineHeightMult);
  let y = (canvas.height - totalHeight) / 2;

  ctx.font = `bold ${fontSize}px "Marker Felt", "Chalkboard", system-ui`;
  for (const line of lines) {
    ctx.fillText(line, canvas.width / 2, y);
    y += fontSize * lineHeightMult;
  }
}

/* =============================================================
   ★ PATCHED QUESTION BOARD — EVERY FONT & BOX INCREASED ★
============================================================= */

function drawQuestionBoard(ctx, canvas) {
  const {
    roomId,
    roundNumber,
    questionText,
    options,
    remaining,
    myVoteOptionId,
  } = chalkState;

  const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grd.addColorStop(0, "#1f3a2b");
  grd.addColorStop(1, "#163024");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#fefae0";
  ctx.lineWidth = 16;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  const marginX = canvas.width * 0.14;
  const headerY = canvas.height * 0.09;

  // Header — MUCH BIGGER
  ctx.fillStyle = "#fefae0";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold 60px "Marker Felt", "Chalkboard", system-ui`;
  ctx.fillText(`Room ${roomId}`, marginX, headerY);
  ctx.font = `bold 50px "Marker Felt", "Chalkboard", system-ui`;
  ctx.fillText(`Round ${roundNumber}`, marginX, headerY + 60);

  if (typeof remaining === "number") {
    ctx.textAlign = "right";
    ctx.font = `bold 48px "Marker Felt", "Chalkboard", system-ui`;
    ctx.fillText(`${remaining}s`, canvas.width - marginX, headerY + 10);
  }

  // QUESTION TEXT — MASSIVE
  const questionTopY = headerY + 140;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const qMaxWidth = canvas.width - marginX * 2;
  let qFont = 70;
  ctx.font = `bold ${qFont}px "Marker Felt", "Chalkboard", system-ui`;

  const qLines = [];
  const qWords = (questionText || "…").split(/\s+/);
  let qLine = "";
  for (const w of qWords) {
    const test = qLine ? qLine + " " + w : w;
    if (ctx.measureText(test).width > qMaxWidth && qLine) {
      qLines.push(qLine);
      qLine = w;
    } else {
      qLine = test;
    }
  }
  if (qLine) qLines.push(qLine);

  let qY = questionTopY;
  qLines.forEach((l) => {
    ctx.fillText(l, canvas.width / 2, qY);
    qY += qFont * 1.2;
  });

  // Helper text — bigger & readable
  ctx.font = `italic 40px "Marker Felt", "Chalkboard", system-ui`;
  ctx.fillText(
    "Tap a box to choose.",
    canvas.width / 2,
    qY + 20
  );

  // OPTIONS — MUCH BIGGER
  const startY = qY + 90;
  const boxWidth = canvas.width * 0.8;
  const boxHeight = 130;
  const gap = 40;

  chalkState.optionBoxes = [];

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  options.forEach((opt, idx) => {
    const x = (canvas.width - boxWidth) / 2;
    const y = startY + idx * (boxHeight + gap);
    const isSelected = myVoteOptionId === opt.id;

    ctx.fillStyle = isSelected ? "#325f4a" : "#274131";
    roundRect(ctx, x, y, boxWidth, boxHeight, 22, true, false);

    ctx.strokeStyle = "#fefae0";
    ctx.lineWidth = 5;
    roundRect(ctx, x, y, boxWidth, boxHeight, 22, false, true);

    ctx.fillStyle = "#fefae0";

    const innerMarginX = 35;
    const innerMaxWidth = boxWidth - innerMarginX * 2;
    const cx = x + innerMarginX;
    const cy = y + boxHeight / 2;

    let oFont = 48;  // BIGGER
    ctx.font = `bold ${oFont}px "Marker Felt", "Chalkboard", system-ui`;

    const words = opt.text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > innerMaxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    const totalH = lines.length * (oFont * 1.2);
    let textY = cy - totalH / 2;
    lines.forEach((ln) => {
      ctx.fillText(ln, cx, textY);
      textY += oFont * 1.2;
    });

    if (isSelected) {
      ctx.strokeStyle = "#fefae0";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(
        x + boxWidth / 2,
        y + boxHeight / 2,
        (boxWidth / 2) + 16,
        (boxHeight / 2) + 12,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    chalkState.optionBoxes.push({ id: opt.id, x, y, w: boxWidth, h: boxHeight });
  });
}

/* =============================================================
   ★ PATCHED RESULTS BOARD — EVERYTHING BIGGER & CLEAR ★
============================================================= */

function drawResultsBoard(ctx, canvas) {
  const {
    roomId,
    roundNumber,
    questionText,
    options,
    winningOptionId,
    counts,
    leaderboard,
  } = chalkState;

  const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grd.addColorStop(0, "#1f3a2b");
  grd.addColorStop(1, "#163024");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#fefae0";
  ctx.lineWidth = 16;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  const marginX = canvas.width * 0.12;

  ctx.fillStyle = "#fefae0";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // BIG header
  ctx.font = `bold 60px "Marker Felt", "Chalkboard", system-ui`;
  ctx.fillText(`Room ${roomId}`, marginX, canvas.height * 0.08);
  ctx.font = `bold 52px "Marker Felt", "Chalkboard", system-ui`;
  ctx.fillText(
    `Round ${roundNumber} — Results`,
    marginX,
    canvas.height * 0.08 + 66
  );

  // QUESTION TEXT — Larger
  ctx.textAlign = "center";
  ctx.font = `bold 52px "Marker Felt", "Chalkboard", system-ui`;
  const qY = canvas.height * 0.23;
  const qMaxWidth = canvas.width - marginX * 2;

  const qWords = (questionText || "…").split(/\s+/);
  const qLines = [];
  let qLine = "";

  qWords.forEach((w) => {
    const test = qLine ? qLine + " " + w : w;
    if (ctx.measureText(test).width > qMaxWidth && qLine) {
      qLines.push(qLine);
      qLine = w;
    } else {
      qLine = test;
    }
  });
  if (qLine) qLines.push(qLine);

  let curY = qY;
  qLines.forEach((ln) => {
    ctx.fillText(ln, canvas.width / 2, curY);
    curY += 58;
  });

  // OPTIONS — Much bigger
  ctx.textAlign = "left";
  ctx.font = `bold 46px "Marker Felt", "Chalkboard", system-ui`;
  let optY = curY + 20;

  options.forEach((opt) => {
    const c = counts.find(
      (entry) => Number(entry.optionId) === Number(opt.id)
    );
    const count = c ? c.count : 0;
    const isWinner = winningOptionId !== null &&
                     Number(opt.id) === Number(winningOptionId);

    const votesWord = count === 1 ? "vote" : "votes";
    const label = isWinner ? "  ← WINNER" : "";

    ctx.fillText(
      `• ${opt.text} — ${count} ${votesWord}${label}`,
      marginX,
      optY
    );
    optY += 48;
  });

  ctx.font = `bold 48px "Marker Felt", "Chalkboard", system-ui`;
  optY += 30;
  ctx.fillText("Scoreboard:", marginX, optY);
  optY += 50;

  leaderboard.forEach((p, idx) => {
    const medal =
      idx === 0 ? "👑" :
      idx === 1 ? "🥈" :
      idx === 2 ? "🥉" :
      "•";

    ctx.fillText(
      `${medal} ${p.name} — ${p.points} pts`,
      marginX,
      optY
    );
    optY += 46;
  });
}


function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (typeof r === "number") {
    r = { tl: r, tr: r, br: r, bl: r };
  } else {
    r = Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, r);
  }
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function createBannerMesh(key, x) {
  const { canvas, ctx, tex } = createBannerTexture(bannerState[key] || "");
  bannerTextures[key] = { canvas, ctx, tex };

  const geom = new THREE.PlaneGeometry(4.2, 6);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.6,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, 6.8, 14.7);
  mesh.rotation.y = Math.PI;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  scene.add(mesh);
  bannerMeshes[key] = mesh;
}

function updateBanner(key) {
  const info = bannerTextures[key];
  if (!info || !info.ctx) return;
  const { ctx, canvas, tex } = info;

  if (key === "left" || key === "right") {
    if (chalkMode === "question") {
      drawQuestionBoard(ctx, canvas);
    } else if (chalkMode === "results") {
      drawResultsBoard(ctx, canvas);
    } else {
      const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grd.addColorStop(0, "#1f3a2b");
      grd.addColorStop(1, "#163024");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#fefae0";
      ctx.lineWidth = 16;
      ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

      drawBannerText(ctx, canvas, bannerState[key]);
    }
  } else {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "#1f3a2b");
    grd.addColorStop(1, "#163024");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#fefae0";
    ctx.lineWidth = 16;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

    drawBannerText(ctx, canvas, bannerState[key]);
  }

  tex.needsUpdate = true;
}

/* ------------------------------------------------------------------
   PUBLIC API: BANNERS / CHALK VIEW
------------------------------------------------------------------- */

export function setCourtroomBanner(left, center, right) {
  if (typeof left === "string") bannerState.left = left;
  if (typeof center === "string") bannerState.center = center;
  if (typeof right === "string") bannerState.right = right;

  if (bannerTextures.left) updateBanner("left");
  if (bannerTextures.center) updateBanner("center");
  if (bannerTextures.right) updateBanner("right");
}

export function setChalkQuestionView({
  roomId,
  roundNumber,
  questionText,
  options,
  remaining,
  myVoteOptionId,
  onOptionClick,
}) {
  chalkMode = "question";
  chalkState.roomId = roomId;
  chalkState.roundNumber = roundNumber;
  chalkState.questionText = questionText || "";
  chalkState.options = options || [];
  chalkState.remaining = remaining;
  chalkState.myVoteOptionId = myVoteOptionId ?? null;
  chalkState.onOptionClick =
    typeof onOptionClick === "function" ? onOptionClick : null;
  chalkState.optionBoxes = [];

  if (bannerTextures.left) updateBanner("left");
  if (bannerTextures.right) updateBanner("right");
}

export function setChalkResultsView({
  roomId,
  roundNumber,
  questionText,
  options,
  winningOptionId,
  counts,
  leaderboard,
}) {
  chalkMode = "results";
  chalkState.roomId = roomId;
  chalkState.roundNumber = roundNumber;
  chalkState.questionText = questionText || "";
  chalkState.options = options || [];
  chalkState.winningOptionId = winningOptionId;
  chalkState.counts = counts || [];
  chalkState.leaderboard = leaderboard || [];

  if (bannerTextures.left) updateBanner("left");
  if (bannerTextures.right) updateBanner("right");
}

/* ------------------------------------------------------------------
   HANDLE CHALKBOARD CLICK → option selection
------------------------------------------------------------------- */

function handleChalkClick(e) {
  if (!renderer || !camera || !scene) return;
  if (chalkMode !== "question") return;

  const { options, optionBoxes, onOptionClick } = chalkState;
  if (!options || options.length === 0) return;
  if (!onOptionClick) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  pointer.set(x, y);

  raycaster.setFromCamera(pointer, camera);

  const boards = [];
  if (bannerMeshes.left) boards.push(bannerMeshes.left);
  if (bannerMeshes.right) boards.push(bannerMeshes.right);
  if (!boards.length) return;

  const hits = raycaster.intersectObjects(boards);
  if (!hits.length) return;
  const hit = hits[0];

  const texInfo = bannerTextures.left || bannerTextures.right;
  if (!texInfo) return;
  const { canvas } = texInfo;
  const u = hit.uv.x;
  const v = hit.uv.y;
  const px = u * canvas.width;
  const py = (1 - v) * canvas.height;

  const hitBox = optionBoxes.find(
    (b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h
  );
  if (!hitBox) return;

  onOptionClick(hitBox.id);
  chalkState.myVoteOptionId = hitBox.id;

  updateBanner("left");
  updateBanner("right");
}

/* ------------------------------------------------------------------
   LOBBY CHALKBOARD INPUT (name + room code)
------------------------------------------------------------------- */

export function setChalkLobbyView({
  nameInput,
  codeInput,
  onCreateRoomClick,
  onJoinRoomClick,
}) {
  chalkMode = "lobby";

  function updateLobbyBoards() {
    bannerState.left =
      `Enter Room Code:\n` +
      `${(codeInput.value || "------").toUpperCase()}\n\n` +
      `Only if joining a game`;

    bannerState.center = `CREATE ROOM\nor\nJOIN ROOM`;

    bannerState.right =
      `Display Name:\n` +
      `${nameInput.value || "(tap to type)"}\n\n` +
      `Tap board to edit`;

    updateBanner("left");
    updateBanner("center");
    updateBanner("right");
  }

  let editing = null; // "name" | "code" | null

  function onLobbyTap(e) {
    if (chalkMode !== "lobby") return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);

    const boards = [
      bannerMeshes.left,
      bannerMeshes.center,
      bannerMeshes.right,
    ].filter(Boolean);

    const hits = raycaster.intersectObjects(boards);
    if (!hits.length) return;

    const mesh = hits[0].object;

    if (mesh === bannerMeshes.left) {
      editing = "code";
      const newCode = prompt("Enter room code:", codeInput.value || "");
      if (newCode !== null)
        codeInput.value = newCode.toUpperCase().slice(0, 6);
      updateLobbyBoards();
      return;
    }

    if (mesh === bannerMeshes.right) {
      editing = "name";
      const newName = prompt("Enter display name:", nameInput.value || "");
      if (newName !== null) nameInput.value = newName.slice(0, 18);
      updateLobbyBoards();
      return;
    }

    if (mesh === bannerMeshes.center) {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length === 6 && typeof onJoinRoomClick === "function") {
        onJoinRoomClick();
      } else if (typeof onCreateRoomClick === "function") {
        onCreateRoomClick();
      }
      return;
    }
  }

  renderer.domElement.addEventListener("pointerup", (e) => {
    if (localStorage.getItem("inRoom") === "1") return;
    onLobbyTap(e);
  });

  updateLobbyBoards();

  return function cleanupLobby() {
    if (renderer) {
      renderer.domElement.removeEventListener("pointerup", onLobbyTap);
    }
    chalkMode = "idle";
  };
}

/* ------------------------------------------------------------------
   INIT SCENE — REAL 3D COURTROOM
------------------------------------------------------------------- */

export function initScene(containerId = "table-app") {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Missing container: #${containerId}`);

  console.log("🎬 initScene() — 3D Courtroom loaded");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9edf5);
  window.__majorityScene = scene;

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

  /* ---------------- CAMERA (behind players, facing judge) ---------------- */

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 4, 0);
  camera.lookAt(0, 4, 10);

  /* ---------------- LIGHTING ---------------- */

  const hemi = new THREE.HemisphereLight(0xffffff, 0xf5e7d0, 0.9);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

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

  const fillLeft = new THREE.PointLight(0xfff1c1, 0.7, 35);
  fillLeft.position.set(-12, 10, 4);
  scene.add(fillLeft);

  const fillRight = new THREE.PointLight(0xd6ecff, 0.7, 35);
  fillRight.position.set(12, 10, 4);
  scene.add(fillRight);

  /* ---------------- FLOOR & WELL ---------------- */

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 26),
    new THREE.MeshStandardMaterial({
      color: 0xe3e0da,
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

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

  /* ---------------- RAIL ---------------- */

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.7, 0.25),
    new THREE.MeshStandardMaterial({
      color: 0xc49a5a,
      roughness: 0.6,
      metalness: 0.05,
    })
  );
  rail.position.set(0, 0.9, 0);
  rail.castShadow = true;
  scene.add(rail);

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

  /* ---------------- AUDIENCE BENCHES ---------------- */

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

  /* ---------------- AUDIENCE ROBOTS ---------------- */

  function spawnAudienceRobot(x, z, rotationY = 0) {
    const bot = createAvatar("BOT");
    bot.scale.set(0.7, 0.7, 0.7);
    bot.position.set(x, 0.75, z);
    bot.rotation.y = rotationY;
    scene.add(bot);
  }

  // Left benches
  spawnAudienceRobot(-8.0, -3.3, 0);
  spawnAudienceRobot(-5.5, -3.3, 0);
  spawnAudienceRobot(-3.0, -3.3, 0);

  spawnAudienceRobot(-8.0, -6.0, 0);
  spawnAudienceRobot(-5.5, -6.0, 0);
  spawnAudienceRobot(-3.0, -6.0, 0);

  // Right benches
  spawnAudienceRobot(8.0, -3.3, 0);
  spawnAudienceRobot(5.5, -3.3, 0);
  spawnAudienceRobot(3.0, -3.3, 0);

  spawnAudienceRobot(8.0, -6.0, 0);
  spawnAudienceRobot(5.5, -6.0, 0);
  spawnAudienceRobot(3.0, -6.0, 0);

  /* ---------------- JUDGE PLATFORM & BENCH ---------------- */

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

  /* ---------------- JUDGE ROBOT ---------------- */

  function spawnJudgeRobot() {
    const judge = createAvatar("JUDGE");
    judge.scale.set(0.7, 0.7, 0.7);
    judge.position.set(0, 1, 11.4);
    judge.rotation.y = Math.PI;
    scene.add(judge);
  }

  spawnJudgeRobot();

  /* ---------------- COURTROOM WALLS ---------------- */

  const frontWall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 12),
    new THREE.MeshStandardMaterial({
      color: 0xdde1f2,
      roughness: 0.9,
      metalness: 0.0,
    })
  );
  frontWall.position.set(0, 6, 15);
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 12),
    new THREE.MeshStandardMaterial({
      color: 0xdde1f2,
      roughness: 0.9,
      metalness: 0.0,
    })
  );
  backWall.position.set(0, 6, -15);
  scene.add(backWall);

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

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.1,
  });

  const trimFront = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.4, 0.3),
    trimMat
  );
  trimFront.position.set(0, 12.1, 15);
  scene.add(trimFront);

  const trimBack = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.4, 0.3),
    trimMat
  );
  trimBack.position.set(0, 12.1, -15);
  scene.add(trimBack);

  const trimLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 30),
    trimMat
  );
  trimLeft.position.set(-15, 12.1, 0);
  scene.add(trimLeft);

  const trimRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 30),
    trimMat
  );
  trimRight.position.set(15, 12.1, 0);
  scene.add(trimRight);

  /* ---------------- CHALKBOARD BANNERS (create meshes) ---------------- */

  createBannerMesh("left", -7);
  createBannerMesh("center", 0);
  createBannerMesh("right", 7);
  updateBanner("center");

  /* ---------------- INPUT & RESIZE ---------------- */

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("resize", updateOrientationOverlay);
  updateOrientationOverlay();

  window.__majorityCamera = camera;
  attachCutsceneCamera(camera);

  animate();
}

/* ------------------------------------------------------------------
   WINDOW RESIZE
------------------------------------------------------------------- */

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ------------------------------------------------------------------
   PLAYER AVATARS — SEMI-CIRCLE AT THE WELL
------------------------------------------------------------------- */

export function setPlayersOnTable(players) {
  console.log("🎯 setPlayersOnTable:", players);

  loggedNoPlayerId = false;
  loggedNoAvatar = false;
  loggedCameraAttached = false;

  if (!scene) return;

  const limited = players.slice(0, TOTAL_SEATS);
  const currentIds = new Set(limited.map((p) => p.id));

  // Remove missing avatars
  for (const [id, group] of avatars.entries()) {
    if (!currentIds.has(id)) {
      scene.remove(group);
      avatars.delete(id);
    }
  }

  const total = limited.length;
  if (total === 0) return;

  // Semi-circle parameters (centered at the red carpet)
  const radius = 4.0;
  const centerZ = 4.5; // a bit in front of the rail, facing judge
  const baseY = 1.6;
  const span = Math.PI * 0.6; // total angular span (~108°)

  limited.forEach((p, idx) => {
    let group = avatars.get(p.id);
    if (!group) {
      group = createAvatar(p.name || "BOT");
      avatars.set(p.id, group);
      scene.add(group);
    }

    // Store info so solo mode can match AI names to avatars
    group.userData.playerName = p.name;
    group.userData.playerId = p.id;

    const t =
      total === 1
        ? 0
        : -span / 2 + (span * idx) / (total - 1); // angle in radians

    const x = Math.sin(t) * radius;
    const z = centerZ + Math.cos(t) * radius * 0.15; // slight arc in depth

    group.position.set(x, baseY, z);
    group.rotation.y = 0; // they all face forward toward the judge / chalkboards
    group.castShadow = true;
    group.receiveShadow = true;
  });
}

/* ------------------------------------------------------------------
   READY BADGES
------------------------------------------------------------------- */

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

    info.sprite.position.set(0, 8.0, 0);
  }
}

/* ------------------------------------------------------------------
   SOLO AI SPEECH BUBBLES (CALLED FROM solo.js)
------------------------------------------------------------------- */

export function setAISpeechBubbles(aiVotes = []) {
  if (!scene) return;

  // Hide any existing bubbles
  for (const info of speechBubbles.values()) {
    if (info.sprite) info.sprite.visible = false;
  }

  aiVotes.forEach((v) => {
    if (!v || !v.aiName || !v.thinking) return;

    // Find avatar whose name matches this AI
    let avatar = null;
    for (const group of avatars.values()) {
      if (group.userData.playerName === v.aiName) {
        avatar = group;
        break;
      }
    }
    if (!avatar) return;

    let info = speechBubbles.get(v.aiName);
    if (!info) {
      const tex = makeSpeechBubbleTexture(v.thinking);
      if (!tex) return;

      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(5, 2.5, 1);
      sprite.position.set(0, 7.5, 0); // above head
      avatar.add(sprite);

      info = { sprite };
      speechBubbles.set(v.aiName, info);
    } else {
      const tex = makeSpeechBubbleTexture(v.thinking);
      if (!tex) return;
      info.sprite.material.map = tex;
      info.sprite.material.needsUpdate = true;
      info.sprite.visible = true;
    }
  });
}

/* ------------------------------------------------------------------
   HEAD LOOK & CAMERA FOLLOW
------------------------------------------------------------------- */

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
  const cam = window.__majorityCamera;
  if (cutsceneActive()) return;
  if (!cam) return;
  const id = myPlayerId;
  const avatar = avatars.get(id);
  if (!avatar) return;

  const headAnchor =
    avatar.userData.headAnchor || avatar.userData.headGroup || avatar;

  // Rotate avatar with yaw (left/right look)
  avatar.rotation.y = yaw;

  // Clamp pitch (up/down look)
  const MAX_PITCH = 0.55;
  const MIN_PITCH = -0.35;
  headAnchor.rotation.x = THREE.MathUtils.clamp(pitch, MIN_PITCH, MAX_PITCH);

  // *** IDENTICAL CAMERA FOR SOLO + MULTIPLAYER ***
  // No overrides, no zoom-out, no special solo adjustments.
  const CAMERA_FORWARD = 0.25;
  const CAMERA_UP = 0.15;

  const camLocal = new THREE.Vector3(0, CAMERA_UP, CAMERA_FORWARD);
  headAnchor.localToWorld(camLocal);

  const lookLocal = new THREE.Vector3(
    0,
    CAMERA_UP,
    CAMERA_FORWARD + 1.5
  );
  headAnchor.localToWorld(lookLocal);

  cam.position.lerp(camLocal, 0.35);
  cam.lookAt(lookLocal);

}


// ============================
//   SOLO MODE — AI SEATING (FRONT BENCHES)
// ============================
export function placeSoloAI(aiNames = []) {
  if (!scene) return;

  // Remove ALL avatars except the player
  for (const [id, model] of avatars.entries()) {
    if (id !== myPlayerId) {
      scene.remove(model);
      avatars.delete(id);
    }
  }

  // Four fixed seating positions on the front benches
  const seats = [
    { x: -7, z: 7 }, // left bench front
    { x: -7, z: 4 },
    { x:  7, z: 7 }, // right bench front
    { x:  7, z: 4 }
  ];

  const me = avatars.get(myPlayerId);

  aiNames.forEach((name, index) => {
    const pos = seats[index];
    if (!pos) return;

    const bot = createAvatar(name);
    bot.userData.playerName = name;

    // Scale down 50%
    bot.scale.set(0.5, 0.5, 0.5);

    // Position on benches
    bot.position.set(pos.x, 0.75, pos.z);

    // Face the player
    if (me) bot.lookAt(me.position.x, 1.4, me.position.z);

    avatars.set(name, bot);
    scene.add(bot);
  });
}

/* ------------------------------------------------------------------
   MAIN ANIMATION LOOP
------------------------------------------------------------------- */

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !camera || !scene) return;

  const t = clock.getElapsedTime();

  // Subtle float on avatars
  for (const [id, avatar] of avatars.entries()) {
    avatar.position.y = 1.6 + Math.sin(t * 2 + id.length) * 0.04;
  }

  // Billboard all speech bubbles toward camera
  for (const info of speechBubbles.values()) {
    if (info.sprite && info.sprite.visible) {
      info.sprite.quaternion.copy(camera.quaternion);
    }
  }

  updateHeadLook();
  updateCameraFollow();

  renderer.render(scene, window.__majorityCamera);
}
