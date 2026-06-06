let deck = [];
let playDeck = [];
let chunks = [];
let currentChunkId = null;
let currentIndex = 0;
let isFlipped = false;
let isInputChecking = false;
let stack = [];
let autoTimer = null;
let autoInterval = 1000;
let isAutoPlaying = false;
let autoPhase = 'question';
let selectedMergeChunks = []; 


const resource = 'flashcards';

// --- API Client Functions ---


const getAllItems = (resource) => {
    let url = `${API_BASE_URL}/${resource}`;
    const myDataOnlyToggle = document.getElementById('my-data-only-toggle');
    if (myDataOnlyToggle && myDataOnlyToggle.checked && AUTH_USER_ID) {
        url = `${API_BASE_URL}/${resource}/user/${AUTH_USER_ID}`;
    }
    console.log(`Fetching all items for resource: ${resource} from ${url}`);
    return fetch(url)
        .then(res => res.json())
        .then(json => json.data || json);
};
const getItemById = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`)
    .then(res => res.json())
    .then(json => json.data || json.item || json);
const createItem = (resource, data) => fetch(`${API_BASE_URL}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) })
    .then(res => res.json())
    .then(json => json.item || json.data || json);
const updateItem = (resource, id, data) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) })
    .then(res => res.json())
    .then(json => json.item || json.data || json);
const deleteItem = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'DELETE', headers: { 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD } })
    .then(res => res.json())
    .then(json => json.item || json.data || json);

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    const myDataContainer = document.getElementById('my-data-only-container');
    if (myDataContainer && (!AUTH_USER_ID || !AUTH_PASSWORD)) {
        myDataContainer.style.display = 'none';
    }
    await initChunks();
    // 初期表示として学習モードを明示的にセット
    switchTab('play');
});

async function handleToggleMyData() {
    await initChunks();
    updateUI();
}

function checkAuth() {
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        const msg = document.getElementById('login-required-msg');
        const link = document.getElementById('top-link');
        if (msg) {
            msg.style.display = 'block';
            // スクロール完了頃合い(約500ms後)から3秒間(500ms x 6回)点滅させる
            msg.animate([
                { opacity: 1 },
                { opacity: 0, offset: 0.5 },
                { opacity: 1 }
            ], {
                duration: 500,
                iterations: 6,
                delay: 500
            });
        }
        if (link) link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
    }
    return true;
}


async function initChunks() {
    try {
        const data = await getAllItems('chunks');
        chunks = data;
        populateChunkSelector();
        if (chunks.length > 0) {
            currentChunkId = chunks[0].id;
            document.getElementById('chunk-select').value = currentChunkId;
            await loadData();
        }
    } catch (error) {
        console.error('Failed to initialize chunks:', error);
    }
}

function populateChunkSelector() {
    const selector = document.getElementById('chunk-select');
    if (!selector) return;
    selector.innerHTML = chunks.map(chunk => `<option value="${chunk.id}">${chunk.name}</option>`).join('');
}

async function handleChunkChange() {
    const selector = document.getElementById('chunk-select');
    currentChunkId = selector.value;
    currentIndex = 0;
    await loadData();
    updateUI();
    // Also update bulk input if editor is active
    if (document.getElementById('editor-view').classList.contains('active')) {
        populateBulkInput();
    }
}

async function handleCreateChunk() {
    if (!checkAuth()) return;
    const name = prompt('新しい問題集の名前を入力してください:');
    if (!name) return;
    try {
        const result = await createItem('chunks', { name });
        await initChunks();
        // Switch to the new chunk
        currentChunkId = result.id;
        document.getElementById('chunk-select').value = currentChunkId;
        await loadData();
        updateUI();
        if (document.getElementById('editor-view').classList.contains('active')) {
            populateBulkInput();
        }
    } catch (error) {
        alert('問題集の作成に失敗しました。');
    }
}

