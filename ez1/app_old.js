let deck = [];
let chunks = [];
let currentChunkId = null;
let currentIndex = 0;
let isFlipped = false;
let isInputChecking = false;

const resource = 'flashcards';

// --- API Client Functions ---
const getAllItems = (resource) => {
    console.log(`Fetching all items for resource: ${resource} from ${API_BASE_URL}/${resource}`);
    return fetch(`${API_BASE_URL}/${resource}`)
        .then(res => res.json())
        .then(json => json.data || json);
};
const getItemById = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`)
    .then(res => res.json())
    .then(json => json.data || json.item || json);
const createItem = (resource, data) => fetch(`${API_BASE_URL}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(res => res.json())
    .then(json => json.item || json.data || json);
const updateItem = (resource, id, data) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    .then(res => res.json())
    .then(json => json.item || json.data || json);
const deleteItem = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(json => json.item || json.data || json);

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await initChunks();
    updateUI();
});

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
    } catch (error) {
        alert('問題集の作成に失敗しました。');
    }
}

// --- Core Data Logic ---

async function loadData() {
    if (!currentChunkId) return;
    try {
        // Fetch items filtered by chunk_id
        const response = await fetch(`${API_BASE_URL}/${resource}?chunk_id=${currentChunkId}`);
        const json = await response.json();
        const data = json.data || json;

        if (data && Array.isArray(data)) {
            deck = data;
        } else {
            deck = [];
        }
    } catch (error) {
        console.error('Failed to load data from API:', error);
        deck = [];
    }
}

async function saveData() {
    if (!currentChunkId) return;
    try {
        // Use the bulk update endpoint with chunk_id query param
        await fetch(`${API_BASE_URL}/${resource}?chunk_id=${currentChunkId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

    if (!playView || !inputView || !editView) return;

    playView.classList.remove('active');
    inputView.classList.remove('active');
    editView.classList.remove('active');

    playTab.classList.remove('active');
    inputTab.classList.remove('active');
    editTab.classList.remove('active');

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

    if (deck.length === 0) {
        emptyState.style.display = 'block';
        gameContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    gameContainer.style.display = 'flex';

    isFlipped = false;
    flashcard.classList.remove('flipped');

    const card = deck[currentIndex];
    const isSwapped = document.getElementById('swap-qa-toggle') ? document.getElementById('swap-qa-toggle').checked : false;

    qText.textContent = isSwapped ? card.answer : card.question;
    aText.textContent = isSwapped ? card.question : card.answer;

    currIdxEl.textContent = currentIndex + 1;
    totalCntEl.textContent = deck.length;

    const progress = ((currentIndex + 1) / deck.length) * 100;
    progressInner.style.width = `${progress}%`;
}

function flipCard() {
    if (deck.length === 0) return;
    if (isFlipped) {
        nextCard();
    } else {
        isFlipped = true;
        document.getElementById('flashcard').classList.add('flipped');
    }
}

function nextCard() {
    if (deck.length === 0) return;
    currentIndex = (currentIndex + 1) % deck.length;
    updatePlayer();
}

function prevCard() {
    if (deck.length === 0) return;
    currentIndex = (currentIndex - 1 + deck.length) % deck.length;
    updatePlayer();
}

async function shuffleCards() {
    if (deck.length <= 1) return;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    currentIndex = 0;
    updatePlayer();
    updateInputPlayer();
    await saveData();
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

    if (deck.length === 0) {
        emptyState.style.display = 'block';
        inputContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    inputContainer.style.display = 'flex';

    const card = deck[currentIndex];
    const isSwapped = document.getElementById('swap-qa-toggle') ? document.getElementById('swap-qa-toggle').checked : false;
    qText.textContent = isSwapped ? card.answer : card.question;

    currIdxEl.textContent = currentIndex + 1;
    totalCntEl.textContent = deck.length;

    const progress = ((currentIndex + 1) / deck.length) * 100;
    progressInner.style.width = `${progress}%`;

    answerInput.value = '';
    answerInput.disabled = false;
    feedback.textContent = '';
    feedback.style.color = '';
    isInputChecking = false;

    setTimeout(() => { answerInput.focus(); }, 50);
}

function checkInputAnswer() {
    if (isInputChecking || deck.length === 0) return;
    const answerInput = document.getElementById('answer-input');
    const feedback = document.getElementById('input-feedback');
    const currentCard = deck[currentIndex];
    const isSwapped = document.getElementById('swap-qa-toggle') ? document.getElementById('swap-qa-toggle').checked : false;
    const targetAnswer = isSwapped ? currentCard.question : currentCard.answer;

    if (answerInput.value === targetAnswer) {
        isInputChecking = true;
        answerInput.disabled = true;
        feedback.textContent = '正解！';
        feedback.style.color = 'var(--success)';
        setTimeout(() => {
            currentIndex = (currentIndex + 1) % deck.length;
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

        const groupIds = Object.keys(groups).sort();

        // If we have multiple chunks or at least one assigned chunk, show the list UI
        if (groupIds.length > 0) {
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
                const row = document.createElement('div');
                row.className = 'list-item';
                row.style.padding = '0.75rem 1rem';
                row.style.marginBottom = '0';

                const info = document.createElement('div');
                info.className = 'item-content';
                info.innerHTML = `<span class="item-q">チャンク ID: ${cid}</span><span class="item-a">${groups[cid].length} 個のアイテム</span>`;

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '0.5rem';

                const loadBtn = document.createElement('button');
                loadBtn.className = 'btn btn-primary';
                loadBtn.style.padding = '0.4rem 0.8rem';
                loadBtn.style.fontSize = '0.8rem';
                loadBtn.textContent = '読み込む';
                loadBtn.onclick = () => selectChunkFromApi(cid);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn';
                deleteBtn.style.padding = '0.4rem 0.8rem';
                deleteBtn.style.fontSize = '0.8rem';
                deleteBtn.style.background = 'var(--danger)';
                deleteBtn.style.border = 'none';
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.title = 'チャンクを削除';
                deleteBtn.onclick = () => deleteChunkFromApi(cid);

                actions.appendChild(loadBtn);
                actions.appendChild(deleteBtn);

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
        // Find or create option if it doesn't exist (though it should)
        let optionExists = Array.from(selector.options).some(opt => opt.value == chunkId);
        if (!optionExists) {
            const newOpt = document.createElement('option');
            newOpt.value = chunkId;
            newOpt.textContent = `チャンク ${chunkId} (新しく検出)`;
            selector.appendChild(newOpt);
        }
        selector.value = chunkId;
        handleChunkChange();

        // Visual feedback
        alert(`チャンク ${chunkId} を読み込みました。`);
    }
}

async function deleteChunkFromApi(chunkId) {
    const confirmMsg = `チャンク ID: ${chunkId} のすべてのアイテムを削除してもよろしいですか？\nこの操作は取り消せません。`;
    if (!confirm(confirmMsg)) return;

    try {
        // Use bulk update with empty array to clear all cards for this chunk
        const response = await fetch(`${API_BASE_URL}/${resource}?chunk_id=${chunkId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([])
        });

        if (response.ok) {
            alert(`チャンク ${chunkId} を削除しました。`);
            handleGetAll(); // Refresh the list

            // If the deleted chunk was the currently selected one, clear the deck
            if (currentChunkId == chunkId) {
                deck = [];
                updateUI();
                populateBulkInput();
            }
        } else {
            const err = await response.json();
            alert(`削除に失敗しました: ${err.error || '不明なエラー'}`);
        }
    } catch (error) {
        console.error('Error deleting chunk:', error);
        alert('削除中にエラーが発生しました。');
    }
}

