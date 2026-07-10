// App State
let sentences = [];
let stack = [];
let currentTab = 'play';

// Kuromoji State
let tokenizerInstance = null;
let isKuromojiReady = false;

// Play State
let playState = {
    isPlaying: false,
    isPaused: false,
    qIndex: 0,
    wordIndex: 0,
    currentWords: [],
    timerLimitMs: 2000,
    timerRemaining: 0,
    lastTickTime: 0,
    animationFrameId: null,
    correctChoiceIndex: -1,
    speed: 1.0
};

// DOM Elements
const els = {
    // Tabs
    tabPlay: document.getElementById('tab-play'),
    tabCreate: document.getElementById('tab-create'),
    viewPlay: document.getElementById('play-view'),
    viewCreate: document.getElementById('create-view'),
    
    // Play View
    qSelect: document.getElementById('q-select'),
    langSelect: document.getElementById('lang-select'),
    speedSlider: document.getElementById('speed-slider'),
    speedVal: document.getElementById('speed-val'),
    timerInput: document.getElementById('timer-input'),
    emptyState: document.getElementById('empty-state'),
    gameContainer: document.getElementById('game-container'),
    currentQIndex: document.getElementById('current-q-index'),
    totalQCount: document.getElementById('total-q-count'),
    currentWordDisplay: document.getElementById('current-word-display'),
    timerBar: document.getElementById('timer-bar'),
    choicesContainer: document.getElementById('choices-container'),
    choiceBtns: document.querySelectorAll('.choice-btn'),
    playBtn: document.getElementById('play-btn'),
    playIcon: document.getElementById('play-icon'),
    playText: document.getElementById('play-text'),
    
    // Create View
    sentenceInput: document.getElementById('sentence-input'),
    createFeedback: document.getElementById('create-feedback'),
    sentencesList: document.getElementById('sentences-list'),
    listCount: document.getElementById('list-count'),
    
    // Stack View
    stackPanel: document.getElementById('stack-panel'),
    stackList: document.getElementById('stack-list'),
    stackBadge: document.getElementById('stack-badge'),

    // Kuromoji Status
    kuromojiStatus: document.getElementById('kuromoji-status'),
    posFilters: document.querySelectorAll('.pos-filter')
};