async function handleMultiTxtImport(event) {
    if (!checkAuth()) return;
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let successCount = 0;
    let failCount = 0;
    let messages = [];

    for (const file of files) {
        // Validation: .txt extension
        if (!file.name.toLowerCase().endsWith('.txt')) {
            failCount++;
            messages.push(`${file.name}: .txtファイルではありません。`);
            continue;
        }

        try {
            const content = await file.text();
            const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');

            // Validation: at least 1 line
            if (lines.length === 0) {
                failCount++;
                messages.push(`${file.name}: データが空です。`);
                continue;
            }

            const items = [];
            let formatError = false;
            for (const line of lines) {
                const parts = line.split('=');
                if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
                    formatError = true;
                    break;
                }
                items.push({
                    question: parts[0].trim(),
                    answer: parts.slice(1).join('=').trim()
                });
            }

            // Validation: format
            if (formatError) {
                failCount++;
                messages.push(`${file.name}: フォーマットが正しくありません (a=A形式)。`);
                continue;
            }

            // Success: Create chunk and save items
            const chunkName = file.name.replace(/\.[^/.]+$/, ""); // Remove .txt
            const chunkResult = await createItem('chunks', { name: chunkName });
            const chunkId = chunkResult.id;

            // Use bulk update (PUT with chunk_id) to save items
            await fetch(`${API_BASE_URL}/${resource}?chunk_id=${chunkId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'user_id': AUTH_USER_ID,
                    'password': AUTH_PASSWORD
                },
                body: JSON.stringify(items)
            });

            successCount++;
        } catch (error) {
            console.error(`Error processing file ${file.name}:`, error);
            failCount++;
            messages.push(`${file.name}: 読み込みエラー - ${error.message}`);
        }
    }

    alert(`インポート結果:\n成功: ${successCount}\n失敗: ${failCount}${messages.length > 0 ? '\n\n' + messages.join('\n') : ''}`);
    
    // Refresh chunks list
    await initChunks();
    // Clear input
    event.target.value = '';
}

// --- Core Data Logic ---

async function loadData() {
    if (!currentChunkId) return;
    try {
        let url = `${API_BASE_URL}/${resource}?chunk_id=${currentChunkId}`;
        const myDataOnlyToggle = document.getElementById('my-data-only-toggle');
        if (myDataOnlyToggle && myDataOnlyToggle.checked && AUTH_USER_ID) {
            url = `${API_BASE_URL}/${resource}/user/${AUTH_USER_ID}?chunk_id=${currentChunkId}`;
        }
        // Fetch items filtered by chunk_id
        const response = await fetch(url);
        const json = await response.json();
        const data = json.data || json;

        if (data && Array.isArray(data)) {
            deck = data;
            playDeck = [...deck];
        } else {
            deck = [];
            playDeck = [];
        }
    } catch (error) {
        console.error('Failed to load data from API:', error);
        deck = [];
    }
}

async function saveData() {
    if (!checkAuth()) return;
    if (!currentChunkId) return;
    try {
        // Use the bulk update endpoint with chunk_id query param
        await fetch(`${API_BASE_URL}/${resource}?chunk_id=${currentChunkId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD },
            body: JSON.stringify(deck)
        });
    } catch (error) {
        console.error('Failed to save data to API:', error);
    }
}

// --- Navigation Logic ---

function switchTab(tab) {
    const playView = document.getElementById('player-view');
    const inputView = document.getElementById('input-view');
    const editView = document.getElementById('editor-view');
    const playTab = document.getElementById('tab-play');
    const inputTab = document.getElementById('tab-input');
    const editTab = document.getElementById('tab-edit');
    const actionButtons = document.getElementById('chunk-action-buttons');

    if (!playView || !inputView || !editView) return;

    playView.classList.remove('active');
    inputView.classList.remove('active');
    editView.classList.remove('active');

    playTab.classList.remove('active');
    inputTab.classList.remove('active');
    editTab.classList.remove('active');

    if (actionButtons) {
        actionButtons.style.display = (tab === 'edit') ? 'flex' : 'none';
    }

    // 学習モードまたは入力回答を開始するたびにスタックをクリア
    if (tab === 'play' || tab === 'input') {
        clearStack();
    }

    if (tab === 'play') {
        playView.classList.add('active');
        playTab.classList.add('active');
        updatePlayer();
    } else if (tab === 'input') {
        inputView.classList.add('active');
        inputTab.classList.add('active');
        updateInputPlayer();
    } else {
        editView.classList.add('active');
        editTab.classList.add('active');
        populateBulkInput();
    }
}

