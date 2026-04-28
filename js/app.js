/**
 * Main application: schedule builder + epithet tracker.
 */

const App = (() => {
  // State: { slotKey: { raceId, skipped } }
  let schedule = {};
  let lastResults = null;
  let activeConfig = null;

  async function init() {
    await Data.load();
    await Config.loadDefaultConfig();

    // If persistence toggle was on and we have saved data, restore it
    const saved = Config.loadFromStorage();
    if (saved) {
      activeConfig = saved;
    } else {
      activeConfig = Config.getDefault();
    }

    applyAptitudesFromConfig(activeConfig);
    renderSchedule();
    bindEvents();

    // Restore toggle state
    const persistToggle = document.getElementById("persist-toggle");
    persistToggle.checked = !!saved;
  }

  /** Set aptitude checkboxes from config. */
  function applyAptitudesFromConfig(config) {
    document.querySelectorAll('input[data-apt="distance"]').forEach(cb => {
      cb.checked = config.aptitudes.distances.includes(cb.value);
    });
    document.querySelectorAll('input[data-apt="terrain"]').forEach(cb => {
      cb.checked = config.aptitudes.terrains.includes(cb.value);
    });
  }

  // --- Schedule Rendering ---

  /** Save to localStorage if persistence toggle is on. */
  function maybePersist() {
    const persistToggle = document.getElementById("persist-toggle");
    if (!persistToggle || !persistToggle.checked) return;
    const config = {
      name: activeConfig.name || "Saved Schedule",
      aptitudes: {
        distances: Array.from(document.querySelectorAll('input[data-apt="distance"]:checked')).map(cb => cb.value),
        terrains: Array.from(document.querySelectorAll('input[data-apt="terrain"]:checked')).map(cb => cb.value),
      },
      slots: {},
    };
    for (const [key, entry] of Object.entries(schedule)) {
      config.slots[key] = { raceId: entry.raceId };
    }
    Config.saveToStorage(config);
  }

  function createSummaryBox(id) {
    const box = document.createElement("div");
    box.id = id;
    box.className = "schedule-summary";
    box.innerHTML = '<div class="summary-title">Schedule Summary</div><div class="summary-body">—</div>';
    return box;
  }

  function renderSchedule() {
    const container = document.getElementById("schedule-grid");
    const slots = Data.getAllSlots();

    // Group by year
    const years = [1, 2, 3];
    const slotsByYear = {};
    for (const y of years) slotsByYear[y] = [];
    for (const slot of slots) slotsByYear[slot.year].push(slot);

    // 3-column layout, all years visible
    const columnsDiv = document.createElement("div");
    columnsDiv.className = "year-columns";

    for (const y of years) {
      const col = document.createElement("div");
      col.className = "year-column";

      const heading = document.createElement("div");
      heading.className = "year-heading";
      heading.textContent = Data.YEAR_LABELS[y];
      col.appendChild(heading);

      for (const slot of slotsByYear[y]) {
        col.appendChild(createTimeslotRow(slot));
      }

      // Add summary box to Junior column (it has fewer slots)
      if (y === 1) {
        col.appendChild(createSummaryBox("schedule-summary"));
      }

      columnsDiv.appendChild(col);
    }

    // Duplicate summary for mobile (shown after all columns)
    const mobileSummary = createSummaryBox("schedule-summary-mobile");

    container.appendChild(columnsDiv);
    container.appendChild(mobileSummary);
    updateConsecutiveWarnings();
    updateAptitudeWarnings();
    evaluateAndRender();
  }

  function createTimeslotRow(slot) {
    const row = document.createElement("div");
    row.className = "timeslot";
    row.dataset.slotKey = slot.key;

    // Highlight summer slots (Jul/Aug) in Classic and Senior years
    if (slot.year >= 2 && (slot.month === 7 || slot.month === 8)) {
      row.classList.add("summer-slot");
    }

    // Skip checkbox
    const skipCb = document.createElement("input");
    skipCb.type = "checkbox";
    skipCb.className = "skip-toggle";
    skipCb.checked = true;
    skipCb.title = "Uncheck to skip this race";
    skipCb.addEventListener("change", () => onSkipToggle(slot.key, skipCb));

    // Label
    const label = document.createElement("div");
    label.className = "timeslot-label";
    label.textContent = Data.formatSlot(slot.year, slot.month, slot.half);

    // Select dropdown
    const select = document.createElement("select");
    select.dataset.slotKey = slot.key;

    // Empty option
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "— Rest —";
    select.appendChild(emptyOpt);

    for (const race of slot.races) {
      const opt = document.createElement("option");
      opt.value = race.id;
      opt.textContent = `[${race.grade}] ${race.name} (${race.terrain}/${race.distance_category})`;
      opt.title = `${race.terrain} ${race.distance}m (${race.distance_category}) — ${race.track}`;
      select.appendChild(opt);
    }

    // Apply initial selection from config
    const slotSelection = Config.getSlotSelection(activeConfig, slot.key);
    if (slotSelection.raceId) {
      select.value = slotSelection.raceId;
    }
    if (slotSelection.skipped) {
      skipCb.checked = false;
      row.classList.add("skipped");
    }

    select.addEventListener("change", () => onRaceSelect(slot.key, select));

    row.appendChild(skipCb);
    row.appendChild(label);
    row.appendChild(select);

    // Initialize state
    updateSlotState(slot.key, select, skipCb);
    updateRowGradeColor(row, select);

    return row;
  }
  function updateRowGradeColor(row, select) {
    // Remove any existing grade class
    row.className = row.className.replace(/\s*slot-grade-\S+/g, "");
    const raceId = select.value ? parseInt(select.value) : null;
    if (raceId) {
      const race = Data.getRaces().find(r => r.id === raceId);
      if (race) {
        row.classList.add(`slot-grade-${race.grade}`);
      }
    }
  }

  // --- State Management ---

  function updateSlotState(slotKey, select, skipCb) {
    const raceId = select.value ? parseInt(select.value) : null;
    const skipped = !skipCb.checked;

    if (raceId) {
      schedule[slotKey] = { raceId, skipped };
    } else {
      delete schedule[slotKey];
    }
  }

  function onRaceSelect(slotKey, select) {
    const row = select.closest(".timeslot");
    const skipCb = row.querySelector(".skip-toggle");
    skipCb.checked = true;
    row.classList.remove("skipped");
    updateSlotState(slotKey, select, skipCb);
    updateRowGradeColor(row, select);
    updateConsecutiveWarnings();
    updateAptitudeWarnings();
    evaluateAndRender();
    maybePersist();
  }

  function onSkipToggle(slotKey, skipCb) {
    const row = skipCb.closest(".timeslot");
    const select = row.querySelector("select");
    row.classList.toggle("skipped", !skipCb.checked);
    updateSlotState(slotKey, select, skipCb);
    updateConsecutiveWarnings();
    updateAptitudeWarnings();
    evaluateAndRender();
    maybePersist();
  }

  /** Get current aptitude selections. */
  function getAptitudes() {
    const distances = new Set();
    const terrains = new Set();
    document.querySelectorAll('input[data-apt="distance"]:checked').forEach(cb => distances.add(cb.value));
    document.querySelectorAll('input[data-apt="terrain"]:checked').forEach(cb => terrains.add(cb.value));
    return { distances, terrains };
  }

  /** Flag rows where selected race doesn't match aptitude. */
  function updateAptitudeWarnings() {
    const { distances, terrains } = getAptitudes();
    const allRaces = Data.getRaces();
    const raceById = {};
    for (const r of allRaces) raceById[r.id] = r;

    document.querySelectorAll(".timeslot").forEach(row => {
      const select = row.querySelector("select");
      const skipCb = row.querySelector(".skip-toggle");
      const raceId = select.value ? parseInt(select.value) : null;
      const isActive = raceId && skipCb.checked;

      row.classList.remove("aptitude-warn");
      const oldWrapper = row.querySelector(".aptitude-warn-wrapper");
      if (oldWrapper) oldWrapper.remove();

      if (!isActive || !raceId) return;

      const race = raceById[raceId];
      if (!race) return;

      const issues = [];
      if (!distances.has(race.distance_category)) issues.push(race.distance_category + " distance");
      if (!terrains.has(race.terrain)) issues.push(race.terrain + " terrain");

      if (issues.length > 0) {
        row.classList.add("aptitude-warn");

        const wrapper = document.createElement("span");
        wrapper.className = "aptitude-warn-wrapper";
        wrapper.style.position = "relative";

        const trigger = document.createElement("span");
        trigger.className = "aptitude-icon";
        trigger.textContent = "\u26a0";

        const tooltip = document.createElement("div");
        tooltip.className = "warn-tooltip aptitude-tooltip";
        tooltip.innerHTML = "<strong>\u26a0 Aptitude Mismatch</strong><br>No aptitude for: " + issues.join(", ");

        wrapper.appendChild(trigger);
        wrapper.appendChild(tooltip);

        const consecWrapper = row.querySelector(".warn-wrapper");
        if (consecWrapper) {
          row.insertBefore(wrapper, consecWrapper);
        } else {
          row.appendChild(wrapper);
        }
      }
    });
  }

  /** Flag rows that are part of 3+ consecutive active races. */
  function updateConsecutiveWarnings() {
    const columns = document.querySelectorAll(".year-column");
    columns.forEach(col => {
      const rows = Array.from(col.querySelectorAll(".timeslot"));

      // Determine which rows have an active (non-skipped, non-rest) race
      const isActive = rows.map(row => {
        const select = row.querySelector("select");
        const skipCb = row.querySelector(".skip-toggle");
        return select.value !== "" && skipCb.checked;
      });

      // Find streaks of 3+
      const flagged = new Array(rows.length).fill(false);
      let streak = 0;
      for (let i = 0; i < isActive.length; i++) {
        streak = isActive[i] ? streak + 1 : 0;
        if (streak >= 3) {
          // Flag this row and the previous ones in the streak
          for (let j = i; j > i - streak; j--) {
            flagged[j] = true;
          }
        }
      }

      // Apply/remove classes and alert icons
      rows.forEach((row, i) => {
        row.classList.toggle("consecutive-warn", flagged[i]);
        // Manage alert icon
        let icon = row.querySelector(".consecutive-trigger");
        if (flagged[i]) {
          if (!icon) {
            const wrapper = document.createElement("span");
            wrapper.className = "warn-wrapper";
            wrapper.style.position = "relative";

            const trigger = document.createElement("span");
            trigger.className = "consecutive-trigger";
            trigger.textContent = "\u26a0";

            const tooltip = document.createElement("div");
            tooltip.className = "warn-tooltip";
            tooltip.innerHTML = "<strong>\u26a0 Fatigue Risk</strong><br>3+ consecutive races scheduled";

            wrapper.appendChild(trigger);
            wrapper.appendChild(tooltip);
            row.appendChild(wrapper);
          }
        } else {
          if (icon) {
            const wrapper = row.querySelector(".warn-wrapper:has(.consecutive-trigger)") || icon.closest(".warn-wrapper");
            if (wrapper) wrapper.remove();
            else icon.remove();
          }
        }
      });
    });
  }

  // --- Evaluation ---

  function getSelectedAndSkipped() {
    const allRaces = Data.getRaces();
    // Build lookup by slotKey -> race for each scheduled entry
    const raceBySlot = {};
    for (const r of allRaces) {
      const key = Data.slotKey(r.year, r.month, r.half);
      if (!raceBySlot[key]) raceBySlot[key] = {};
      raceBySlot[key][r.id] = r;
    }

    const selected = [];
    const skipped = [];

    for (const [slotKey, entry] of Object.entries(schedule)) {
      const slotRaces = raceBySlot[slotKey];
      const race = slotRaces && slotRaces[entry.raceId];
      if (!race) continue;
      if (entry.skipped) {
        skipped.push(race);
      } else {
        selected.push(race);
      }
    }

    return { selected, skipped };
  }

  function evaluateAndRender() {
    const { selected, skipped } = getSelectedAndSkipped();
    const epithets = Data.getEpithets();
    lastResults = EpithetEngine.evaluate(selected, skipped, epithets);
    renderEpithets(lastResults);
    updateSummary(selected, lastResults);
    updateCrucialRaces();
  }

  /** Find and highlight races that can't be skipped without losing an earned epithet. */
  function updateCrucialRaces() {
    // Clear all existing crucial markers
    document.querySelectorAll(".timeslot").forEach(row => {
      row.classList.remove("crucial-race");
      const icon = row.querySelector(".crucial-icon");
      if (icon) icon.remove();
    });

    const toggle = document.getElementById("crucial-toggle");
    if (!toggle || !toggle.checked) return;
    if (!lastResults) return;

    const epithets = Data.getEpithets();
    const currentEarned = lastResults.filter(r => r.status === "earned").length;

    // For each active (non-skipped) race, simulate skipping it
    const activeSlotKeys = Object.keys(schedule).filter(k => {
      const entry = schedule[k];
      return entry && entry.raceId && !entry.skipped;
    });

    const crucialSlots = new Set();

    for (const slotKey of activeSlotKeys) {
      // Temporarily mark as skipped
      schedule[slotKey].skipped = true;

      const { selected, skipped } = getSelectedAndSkipped();
      const results = EpithetEngine.evaluate(selected, skipped, epithets);
      const testEarned = results.filter(r => r.status === "earned").length;

      if (testEarned < currentEarned) {
        crucialSlots.add(slotKey);
      }

      // Restore
      schedule[slotKey].skipped = false;
    }

    // Apply visual indicator
    for (const slotKey of crucialSlots) {
      const row = document.querySelector(`.timeslot[data-slot-key="${slotKey}"]`);
      if (row) {
        row.classList.add("crucial-race");
        const icon = document.createElement("span");
        icon.className = "crucial-icon";
        icon.textContent = "\uD83D\uDD12";
        icon.title = "Crucial: skipping this race would lose an earned epithet";
        row.appendChild(icon);
      }
    }
  }

  /** Update the summary box in the Junior column. */
  function updateSummary(selectedRaces, results) {
    const earned = results.filter(r => r.status === "earned");
    const totalRaces = selectedRaces.length;

    // Aggregate rewards from earned epithets
    let totalStatBonus = 0;
    const hints = [];

    for (const r of earned) {
      const reward = r.epithet.reward;
      const statMatch = reward.match(/(\d+)\s*Random Stats?\s*\+(\d+)/i);
      if (statMatch) {
        totalStatBonus += parseInt(statMatch[1]) * parseInt(statMatch[2]);
      }
      if (reward.toLowerCase().includes("hint")) {
        hints.push(reward);
      }
    }

    // Build base HTML (without the details open attribute — added per target)
    let baseHtml = "";
    baseHtml += '<div class="summary-row"><span class="summary-label">Races scheduled</span><span class="summary-value">' + totalRaces + '</span></div>';
    baseHtml += '<div class="summary-row"><span class="summary-label">Total stat bonus</span><span class="summary-value highlight">+' + totalStatBonus + '</span></div>';

    if (hints.length > 0) {
      for (const h of hints) {
        baseHtml += '<div class="summary-row"><span class="summary-label">Skill hint</span><span class="summary-value hint-value">' + h + '</span></div>';
      }
    }

    let earnedListHtml = "";
    if (earned.length > 0) {
      earnedListHtml += '<div class="summary-earned-list">';
      for (const r of earned) {
        earnedListHtml += '<div class="summary-earned-item">' + r.epithet.name + ' <span class="summary-reward">' + r.epithet.reward + '</span></div>';
      }
      earnedListHtml += '</div></details>';
    }

    // Update each summary independently, preserving its own open state
    const targets = ["#schedule-summary", "#schedule-summary-mobile"];
    for (const selector of targets) {
      const body = document.querySelector(selector + " .summary-body");
      if (!body) continue;

      const existing = body.querySelector(".summary-earned-details");
      const wasOpen = existing && existing.open;

      let html = baseHtml;
      if (earned.length > 0) {
        const openAttr = wasOpen ? " open" : "";
        html += '<details class="summary-earned-details"' + openAttr + '><summary class="summary-earned-toggle">' + earned.length + ' epithets earned</summary>';
        html += earnedListHtml;
      }
      body.innerHTML = html;
    }
  }

  // --- Epithet Rendering ---

  function renderEpithets(results) {
    const container = document.getElementById("epithet-list");
    container.innerHTML = "";

    // Sort: earned first, then at-risk, partial, unearned
    const statusOrder = { earned: 0, "at-risk": 1, partial: 2, unearned: 3, unknown: 4 };
    const sorted = [...results].sort(
      (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    );

    // Summary
    const earned = results.filter(r => r.status === "earned").length;
    const atRisk = results.filter(r => r.status === "at-risk").length;
    const partial = results.filter(r => r.status === "partial").length;
    const summary = document.createElement("div");
    summary.style.cssText = "margin-bottom: 1rem; font-size: 0.85rem; color: #aaa;";
    summary.innerHTML = `<strong style="color:#00e676">${earned} earned</strong> · ` +
      `<strong style="color:#f44336">${atRisk} at risk</strong> · ` +
      `<strong style="color:#ffab00">${partial} in progress</strong> · ` +
      `${results.length} total`;
    container.appendChild(summary);

    for (const result of sorted) {
      container.appendChild(createEpithetCard(result));
    }
  }

  function createEpithetCard(result) {
    const { epithet, status, met, total, details, extraDetails } = result;

    const card = document.createElement("div");
    card.className = `epithet-card ${status}`;

    // Header
    const header = document.createElement("div");
    header.className = "epithet-header";

    const name = document.createElement("span");
    name.className = "epithet-name";
    name.textContent = epithet.name;

    const statusBadge = document.createElement("span");
    const statusLabels = {
      earned: "Earned", "at-risk": "At Risk", partial: "In Progress", unearned: "Not Started",
    };
    statusBadge.className = `epithet-status status-${status}`;
    statusBadge.textContent = `${statusLabels[status] || status} (${met}/${total})`;

    header.appendChild(name);
    header.appendChild(statusBadge);
    card.appendChild(header);

    // Reward
    const reward = document.createElement("div");
    reward.className = "epithet-reward";
    reward.textContent = epithet.reward;
    card.appendChild(reward);

    // Race details
    if (details && details.length > 0) {
      const racesDiv = document.createElement("div");
      racesDiv.className = "epithet-races";

      for (const d of details) {
        const row = document.createElement("div");
        row.className = "race-req";

        const check = document.createElement("span");
        check.className = `check ${d.status}`;
        check.textContent = d.status === "done" ? "✓" : d.status === "skipped" ? "⊘" : "✗";

        const raceName = document.createElement("span");
        raceName.className = `race-name ${d.status}`;
        raceName.textContent = d.label;

        const slotSpan = document.createElement("span");
        slotSpan.className = "race-slot";
        slotSpan.textContent = d.slot;

        row.appendChild(check);
        row.appendChild(raceName);
        row.appendChild(slotSpan);
        racesDiv.appendChild(row);
      }

      card.appendChild(racesDiv);
    }

    // Impact warning for at-risk
    if (status === "at-risk") {
      const warning = document.createElement("div");
      warning.className = "impact-warning";
      const skippedRaces = details.filter(d => d.status === "skipped").map(d => d.label);
      warning.textContent = `⚠ Would lose this epithet — skipped: ${skippedRaces.join(", ")}`;
      card.appendChild(warning);
    }

    return card;
  }

  // --- Event Binding ---

  function bindEvents() {
    // Experimental panel toggle
    const expBtn = document.getElementById("btn-experimental");
    const expPanel = document.getElementById("experimental-panel");
    expBtn.addEventListener("click", () => {
      const open = !expPanel.hidden;
      expPanel.hidden = !expPanel.hidden;
      expBtn.textContent = open ? "Experimental \u25b8" : "Experimental \u25be";
    });

    document.getElementById("btn-clear").addEventListener("click", () => {
      document.querySelectorAll("#schedule-grid select").forEach(s => { s.value = ""; });
      document.querySelectorAll("#schedule-grid .skip-toggle").forEach(cb => {
        cb.checked = true;
        cb.closest(".timeslot").classList.remove("skipped");
      });
      schedule = {};
      lastResults = null;
      updateConsecutiveWarnings();
      updateAptitudeWarnings();
      evaluateAndRender();
    });

    // Re-check aptitude warnings when aptitude checkboxes change
    document.querySelectorAll("input[data-apt]").forEach(cb => {
      cb.addEventListener("change", () => {
        updateAptitudeWarnings();
        maybePersist();
      });
    });

    // Persistence toggle
    document.getElementById("persist-toggle").addEventListener("change", (e) => {
      if (e.target.checked) {
        maybePersist();
      } else {
        Config.clearStorage();
      }
    });

    // Crucial races toggle
    document.getElementById("crucial-toggle").addEventListener("change", () => {
      updateCrucialRaces();
    });

    // Export current schedule as JSON file
    document.getElementById("btn-export").addEventListener("click", () => {
      const config = {
        name: activeConfig.name || "Exported Schedule",
        aptitudes: {
          distances: Array.from(document.querySelectorAll('input[data-apt="distance"]:checked')).map(cb => cb.value),
          terrains: Array.from(document.querySelectorAll('input[data-apt="terrain"]:checked')).map(cb => cb.value),
        },
        slots: {},
      };
      for (const [slotKey, entry] of Object.entries(schedule)) {
        config.slots[slotKey] = { raceId: entry.raceId };
      }
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (config.name.replace(/\s+/g, "-").toLowerCase() || "schedule") + ".json";
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import schedule from JSON file
    const fileInput = document.getElementById("import-file");
    document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target.result);
          if (!config.slots) throw new Error("Invalid schedule: missing slots");
          activeConfig = config;
          applyConfigToUI(config);
        } catch (err) {
          alert("Failed to import schedule: " + err.message);
        }
        fileInput.value = "";
      };
      reader.readAsText(file);
    });

    // Optimizer buttons
    const statusEl = document.getElementById("optimize-status");
    document.querySelectorAll(".btn-optimize").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetDistance = btn.dataset.distance;
        statusEl.textContent = "Optimizing...";

        // Run async to let UI update
        setTimeout(() => {
          const { newSchedule, swaps } = Optimizer.optimize(
            schedule, targetDistance, Data.getRaces(), Data.getEpithets(), getAptitudes()
          );

          if (swaps === 0) {
            statusEl.textContent = "No safe swaps found for " + targetDistance + ".";
          } else {
            // Apply the optimized schedule to UI
            schedule = newSchedule;
            document.querySelectorAll(".timeslot").forEach(row => {
              const slotKey = row.dataset.slotKey;
              const select = row.querySelector("select");
              const skipCb = row.querySelector(".skip-toggle");
              const entry = newSchedule[slotKey];
              select.value = entry ? (entry.raceId || "") : "";
              skipCb.checked = !(entry && entry.skipped);
              row.classList.toggle("skipped", !!(entry && entry.skipped));
              updateRowGradeColor(row, select);
            });
            updateConsecutiveWarnings();
            updateAptitudeWarnings();
            evaluateAndRender();
            maybePersist();
            statusEl.textContent = swaps + " race(s) swapped to " + targetDistance + ".";
          }

          setTimeout(() => { statusEl.textContent = ""; }, 4000);
        }, 10);
      });
    });
  }

  /** Apply a config to the full UI (aptitudes + all slot dropdowns). */
  function applyConfigToUI(config) {
    // Set aptitudes
    if (config.aptitudes) applyAptitudesFromConfig(config);

    // Set each slot dropdown
    document.querySelectorAll(".timeslot").forEach(row => {
      const slotKey = row.dataset.slotKey;
      const select = row.querySelector("select");
      const skipCb = row.querySelector(".skip-toggle");

      const selection = Config.getSlotSelection(config, slotKey);
      select.value = selection.raceId || "";
      skipCb.checked = true;
      row.classList.remove("skipped");

      updateSlotState(slotKey, select, skipCb);
      updateRowGradeColor(row, select);
    });

    updateConsecutiveWarnings();
    updateAptitudeWarnings();
    evaluateAndRender();
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
