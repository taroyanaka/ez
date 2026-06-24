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
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                let parsed = JSON.parse(raw);
                if (parsed.play && typeof parsed.play.duration === 'number') {
                    // Migrate legacy format
                    parsed = { global: parsed };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                }
                return parsed;
            }
        } catch (e) {}
        return { global: { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } } };
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

    function getCurrentService() {
        const path = window.location.pathname.toLowerCase();
        const match = path.match(/\/(ez\d+|game)\//);
        if (match) return match[1];
        
        const segments = path.split('/').filter(s => s && s !== 'index.html' && s !== 'ez');
        if (segments.length > 0 && segments[0].startsWith('ez')) {
            return segments[0];
        }
        return 'global'; // fallback
    }

    let currentMode = getCurrentMode();
    let modeStartTime = Date.now();

    function initServiceStats(stats, service) {
        if (!stats[service]) {
            stats[service] = { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } };
        }
    }

    function getDailyDateKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function initDailyStats(stats, dateKey, service) {
        if (!stats.daily) stats.daily = {};
        if (!stats.daily[dateKey]) stats.daily[dateKey] = {};
        if (!stats.daily[dateKey][service]) {
            stats.daily[dateKey][service] = { play: { duration: 0, taps: 0 }, edit: { duration: 0, taps: 0 } };
        }
    }

    function recordTap() {
        const mode = getCurrentMode();
        const service = getCurrentService();
        const stats = getStats();
        const dateKey = getDailyDateKey();
        
        initServiceStats(stats, 'global');
        initServiceStats(stats, service);
        initDailyStats(stats, dateKey, 'global');
        initDailyStats(stats, dateKey, service);

        stats['global'][mode].taps = (stats['global'][mode].taps || 0) + 1;
        stats.daily[dateKey]['global'][mode].taps = (stats.daily[dateKey]['global'][mode].taps || 0) + 1;
        if (service !== 'global') {
            stats[service][mode].taps = (stats[service][mode].taps || 0) + 1;
            stats.daily[dateKey][service][mode].taps = (stats.daily[dateKey][service][mode].taps || 0) + 1;
        }
        saveStats(stats);
    }

    function flushDuration() {
        const durationMs = Date.now() - modeStartTime;
        if (durationMs > 200) { // minimum threshold of 0.2s
            const durationSec = Math.round(durationMs / 1000);
            const service = getCurrentService();
            const stats = getStats();
            const dateKey = getDailyDateKey();
            
            initServiceStats(stats, 'global');
            initServiceStats(stats, service);
            initDailyStats(stats, dateKey, 'global');
            initDailyStats(stats, dateKey, service);

            stats['global'][currentMode].duration = (stats['global'][currentMode].duration || 0) + durationSec;
            stats.daily[dateKey]['global'][currentMode].duration = (stats.daily[dateKey]['global'][currentMode].duration || 0) + durationSec;
            if (service !== 'global') {
                stats[service][currentMode].duration = (stats[service][currentMode].duration || 0) + durationSec;
                stats.daily[dateKey][service][currentMode].duration = (stats.daily[dateKey][service][currentMode].duration || 0) + durationSec;
            }
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
