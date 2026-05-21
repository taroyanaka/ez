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

    document.getElementById("tapButton").addEventListener("click", () => {
      state.tapCount += 1;
      updateLayers();
    });

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
    renderChecks();
    updateLayers();