// --- Player Logic ---

function updateUI() {
    updatePlayer();
    updateInputPlayer();

    // 念のため現在のアクティブなタブに合わせてボタンの表示状態を同期
    const editTab = document.getElementById('tab-edit');
    const actionButtons = document.getElementById('chunk-action-buttons');
    if (editTab && actionButtons) {
        const isEditActive = editTab.classList.contains('active');
        actionButtons.style.display = isEditActive ? 'flex' : 'none';
    }
}

function updatePlayer() {
    const emptyState = document.getElementById('empty-state');
    const gameContainer = document.getElementById('game-container');
    const qText = document.getElementById('question-text');
    const aText = document.getElementById('answer-text');
    const currIdxEl = document.getElementById('current-index');
    const totalCntEl = document.getElementById('total-count');
    const progressInner = document.getElementById('progress-inner');
    const flashcard = document.getElementById('flashcard');

    if (!emptyState || !gameContainer) return;

    if (playDeck.length === 0) {
        emptyState.style.display = 'block';
        gameContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    gameContainer.style.display = 'flex';

    const wasFlipped = flashcard.classList.contains('flipped');
    isFlipped = false;
    flashcard.classList.remove('flipped');

    const card = playDeck[currentIndex];
    const isSwapped = document.getElementById('swap-qa-toggle') ? document.getElementById('swap-qa-toggle').checked : false;

    qText.textContent = isSwapped ? card.answer : card.question;
    
    if (wasFlipped) {
        // カードが回転して裏面が見えなくなるタイミング（約300ms後）まで回答の更新を遅らせる
        setTimeout(() => {
            aText.textContent = isSwapped ? card.question : card.answer;
        }, 300);
    } else {
        aText.textContent = isSwapped ? card.question : card.answer;
    }

    currIdxEl.textContent = currentIndex + 1;
    totalCntEl.textContent = playDeck.length;

    const progress = ((currentIndex + 1) / playDeck.length) * 100;
    progressInner.style.width = `${progress}%`;
}


function flipCard() {
    if (playDeck.length === 0) return;
    if (isFlipped) {
        nextCard();
    } else {
        isFlipped = true;
        document.getElementById('flashcard').classList.add('flipped');
    }
}

function nextCard() {
    if (playDeck.length === 0) return;
    currentIndex = (currentIndex + 1) % playDeck.length;
    updatePlayer();
}

function prevCard() {
    if (playDeck.length === 0) return;
    currentIndex = (currentIndex - 1 + playDeck.length) % playDeck.length;
    updatePlayer();
}

function shuffleCards() {
    if (playDeck.length <= 1) return;
    for (let i = playDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playDeck[i], playDeck[j]] = [playDeck[j], playDeck[i]];
    }
    currentIndex = 0;
    updatePlayer();
    updateInputPlayer();
}

async function toggleAutoMode() {
    if (isAutoPlaying) {
        stopAutoMode();
    } else {
        const intervalStr = prompt('何秒間隔でカードをめくるか入力してください (0.5, 1, 3, 5):', '1');
        if (!intervalStr) return;
        const interval = parseFloat(intervalStr);
        if (![0.5, 1, 3, 5].includes(interval)) {
            alert('0.5, 1, 3, 5 のいずれかを入力してください。');
            return;
        }
        autoInterval = interval * 1000;
        startAutoMode();
    }
}

