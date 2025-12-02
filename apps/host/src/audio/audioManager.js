// apps/host/src/audio/audioManager.js
console.log("🎧 Audio Manager Loaded");

let globalMuted = false;
let audioUnlocked = false;

export const AudioManager = {
  tracks: {},

  // --------------------------------------------------------
  // LOAD A SINGLE TRACK
  // --------------------------------------------------------
  load(name, url, { loop = true, volume = 1.0 } = {}) {
    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = volume;
    audio.preload = "auto";
    audio.muted = globalMuted;

    audio.addEventListener("canplaythrough", () => {
      audio.ready = true;
    });

    this.tracks[name] = audio;
  },

  // --------------------------------------------------------
  // ENSURE A TRACK IS LOADED
  // --------------------------------------------------------
  async ensureLoaded(name) {
    const a = this.tracks[name];
    if (!a) return;

    if (a.ready) return; 

    return new Promise((resolve) => {
      a.addEventListener("canplaythrough", () => {
        a.ready = true;
        resolve();
      });
      a.load();
    });
  },

  // --------------------------------------------------------
  // PRELOAD ALL TRACKS AT ONCE
  // --------------------------------------------------------
  async loadAll() {
    const promises = Object.keys(this.tracks).map((name) =>
      this.ensureLoaded(name)
    );
    return Promise.all(promises);
  },

  // --------------------------------------------------------
  // PLAY AUDIO
  // --------------------------------------------------------
  play(name) {
    const a = this.tracks[name];
    if (!a) return;

    a.muted = globalMuted;

    this.unlock();

    try {
      a.currentTime = 0;
      a.play();
    } catch (e) {
      console.warn("⚠️ Audio play blocked until user interaction", e);
    }
  },

  // --------------------------------------------------------
  // STOP AUDIO
  // --------------------------------------------------------
  stop(name) {
    const a = this.tracks[name];
    if (!a) return;
    a.pause();
  },

  stopAll() {
    for (const a of Object.values(this.tracks)) {
      a.pause();
    }
  },

  // --------------------------------------------------------
  // MUTE TOGGLE
  // --------------------------------------------------------
    toggleMute() {
    globalMuted = !globalMuted;

    for (const a of Object.values(this.tracks)) {
      a.muted = globalMuted;
    }

    return globalMuted;
  },
  // --------------------------------------------------------
  // UNLOCK AUDIO AUTOMATICALLY
  // --------------------------------------------------------
    unlock() {
    if (audioUnlocked) return;

    audioUnlocked = true;

    for (const a of Object.values(this.tracks)) {
      try {
        a.muted = true;
        a.play()
          .then(() => {
            a.pause();
            a.currentTime = 0;

            a.muted = globalMuted;
          })
          .catch(() => {
          });
      } catch (_) {}
    }
  },
};
