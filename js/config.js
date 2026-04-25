/**
 * Schedule configuration: loads the default schedule from file.
 */

const Config = (() => {
  let defaultConfig = null;

  /** Load the shipped default config from file. */
  async function loadDefaultConfig() {
    const resp = await fetch("data/schedules/default.json");
    defaultConfig = await resp.json();
  }

  /** Return a deep copy of the default config. */
  function getDefault() {
    if (defaultConfig) {
      return JSON.parse(JSON.stringify(defaultConfig));
    }
    return {
      name: "Default",
      aptitudes: {
        distances: ["Mile", "Medium", "Long"],
        terrains: ["Turf"],
      },
      slots: {},
    };
  }

  /** Get the race selection for a slot from config. */
  function getSlotSelection(config, slotKey) {
    if (config.slots && config.slots[slotKey]) {
      return { raceId: config.slots[slotKey].raceId, skipped: false };
    }
    return { raceId: null, skipped: false };
  }

  const STORAGE_KEY = "uma-planner-schedule";

  /** Save schedule to localStorage. */
  function saveToStorage(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn("Failed to save:", e);
    }
  }

  /** Load schedule from localStorage, or null if not found. */
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to load:", e);
    }
    return null;
  }

  /** Clear saved schedule from localStorage. */
  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return { loadDefaultConfig, getDefault, getSlotSelection, saveToStorage, loadFromStorage, clearStorage };
})();
