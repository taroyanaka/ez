const API_BASE_URL = 'https://ez-server-d7h7.onrender.com';
// const API_BASE_URL = 'http://localhost:3000';

let AUTH_USER_ID = localStorage.getItem('user_id') || '';
let AUTH_PASSWORD = localStorage.getItem('password') || '';

// --- Game Mode Streak Configuration ---
const GAME_STREAK_THRESHOLDS = [5, 10, 50, 100];
const GAME_STREAK_TIMEOUT = 2000; // milliseconds

if (localStorage.getItem('game_mode') === 'on') {
    const buttonStates = new Map();

    const updateGlow = (btn, tier) => {
        btn.classList.remove('glow-tier-1', 'glow-tier-2', 'glow-tier-3', 'glow-tier-4');
        if (tier > 0) {
            btn.classList.add(`glow-tier-${tier}`);
        }
    };

    const handleStreakBreak = (btn) => {
        const state = buttonStates.get(btn);
        if (!state) return;
        
        if (state.tier > 0) {
            state.tier--; // 前の段階に戻る (Downgrade by 1 tier)
            
            // Adjust the streak count to exactly match the threshold of the new tier
            if (state.tier === 0) {
                state.streak = 0;
            } else {
                state.streak = GAME_STREAK_THRESHOLDS[state.tier - 1];
            }
            
            updateGlow(btn, state.tier);
            
            // If still glowing, set another timeout to continue degrading
            if (state.tier > 0) {
                state.timeoutId = setTimeout(() => handleStreakBreak(btn), GAME_STREAK_TIMEOUT);
            }
        }
    };

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        let state = buttonStates.get(btn);
        
        if (!state) {
            state = { streak: 0, tier: 0, timeoutId: null };
            buttonStates.set(btn, state);
        }
        
        // Cancel the current degradation timeout
        clearTimeout(state.timeoutId);
        
        // Increment the streak for this button
        state.streak++;
        
        // Calculate the current tier based on the streak
        let newTier = 0;
        for (let i = 0; i < GAME_STREAK_THRESHOLDS.length; i++) {
            if (state.streak >= GAME_STREAK_THRESHOLDS[i]) {
                newTier = i + 1;
            }
        }
        
        state.tier = newTier;
        updateGlow(btn, state.tier);
        
        // Start the timer to break the streak if not clicked again within the threshold
        state.timeoutId = setTimeout(() => handleStreakBreak(btn), GAME_STREAK_TIMEOUT);
    });
}