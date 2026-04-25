/**
 * Data loading and indexing for races and epithets.
 */

const Data = (() => {
  let races = [];
  let epithets = [];
  let slotIndex = {}; // { "junior-jul-early": [race, ...] }

  async function load() {
    const [racesResp, epithetsResp] = await Promise.all([
      fetch("data/races.json"),
      fetch("data/epithets.json"),
    ]);
    races = await racesResp.json();
    epithets = await epithetsResp.json();
    buildSlotIndex();
  }

  function buildSlotIndex() {
    slotIndex = {};
    for (const race of races) {
      const key = slotKey(race.year, race.month, race.half);
      if (!slotIndex[key]) slotIndex[key] = [];
      slotIndex[key].push(race);
    }
    // Sort races within each slot: G1 first, then by name
    const gradeOrder = { G1: 0, G2: 1, G3: 2, OP: 3, "Pre-OP": 4 };
    for (const key of Object.keys(slotIndex)) {
      slotIndex[key].sort(
        (a, b) =>
          (gradeOrder[a.grade] ?? 99) - (gradeOrder[b.grade] ?? 99) ||
          a.name.localeCompare(b.name)
      );
    }
  }

  const YEAR_KEYS = { 1: "junior", 2: "classic", 3: "senior" };
  const MONTH_KEYS = {
    1: "jan", 2: "feb", 3: "mar", 4: "apr",
    5: "may", 6: "jun", 7: "jul", 8: "aug",
    9: "sep", 10: "oct", 11: "nov", 12: "dec",
  };

  function slotKey(year, month, half) {
    const h = half === 1 ? "early" : "late";
    return `${YEAR_KEYS[year]}-${MONTH_KEYS[month]}-${h}`;
  }

  /** Get all unique time slots in order. */
  function getAllSlots() {
    const slots = [];
    for (let year = 1; year <= 3; year++) {
      for (let month = 1; month <= 12; month++) {
        for (let half = 1; half <= 2; half++) {
          const key = slotKey(year, month, half);
          if (slotIndex[key]) {
            slots.push({ year, month, half, key, races: slotIndex[key] });
          }
        }
      }
    }
    return slots;
  }

  function getRaces() { return races; }
  function getEpithets() { return epithets; }

  const YEAR_LABELS = { 1: "Junior", 2: "Classic", 3: "Senior" };
  const MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December",
  };

  function formatSlot(year, month, half) {
    const h = half === 1 ? "Early" : "Late";
    return `${h} ${MONTH_NAMES[month]}`;
  }

  function formatSlotFull(year, month, half) {
    return `${YEAR_LABELS[year]} – ${formatSlot(year, month, half)}`;
  }

  return {
    load, getRaces, getEpithets, getAllSlots, slotKey,
    formatSlot, formatSlotFull, YEAR_LABELS, MONTH_NAMES,
  };
})();
