// apps/host/src/state.js

// Single source of truth for THIS device's player ID
export let myPlayerId = null;

export function setMyPlayerId(id) {
  console.log("🌐 setMyPlayerId:", id);
  myPlayerId = id;
}