// apps/host/src/audio/audioManager.js
console.log("🎧 Audio Manager Loaded");

export const AudioManager = {
  tracks: {},

  load(name, url, { loop = true, volume = 1.0 } = {}) {
    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = volume;
    audio.preload = "auto";
    this.tracks[name] = audio;
  },

  play(name) {
    const a = this.tracks[name];
    if (!a) return;
    try {
      a.currentTime = 0;
      a.play();
    } catch (e) {
      console.warn("⚠️ Audio play blocked until user interaction");
    }
  },

  stop(name) {
    const a = this.tracks[name];
    if (!a) return;
    a.pause();
  },

  stopAll() {
    for (const a of Object.values(this.tracks)) {
      a.pause();
    }
  }
};
