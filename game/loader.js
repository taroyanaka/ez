// EZ Game Mode Loader Module
// This script is dynamically loaded in sub-apps (ez1 to ez5) when Game Mode is ON.
(function() {
    if (localStorage.getItem('game_mode') !== 'on') return;

    // 1. Resolve relative path dynamically from script source
    const scripts = document.getElementsByTagName('script');
    let loaderUrl = '';
    for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src && scripts[i].src.indexOf('game/loader.js') !== -1) {
            loaderUrl = scripts[i].src;
            break;
        }
    }
    const gameBaseUrl = loaderUrl.substring(0, loaderUrl.lastIndexOf('/') + 1);

    if (typeof window.EZ_GAME_EFFECTS === 'undefined') {
        const configScript = document.createElement('script');
        configScript.src = gameBaseUrl + 'config.js';
        configScript.onload = () => initialize(gameBaseUrl);
        document.head.appendChild(configScript);
    } else {
        initialize(gameBaseUrl);
    }

    function initialize(gameBaseUrl) {
        // Inject Stylesheet
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = gameBaseUrl + 'style.css';
        document.head.appendChild(link);

        // 2. Inject Animation Screen DOM
    const screenHtml = `
      <div class="base-reels">
        <div class="reel">7</div>
        <div class="reel">7</div>
        <div class="reel">7</div>
      </div>
      <div class="layer fruit-pattern" data-key="fruit">
        <div class="fruit-banner">FRUIT 柄 出現 ?!</div>
      </div>
      <div class="layer zawa-layer" data-key="zawa">
        <div class="zawa-text z1">ざわ</div>
        <div class="zawa-text z2">ざわ…</div>
        <div class="zawa-text z3">ざわざわ！</div>
      </div>
      <div class="layer gekiatsu-layer" data-key="gekiatsu">
        <div class="gekiatsu-text">激アツ</div>
      </div>
      <div class="layer chance-text" data-key="chance">CHANCE</div>
      <div class="layer rainbow-win" data-key="rainbow">BONUS確定</div>
      <div class="layer flash-layer" data-key="flash"></div>
    `;

    const screenContainer = document.createElement('section');
    screenContainer.className = 'screen';
    screenContainer.setAttribute('aria-label', 'animation screen');
    screenContainer.style.display = 'block';
    screenContainer.innerHTML = screenHtml;

    // Prepend screen to body or wrapper if exists
    document.addEventListener('DOMContentLoaded', () => {
        // Try to insert after the navigation or at the very top of body
        const nav = document.querySelector('nav');
        if (nav && nav.nextSibling) {
            nav.parentNode.insertBefore(screenContainer, nav.nextSibling);
        } else {
            document.body.insertBefore(screenContainer, document.body.firstChild);
        }
        initGameLogic();
    });

    // 3. Game Logic
    function initGameLogic() {
        const animationDefs = window.EZ_GAME_EFFECTS || [
            { key: "fruit", label: "FRUIT柄" },
            { key: "zawa", label: "ざわ前兆" },
            { key: "gekiatsu", label: "激アツ炎" },
            { key: "chance", label: "CHANCE拡大" },
            { key: "rainbow", label: "BONUS虹" },
            { key: "flash", label: "白フラッシュ" }
        ];

        let config = null;
        try {
            config = JSON.parse(localStorage.getItem('game_mode_config'));
        } catch (e) {}
        
        config = config || {};

        const state = {
            tapCount: 0,
            tapStep: config.tapStep || 10,
            maxBehavior: config.maxBehavior || 'reset',
            enabled: config.enabled || Object.fromEntries(animationDefs.map((d) => [d.key, true]))
        };

        const layers = Object.fromEntries(animationDefs.map((d) => [
            d.key, 
            screenContainer.querySelector(`[data-key="${d.key}"]`)
        ]));

        // Default 18 levels of vibration
        const defaultPatterns = new Map([
            [1, [10]],
            [2, [100,10,100]],
            [3, [200,10,200]],
            [4, [300,10,300,10,300,10,300]],
            [5, [400,10,400,10,400,10,400]],
            [6, [500,10,500,10,500,10,500,10,500,10,500]],
            [7, [600,10,600,10,600,10,600,10,600,10,600]],
            [8, [700,10,700,10,700,10,700,10,700,10,700,10,700,10,700]],
            [9, [800,10,800,10,800,10,800,10,800,10,800,10,800,10,800]],
            [10, [900,10,900,10,900,10,900,10,900,10,900,10,900,10,900,10,900,10,900]],
            [11, [1000,10,1000,10,1000,10,1000,10,1000,10,1000,10,1000,10,1000,10,1000,10,1000]],
            [12, [1100,10,1100,10,1100,10,1100,10,1100,10,1100,10,1100,10,1100,10,1100,10,1100,10,1100,10,1100]],
            [13, [1200,10,1200,10,1200,10,1200,10,1200,10,1200,10,1200,10,1200,10,1200,10,1200,10,1200,10,1200]],
            [14, [1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300,10,1300]],
            [15, [1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400,10,1400]],
            [16, [1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500,10,1500]],
            [17, [1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600,10,1600]],
            [18, [1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700,10,1700]]
        ]);

        function triggerVibration(tapCount) {
            if (!navigator.vibrate) return;
            if (tapCount === 0 || tapCount % state.tapStep !== 0) return;

            const level = Math.floor(tapCount / state.tapStep);
            let matchedPattern = null;
            let maxKey = 0;
            for (const [key, pattern] of defaultPatterns.entries()) {
                if (key <= level && key > maxKey) {
                    maxKey = key;
                    matchedPattern = pattern;
                }
            }

            if (matchedPattern) {
                navigator.vibrate(matchedPattern);
            }
        }

        function updateLayers() {
            const defs = animationDefs.filter((d) => state.enabled[d.key]);
            const addCount = Math.floor(state.tapCount / state.tapStep);
            const activeKeys = new Set(defs.slice(0, addCount).map((d) => d.key));

            for (const def of animationDefs) {
                if (layers[def.key]) {
                    layers[def.key].classList.toggle("active", activeKeys.has(def.key));
                }
            }
        }

        const doTap = () => {
            state.tapCount += 1;
            const currentLevel = Math.floor(state.tapCount / state.tapStep);
            const maxLevel = 18;

            if (currentLevel > maxLevel) {
                if (state.maxBehavior === 'reset') {
                    state.tapCount = 1;
                }
            }

            updateLayers();
            triggerVibration(state.tapCount);
        };

        // Listen for standard custom event from ezN apps for correct answers
        document.addEventListener("ez-correct-answer", (e) => {
            const count = (e && e.detail && e.detail.count) ? e.detail.count : 1;
            for (let i = 0; i < count; i++) {
                doTap();
            }
        });
    }
    } // End of initialize
})();