function startAutoMode() {
    if (deck.length === 0) return;
    isAutoPlaying = true;
    autoPhase = 'question';
    
    const btn = document.getElementById('auto-btn');
    const icon = document.getElementById('auto-icon');
    const text = document.getElementById('auto-text');
    if (btn) btn.classList.add('active-auto');
    if (icon) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-stop');
    }
    if (text) text.textContent = 'オート停止';

    runAutoStep();
}

function stopAutoMode() {
    isAutoPlaying = false;
    clearTimeout(autoTimer);
    
    const btn = document.getElementById('auto-btn');
    const icon = document.getElementById('auto-icon');
    const text = document.getElementById('auto-text');
    if (btn) btn.classList.remove('active-auto');
    if (icon) {
        icon.classList.remove('fa-stop');
        icon.classList.add('fa-play');
    }
    if (text) text.textContent = 'オート開始';
}

function runAutoStep() {
    if (!isAutoPlaying) return;
    
    if (autoPhase === 'question') {
        if (!isFlipped) {
            flipCard();
        }
        autoPhase = 'answer';
        autoTimer = setTimeout(runAutoStep, autoInterval);
    } else {
        nextCard();
        autoPhase = 'question';
        autoTimer = setTimeout(runAutoStep, autoInterval);
    }
}

function toggleQASwap() {
    updateUI();
}

// --- Input Mode Logic ---

function updateInputPlayer() {
    const emptyState = document.getElementById('input-empty-state');
    const inputContainer = document.getElementById('input-container');
    const qText = document.getElementById('input-question-text');
    const currIdxEl = document.getElementById('input-current-index');
    const totalCntEl = document.getElementById('input-total-count');
    const progressInner = document.getElementById('input-progress-inner');
    const answerInput = document.getElementById('answer-input');
    const feedback = document.getElementById('input-feedback');

    if (!emptyState) return;

    if (playDeck.length === 0) {
        emptyState.style.display = 'block';
        inputContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    inputContainer.style.display = 'flex';

    const card = playDeck[currentIndex];
    const isSwapped = document.getElementById('swap-qa-toggle') ? document.getElementById('swap-qa-toggle').checked : false;
    qText.textContent = isSwapped ? card.answer : card.question;

    currIdxEl.textContent = currentIndex + 1;
    totalCntEl.textContent = playDeck.length;

    const progress = ((currentIndex + 1) / playDeck.length) * 100;
    progressInner.style.width = `${progress}%`;

    answerInput.value = '';
    answerInput.disabled = false;
    feedback.textContent = '';
    feedback.style.color = '';
    isInputChecking = false;

    setTimeout(() => { answerInput.focus(); }, 50);
}

function checkInputAnswer() {
    if (isInputChecking || playDeck.length === 0) return;
    const answerInput = document.getElementById('answer-input');
    const feedback = document.getElementById('input-feedback');
    const currentCard = playDeck[currentIndex];
    const isSwapped = document.getElementById('swap-qa-toggle') ? document.getElementById('swap-qa-toggle').checked : false;
    const targetAnswer = isSwapped ? currentCard.question : currentCard.answer;

    if (answerInput.value === targetAnswer) {
        isInputChecking = true;
        answerInput.disabled = true;
        feedback.textContent = '正解！';
        feedback.style.color = 'var(--success)';
        setTimeout(() => {
            currentIndex = (currentIndex + 1) % playDeck.length;
            updateInputPlayer();
            updatePlayer();
        }, 1000);
    }
}

// --- Editor Logic (Bulk) ---

function populateBulkInput() {
    const bulkInput = document.getElementById('bulk-input');
    const text = deck.map(card => `${card.question}=${card.answer}`).join('\n');
    bulkInput.value = text;
}

async function applyBulkUpdate() {
    if (!checkAuth()) return;
    const bulkInput = document.getElementById('bulk-input');
    const lines = bulkInput.value.trim().split('\n');
    const newDeck = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split('=');
        if (parts.length >= 2) {
            const question = parts[0].trim();
            const answer = parts.slice(1).join('=').trim();
            if (question && answer) {
                newDeck.push({ question, answer });
            }
        }
    }

    if (newDeck.length === 0 && lines.some(l => l.trim() !== '')) {
        if (!confirm('有効なカードが読み取れませんでした。データを空にしますか？')) return;
    }

    deck = newDeck;
    playDeck = [...deck];
    if (currentIndex >= deck.length) currentIndex = Math.max(0, deck.length - 1);
    await saveData();
    alert('保存しました！');
}

