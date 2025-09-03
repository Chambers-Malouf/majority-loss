// apps/host/src/app.js
// connecting to server
import { io } from "socket.io-client";
const socket = io("http://192.168.4.37:8080");

// DOM helper
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") e[k] = v; 
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}


// local UI state
const app = document.getElementById("app");
let roomId = null;
let myId = null;         
let myName = null;
let players = [];
let voted = {};

// initial screen
function renderHome() {
  app.innerHTML = "";
  const nameInput = el("input", { placeholder: "Your name", maxlength: "16" });
  const codeInput = el("input", { placeholder: "Room code (e.g., ABC123)", maxlength: "6", class: "mt-8" });
  const createBtn = el("button", { class: "btn mt-12", onclick: onCreateRoom }, "Create Room");
  const joinBtn = el("button", { class: "btn mt-12 ml-8", onclick: () => onJoinRoom(codeInput.value, nameInput.value) }, "Join Room");

  app.appendChild(
    el("div", { class: "card" },
      el("h1", {}, "Minority Mayhem"),
      nameInput,
      codeInput,
      el("div", {}, createBtn, joinBtn),
      el("div", { class: "small mt-12" }, "Tip: One person creates a room. Everyone else joins with the code.")
    )
  );
}

// create room
function onCreateRoom() {  
  if (!myName) myName = prompt("Enter your name")?.trim() || "Player";
  socket.emit("host_create", (res) => {
    roomId = res.roomId;
    socket.emit("join_room", { roomId, name: myName }, (ack) => {
      if (ack?.error) return alert(ack.error);
      myId = ack.playerId;                     
      renderLobby();
    });
  });
}

// join room
function onJoinRoom(code, name) {
  roomId = (code || "").trim().toUpperCase();
  myName = (name || "").trim() || "Player";
  if (!roomId) return alert("Enter a room code.");
  socket.emit("join_room", { roomId, name: myName }, (ack) => {
    if (ack?.error) return alert(ack.error);
    myId = ack.playerId;                    
    renderLobby();
  });
}

// lobby screen
function renderLobby() {
  app.innerHTML = "";

  const header = el("div", { class: "card" },
    el("h2", {}, "Room: ", el("span", { class: "mono" }, roomId || "------")),
    el("div", { class: "small" }, "Share this code for friends to join")
  );

  const list = el("div", { class: "card" },
    el("h3", {}, "Players"),
  );

  players.forEach(p => {
    const status = voted[p.id] ? "✅ vote placed" : "⏳ waiting";
    const me = (p.id === myId) ? " (you)" : "";
    list.appendChild(el("div", {}, `${p.name}${me} - ${status}`));
  });

  app.appendChild(header);
  app.appendChild(list);
}

// socket listeners
socket.on("room_state", (s) => {
  if (s.roomId) roomId = s.roomId;
  players = s.players || [];
  renderLobby();
});

socket.on("vote_status", ({ voted: v }) => {
  voted = v || {};
  if (roomId) renderLobby();
});

// start
renderHome();
