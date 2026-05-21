    const animationDefs = [
      { key: "fruit", label: "FRUIT柄" },
      { key: "zawa", label: "ざわ前兆" },
      { key: "gekiatsu", label: "激アツ炎" },
      { key: "chance", label: "CHANCE拡大" },
      { key: "rainbow", label: "BONUS虹" },
      { key: "flash", label: "白フラッシュ" }
    ];

    const state = {
      tapCount: 0,
      tapStep: 1,
      enabled: Object.fromEntries(animationDefs.map((d) => [d.key, true]))
    };

    const tapCountEl = document.getElementById("tapCount");
    const tapStepEl = document.getElementById("tapStep");
    const activeCountEl = document.getElementById("activeCount");
    const checksEl = document.getElementById("checks");
    const layers = Object.fromEntries(animationDefs.map((d) => [d.key, document.querySelector(`[data-key="${d.key}"]`)]));

    // Vibration Configuration State
    const vibrateEnabledEl = document.getElementById("vibrateEnabled");
    const vibratePatternsEl = document.getElementById("vibratePatterns");
    const vibrateConfigRowEl = document.getElementById("vibrateConfigRow");
    const vibratePatternsMap = new Map();

    function parseVibrationPatterns() {
      vibratePatternsMap.clear();
      const lines = vibratePatternsEl.value.split("\n");
      for (const line of lines) {
        const parts = line.split(":");
        if (parts.length === 2) {
          const tapNum = parseInt(parts[0].trim());
          const patternStr = parts[1].trim();
          if (!isNaN(tapNum) && patternStr) {
            const vals = patternStr.split(",").map(v => parseInt(v.trim())).filter(v => !isNaN(v));
            if (vals.length > 0) {
              vibratePatternsMap.set(tapNum, vals);
            }
          }
        }
      }
    }

    function triggerVibration(tapCount) {
      if (!vibrateEnabledEl.checked) return;
      if (!navigator.vibrate) return;

      // Only trigger vibration when a new animation threshold is hit (tapCount is a multiple of tapStep)
      if (tapCount === 0 || tapCount % state.tapStep !== 0) return;

      const level = Math.floor(tapCount / state.tapStep);

      // Find exact match or closest lower match based on the animation level
      let matchedPattern = null;
      let maxKey = 0;
      for (const [key, pattern] of vibratePatternsMap.entries()) {
        if (key <= level && key > maxKey) {
          maxKey = key;
          matchedPattern = pattern;
        }
      }

      if (matchedPattern) {
        navigator.vibrate(matchedPattern);
      }
    }

    function updateVibrateUIVisibility() {
      if (vibrateEnabledEl.checked) {
        vibrateConfigRowEl.style.opacity = "1";
        vibratePatternsEl.disabled = false;
      } else {
        vibrateConfigRowEl.style.opacity = "0.5";
        vibratePatternsEl.disabled = true;
      }
    }

    vibrateEnabledEl.addEventListener("change", updateVibrateUIVisibility);
    vibratePatternsEl.addEventListener("input", parseVibrationPatterns);

    function renderChecks() {
      checksEl.innerHTML = "";
      for (const def of animationDefs) {
        const id = `chk-${def.key}`;
        const wrapper = document.createElement("label");
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.id = id;
        chk.checked = !!state.enabled[def.key];
        chk.addEventListener("change", () => {
          state.enabled[def.key] = chk.checked;
          updateLayers();
        });
        const txt = document.createElement("span");
        txt.textContent = def.label;
        wrapper.append(chk, txt);
        checksEl.append(wrapper);
      }
    }

    function enabledDefs() {
      return animationDefs.filter((d) => state.enabled[d.key]);
    }

    function updateLayers() {
      const defs = enabledDefs();
      const addCount = Math.floor(state.tapCount / state.tapStep);
      const activeKeys = new Set(defs.slice(0, addCount).map((d) => d.key));

      for (const def of animationDefs) {
        layers[def.key].classList.toggle("active", activeKeys.has(def.key));
      }
      activeCountEl.textContent = String(activeKeys.size);
      tapCountEl.textContent = String(state.tapCount);
    }

    function sanitizeStep(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1) return 1;
      return Math.floor(n);
    }

    const doTap = () => {
      state.tapCount += 1;
      updateLayers();
      triggerVibration(state.tapCount);
    };

    document.getElementById("tapButton").addEventListener("click", doTap);
    document.querySelector(".screen").addEventListener("click", doTap);

    document.getElementById("resetButton").addEventListener("click", () => {
      state.tapCount = 0;
      updateLayers();
    });

    tapStepEl.addEventListener("input", () => {
      state.tapStep = sanitizeStep(tapStepEl.value);
      tapStepEl.value = String(state.tapStep);
      updateLayers();
    });

    state.tapStep = sanitizeStep(tapStepEl.value);
    parseVibrationPatterns();
    updateVibrateUIVisibility();
    renderChecks();
    updateLayers();