// --- API UI Handlers ---

function displayApiResult(data) {
    const resultEl = document.getElementById('api-result');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = ''; // Clear previous content

    // Check if it's a successful getAll with flashcards
    if (data.action === 'getAll' && data.status === 'success' && Array.isArray(data.data)) {
        const items = data.data;
        // Group by chunk_id
        const groups = items.reduce((acc, item) => {
            const cid = item.chunk_id || 'unassigned';
            if (!acc[cid]) acc[cid] = [];
            acc[cid].push(item);
            return acc;
        }, {});

        // アイテム数が0のチャンクもリストに表示するために追加
        if (chunks && Array.isArray(chunks)) {
            chunks.forEach(chunk => {
                const cid = String(chunk.id);
                if (!groups[cid]) {
                    groups[cid] = [];
                }
            });
        }

        const groupIds = Object.keys(groups).sort();

        // If we have multiple chunks or at least one assigned chunk, show the list UI
        if (groupIds.length > 0) {
            // Add Merge Button at the top
            const mergeActionContainer = document.createElement('div');
            mergeActionContainer.id = 'merge-action-container';
            mergeActionContainer.style.display = 'none';
            mergeActionContainer.style.marginBottom = '1rem';
            mergeActionContainer.style.padding = '1rem';
            mergeActionContainer.style.background = 'rgba(129, 140, 248, 0.1)';
            mergeActionContainer.style.borderRadius = '12px';
            mergeActionContainer.style.border = '1px solid var(--accent-color)';
            mergeActionContainer.style.animation = 'fadeIn 0.3s ease';
            
            const mergeBtn = document.createElement('button');
            mergeBtn.className = 'btn btn-primary';
            mergeBtn.style.width = '100%';
            mergeBtn.innerHTML = '<i class="fas fa-object-group"></i> 選択した問題集を合成して新規作成';
            mergeBtn.onclick = handleMergeChunks;
            mergeActionContainer.appendChild(mergeBtn);
            resultEl.appendChild(mergeActionContainer);

            const listContainer = document.createElement('div');
            listContainer.style.display = 'flex';
            listContainer.style.flexDirection = 'column';
            listContainer.style.gap = '0.75rem';

            const title = document.createElement('div');
            title.textContent = '検出されたチャンク一覧:';
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '0.5rem';
            title.style.color = 'var(--text-primary)';
            listContainer.appendChild(title);

            groupIds.forEach(cid => {
                const chunk = chunks.find(c => String(c.id) === String(cid));
                const displayName = chunk ? chunk.name : `未定義の問題集 (ID: ${cid})`;

                const row = document.createElement('div');
                row.className = 'list-item';
                row.style.padding = '0.75rem 1rem';
                row.style.marginBottom = '0';

                // Merge Selection UI
                const selectionContainer = document.createElement('div');
                selectionContainer.style.display = 'flex';
                selectionContainer.style.alignItems = 'center';
                selectionContainer.style.marginRight = '1rem';
                selectionContainer.style.paddingRight = '0.5rem';
                selectionContainer.style.borderRight = '1px solid rgba(255,255,255,0.1)';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'merge-checkbox';
                checkbox.dataset.id = cid;
                checkbox.style.width = '18px';
                checkbox.style.height = '18px';
                checkbox.style.cursor = 'pointer';
                checkbox.onchange = (e) => toggleMergeSelection(cid, e.target.checked);

                const orderLabel = document.createElement('span');
                orderLabel.id = `merge-order-${cid}`;
                orderLabel.style.minWidth = '20px';
                orderLabel.style.textAlign = 'center';
                orderLabel.style.fontWeight = 'bold';
                orderLabel.style.color = 'var(--accent-color)';
                orderLabel.style.marginLeft = '0.5rem';
                orderLabel.style.fontSize = '0.9rem';
                orderLabel.textContent = '';

                selectionContainer.appendChild(checkbox);
                selectionContainer.appendChild(orderLabel);
                row.appendChild(selectionContainer);

                const info = document.createElement('div');
                info.className = 'item-content';
                info.style.flex = '1';
                info.innerHTML = `<span class="item-q">${displayName}</span><span class="item-a">${groups[cid].length} 個のアイテム</span>`;

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '0.5rem';

                const loadBtn = document.createElement('button');
                loadBtn.className = 'btn btn-primary';
                loadBtn.style.padding = '0.4rem 0.8rem';
                loadBtn.style.fontSize = '0.8rem';
                loadBtn.textContent = '読み込む';
                loadBtn.onclick = () => selectChunkFromApi(cid);

                actions.appendChild(loadBtn);

                row.appendChild(info);
                row.appendChild(actions);
                listContainer.appendChild(row);
            });
            resultEl.appendChild(listContainer);
            resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
    }

    // Default: Display as formatted JSON
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = JSON.stringify(data, null, 2);
    resultEl.appendChild(pre);
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function selectChunkFromApi(chunkId) {
    const selector = document.getElementById('chunk-select');
    if (selector) {
        const chunk = chunks.find(c => String(c.id) === String(chunkId));
        const chunkName = chunk ? chunk.name : `問題集 (ID: ${chunkId})`;

        // Find or create option if it doesn't exist (though it should)
        let optionExists = Array.from(selector.options).some(opt => opt.value == chunkId);
        if (!optionExists) {
            const newOpt = document.createElement('option');
            newOpt.value = chunkId;
            newOpt.textContent = `${chunkName} (新しく検出)`;
            selector.appendChild(newOpt);
        }
        selector.value = chunkId;
        handleChunkChange();

        // Visual feedback
        alert(`「${chunkName}」を読み込みました。`);
    }
}



async function handleGetAll() {
    console.log('handleGetAll: Start');
    selectedMergeChunks = []; // Reset selection when fetching new list
    try {
        console.log('handleGetAll: Fetching items...');
        const data = await getAllItems(resource);
        console.log('handleGetAll: Success', data);
        displayApiResult({ action: 'getAll', status: 'success', data: data });
        console.log('handleGetAll: Results displayed');
    } catch (error) {
        console.error('handleGetAll: Error', error);
        displayApiResult({ action: 'getAll', status: 'error', message: error.message });
    }
}






async function handleDelete() {
    if (!checkAuth()) return;
    if (!currentChunkId) {
        alert('削除する問題集が選択されていません。');
        return;
    }

    const currentChunk = chunks.find(c => String(c.id) === String(currentChunkId));
    const chunkName = currentChunk ? currentChunk.name : `ID: ${currentChunkId}`;

    if (!confirm(`読み込み中の問題集「${chunkName}」を削除してもよろしいですか？\nこの操作は取り消せません。`)) return;

    try {
        // 先にチャンク内のフラッシュカードをすべて削除する
        await fetch(`${API_BASE_URL}/${resource}?chunk_id=${currentChunkId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD },
            body: JSON.stringify([])
        });

        // チャンク自体を削除する
        const chunkData = await deleteItem('chunks', currentChunkId);

        displayApiResult({ action: 'deleteChunk', id: currentChunkId, status: 'success', data: chunkData });
        
        await initChunks();
        if (chunks.length === 0) {
            currentChunkId = null;
            deck = [];
            playDeck = [];
            populateBulkInput();
        }
        updateUI();
        alert(`「${chunkName}」を削除しました。`);
    } catch (error) {
        displayApiResult({ action: 'deleteChunk', id: currentChunkId, status: 'error', message: error.message });
        alert('削除に失敗しました。');
    }
}

// --- Stack Logic ---

function addToStack() {
    if (playDeck.length === 0) return;
    const card = playDeck[currentIndex];
    
    // 現在表示中のペアをスタックに追加
    stack.push({ ...card });
    updateStackUI();
    
    // フィードバック（一瞬ボタンを光らせるなどの代わりに、簡易的な通知やバッジ更新）
}

function updateStackUI() {
    const listEl = document.getElementById('stack-list');
    const badgeEl = document.getElementById('stack-badge');
    if (!listEl || !badgeEl) return;

    listEl.innerHTML = stack.map((item, index) => `
        <div class="stack-item" style="position: relative; padding-right: 2rem;">
            <div class="item-q">${item.question}</div>
            <div class="item-a">${item.answer}</div>
            <button onclick="removeFromStack(${index})" title="このアイテムを削除" style="position: absolute; top: 50%; right: 0.4rem; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0.2rem; opacity: 0.5;" onmouseover="this.style.opacity='1'; this.style.color='var(--danger)'" onmouseout="this.style.opacity='0.5'; this.style.color='var(--text-secondary)'">&times;</button>
        </div>
    `).join('');

    badgeEl.textContent = stack.length;
    badgeEl.style.display = stack.length > 0 ? 'block' : 'none';
}

function toggleStack() {
    const panel = document.getElementById('stack-panel');
    if (panel) {
        panel.classList.toggle('open');
    }
}

function clearStack() {
    stack = [];
    updateStackUI();
}

function removeFromStack(index) {
    stack.splice(index, 1);
    updateStackUI();
}

async function copyStackToClipboard() {
    if (stack.length === 0) {
        alert('スタックが空です。');
        return;
    }
    const text = stack.map(item => `${item.question}=${item.answer}`).join('\n');
    try {
        await navigator.clipboard.writeText(text);
        alert('クリップボードにコピーしました！');
    } catch (err) {
        // Fallback for non-secure contexts if needed, but navigator.clipboard is standard
        console.error('Clipboard copy failed:', err);
        alert('コピーに失敗しました。');
    }
}

// --- Hamburger Menu Logic ---
function toggleMenu() {
    const dropdown = document.getElementById('menu-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Close dropdown when clicking outside
window.addEventListener('click', function(event) {
    const menuToggle = document.getElementById('menu-toggle');
    const menuDropdown = document.getElementById('menu-dropdown');
    if (menuToggle && !menuToggle.contains(event.target)) {
        if (menuDropdown && menuDropdown.classList.contains('show')) {
            menuDropdown.classList.remove('show');
        }
    }
});

async function copyLeftSide(silent = false, redirectUrl = null) {
    const bulkInput = document.getElementById('bulk-input');
    if (!bulkInput) return;
    const lines = bulkInput.value.split('\n');
    const leftSides = lines
        .map(line => {
            const parts = line.split('=');
            return parts[0].trim();
        })
        .filter(text => text !== '');
    
    if (leftSides.length === 0) {
        if (!silent) alert('コピーする内容がありません。');
        return;
    }

    try {
        await navigator.clipboard.writeText(leftSides.join('\n'));
        if (!silent) alert('左側の内容をクリップボードにコピーしました！');
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
    const dropdown = document.getElementById('menu-dropdown');
    if (dropdown) dropdown.classList.remove('show');

    if (redirectUrl) {
        window.location.href = redirectUrl;
    }
}

async function copyRightSide(silent = false, redirectUrl = null) {
    const bulkInput = document.getElementById('bulk-input');
    if (!bulkInput) return;
    const lines = bulkInput.value.split('\n');
    const rightSides = lines
        .map(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                return parts.slice(1).join('=').trim();
            }
            return '';
        })
        .filter(text => text !== '');
    
    if (rightSides.length === 0) {
        if (!silent) alert('コピーする内容がありません。');
        return;
    }

    try {
        await navigator.clipboard.writeText(rightSides.join('\n'));
        if (!silent) alert('右側の内容をクリップボードにコピーしました！');
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
    const dropdown = document.getElementById('menu-dropdown');
    if (dropdown) dropdown.classList.remove('show');

    if (redirectUrl) {
        window.location.href = redirectUrl;
    }
}

function addBulkToStack() {
    const bulkInput = document.getElementById('bulk-input');
    if (!bulkInput) return;
    const text = bulkInput.value.trim();
    if (!text) {
        alert('追加するテキストを入力してください。');
        return;
    }

    const lines = text.split('\n');
    const newItems = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split('=');
        if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
            alert(`フォーマットが正しくありません (行 ${i + 1}): "${line}"\n「問題=解答」の形式で入力してください。`);
            return;
        }
        newItems.push({
            question: parts[0].trim(),
            answer: parts.slice(1).join('=').trim()
        });
    }

    if (newItems.length > 0) {
        stack.push(...newItems);
        updateStackUI();
        alert(`${newItems.length}件のアイテムをスタックに追加しました。`);
    }
}

// --- Chunk Merging Logic ---

function toggleMergeSelection(chunkId, isChecked) {
    if (isChecked) {
        if (!selectedMergeChunks.includes(chunkId)) {
            selectedMergeChunks.push(chunkId);
        }
    } else {
        selectedMergeChunks = selectedMergeChunks.filter(id => id !== chunkId);
    }
    updateMergeUI();
}

function updateMergeUI() {
    const container = document.getElementById('merge-action-container');
    if (container) {
        container.style.display = selectedMergeChunks.length >= 2 ? 'block' : 'none';
    }

    // Update numbers
    const checkboxes = document.querySelectorAll('.merge-checkbox');
    checkboxes.forEach(cb => {
        const cid = cb.dataset.id;
        const orderLabel = document.getElementById(`merge-order-${cid}`);
        if (orderLabel) {
            const index = selectedMergeChunks.indexOf(cid);
            orderLabel.textContent = index !== -1 ? (index + 1) : '';
        }
    });
}

async function handleMergeChunks() {
    if (!checkAuth()) return;
    if (selectedMergeChunks.length < 2) {
        alert('合成するには2つ以上の問題集を選択してください。');
        return;
    }

    const newName = prompt('合成後の新しい問題集の名前を入力してください:');
    if (!newName) return;

    try {
        // 1. Create new chunk
        const chunkResult = await createItem('chunks', { name: newName });
        const newChunkId = chunkResult.id;

        // 2. Fetch all items for selected chunks in order and combine them
        let allMergedItems = [];
        for (const cid of selectedMergeChunks) {
            const response = await fetch(`${API_BASE_URL}/${resource}?chunk_id=${cid}`);
            const json = await response.json();
            const items = json.data || json;
            if (Array.isArray(items)) {
                // Remove individual IDs and other metadata so they are created as new items
                const cleanedItems = items.map(({ id, created_at, user_id, ...rest }) => ({
                    ...rest,
                    chunk_id: newChunkId
                }));
                allMergedItems.push(...cleanedItems);
            }
        }

        // 3. Save merged items to new chunk using bulk update (PUT)
        const saveResponse = await fetch(`${API_BASE_URL}/${resource}?chunk_id=${newChunkId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json', 
                'user_id': AUTH_USER_ID, 
                'password': AUTH_PASSWORD 
            },
            body: JSON.stringify(allMergedItems)
        });

        if (saveResponse.ok) {
            alert(`「${newName}」を作成し、${allMergedItems.length}件のアイテムを合成しました！`);
            // Reset and Refresh
            selectedMergeChunks = [];
            await initChunks();
            await handleGetAll(); // Refresh the list
        } else {
            const err = await saveResponse.json();
            alert(`保存に失敗しました: ${err.error || '不明なエラー'}`);
        }
    } catch (error) {
        console.error('Merge error:', error);
        alert('合成中にエラーが発生しました。');
    }
}

