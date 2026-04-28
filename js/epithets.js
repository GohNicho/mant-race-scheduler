/**
 * Epithet evaluation engine.
 *
 * Takes a set of selected races (with skip states) and evaluates
 * each epithet's completion status.
 */

const EpithetEngine = (() => {

  const STANDARD_DISTANCES = new Set([1200, 1400, 1600, 1800, 2000, 2400, 2500, 3200]);
  const GRADE_RANK = { "G1": 1, "G2": 2, "G3": 3, "OP": 4, "Pre-OP": 5 };

  /**
   * Evaluate all epithets against the current schedule.
   * @param {Object[]} selectedRaces - Array of race objects the user selected (not skipped).
   * @param {Object[]} skippedRaces - Array of race objects the user skipped (toggled off).
   * @param {Object[]} epithets - The epithet definitions.
   * @returns {Object[]} Array of evaluation results per epithet.
   */
  function evaluate(selectedRaces, skippedRaces, epithets) {
    return epithets.map(ep => evaluateOne(ep, selectedRaces, skippedRaces));
  }

  function evaluateOne(ep, selected, skipped) {
    const type = ep.requirement_type;
    switch (type) {
      case "specific_races":
        return evalSpecificRaces(ep, selected, skipped);
      case "specific_races_any":
        return evalSpecificRacesAny(ep, selected, skipped);
      case "compound":
        return evalCompound(ep, selected, skipped);
      case "terrain_count":
        return evalTerrainCount(ep, selected, skipped);
      case "terrain_grade_count":
        return evalTerrainGradeCount(ep, selected, skipped);
      case "grade_count":
        return evalGradeCount(ep, selected, skipped);
      case "distance_type_count":
        return evalDistanceTypeCount(ep, selected, skipped);
      case "region_count":
        return evalRegionCount(ep, selected, skipped);
      case "name_pattern_count":
        return evalNamePatternCount(ep, selected, skipped);
      case "turf_all_distances":
        return evalTurfAllDistances(ep, selected, skipped);
      default:
        return { epithet: ep, status: "unknown", met: 0, total: 0, details: [] };
    }
  }

  // --- Helpers ---

  function raceMatches(race, req) {
    if (race.name !== req.name) return false;
    if (req.year && race.year !== req.year) return false;
    return true;
  }

  function findMatch(raceList, req) {
    return raceList.find(r => raceMatches(r, req));
  }

  function slotLabel(race) {
    if (!race) return "";
    const h = race.half === 1 ? "Early" : "Late";
    const yearLabel = { 1: "Junior", 2: "Classic", 3: "Senior" }[race.year] || "";
    return `${yearLabel} - ${h} ${Data.MONTH_NAMES[race.month]}`;
  }

  function buildResult(ep, details, extraDetails) {
    const met = details.filter(d => d.status === "done").length;
    const total = details.length;
    const skippedCount = details.filter(d => d.status === "skipped").length;
    const hasPartial = details.some(d => d.status === "partial");

    let status;
    if (met === total) {
      status = "earned";
    } else if (skippedCount > 0 && met + skippedCount === total) {
      // Unskipping all would earn the epithet
      status = "at-risk";
    } else if (met > 0 || hasPartial || skippedCount > 0) {
      status = "partial";
    } else {
      status = "unearned";
    }

    return { epithet: ep, status, met, total, details, extraDetails };
  }

  // --- Evaluators ---

  function evalSpecificRaces(ep, selected, skipped) {
    const details = ep.required_races.map(req => {
      const inSelected = findMatch(selected, req);
      const inSkipped = findMatch(skipped, req);
      const matchedRace = inSelected || inSkipped;
      return {
        label: req.name + (req.year ? ` (${Data.YEAR_LABELS[req.year]})` : ""),
        slot: matchedRace ? slotLabel(matchedRace) : "",
        status: inSelected ? "done" : inSkipped ? "skipped" : "missing",
      };
    });
    return buildResult(ep, details);
  }

  function evalSpecificRacesAny(ep, selected, skipped) {
    // Required races (must win all)
    const details = ep.required_races.map(req => {
      const inSelected = findMatch(selected, req);
      const inSkipped = findMatch(skipped, req);
      const matchedRace = inSelected || inSkipped;
      return {
        label: req.name + (req.year ? ` (${Data.YEAR_LABELS[req.year]})` : ""),
        slot: matchedRace ? slotLabel(matchedRace) : "",
        status: inSelected ? "done" : inSkipped ? "skipped" : "missing",
      };
    });

    // Additional "pick N from" pool
    let extraDetails = [];
    if (ep.additional_any) {
      const { pick, from } = ep.additional_any;
      const poolDetails = from.map(req => {
        const inSelected = findMatch(selected, req);
        const inSkipped = findMatch(skipped, req);
        const matchedRace = inSelected || inSkipped;
        return {
          label: req.name + (req.year ? ` (${Data.YEAR_LABELS[req.year]})` : ""),
          slot: matchedRace ? slotLabel(matchedRace) : "",
          status: inSelected ? "done" : inSkipped ? "skipped" : "missing",
        };
      });

      const poolMet = poolDetails.filter(d => d.status === "done").length;
      const poolSatisfied = poolMet >= pick;

      // Add a synthetic detail for the pool requirement
      details.push({
        label: `${pick} of: ${from.map(r => r.name).join(", ")}`,
        slot: "",
        status: poolSatisfied ? "done" : poolDetails.some(d => d.status === "skipped") ? "skipped" : "missing",
      });
      extraDetails = poolDetails;
    }

    return buildResult(ep, details, extraDetails);
  }

  function evalCompound(ep, selected, skipped) {
    const details = [];

    // requires_any_of: at least one option set must be fully met
    if (ep.requires_any_of) {
      for (const group of ep.requires_any_of) {
        let anyMet = false;
        for (const option of group.options) {
          const allMet = option.every(req => findMatch(selected, req));
          if (allMet) { anyMet = true; break; }
        }
        const anySkipped = group.options.some(option =>
          option.some(req => findMatch(skipped, req))
        );
        details.push({
          label: group.label,
          slot: "",
          status: anyMet ? "done" : anySkipped ? "skipped" : "missing",
        });
      }
    }

    // requires_all: every race must be won
    if (ep.requires_all) {
      for (const req of ep.requires_all) {
        const inSelected = findMatch(selected, req);
        const inSkipped = findMatch(skipped, req);
        const matchedRace = inSelected || inSkipped;
        details.push({
          label: req.name + (req.year ? ` (${Data.YEAR_LABELS[req.year]})` : ""),
          slot: matchedRace ? slotLabel(matchedRace) : "",
          status: inSelected ? "done" : inSkipped ? "skipped" : "missing",
        });
      }
    }

    return buildResult(ep, details);
  }

  function evalTerrainCount(ep, selected, skipped) {
    const count = selected.filter(r => r.terrain === ep.terrain).length;
    const skippedCount = skipped.filter(r => r.terrain === ep.terrain).length;
    const wouldReachIfUnskipped = count + skippedCount >= ep.required_count;
    const details = [{
      label: `${count}/${ep.required_count} ${ep.terrain} races`,
      slot: "",
      status: count >= ep.required_count ? "done"
        : (skippedCount > 0 && wouldReachIfUnskipped) ? "skipped"
        : count > 0 ? "partial" : "missing",
    }];
    return buildResult(ep, details);
  }

  function evalTerrainGradeCount(ep, selected, skipped) {
    const count = selected.filter(r => r.terrain === ep.terrain && r.grade === ep.grade).length;
    const skippedCount = skipped.filter(r => r.terrain === ep.terrain && r.grade === ep.grade).length;
    const wouldReachIfUnskipped = count + skippedCount >= ep.required_count;
    const details = [{
      label: `${count}/${ep.required_count} ${ep.terrain} ${ep.grade} races`,
      slot: "",
      status: count >= ep.required_count ? "done"
        : (skippedCount > 0 && wouldReachIfUnskipped) ? "skipped"
        : count > 0 ? "partial" : "missing",
    }];
    return buildResult(ep, details);
  }

  function evalGradeCount(ep, selected, skipped) {
    const minRank = GRADE_RANK[ep.min_grade] || 99;
    const predicate = r => (GRADE_RANK[r.grade] || 99) <= minRank;
    const count = selected.filter(predicate).length;
    const skippedCount = skipped.filter(predicate).length;
    const wouldReachIfUnskipped = count + skippedCount >= ep.required_count;
    const details = [{
      label: `${count}/${ep.required_count} races at ${ep.min_grade} or above`,
      slot: "",
      status: count >= ep.required_count ? "done"
        : (skippedCount > 0 && wouldReachIfUnskipped) ? "skipped"
        : count > 0 ? "partial" : "missing",
    }];
    return buildResult(ep, details);
  }

  function evalDistanceTypeCount(ep, selected, skipped) {
    const isStandard = ep.distance_type === "standard";
    const predicate = r =>
      isStandard ? STANDARD_DISTANCES.has(r.distance) : !STANDARD_DISTANCES.has(r.distance);
    const count = selected.filter(predicate).length;
    const skippedCount = skipped.filter(predicate).length;
    const wouldReachIfUnskipped = count + skippedCount >= ep.required_count;
    const details = [{
      label: `${count}/${ep.required_count} ${ep.distance_type} distance races`,
      slot: "",
      status: count >= ep.required_count ? "done"
        : (skippedCount > 0 && wouldReachIfUnskipped) ? "skipped"
        : count > 0 ? "partial" : "missing",
    }];
    return buildResult(ep, details);
  }

  function evalRegionCount(ep, selected, skipped) {
    const trackSet = new Set(ep.tracks);
    const predicate = r => trackSet.has(r.track);
    const count = selected.filter(predicate).length;
    const skippedCount = skipped.filter(predicate).length;
    const wouldReachIfUnskipped = count + skippedCount >= ep.required_count;
    const details = [{
      label: `${count}/${ep.required_count} races in ${ep.region} (${ep.tracks.join(", ")})`,
      slot: "",
      status: count >= ep.required_count ? "done"
        : (skippedCount > 0 && wouldReachIfUnskipped) ? "skipped"
        : count > 0 ? "partial" : "missing",
    }];
    return buildResult(ep, details);
  }

  function evalNamePatternCount(ep, selected, skipped) {
    let predicate;
    let descriptor;
    if (ep.pattern) {
      predicate = r => r.name.includes(ep.pattern);
      descriptor = `races with "${ep.pattern}" in the name`;
    } else if (ep.pattern_type === "country_in_name") {
      const countries = ["American", "Argentine", "Brazil", "Copa Republica", "New Zealand", "Saudi Arabia"];
      predicate = r => countries.some(c => r.name.includes(c));
      descriptor = "races with a country name";
    } else {
      predicate = () => false;
      descriptor = "matching races";
    }
    const count = selected.filter(predicate).length;
    const skippedCount = skipped.filter(predicate).length;
    const wouldReachIfUnskipped = count + skippedCount >= ep.required_count;
    const details = [{
      label: `${count}/${ep.required_count} ${descriptor}`,
      slot: "",
      status: count >= ep.required_count ? "done"
        : (skippedCount > 0 && wouldReachIfUnskipped) ? "skipped"
        : count > 0 ? "partial" : "missing",
    }];
    return buildResult(ep, details);
  }

  function evalTurfAllDistances(ep, selected, skipped) {
    const cats = ep.required_distance_categories || ["Sprint", "Mile", "Medium", "Long"];
    const details = cats.map(cat => {
      const has = selected.some(r => r.terrain === "Turf" && r.distance_category === cat);
      const hadSkipped = skipped.some(r => r.terrain === "Turf" && r.distance_category === cat);
      return {
        label: `Turf ${cat}`,
        slot: "",
        status: has ? "done" : hadSkipped ? "skipped" : "missing",
      };
    });
    return buildResult(ep, details);
  }

  return { evaluate };
})();
