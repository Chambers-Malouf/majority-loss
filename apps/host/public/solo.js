//apps/host/src/solo.js
// === Solo Mode Frontend ===

// DOM helper (copied from app.js)
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === "class") e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

const root = document.getElementById("solo-app");
const AIs = [
  { name: "Nyx", personality: "cold and analytical" },
  { name: "Charon", personality: "sarcastic and cynical" },
  { name: "Erebus", personality: "mischievous and unpredictable" },
  { name: "Selene", personality: "empathetic and thoughtful" },
];
const BACKEND_URL = "https://minority-mayhem.onrender.com"; 
let playerChoice = null;
let aiData = [];
let seconds = 10;
let timer = null;
let roundNum = 0;
let maxRounds = 10;

// === Start Screen ===
function renderHome() {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "card" },
      el("h1", {}, "Solo Mode"),
      el("p", { class: "mt-8 small" },
        "Play against 4 AI personalities. Everyone votes within 10 seconds."),
      el("button", { class: "btn mt-12", onclick: startRound }, "Start Game"),
      el("button", { class: "btn mt-8", onclick: () => window.location.href = './index.html' }, "Back")
    )
  );
}
renderHome();

// === Main Round ===
async function startRound() {
  root.innerHTML = "";
  roundNum++;
  if (roundNum > maxRounds) return renderEnd();
  const RENDER_BASE_URL = "https://minority-mayhem.onrender.com"; 
  const qRes = await fetch(`${RENDER_BASE_URL}/api/solo/question`);
  const qData = await qRes.json();
  if (!qData.ok) return root.append("Error loading question.");
  const { question, options } = qData;

  // Header + question
  const header = el("div", { class: "card" },
    el("h2", {}, `Round ${roundNum}`),
    el("div", { class: "small mt-4" }, question.text)
  );

  // Option buttons
  const optsDiv = el("div", { class: "card mt-12" });
  options.forEach(opt =>
    optsDiv.appendChild(
      el("button", {
        class: "btn mr-8",
        onclick: () => {
          playerChoice = opt;
          Array.from(optsDiv.querySelectorAll("button")).forEach(b => b.disabled = true);
        }
      }, opt.text)
    )
  );

  // AI chat area
  const chat = el("div", { class: "card mt-12" },
    el("h3", {}, "AI Thinking..."),
    el("div", { id: "ai-box" })
  );

  // Timer
  const timerEl = el("div", { class: "mono mt-8" }, "");
  header.appendChild(timerEl);

  root.append(header, optsDiv, chat);

  // Start timer
  seconds = 10;
  timerEl.textContent = `Time: ${seconds}s`;
  timer = setInterval(() => {
    seconds--;
    timerEl.textContent = `Time: ${seconds}s`;
    if (seconds <= 0) {
      clearInterval(timer);
      revealResults(options);
    }
  }, 1000);

  // Trigger AIs
  aiData = [];
  for (const ai of AIs) {
    const RENDER_BASE_URL = "https://minority-mayhem.onrender.com"; 
    fetch(`${RENDER_BASE_URL}/api/ai-round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, options, aiName: ai.name, aiPersonality: ai.personality }),
    })
      .then(r => r.json())
      .then(d => {
        aiData.push(d);
        const box = document.getElementById("ai-box");
        const div = el("div", { class: "mt-4" },
          el("strong", {}, ai.name + ": "),
          d.thinking || "(thinking...)"
        );
        box.appendChild(div);
      })
      .catch(e => console.error("AI fail:", e));
  }
}

// === Reveal results ===
function revealResults(options) {
  const box = document.getElementById("ai-box");
  if (!playerChoice) playerChoice = { text: "(no choice)" };
  const allVotes = [playerChoice.text, ...aiData.map(a => a.choiceText)].filter(Boolean);

  // Count occurrences
  const counts = {};
  for (const v of allVotes) counts[v] = (counts[v] || 0) + 1;

  // Find majority
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const winner = sorted.length ? sorted[0][0] : null;

  // Show AI reveals
  aiData.forEach(a => {
    const rev = el("div", { class: "mt-2" },
      `${a.aiName} secretly chose: ${a.choiceText || "?"}`
    );
    box.appendChild(rev);
  });

  const result = el("div", { class: "card mt-12" },
    winner === playerChoice.text
      ? `🟢 You survived! Majority picked ${winner}`
      : `🔴 You lost! Majority picked ${winner}`
  );
  root.appendChild(result);

  setTimeout(startRound, 5000);
}

// === End ===
function renderEnd() {
  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "card" },
      el("h2", {}, "🏁 Game Over"),
      el("p", { class: "mt-8" }, "Solo Mode complete!"),
      el("button", { class: "btn mt-12", onclick: renderHome }, "Back to Menu")
    )
  );
}
