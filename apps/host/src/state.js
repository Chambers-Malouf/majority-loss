// apps/host/src/state.jsl

export let myPlayerId = null;

export function setMyPlayerId(id) {
  console.log("🌐 setMyPlayerId:", id);
  myPlayerId = id;
}