// App State
let sentences = [];
let stack = [];
let currentTab = 'play';

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
    stackBadge: document.getElementById('stack-badge')
};

// Initialize
function init() {
    loadData();
    renderSentencesList();
    renderStack();
    updatePlayUIState();
    
    // Setup TTS voices (browser sometimes needs time to load them)
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

// Data Management
function saveData() {
    localStorage.setItem('ez6_sentences', JSON.stringify(sentences));
    localStorage.setItem('ez6_stack', JSON.stringify(stack));
}

function loadData() {
    const s = localStorage.getItem('ez6_sentences');
    const st = localStorage.getItem('ez6_stack');
    if (s) sentences = JSON.parse(s);
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

function parseSentenceToWords(sentence) {
    // split by space and clean
    return sentence.split(/\s+/).map(cleanWord).filter(w => w.length > 0);
}

// Create Mode
function addSentence() {
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
    
    sentences.push(text);
    els.sentenceInput.value = '';
    els.createFeedback.textContent = '';
    
    saveData();
    renderSentencesList();
    updatePlayUIState();
}

function clearAllSentences() {
    if(confirm('すべての問題を削除しますか？')) {
        sentences = [];
        saveData();
        renderSentencesList();
        updatePlayUIState();
    }
}

function removeSentence(index) {
    sentences.splice(index, 1);
    saveData();
    renderSentencesList();
    updatePlayUIState();
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
    } else {
        els.emptyState.style.display = 'none';
        els.gameContainer.style.display = 'flex';
        els.totalQCount.textContent = sentences.length;
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
    playState.qIndex = 0;
    playState.wordIndex = 0;
    
    // Disable inputs during play
    els.timerInput.disabled = true;
    els.speedSlider.disabled = true;
    
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
    utterance.lang = 'en-US'; // Defaulting to english reading
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
