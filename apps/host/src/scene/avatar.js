// apps/host/src/scene/avatar.js
import * as THREE from "three";

/**
 * Make a goofy cartoon robot avatar.
 * Returns a THREE.Group positioned at the origin.
 * Caller is responsible for placing it in the scene.
 */
export function createAvatar(name = "BOT") {
  const group = new THREE.Group();

  // ---------------- COLORS ----------------
  const bodyPalette = [0x4ade80, 0x60a5fa, 0xf97316, 0xfacc15, 0xa855f7];
  const accentPalette = [0x22c55e, 0x3b82f6, 0xfb7185, 0xf59e0b, 0x8b5cf6];

  const bodyColor =
    bodyPalette[Math.floor(Math.random() * bodyPalette.length)];
  const accentColor =
    accentPalette[Math.floor(Math.random() * accentPalette.length)];

  // ---------------- MATERIALS ----------------
  const metalMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.6,
    roughness: 0.3,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.5,
    roughness: 0.6,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    metalness: 0.8,
    roughness: 0.2,
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 0.35,
  });

  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.3,
    roughness: 0.4,
    emissive: new THREE.Color(0x22d3ee),
    emissiveIntensity: 0.4,
  });

  // ---------------- TORSO ----------------
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.8, 1.7, 20),
    metalMat
  );
  torso.position.set(0, 1.6, 0);
  group.add(torso);

  // Shoulder ring
  const shoulders = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.13, 12, 32),
    accentMat
  );
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.set(0, 2.3, 0);
  group.add(shoulders);

  // ---------------- HEAD ----------------
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 3.0, 0);
  group.add(headGroup);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.95, 1.05),
    metalMat
  );
  headGroup.add(head);

  // Face
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.65, 0.12),
    faceMat
  );
  face.position.set(0, 0, 0.55);
  headGroup.add(face);

  // store reference for POV attachment later
  group.userData.headGroup = headGroup;
  // Glowing eyes (two tiny spheres)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0x7dd3fc),
    emissiveIntensity: 0.9,
  });
  const eyeGeo = new THREE.SphereGeometry(0.07, 12, 12);

  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.22, 3.05, 0.62);
  const eyeR = eyeL.clone();
  eyeR.position.x *= -1;
  group.add(eyeL, eyeR);

  // Emotive "mouth" bar
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.06, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: new THREE.Color(0x22c55e),
      emissiveIntensity: 0.7,
    })
  );
  mouth.position.set(0, 2.85, 0.62);
  group.add(mouth);

  // Antennas
  const antennaBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8),
    darkMat
  );
  antennaBase.position.set(-0.35, 3.55, 0);

  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 10),
    accentMat
  );
  antennaTip.position.set(-0.35, 3.8, 0);

  const antennaBaseR = antennaBase.clone();
  antennaBaseR.position.x *= -1;
  const antennaTipR = antennaTip.clone();
  antennaTipR.position.x *= -1;

  group.add(antennaBase, antennaTip, antennaBaseR, antennaTipR);

  // ---------------- ARMS ----------------
  const upperArmGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10);
  const foreArmGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.55, 10);
  const handGeo = new THREE.SphereGeometry(0.16, 12, 12);

  function makeArm(side = 1) {
    const armGroup = new THREE.Group();

    const upper = new THREE.Mesh(upperArmGeo, darkMat);
    upper.position.set(side * 0.95, 2.15, 0);
    upper.rotation.z = side * -0.6;
    armGroup.add(upper);

    const fore = new THREE.Mesh(foreArmGeo, metalMat);
    fore.position.set(side * 1.35, 1.7, 0.2);
    fore.rotation.z = side * -0.4;
    armGroup.add(fore);

    const hand = new THREE.Mesh(handGeo, accentMat);
    hand.position.set(side * 1.55, 1.45, 0.35);
    armGroup.add(hand);

    return armGroup;
  }

  group.add(makeArm(1), makeArm(-1));

  // ---------------- LEGS ----------------
  const legGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.1, 12);

  const legL = new THREE.Mesh(legGeo, darkMat);
  legL.position.set(-0.3, 0.65, 0.12);
  const legR = legL.clone();
  legR.position.x *= -1;

  const footGeo = new THREE.BoxGeometry(0.45, 0.2, 0.7);
  const footMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    roughness: 0.8,
    metalness: 0.1,
  });

  const footL = new THREE.Mesh(footGeo, footMat);
  footL.position.set(-0.3, 0.05, 0.3);
  const footR = footL.clone();
  footR.position.x *= -1;

  group.add(legL, legR, footL, footR);

  // ---------------- NAME TAG SPRITE ----------------
  const label = makeNameSprite(name);
  label.position.set(0, 3.8, 0);
  group.add(label);

  // ---------------- HEAD ANCHOR FOR CAMERA ---------
  // This is where we mount the per-player POV camera.
  const headAnchor = new THREE.Object3D();
  headAnchor.position.set(1, 4, 0); // center of head
  group.add(headAnchor);
  group.userData.headAnchor = headAnchor;

  // For bobbing animation in scene.js
  group.userData.baseY = group.position.y;
  group.userData.phase = Math.random() * Math.PI * 2;

  return group;
}

/**
 * Simple canvas-based text sprite for the robot's name.
 */
function makeNameSprite(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Rounded rect background
  const radius = 30;
  const w = canvas.width - 80;
  const h = canvas.height - 40;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;

  ctx.fillStyle = "rgba(15,23,42,0.9)";
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();

  ctx.strokeStyle = "rgba(148,163,184,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Text
  ctx.font = "bold 52px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase().slice(0, 12), canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8, 0.7, 1);

  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  const min = Math.min(w, h) / 2;
  if (r > min) r = min;
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
}