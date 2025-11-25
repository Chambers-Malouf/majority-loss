// apps/host/src/state.jsl

// Single source of truth for THIS device's player ID
export let myPlayerId = null;

export function setMyPlayerId(id) {
  console.log("🌐 setMyPlayerId:", id);
  myPlayerId = id;
}