// Initialize
async function init() {
    await loadData();
    renderSentencesList();
    renderStack();
    updatePlayUIState();
    
    window.onChunkChange = async () => {
        await loadData();
        renderSentencesList();
        updatePlayUIState();
    };
    const container = document.getElementById('ez-chunk-container');
    if (container && typeof renderChunkWidget === 'function') {
        await renderChunkWidget('tts_quiz');
    }
    
    // Setup Kuromoji
    els.playBtn.disabled = true; // Disable until ready
    if (typeof kuromoji !== 'undefined') {
        kuromoji.builder({ dicPath: "dict/" }).build((err, _tokenizer) => {
            if (err) {
                els.kuromojiStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 辞書ロード失敗';
                els.kuromojiStatus.style.color = 'var(--danger)';
                console.error("Kuromoji load error", err);
                return;
            }
            tokenizerInstance = _tokenizer;
            isKuromojiReady = true;
            els.kuromojiStatus.style.display = 'none'; // Hide status when ready
            els.playBtn.disabled = false;
            
            // Re-render list just in case to show correct word counts
            renderSentencesList();
        });
    } else {
        els.kuromojiStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Kuromojiライブラリが見つかりません';
        els.kuromojiStatus.style.color = 'var(--danger)';
    }

    // Bind checkbox changes
    els.posFilters.forEach(f => {
        f.addEventListener('change', () => {
            renderSentencesList(); // Update word counts when POS changes
        });
    });

    // Setup TTS voices
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

const resource = 'tts_quiz';

const apiGetAll = () => {
    let url = `${API_BASE_URL}/${resource}`;
    if (window.currentChunkId) {
        url += `?chunk_id=${window.currentChunkId}`;
    }
    return fetch(url).then(res => res.json()).then(json => json.data || json);
};
const apiCreate = (data) => {
    if (window.currentChunkId) data.chunk_id = window.currentChunkId;
    return fetch(`${API_BASE_URL}/${resource}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data)
    }).then(res => res.json());
};
const apiDelete = (id) => fetch(`${API_BASE_URL}/${resource}/${id}`, {
    method: 'DELETE', headers: { 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }
}).then(res => res.json());

// Data Management
function saveData() {
    localStorage.setItem('ez6_stack', JSON.stringify(stack));
}

async function loadData() {
    try {
        const raw = await apiGetAll();
        sentences = raw.map(r => r.sentence);
    } catch (e) {
        console.error(e);
        sentences = [];
    }
    const st = localStorage.getItem('ez6_stack');
    if (st) stack = JSON.parse(st);
}

// Tab Switching
function switchTab(tab) {
    if (playState.isPlaying && tab !== 'play') {
        alert('プレイ中はタブを切り替えられません。一時停止するか停止してください。');
        return;
    }

    currentTab = tab;
    els.tabPlay.classList.toggle('active', tab === 'play');
    els.tabCreate.classList.toggle('active', tab === 'create');
    els.viewPlay.classList.toggle('active', tab === 'play');
    els.viewCreate.classList.toggle('active', tab === 'create');
    
    if (tab === 'play') {
        updatePlayUIState();
    }
}

// Stack UI
function toggleStack() {
    els.stackPanel.classList.toggle('open');
}

function addToStack(sentence) {
    if (!stack.includes(sentence)) {
        stack.push(sentence);
        saveData();
        renderStack();
    }
}

function removeFromStack(index) {
    stack.splice(index, 1);
    saveData();
    renderStack();
}

function clearStack() {
    if(confirm('スタックをクリアしますか？')) {
        stack = [];
        saveData();
        renderStack();
    }
}

function retryStack() {
    if (stack.length === 0) return;
    
    // Merge stack into sentences without duplicates
    let added = 0;
    stack.forEach(s => {
        if (!sentences.includes(s)) {
            sentences.push(s);
            added++;
        }
    });
    
    if (added > 0) {
        saveData();
        renderSentencesList();
        updatePlayUIState();
        alert(`${added}件の問題をスタックから復元しました。`);
    } else {
        alert('スタック内の問題はすでにリストに存在します。');
    }
}

function renderStack() {
    els.stackBadge.style.display = stack.length > 0 ? 'flex' : 'none';
    els.stackBadge.textContent = stack.length;
    
    els.stackList.innerHTML = '';
    stack.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'stack-item';
        div.innerHTML = `
            <div style="padding-right: 20px; font-size: 0.9rem;">${s}</div>
            <button class="remove-btn" onclick="removeFromStack(${i})" title="削除">
                <i class="fas fa-times"></i>
            </button>
        `;
        els.stackList.appendChild(div);
    });
}

// Text Processing Helper
function cleanWord(word) {
    // Remove all punctuation and symbols, keep only letters and numbers
    return word.replace(/[^\w\s\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g, '').trim();
}

function getSelectedPOS() {
    const selected = [];
    els.posFilters.forEach(f => {
        if (f.checked) selected.push(f.value);
    });
    return selected;
}

function parseSentenceToWords(sentence) {
    if (!isKuromojiReady || !tokenizerInstance) return [];
    
    const tokens = tokenizerInstance.tokenize(sentence);
    const selectedPOS = getSelectedPOS();
    
    return tokens
        .filter(t => selectedPOS.includes(t.pos))
        .map(t => cleanWord(t.surface_form))
        .filter(w => w.length > 0);
}

// Create Mode
async function addSentence() {
    if (!AUTH_USER_ID) return alert('ログインが必要です');
    const text = els.sentenceInput.value.trim();
    if (!text) return;
    
    const words = parseSentenceToWords(text);
    if (words.length < 3) {
        els.createFeedback.textContent = 'エラー: 問題は3単語以上必要です。';
        return;
    }
    
    if (sentences.includes(text)) {
        els.createFeedback.textContent = 'エラー: 既に同じ問題が存在します。';
        return;
    }
    
    try {
        await apiCreate({ sentence: text });
        sentences.push(text);
        els.sentenceInput.value = '';
        els.createFeedback.textContent = '';
        renderSentencesList();
        updatePlayUIState();
    } catch(e) {
        console.error(e);
        alert('保存に失敗しました');
    }
}

async function clearAllSentences() {
    if(confirm('すべての問題を削除しますか？\n(注意: API側の全件削除は未実装のため、チャンクから外すなど手動対応が必要です)')) {
        sentences = [];
        renderSentencesList();
        updatePlayUIState();
    }
}

async function removeSentence(index) {
    if (!AUTH_USER_ID) return alert('ログインが必要です');
    const text = sentences[index];
    try {
        // We need to fetch again to get the ID to delete, or delete by text?
        // Actually dynamic API delete needs ID.
        const raw = await apiGetAll();
        const item = raw.find(r => r.sentence === text);
        if (item) {
            await apiDelete(item.id_key || item.id);
        }
        sentences.splice(index, 1);
        renderSentencesList();
        updatePlayUIState();
    } catch(e) {
        console.error(e);
        alert('削除に失敗しました');
    }
}

function renderSentencesList() {
    els.listCount.textContent = sentences.length;
    els.sentencesList.innerHTML = '';
    sentences.forEach((s, i) => {
        const li = document.createElement('li');
        const words = parseSentenceToWords(s);
        li.innerHTML = `
            <div style="flex:1;">
                <div>${s}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">(${words.length} words)</div>
            </div>
            <button class="btn-icon" style="color: var(--danger);" onclick="removeSentence(${i})">
                <i class="fas fa-trash"></i>
            </button>
        `;
        els.sentencesList.appendChild(li);
    });
}

// Play Mode Logic
function updateSpeed() {
    playState.speed = parseFloat(els.speedSlider.value);
    els.speedVal.textContent = playState.speed.toFixed(1);
}

function updatePlayUIState() {
    if (sentences.length === 0) {
        els.emptyState.style.display = 'block';
        els.gameContainer.style.display = 'none';
        els.timerInput.disabled = false;
        if(els.qSelect) els.qSelect.disabled = false;
        if(els.qSelect) els.qSelect.innerHTML = '';
    } else {
        els.emptyState.style.display = 'none';
        els.gameContainer.style.display = 'flex';
        els.totalQCount.textContent = sentences.length;
        
        // Update select options if not playing
        if (!playState.isPlaying && els.qSelect) {
            els.qSelect.innerHTML = '';
            sentences.forEach((s, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `${i + 1}. ${s.substring(0, 20)}${s.length > 20 ? '...' : ''}`;
                els.qSelect.appendChild(opt);
            });
        }
    }
}

function togglePlay() {
    if (playState.isPlaying && !playState.isPaused) {
        pauseGame();
    } else if (playState.isPlaying && playState.isPaused) {
        resumeGame();
    } else {
        startGame();
    }
}

function startGame() {
    if (sentences.length === 0) return;
    
    playState.isPlaying = true;
    playState.isPaused = false;
    playState.qIndex = parseInt(els.qSelect.value) || 0;
    playState.wordIndex = 0;
    
    // Disable inputs during play
    els.timerInput.disabled = true;
    els.speedSlider.disabled = true;
    if(els.qSelect) els.qSelect.disabled = true;
    if(els.langSelect) els.langSelect.disabled = true;
    
    updatePlayButtonUI();
    processCurrentWord();
}

function pauseGame() {
    playState.isPaused = true;
    window.speechSynthesis.cancel(); // Stop TTS immediately
    cancelAnimationFrame(playState.animationFrameId);
    
    updatePlayButtonUI();
}

function resumeGame() {
    playState.isPaused = false;
    updatePlayButtonUI();
    
    // Resume timing if we were waiting for an answer
    if (playState.timerRemaining > 0) {
        playState.lastTickTime = performance.now();
        playState.animationFrameId = requestAnimationFrame(tickTimer);
        // Do not re-read the word, just continue the timer
    } else {
        // We were between words or just starting a word, read it
        processCurrentWord();
    }
}

function stopGame() {
    playState.isPlaying = false;
    playState.isPaused = false;
    playState.timerRemaining = 0;
    window.speechSynthesis.cancel();
    cancelAnimationFrame(playState.animationFrameId);
    
    els.timerInput.disabled = false;
    els.speedSlider.disabled = false;
    if(els.qSelect) els.qSelect.disabled = false;
    if(els.langSelect) els.langSelect.disabled = false;
    
    els.currentWordDisplay.textContent = '--';
    els.timerBar.style.width = '100%';
    disableChoices();
    resetChoiceStyles();
    
    updatePlayButtonUI();
}

function updatePlayButtonUI() {
    if (playState.isPlaying) {
        if (playState.isPaused) {
            els.playIcon.className = 'fas fa-play';
            els.playText.textContent = '再開';
            els.playBtn.style.background = 'var(--success)';
        } else {
            els.playIcon.className = 'fas fa-pause';
            els.playText.textContent = '一時停止';
            els.playBtn.style.background = 'var(--accent-color)';
        }
    } else {
        els.playIcon.className = 'fas fa-play';
        els.playText.textContent = 'スタート';
        els.playBtn.style.background = 'var(--primary-gradient)';
    }
}

function processCurrentWord() {
    if (!playState.isPlaying || playState.isPaused) return;

    const currentSentenceStr = sentences[playState.qIndex];
    playState.currentWords = parseSentenceToWords(currentSentenceStr);
    
    els.currentQIndex.textContent = playState.qIndex + 1;
    resetChoiceStyles();
    disableChoices();
    els.timerBar.style.width = '100%';

    const currentWord = playState.currentWords[playState.wordIndex];
    els.currentWordDisplay.textContent = currentWord;

    // Is it the last word?
    if (playState.wordIndex >= playState.currentWords.length - 1) {
        // Last word, just read it and move to next sentence
        speak(currentWord, () => {
            setTimeout(() => {
                nextSentence();
            }, 500); // Small pause after sentence ends
        });
        return;
    }

    // Not the last word, read it and prepare choices for the NEXT word
    const nextWord = playState.currentWords[playState.wordIndex + 1];
    
    // Generate incorrect choices from the current sentence
    let availableIncorrect = playState.currentWords.filter((w, idx) => w !== nextWord && idx !== playState.wordIndex + 1);
    
    // If not enough words in sentence (e.g. all same words), fallback to other sentences or generic logic
    if (availableIncorrect.length < 2) {
        // Mix all words from all sentences to ensure we have choices
        const allWords = Array.from(new Set(sentences.flatMap(parseSentenceToWords)));
        availableIncorrect = allWords.filter(w => w !== nextWord);
    }
    
    // Shuffle available incorrect
    availableIncorrect.sort(() => Math.random() - 0.5);
    
    const choice1 = availableIncorrect[0] || 'apple'; // Fallbacks just in case
    const choice2 = availableIncorrect[1] || 'banana';
    
    const choices = [nextWord, choice1, choice2].sort(() => Math.random() - 0.5);
    playState.correctChoiceIndex = choices.indexOf(nextWord);
    
    // Setup UI
    els.choiceBtns.forEach((btn, idx) => {
        btn.textContent = choices[idx];
    });

    // Speak and then start timer
    speak(currentWord, () => {
        if (!playState.isPlaying || playState.isPaused) return;
        
        enableChoices();
        playState.timerLimitMs = parseFloat(els.timerInput.value) * 1000;
        playState.timerRemaining = playState.timerLimitMs;
        playState.lastTickTime = performance.now();
        playState.animationFrameId = requestAnimationFrame(tickTimer);
    });
}

function speak(text, onEndCallback) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = els.langSelect ? els.langSelect.value : 'ja-JP';
    utterance.rate = playState.speed;
    
    utterance.onend = () => {
        if (onEndCallback) onEndCallback();
    };
    
    utterance.onerror = (e) => {
        console.warn('TTS Error:', e);
        // Fallback if TTS fails
        if (onEndCallback) onEndCallback();
    };

    window.speechSynthesis.speak(utterance);
}

function tickTimer(currentTime) {
    if (!playState.isPlaying || playState.isPaused) return;

    const delta = currentTime - playState.lastTickTime;
    playState.lastTickTime = currentTime;
    playState.timerRemaining -= delta;
    
    const percentage = Math.max(0, (playState.timerRemaining / playState.timerLimitMs) * 100);
    els.timerBar.style.width = `${percentage}%`;

    if (playState.timerRemaining <= 0) {
        // Timeout!
        handleFailure();
    } else {
        playState.animationFrameId = requestAnimationFrame(tickTimer);
    }
}

function selectChoice(index) {
    if (!playState.isPlaying || playState.isPaused || els.choiceBtns[index].disabled) return;
    
    cancelAnimationFrame(playState.animationFrameId);
    disableChoices();

    if (index === playState.correctChoiceIndex) {
        // Correct
        els.choiceBtns[index].classList.add('correct');
        document.dispatchEvent(new CustomEvent('ez-correct-answer'));
        setTimeout(() => {
            playState.wordIndex++;
            processCurrentWord();
        }, 500);
    } else {
        // Incorrect
        els.choiceBtns[index].classList.add('incorrect');
        els.choiceBtns[playState.correctChoiceIndex].classList.add('correct');
        handleFailure();
    }
}

function handleFailure() {
    // Add to stack
    addToStack(sentences[playState.qIndex]);
    
    setTimeout(() => {
        // Move to next word (read it anyway as punishment/correction)
        playState.wordIndex++;
        processCurrentWord();
    }, 1000);
}

function nextSentence() {
    playState.qIndex++;
    playState.wordIndex = 0;
    
    if (playState.qIndex >= sentences.length) {
        // Finished all
        stopGame();
        alert('すべての問題を終了しました！');
    } else {
        if(els.qSelect) els.qSelect.value = playState.qIndex;
        processCurrentWord();
    }
}

function disableChoices() {
    els.choiceBtns.forEach(btn => btn.disabled = true);
}

function enableChoices() {
    els.choiceBtns.forEach(btn => btn.disabled = false);
}

function resetChoiceStyles() {
    els.choiceBtns.forEach((btn, idx) => {
        btn.classList.remove('correct', 'incorrect');
        btn.textContent = `選択肢${idx+1}`;
    });
}

// Kickoff
window.addEventListener('DOMContentLoaded', init);
