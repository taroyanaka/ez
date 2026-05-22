const API_BASE_URL = 'https://ez-server-d7h7.onrender.com';
// const API_BASE_URL = 'http://localhost:3000';

let AUTH_USER_ID = localStorage.getItem('user_id') || '';
let AUTH_PASSWORD = localStorage.getItem('password') || '';

// --- Activity Tracker (Play vs Edit Modes) ---
(function() {
    // Avoid running on the analytics page itself
    if (window.location.pathname.includes('/log/')) return;

    const STORAGE_KEY = 'ez_activity_logs';

    function getStats() {
        const defaultStats = {
            play: { duration: 0, taps: 0 },
            edit: { duration: 0, taps: 0 }
        };
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    play: { ...defaultStats.play, ...parsed.play },
                    edit: { ...defaultStats.edit, ...parsed.edit }
                };
            }
        } catch (e) {}
        return defaultStats;
    }

    function saveStats(stats) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
        } catch (e) {}
    }

    function getCurrentMode() {
        // 1. Detect by active tab buttons
        const activeTab = document.querySelector('.tab-btn.active, .tab.active, [id*="tab-"].active, [id*="tab_"].active');
        if (activeTab) {
            const id = activeTab.id.toLowerCase();
            const text = activeTab.textContent;
            if (id.includes('play') || id.includes('learn') || text.includes('Play') || text.includes('学習') || text.includes('練習')) {
                return 'play';
            }
            if (id.includes('create') || id.includes('edit') || id.includes('input') || text.includes('Create') || text.includes('作成') || text.includes('編集') || text.includes('登録')) {
                return 'edit';
            }
        }

        // 2. Detect by active views
        const activeView = document.querySelector('.view.active, .view-container.active, [id*="-view"].active');
        if (activeView) {
            const id = activeView.id.toLowerCase();
            if (id.includes('play') || id.includes('player') || id.includes('quiz') || id.includes('learn')) {
                return 'play';
            }
            if (id.includes('edit') || id.includes('editor') || id.includes('create') || id.includes('input') || id.includes('db')) {
                return 'edit';
            }
        }

        // 3. Fallback by path name
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/game/')) {
            return 'play';
        }

        // Default fallback: If there is a create tab on the page but play is not active, look for edit views
        if (document.querySelector('#tab-create, #tab-edit, #editor-view, #create-view')) {
            const playTab = document.querySelector('#tab-play, #tab-player');
            if (playTab && !playTab.classList.contains('active')) {
                return 'edit';
            }
        }

        return 'play';
    }

    let currentMode = getCurrentMode();
    let modeStartTime = Date.now();

    function recordTap() {
        const mode = getCurrentMode();
        const stats = getStats();
        stats[mode].taps = (stats[mode].taps || 0) + 1;
        saveStats(stats);
    }

    function flushDuration() {
        const durationMs = Date.now() - modeStartTime;
        if (durationMs > 200) { // minimum threshold of 0.2s
            const stats = getStats();
            stats[currentMode].duration = (stats[currentMode].duration || 0) + Math.round(durationMs / 1000);
            saveStats(stats);
        }
        modeStartTime = Date.now();
    }

    // Capture taps/clicks globally on buttons, inputs, links, cards, list items
    document.addEventListener('click', (e) => {
        const interactive = e.target.closest('button, a, input, select, textarea, .card, [role="button"], .tab-btn');
        if (interactive) {
            recordTap();
        }

        // Periodically check for mode changes right after click transitions
        setTimeout(() => {
            const newMode = getCurrentMode();
            if (newMode !== currentMode) {
                flushDuration();
                currentMode = newMode;
            }
        }, 80);
    });

    // Handle beforeunload to store final session durations cleanly
    window.addEventListener('beforeunload', () => {
        flushDuration();
    });

    // Also support page visibility changes (saving data if user leaves tab or background app)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            flushDuration();
        } else {
            modeStartTime = Date.now();
        }
    });
})();
