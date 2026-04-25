/**
 * Schedule optimizer.
 *
 * Attempts to replace races with a target distance category
 * without reducing the number of earned epithets.
 */

const Optimizer = (() => {

  /**
   * Optimize the schedule toward a target distance category.
   * @param {Object} schedule - Current schedule { slotKey: { raceId, skipped } }
   * @param {string} targetDistance - "Sprint", "Mile", "Medium", or "Long"
   * @param {Object[]} allRaces - All race data
   * @param {Object[]} epithets - All epithet definitions
   * @param {{ distances: Set<string>, terrains: Set<string> }} aptitudes - User aptitudes
   * @returns {{ newSchedule: Object, swaps: number }} Updated schedule and count of changes
   */
  function optimize(schedule, targetDistance, allRaces, epithets, aptitudes) {
    const raceById = {};
    for (const r of allRaces) raceById[r.id] = r;

    // Build slot index: slotKey -> [race, ...]
    const slotRaces = {};
    for (const r of allRaces) {
      const key = Data.slotKey(r.year, r.month, r.half);
      if (!slotRaces[key]) slotRaces[key] = [];
      slotRaces[key].push(r);
    }

    // Get current earned count
    const currentSelected = getSelected(schedule, raceById);
    const currentResults = EpithetEngine.evaluate(currentSelected, [], epithets);
    const currentEarned = currentResults.filter(r => r.status === "earned").length;

    // Work on a copy
    const newSchedule = JSON.parse(JSON.stringify(schedule));
    let swaps = 0;

    // Sort slot keys so we process in calendar order
    const slotKeys = Object.keys(newSchedule).sort();

    for (const slotKey of slotKeys) {
      const entry = newSchedule[slotKey];
      if (!entry || !entry.raceId) continue;
      if (entry.skipped) continue;

      const currentRace = raceById[entry.raceId];
      if (!currentRace) continue;

      // Already the target distance? Skip.
      if (currentRace.distance_category === targetDistance) continue;

      // Find candidate replacements in this slot with the target distance and matching aptitudes
      const gradeOrder = { G1: 0, G2: 1, G3: 2, OP: 3, "Pre-OP": 4 };
      const currentGradeRank = gradeOrder[currentRace.grade] ?? 99;

      const candidates = (slotRaces[slotKey] || [])
        .filter(r =>
          r.distance_category === targetDistance &&
          (gradeOrder[r.grade] ?? 99) <= currentGradeRank &&
          aptitudes.distances.has(r.distance_category) &&
          aptitudes.terrains.has(r.terrain)
        )
        .sort((a, b) => {
          return (gradeOrder[a.grade] ?? 99) - (gradeOrder[b.grade] ?? 99);
        });

      for (const candidate of candidates) {
        // Try the swap
        newSchedule[slotKey] = { raceId: candidate.id };
        const testSelected = getSelected(newSchedule, raceById);
        const testResults = EpithetEngine.evaluate(testSelected, [], epithets);
        const testEarned = testResults.filter(r => r.status === "earned").length;

        if (testEarned >= currentEarned) {
          // Swap is safe
          swaps++;
          break;
        } else {
          // Revert
          newSchedule[slotKey] = { raceId: entry.raceId };
        }
      }
    }

    return { newSchedule, swaps };
  }

  function getSelected(schedule, raceById) {
    const selected = [];
    for (const entry of Object.values(schedule)) {
      if (!entry || !entry.raceId || entry.skipped) continue;
      const race = raceById[entry.raceId];
      if (race) selected.push(race);
    }
    return selected;
  }

  return { optimize };
})();
