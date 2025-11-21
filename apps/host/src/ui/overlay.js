// apps/host/src/ui/overlay.js

// Root where all overlays are rendered
const overlayRootId = "overlay-root";

function getOverlayRoot() {
  const root = document.getElementById(overlayRootId);
  if (!root) {
    console.error(`❌ overlay root #${overlayRootId} not found`);
  }
  return root;
}

/**
 * Renders the main lobby screen:
 * - display name input
 * - room code input
 * - Create / Join buttons
 *
 * All behavior is injected via callbacks so this file stays purely UI.
 */
export function renderLobbyOverlay({
  savedName = "",
  onCreateRoomClick,
  onJoinRoomClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  root.innerHTML = `
    <div class="overlay-ui">
      <div class="overlay-card">
        <h1>MAJORITY LOSS</h1>
        <p>3D mode — create a room or join one</p>

        <div class="input-row">
          <label for="name-input">Display Name</label>
          <input id="name-input"
                 type="text"
                 maxlength="18"
                 placeholder="Chambers"
                 value="${savedName.replace(/"/g, "&quot;")}" />
        </div>

        <div class="input-row">
          <label for="code-input">Room Code (to join)</label>
          <input id="code-input"
                 type="text"
                 maxlength="6"
                 placeholder="E.g. 4F7KQ2"
                 style="text-transform:uppercase;font-family:ui-monospace;" />
        </div>

        <div class="btn-row">
          <button id="create-room-btn" class="btn">Create Room</button>
          <button id="join-room-btn" class="btn secondary">Join Room</button>
        </div>

        <div class="small-text">
          Open this page in multiple windows with different names to test multiplayer.
        </div>
      </div>
    </div>
  `;

  // Wire buttons to callbacks from table.js
  const createBtn = document.getElementById("create-room-btn");
  const joinBtn = document.getElementById("join-room-btn");

  if (createBtn && typeof onCreateRoomClick === "function") {
    createBtn.onclick = onCreateRoomClick;
  }

  if (joinBtn && typeof onJoinRoomClick === "function") {
    joinBtn.onclick = onJoinRoomClick;
  }
}

/**
 * Renders the "in-room" overlay:
 * - shows room code
 * - lists players + ready/not ready
 * - host sees Start Game button
 * - everyone sees Ready button (until they are ready)
 */
export function renderInRoomOverlay({
  roomId = "------",
  players = [],
  myId = null,
  readyById = {},
  allReady = false,
  isHost = false,
  onReadyClick,
  onStartGameClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  const playerLines = players
    .map((p) => {
      const isMe = p.id === myId;
      const star = isMe ? "⭐ " : "• ";
      const suffix = isMe ? " (you)" : "";
      const isReady = !!readyById[p.id];
      const statusText = isReady ? "READY ✔" : "NOT READY";
      const statusClass = isReady ? "ready-pill" : "not-ready-pill";

      return `
        <div class="player-row">
          <span>${star}${p.name}${suffix}</span>
          <span class="${statusClass}">${statusText}</span>
        </div>
      `;
    })
    .join("");

  const iAmReady = !!readyById[myId];

  root.innerHTML = `
    <div class="overlay-ui">
      <div class="overlay-card">
        <h1>Lobby</h1>
        <p>Players at the table. Get everyone ready, then begin the trial.</p>

        <div class="room-tag">
          ROOM: ${roomId}
        </div>

        <div style="margin-top:12px;max-height:160px;overflow:auto;font-size:13px;">
          ${playerLines || "<div>(no players yet)</div>"}
        </div>

        <div class="btn-row" style="margin-top:16px;gap:12px;flex-wrap:wrap;">
          ${
            iAmReady
              ? `<button class="btn secondary" disabled>
                   🤖 READY — awaiting verdict...
                 </button>`
              : `<button id="ready-btn" class="btn">
                   I'm Ready
                 </button>`
          }

          ${
            isHost
              ? `<button id="start-game-btn" class="btn warning">
                   Start Game${allReady ? " (All Ready!)" : ""}
                 </button>`
              : ""
          }
        </div>

        <div class="small-text" style="margin-top:10px;">
          ${
            allReady
              ? "All robots are ready in the courtroom. The game will begin as soon as the host bangs the gavel."
              : "When everyone is READY, the host can begin the trial. Until then, you can still join from other devices."
          }
        </div>
      </div>
    </div>
  `;

  // Ready button handler
  const readyBtn = document.getElementById("ready-btn");
  if (readyBtn && typeof onReadyClick === "function") {
    readyBtn.onclick = onReadyClick;
  }

  // Host start button handler
  const startBtn = document.getElementById("start-game-btn");
  if (startBtn && typeof onStartGameClick === "function") {
    startBtn.onclick = onStartGameClick;
  }
}

/**
 * QUESTION OVERLAY — shown during a round.
 * - shows round number, timer, question + options
 */
export function renderQuestionOverlay({
  roomId = "------",
  roundNumber = 1,
  question,
  options = [],
  remaining = null,
  myVoteOptionId = null,
  onOptionClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  const safeQuestion = question?.text || "…";

  const optionButtons = options
    .map((opt) => {
      const isMine = myVoteOptionId === opt.id;
      const btnClass = isMine ? "btn option-btn selected" : "btn option-btn";
      const disabledAttr = myVoteOptionId ? "disabled" : "";
      return `
        <button
          class="${btnClass}"
          data-option-id="${opt.id}"
          ${disabledAttr}
        >
          ${opt.text}
        </button>
      `;
    })
    .join("");

  const timerLabel =
    typeof remaining === "number"
      ? `<div class="timer-pill">Time left: ${remaining}s</div>`
      : "";

  const votedText = myVoteOptionId
    ? `<div class="small-text">You have locked in your answer. Waiting for other robots...</div>`
    : `<div class="small-text">Tap one option on your tablet to cast your vote.</div>`;

  root.innerHTML = `
    <div class="overlay-ui">
      <div class="overlay-card">
        <div class="room-tag">ROOM: ${roomId} — Round ${roundNumber}</div>
        ${timerLabel}
        <h2 style="margin-top:12px;">${safeQuestion}</h2>

        <div class="options-column">
          ${optionButtons || "<div>(no options?)</div>"}
        </div>

        ${votedText}
      </div>
    </div>
  `;

  if (!myVoteOptionId && typeof onOptionClick === "function") {
    const btns = root.querySelectorAll(".option-btn");
    btns.forEach((btn) => {
      btn.onclick = () => {
        const idStr = btn.getAttribute("data-option-id");
        const optionId = Number(idStr);
        onOptionClick(optionId);
      };
    });
  }
}

/**
 * RESULTS OVERLAY — after the round ends.
 * - shows which option won
 * - shows counts per option
 * - shows leaderboard
 * - host can click Next Round
 */
// ===================== RESULTS OVERLAY =====================
export function renderResultsOverlay({
  roomId = "------",
  roundNumber = 1,
  question = { text: "" },
  options = [],
  winningOptionId = null,
  counts = [],
  leaderboard = [],
  isHost = false,
  onNextRoundClick,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  // Build outcome lines using counts from the server
  const outcomeLines = options
    .map((opt) => {
      // Find the matching count entry for this option
      const c = counts.find((entry) => Number(entry.optionId) === Number(opt.id));
      const count = c ? c.count : 0;

      const isWinner =
        winningOptionId !== null &&
        Number(opt.id) === Number(winningOptionId);

      const label = isWinner ? " (minority wins)" : "";
      const votesWord = count === 1 ? "vote" : "votes";

      return `<div>${opt.text} — <strong>${count} ${votesWord}</strong>${label}</div>`;
    })
    .join("");

  // Build leaderboard list
  const leaderboardHtml = leaderboard
    .map((p, idx) => {
      const crown = idx === 0 ? "👑 " : "• ";
      return `<div>${crown}${p.name} ${p.points} pts</div>`;
    })
    .join("");

  // Host sees a "Next Round" button, others just see waiting text
  const nextButtonHtml = isHost
    ? `<button id="next-round-btn" class="btn">Next Round</button>`
    : `<div class="small-text">Waiting for the host to begin the next trial…</div>`;

  root.innerHTML = `
    <div class="overlay-ui">
      <div class="overlay-card">
        <div class="room-tag">
          ROOM: ${roomId} — Round ${roundNumber} results
        </div>

        <h1>${question?.text || ""}</h1>

        <h3 style="margin-top: 16px;">Outcome</h3>
        <div style="font-size:13px;margin-bottom:12px;">
          ${outcomeLines || "<div>No votes were cast.</div>"}
        </div>

        <h3>Leaderboard</h3>
        <div style="font-size:13px;margin-bottom:16px;">
          ${leaderboardHtml || "<div>No scores yet.</div>"}
        </div>

        <div style="margin-top: 8px;">
          ${nextButtonHtml}
        </div>
      </div>
    </div>
  `;

  // Wire Next Round click if this client is the host
  if (isHost && typeof onNextRoundClick === "function") {
    const btn = document.getElementById("next-round-btn");
    if (btn) {
      btn.onclick = onNextRoundClick;
    }
  }
}


/**
 * GAME OVER OVERLAY — after MAX_ROUNDS.
 */
export function renderGameOverOverlay({
  roomId = "------",
  leaderboard = [],
  onBackToLobby,
}) {
  const root = getOverlayRoot();
  if (!root) return;

  const rows = leaderboard
    .map((p, idx) => {
      const medal = idx === 0 ? "👑 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "• ";
      return `
        <div class="player-row">
          <span>${medal}${p.name}</span>
          <span>${p.points} pts</span>
        </div>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="overlay-ui">
      <div class="overlay-card">
        <h1>Game Over</h1>
        <p>The tribunal has spoken. Final standings for room ${roomId}:</p>

        <div style="margin-top:12px;max-height:180px;overflow:auto;font-size:13px;">
          ${rows || "<div>(no players?)</div>"}
        </div>

        <button id="back-to-lobby-btn" class="btn" style="margin-top:18px;">
          Back to Lobby
        </button>
      </div>
    </div>
  `;

  const backBtn = document.getElementById("back-to-lobby-btn");
  if (backBtn && typeof onBackToLobby === "function") {
    backBtn.onclick = onBackToLobby;
  }
}