async function handleGetAll() {
    console.log('handleGetAll: Start');
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

async function handleGetById() {
    const id = prompt('取得するアイテムのIDを入力してください:');
    if (!id) return;
    try {
        const data = await getItemById(resource, id);
        displayApiResult({ action: 'getById', id, status: 'success', data });
    } catch (error) {
        displayApiResult({ action: 'getById', id, status: 'error', message: error.message });
    }
}

async function handleCreate() {
    const bulkInput = document.getElementById('bulk-input');
    const text = bulkInput.value.trim();

    if (!text) {
        alert('作成する問題を入力してください。');
        return;
    }

    const lines = text.split('\n').filter(line => line.trim() !== '');
    const newItems = [];

    // Validation
    for (const line of lines) {
        const parts = line.split('=');
        if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
            alert(`フォーマットが正しくありません: "${line}"\n「問題=解答」の形式で入力してください。`);
            return;
        }
        newItems.push({
            chunk_id: currentChunkId,
            question: parts[0].trim(),
            answer: parts.slice(1).join('=').trim()
        });
    }

    try {
        console.log(`Creating ${newItems.length} items...`);
        const results = [];
        for (const item of newItems) {
            const result = await createItem(resource, item);
            results.push(result);
        }

        displayApiResult({ action: 'create', status: 'success', count: newItems.length, data: results });

        // Clear textarea after successful creation
        bulkInput.value = '';

        await loadData();
        updateUI();
        alert(`${newItems.length}件の問題を新規登録しました！`);
    } catch (error) {
        console.error('handleCreate: Error', error);
        displayApiResult({ action: 'create', status: 'error', message: error.message });
        alert('登録中にエラーが発生しました。');
    }
}

async function handleUpdate() {
    const id = prompt('更新するアイテムのIDを入力してください:');
    if (!id) return;
    const question = prompt('新しい問題を入力してください (省略可):');
    const answer = prompt('新しい解答を入力してください (省略可):');
    const updateData = {};
    if (question) updateData.question = question;
    if (answer) updateData.answer = answer;
    try {
        const data = await updateItem(resource, id, updateData);
        displayApiResult({ action: 'update', id, status: 'success', data });
        await loadData();
        updateUI();
    } catch (error) {
        displayApiResult({ action: 'update', id, status: 'error', message: error.message });
    }
}

async function handleDelete() {
    const id = prompt('削除するアイテムのIDを入力してください:');
    if (!id) return;
    if (!confirm(`ID: ${id} のアイテムを削除してもよろしいですか？`)) return;
    try {
        const data = await deleteItem(resource, id);
        displayApiResult({ action: 'delete', id, status: 'success', data });
        await loadData();
        updateUI();
    } catch (error) {
        displayApiResult({ action: 'delete', id, status: 'error', message: error.message });
    }
}
