// Global State
let createOriginalImg = null;
let createOriginalFile = null;
let createCanvas = null;
let createCtx = null;
let isDrawing = false;
let drawMode = 'brush'; 
let brushSize = 20;
let savedRecords = []; // サーバー(DB)上に保存されたリスト
let tempRecords = []; // ブラウザのメモリ上に一時保存されているリスト
let currentEditingId = null;
let createOrigImgQueue = []; // 連続編集の待機キュー

// Undo/Redo State
let drawHistory = [];
let historyStep = -1;

// Navigation / async control
let saveInProgress = false;
let operationSeq = 0; // シーケンス番号
const prefetchControllers = new Map(); // id -> AbortController
const playPrefetchCache = new Map(); // id -> { origUrl, maskUrl }




document.addEventListener('DOMContentLoaded', () => {
    // Canvas Setup
    createCanvas = document.getElementById('create-canvas');
    createCtx = createCanvas.getContext('2d', { willReadFrequently: true });
    
    if (AUTH_USER_ID) {
        loadData();
    } else {
        renderSavedList();
        renderDbList();
    }

    document.getElementById('create-orig-img').addEventListener('change', e => loadImage(e));
    document.getElementById('bulk-import-imgs').addEventListener('change', e => handleBulkImport(e));
    document.getElementById('bulk-import-originals').addEventListener('change', e => handleBulkImportOriginals(e));
    document.getElementById('brush-size').addEventListener('input', e => {
        brushSize = parseInt(e.target.value);
    });
    
    // Drawing events
    createCanvas.addEventListener('mousedown', startDrawing);
    createCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);
    
    // Touch support for drawing
    createCanvas.addEventListener('touchstart', e => { 
        if (e.touches && e.touches.length >= 2) {
            // 2本指以上の場合はブラウザのピンチ・スワイプ（画面移動）に任せる
            isDrawing = false;
            return;
        }
        e.preventDefault(); 
        startDrawing(e);
    }, { passive: false });
    
    createCanvas.addEventListener('touchmove', e => { 
        if (e.touches && e.touches.length >= 2) {
            isDrawing = false;
            return;
        }
        e.preventDefault(); 
        draw(e);
    }, { passive: false });
    
    window.addEventListener('touchend', stopDrawing);

    // Create mode nav buttons
    const createPrevBtn = document.getElementById('create-prev-btn');
    const createNextBtn = document.getElementById('create-next-btn');
    if (createPrevBtn) createPrevBtn.addEventListener('click', () => createNavigatePrev());
    if (createNextBtn) createNextBtn.addEventListener('click', () => createNavigateNext());
    const createOpenPlayBtn = document.getElementById('create-open-play-btn');
    if (createOpenPlayBtn) createOpenPlayBtn.addEventListener('click', () => createOpenInPlay());

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            const active = document.querySelector('.view.active');
            if (active && active.id === 'create-view') createNavigatePrev();
            if (active && active.id === 'play-view') playNavigatePrevActive();
        } else if (e.key === 'ArrowRight') {
            const active = document.querySelector('.view.active');
            if (active && active.id === 'create-view') createNavigateNext();
            if (active && active.id === 'play-view') playNavigateNextActive();
        }
    });
});

function showTransientError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
}

function blobFromDataUrl(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

async function autoSaveWithData(id, maskDataUrl, targetText, contentText) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const maskBlob = blobFromDataUrl(maskDataUrl);
        const formData = new FormData();
        formData.append('mask', maskBlob, 'mask.png');
        if (targetText !== undefined) formData.append('target', targetText);
        if (contentText !== undefined) formData.append('content', contentText);

        const resp = await fetch(`${API_BASE_URL}/fill_image/${id}`, {
            method: 'PUT',
            headers: {
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error('auto save failed');
        const result = await resp.json();
        // 更新が返ってきたらlocal savedRecords を更新
        if (result.item && result.item.mask) {
            const idx = savedRecords.findIndex(r => r.id === id);
            if (idx !== -1) {
                savedRecords[idx].mask = result.item.mask;
                savedRecords[idx].target = result.item.target !== undefined ? result.item.target : targetText || savedRecords[idx].target;
                savedRecords[idx].content = result.item.content !== undefined ? result.item.content : contentText || savedRecords[idx].content;
                savedRecords[idx].timestamp = new Date().toLocaleTimeString();
            }
        }
        return true;
    } catch (e) {
        console.error('Auto-save error for id', id, e);
        return false;
    }
}

async function switchTab(tab) {
    if (tab === 'play' && document.getElementById('create-view').classList.contains('active') && currentEditingId !== null && document.getElementById('create-canvas-container').style.display === 'block') {
        const prevId = currentEditingId;
        const prevTarget = document.getElementById('edit-target-textarea') ? document.getElementById('edit-target-textarea').value.trim() : '';
        const prevContent = document.getElementById('edit-content-textarea') ? document.getElementById('edit-content-textarea').value.trim() : '';
        const prevMaskData = createCanvas.toDataURL('image/png');
        
        const navErr = document.getElementById('create-nav-error');
        if (navErr) navErr.textContent = '保存中...';
        await autoSaveWithData(prevId, prevMaskData, prevTarget, prevContent);
        if (navErr) navErr.textContent = '';
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + '-view').classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    
    if (tab === 'play') {
        renderPlayList();
        toggleFixedUI(false);
    } else if (tab === 'create') {
        renderDbList();
        if (document.getElementById('create-canvas-container').style.display === 'block') {
            toggleFixedUI(true);
        }
    }
}

function checkAuth() {
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        const msg = document.getElementById('login-required-msg');
        const link = document.getElementById('top-link');
        if (msg) {
            msg.style.display = 'block';
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

async function loadImage(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    // ログインチェック (createモードのみ必要)
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        event.target.value = ''; // ファイル選択をリセット
        checkAuth(); // 「ログイン必要」メッセージを点滅表示
        alert('ファイルを選択するにはログインが必要です。');
        return;
    }

    if (currentEditingId !== null) {
        const wantsToSave = confirm(`現在「ID: ${currentEditingId}」を編集中です。現在の編集内容を上書き保存しますか？\n\n[OK] 保存してから新規画像を読み込む\n[キャンセル] 保存せずに破棄して新規画像を読み込む`);
        if (wantsToSave) {
            const btn = document.getElementById(`btn-update-${currentEditingId}`);
            if (btn) {
                await updateRecord(currentEditingId, btn);
            }
        } else {
            // 破棄する場合は編集状態をクリアするだけ
            currentEditingId = null;
            document.querySelectorAll('[id^="btn-update-"]').forEach(btn => btn.disabled = true);
            const editContainer = document.getElementById('edit-target-container');
            const editTextArea = document.getElementById('edit-target-textarea');
            const editContentArea = document.getElementById('edit-content-textarea');
            const bulkImportTargets = document.getElementById('bulk-import-targets');
            const bulkImportContents = document.getElementById('bulk-import-contents');
            if (editContainer) editContainer.style.display = 'none';
            if (editTextArea) editTextArea.value = '';
            if (editContentArea) editContentArea.value = '';
            if (bulkImportTargets) bulkImportTargets.style.display = 'block';
            if (bulkImportContents) bulkImportContents.style.display = 'block';
        }
    } else {
        // 新規作成から別の新規作成へ移る場合も念のためクリア
        currentEditingId = null;
    }

    createOrigImgQueue = files.slice(1);
    loadSingleImage(files[0]);
    event.target.value = ''; // 連続で同じファイルを選択できるようにリセット
}

function loadSingleImage(file) {
    createOriginalFile = file;
    
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            createOriginalImg = img;
            const bgImg = document.getElementById('create-bg-img');
            bgImg.src = img.src;
            bgImg.style.display = 'block';
            setupCreateCanvas();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setupCreateCanvas() {
    document.getElementById('create-controls').style.display = 'flex';
    document.getElementById('create-canvas-container').style.display = 'block';
    toggleFixedUI(true);
    initCamera();
    
    // キャンバスのサイズを元画像と全く同じピクセル数に設定
    createCanvas.width = createOriginalImg.width;
    createCanvas.height = createOriginalImg.height;
    createCtx.clearRect(0, 0, createCanvas.width, createCanvas.height);
    
    // 履歴のリセットと初期状態の保存
    drawHistory = [];
    historyStep = -1;
    saveState();
}

function setMode(mode) {
    drawMode = mode;
    document.getElementById('btn-brush').classList.toggle('active', mode === 'brush');
    document.getElementById('btn-eraser').classList.toggle('active', mode === 'eraser');
}

// タップされた瞬間の画面上の位置（x, y）を、Canvas内のピクセル座標に正確に変換する
function getCreatePos(e) {
    const rect = createCanvas.getBoundingClientRect();
    const scaleX = createCanvas.width / rect.width;
    const scaleY = createCanvas.height / rect.height;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    // タッチイベント対応
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function startDrawing(e) {
    if (!createOriginalImg) return;
    isDrawing = true;
    draw(e);
}

// arc（円形）を用い、指定した半径でタップ位置に黒色を描画する
function draw(e) {
    if (!isDrawing) return;
    const pos = getCreatePos(e);
    
    createCtx.beginPath();
    createCtx.arc(pos.x, pos.y, brushSize, 0, Math.PI * 2);
    
    if (drawMode === 'brush') {
        createCtx.globalCompositeOperation = 'source-over';
        createCtx.fillStyle = 'rgba(0, 0, 0, 1)'; // 完全に不透明な黒
        createCtx.fill();
    } else {
        createCtx.globalCompositeOperation = 'destination-out';
        createCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        createCtx.fill();
    }
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        if (createCtx) {
            createCtx.beginPath();
        }
        saveState(); // 描画終了時に状態を保存
    }
}

// --- Undo / Redo Logic ---
function saveState() {
    historyStep++;
    // もしUndoした後に新しい描画をした場合は、その先のRedo履歴を破棄する
    if (historyStep < drawHistory.length) {
        drawHistory.length = historyStep;
    }
    
    drawHistory.push(createCanvas.toDataURL('image/png'));
    updateUndoRedoButtons();
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        restoreState();
    }
}

function redo() {
    if (historyStep < drawHistory.length - 1) {
        historyStep++;
        restoreState();
    }
}

function restoreState() {
    const img = new Image();
    img.onload = () => {
        // 現在のキャンバスをクリアして履歴の画像を再描画する
        createCtx.clearRect(0, 0, createCanvas.width, createCanvas.height);
        // source-over を明示的に指定して上書き
        createCtx.globalCompositeOperation = 'source-over';
        createCtx.drawImage(img, 0, 0);
        
        // 描画モードを元の状態に戻す（消しゴムモードだった場合への対応）
        if (drawMode === 'eraser') {
            createCtx.globalCompositeOperation = 'destination-out';
        }
    };
    img.src = drawHistory[historyStep];
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = historyStep <= 0;
    if (btnRedo) btnRedo.disabled = historyStep >= drawHistory.length - 1;
}



// --- Play Mode Logic ---

const playMaskMap = new Map();

function renderPlayList() {
    const playListEl = document.getElementById('play-list-container');
    if (!playListEl) return;
    
    const validRecords = savedRecords.filter(r => r.mask);
    
    if (validRecords.length === 0) {
        playListEl.innerHTML = '<p style="color: var(--text-secondary);">プレイ可能なデータ（マスク画像あり）がありません。</p>';
        return;
    }
    
    // ファイル名（URLの末尾）を抽出するヘルパー
    const getFileName = (url) => {
        try {
            return url.split('/').pop().split('?')[0];
        } catch(e) {
            return url;
        }
    };
    
    playListEl.innerHTML = validRecords.map((record, index) => `
        <div id="play-card-${record.id}" class="play-card" style="background: var(--card-bg); border-radius: 8px; border: 1px solid var(--glass-border); padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div>
                    <div style="font-weight: bold; color: var(--accent-color);">Question #${index + 1}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); word-break: break-all;">${getFileName(record.original)}</div>
                </div>
                <button class="btn btn-primary" id="btn-load-${record.id}" onclick="loadPlayImage(${record.id}, this)" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #3b82f6; border-color: #3b82f6;">
                    <i class="fas fa-download"></i> 画像を読み込む
                </button>
            </div>
            
            <div id="play-loading-${record.id}" style="display: none; text-align: center; padding: 3rem 1rem; color: var(--accent-color); font-weight: bold;">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <div style="margin-top: 1rem;">画像ロード中...</div>
            </div>
            
            <div id="play-content-${record.id}" style="display: none;">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 0.5rem; gap:0.5rem;">
                    <button class="btn btn-primary" onclick="toggleAllMasks(${record.id}, this)" style="padding: 0.2rem 0.8rem; font-size: 0.8rem;">
                        <i class="fas fa-eye-slash"></i> 全て非表示
                    </button>
                    <button class="btn btn-primary" onclick="switchTab('create'); editRecord(${record.id}, {suppressPopup:true})" style="padding: 0.2rem 0.8rem; font-size: 0.8rem; background:#f97316; border-color:#f97316;">
                        <i class="fas fa-edit"></i> 編集へ
                    </button>
                </div>
                <div class="play-canvas-wrapper" style="position: relative; width: 100%; border-radius: 4px; overflow: hidden; background: #000; user-select: none;">
                    <img id="play-orig-${record.id}" crossorigin="anonymous" style="display: block; width: 100%; height: auto; object-fit: contain;">
                    <canvas id="play-mask-${record.id}" style="position: absolute; top:0; left:0; width: 100%; height: 100%; cursor: pointer;"></canvas>
                </div>
                <div style="display:flex; justify-content:center; align-items:center; gap:1rem; margin-top:0.5rem;">
                    <button class="btn" id="play-prev-${record.id}" onclick="playNavigatePrev(${record.id})">← 前へ</button>
                    <div id="play-nav-error-${record.id}" style="color:#ef4444; font-weight:bold; min-width:200px; text-align:center;" aria-live="polite"></div>
                    <button class="btn" id="play-next-${record.id}" onclick="playNavigateNext(${record.id})">次へ →</button>
                </div>
                <p style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">
                    画像をタップして、その箇所の黒塗りの表示/非表示を切り替え
                </p>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--glass-border);">
                    <label style="font-size: 0.8rem; font-weight: bold; margin-bottom: 0.25rem; display: block;">Target:</label>
                    <textarea id="play-target-${record.id}" style="width: 100%; height: 40px; font-size: 0.8rem; padding: 0.5rem; border: 1px solid var(--glass-border); border-radius: 4px; background: var(--bg-color); color: var(--text-color); margin-bottom: 0.5rem;">${record.target || ''}</textarea>
                    <label style="font-size: 0.8rem; font-weight: bold; margin-bottom: 0.25rem; display: block;">Content:</label>
                    <textarea id="play-content-text-${record.id}" style="width: 100%; height: 40px; font-size: 0.8rem; padding: 0.5rem; border: 1px solid var(--glass-border); border-radius: 4px; background: var(--bg-color); color: var(--text-color); margin-bottom: 0.5rem;">${record.content || ''}</textarea>
                    <div style="text-align: right; display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn btn-primary" onclick="saveToEz2(${record.id}, this)" style="padding: 0.3rem 0.8rem; font-size: 0.8rem; background: #8b5cf6; border-color: #8b5cf6;">
                            <i class="fas fa-file-import"></i> ez2へ保存
                        </button>
                        <button class="btn btn-primary" onclick="savePlayTargetContent(${record.id}, this)" style="padding: 0.3rem 0.8rem; font-size: 0.8rem; background: #10b981; border-color: #10b981;">
                            <i class="fas fa-save"></i> テキスト保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    // 画像は一括で読み込まず、ユーザーが「読み込む」ボタンを押すまで待機する
    playMaskMap.clear();
}

function loadPlayImage(id, btn) {
    const record = savedRecords.find(r => r.id === id);
    if (!record) return;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 読込中...';
    }
    
    const contentDiv = document.getElementById(`play-content-${id}`);
    const loadingDiv = document.getElementById(`play-loading-${id}`);
    const origImg = document.getElementById(`play-orig-${id}`);
    const canvas = document.getElementById(`play-mask-${id}`);
    
    if (loadingDiv && contentDiv.style.display === 'none') {
        loadingDiv.style.display = 'block';
    }
    
    const maskImg = new Image();
    maskImg.crossOrigin = "anonymous";
    
    const setup = () => {
        if (maskImg.complete && maskImg.naturalWidth > 0) {
            drawPlayCanvas(record, origImg, maskImg, canvas);
            if (loadingDiv) loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
            if (btn) btn.style.display = 'none';
            // clear loading indicator
            const navErr = document.getElementById(`play-nav-error-${id}`);
            if (navErr) navErr.textContent = '';
        } else {
            maskImg.onload = () => {
                drawPlayCanvas(record, origImg, maskImg, canvas);
                if (loadingDiv) loadingDiv.style.display = 'none';
                contentDiv.style.display = 'block';
                if (btn) btn.style.display = 'none';
                const navErr = document.getElementById(`play-nav-error-${id}`);
                if (navErr) navErr.textContent = '';
            };
            maskImg.onerror = () => {
                if (loadingDiv) loadingDiv.style.display = 'none';
                showTransientError(`play-nav-error-${id}`, '画像ロードに失敗しました');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> 画像を読み込む'; }
            };
        }
    };
    
    if (origImg.complete && origImg.naturalWidth > 0) {
        setup();
    } else {
        origImg.onload = setup;
    }
    
    // 実際に画像のダウンロードを開始
    // もしプリフェッチ済みならそれを使う
    const cached = playPrefetchCache.get(id);
    if (cached) {
        origImg.src = cached.origUrl;
        maskImg.src = cached.maskUrl;
    } else {
        origImg.src = record.original;
        maskImg.src = record.mask;
    }

    origImg.onerror = () => {
        if (loadingDiv) loadingDiv.style.display = 'none';
        showTransientError(`play-nav-error-${id}`, '画像ロードに失敗しました');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> 画像を読み込む'; }
    };

    // 起動後に次をプリフェッチ
    const idx = savedRecords.findIndex(r => r.id === id);
    if (idx !== -1) {
        prefetchPlayAtIndex(idx + 1);
    }
}

function prefetchPlayAtIndex(index) {
    if (index < 0 || index >= savedRecords.length) return;
    const rec = savedRecords[index];
    const id = rec.id;

    // 既存のコントローラがあればキャンセル
    if (prefetchControllers.has(id)) {
        try { prefetchControllers.get(id).abort(); } catch (e) {}
        prefetchControllers.delete(id);
    }

    const controller = new AbortController();
    prefetchControllers.set(id, controller);

    // 3秒タイムアウト
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    (async () => {
        try {
            const [origResp, maskResp] = await Promise.all([
                fetch(rec.original, { signal: controller.signal }),
                fetch(rec.mask, { signal: controller.signal })
            ]);
            if (!origResp.ok || !maskResp.ok) throw new Error('prefetch failed');
            const origBlob = await origResp.blob();
            const maskBlob = await maskResp.blob();
            const origUrl = URL.createObjectURL(origBlob);
            const maskUrl = URL.createObjectURL(maskBlob);
            playPrefetchCache.set(id, { origUrl, maskUrl });
        } catch (e) {
            console.warn('Prefetch failed for id', id, e);
        } finally {
            clearTimeout(timeoutId);
            prefetchControllers.delete(id);
        }
    })();
}

function getSavedIndexById(id) {
    return savedRecords.findIndex(r => r.id === id);
}

async function createNavigateNext() {
    if (currentEditingId === null) return;
    const idx = getSavedIndexById(currentEditingId);
    if (idx === -1) return;
    const nextIdx = idx + 1;
    if (nextIdx >= savedRecords.length) return;

    const prevId = currentEditingId;
    const prevTarget = document.getElementById('edit-target-textarea') ? document.getElementById('edit-target-textarea').value.trim() : '';
    const prevContent = document.getElementById('edit-content-textarea') ? document.getElementById('edit-content-textarea').value.trim() : '';
    const prevMaskData = createCanvas.toDataURL('image/png');

    // グレーアウトして二重押下を防止
    const prevBtn = document.getElementById('create-prev-btn');
    const nextBtn = document.getElementById('create-next-btn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    // 先に次の編集画面を即座に表示
    const nextId = savedRecords[nextIdx].id;
    editRecord(nextId, {suppressPopup:true});

    // バックグラウンドで保存
    const ok = await autoSaveWithData(prevId, prevMaskData, prevTarget, prevContent);
    if (!ok) showTransientError('create-nav-error', '保存に失敗しました');

    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
}

async function createNavigatePrev() {
    if (currentEditingId === null) return;
    const idx = getSavedIndexById(currentEditingId);
    if (idx === -1) return;
    const prevIdx = idx - 1;
    if (prevIdx < 0) return;

    const prevId = currentEditingId;
    const prevTarget = document.getElementById('edit-target-textarea') ? document.getElementById('edit-target-textarea').value.trim() : '';
    const prevContent = document.getElementById('edit-content-textarea') ? document.getElementById('edit-content-textarea').value.trim() : '';
    const prevMaskData = createCanvas.toDataURL('image/png');

    const prevBtn = document.getElementById('create-prev-btn');
    const nextBtn = document.getElementById('create-next-btn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    const targetId = savedRecords[prevIdx].id;
    editRecord(targetId, {suppressPopup:true});

    const ok = await autoSaveWithData(prevId, prevMaskData, prevTarget, prevContent);
    if (!ok) showTransientError('create-nav-error', '保存に失敗しました');

    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
}

function playNavigateNext(id) {
    const idx = getSavedIndexById(id);
    if (idx === -1) return;
    const nextIdx = idx + 1;
    if (nextIdx >= savedRecords.length) return;
    const nextId = savedRecords[nextIdx].id;
    // Cancel prefetch for this id if any
    if (prefetchControllers.has(id)) {
        try { prefetchControllers.get(id).abort(); } catch(e){}
        prefetchControllers.delete(id);
    }
    // Scroll to the target play card/content
    const targetContent = document.getElementById(`play-card-${nextId}`);
    if (targetContent && targetContent.scrollIntoView) targetContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
    loadPlayImage(nextId, document.getElementById(`btn-load-${nextId}`));
}

function playNavigatePrev(id) {
    const idx = getSavedIndexById(id);
    if (idx === -1) return;
    const prevIdx = idx - 1;
    if (prevIdx < 0) return;
    const prevId = savedRecords[prevIdx].id;
    const targetContent = document.getElementById(`play-card-${prevId}`);
    if (targetContent && targetContent.scrollIntoView) targetContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
    loadPlayImage(prevId, document.getElementById(`btn-load-${prevId}`));
}

function playNavigateNextActive() {
    const nodes = document.querySelectorAll('[id^="play-content-"]');
    let visible = null;
    nodes.forEach(n => { if (n.style && n.style.display === 'block') visible = n; });
    if (!visible) return;
    const id = parseInt(visible.id.replace('play-content-', ''), 10);
    playNavigateNext(id);
}

function playNavigatePrevActive() {
    const nodes = document.querySelectorAll('[id^="play-content-"]');
    let visible = null;
    nodes.forEach(n => { if (n.style && n.style.display === 'block') visible = n; });
    if (!visible) return;
    const id = parseInt(visible.id.replace('play-content-', ''), 10);
    playNavigatePrev(id);
}

function createOpenInPlay() {
    if (currentEditingId === null) return;
    const id = currentEditingId;
    // 移動前にcreateを閉じる/切替してplayリストを描画
    switchTab('play');
    // renderPlayList は switchTab('play') 内で呼ばれるため、ここでボタンを取得してロードを呼ぶ
    const btn = document.getElementById(`btn-load-${id}`);
    // ボタンが見つからない場合でも loadPlayImage は btn をオプションで受け取れるように保護済み
    loadPlayImage(id, btn);
}

function drawPlayCanvas(record, origImg, maskImg, canvas) {
    canvas.width = origImg.naturalWidth;
    canvas.height = origImg.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
    
    const origData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // クラウド側でのフォーマット変換(JPG等)や白背景PNG対策として、
    // 白・透明ピクセルは完全に透明化し、黒い部分は完全な不透明黒に補正する
    const oPixels = origData.data;
    const cPixels = currentData.data;
    const len = oPixels.length;
    
    for (let i = 0; i < len; i += 4) {
        const r = oPixels[i];
        const g = oPixels[i+1];
        const b = oPixels[i+2];
        const a = oPixels[i+3];
        
        // 白っぽい背景、または元から透明な部分は「マスクなし（透明）」とする
        if (a < 50 || (r > 200 && g > 200 && b > 200)) {
            oPixels[i+3] = 0;
            cPixels[i+3] = 0;
        } else {
            // 黒っぽい部分は確実に黒塗り(アルファ255)として描画する
            oPixels[i] = 0;
            oPixels[i+1] = 0;
            oPixels[i+2] = 0;
            oPixels[i+3] = 255;
            
            cPixels[i] = 0;
            cPixels[i+1] = 0;
            cPixels[i+2] = 0;
            cPixels[i+3] = 255;
        }
    }
    
    // 補正したデータをキャンバスに反映
    ctx.putImageData(currentData, 0, 0);
    
    playMaskMap.set(record.id, {
        origData,
        currentData,
        width: canvas.width,
        height: canvas.height,
        canvas,
        ctx,
        isAllHidden: false
    });
    
    canvas.onclick = (e) => handlePlayCanvasClick(e, record.id);
}

function getContiguousRegion(imgData, startX, startY, width, height) {
    const pixels = imgData.data;
    const startIndex = (startY * width + startX) * 4;
    
    if (pixels[startIndex + 3] === 0) return null; // 透明な部分は無視

    const visited = new Uint8Array(width * height);
    const regionIndices = [];
    
    const queueX = new Int32Array(width * height);
    const queueY = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    
    queueX[tail] = startX;
    queueY[tail] = startY;
    tail++;
    
    visited[startY * width + startX] = 1;

    while(head < tail) {
        const x = queueX[head];
        const y = queueY[head];
        head++;
        
        const idx = (y * width + x) * 4;
        regionIndices.push(idx);

        if (x + 1 < width && !visited[y * width + (x + 1)]) {
            visited[y * width + (x + 1)] = 1;
            if (pixels[(y * width + (x + 1)) * 4 + 3] > 0) {
                queueX[tail] = x + 1; queueY[tail] = y; tail++;
            }
        }
        if (x - 1 >= 0 && !visited[y * width + (x - 1)]) {
            visited[y * width + (x - 1)] = 1;
            if (pixels[(y * width + (x - 1)) * 4 + 3] > 0) {
                queueX[tail] = x - 1; queueY[tail] = y; tail++;
            }
        }
        if (y + 1 < height && !visited[(y + 1) * width + x]) {
            visited[(y + 1) * width + x] = 1;
            if (pixels[((y + 1) * width + x) * 4 + 3] > 0) {
                queueX[tail] = x; queueY[tail] = y + 1; tail++;
            }
        }
        if (y - 1 >= 0 && !visited[(y - 1) * width + x]) {
            visited[(y - 1) * width + x] = 1;
            if (pixels[((y - 1) * width + x) * 4 + 3] > 0) {
                queueX[tail] = x; queueY[tail] = y - 1; tail++;
            }
        }
    }
    return regionIndices;
}

function handlePlayCanvasClick(e, id) {
    const dataObj = playMaskMap.get(id);
    if (!dataObj) return;
    
    const rect = dataObj.canvas.getBoundingClientRect();
    const scaleX = dataObj.width / rect.width;
    const scaleY = dataObj.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    if (x < 0 || y < 0 || x >= dataObj.width || y >= dataObj.height) return;
    
    const origPixels = dataObj.origData.data;
    const idx = (y * dataObj.width + x) * 4;
    
    if (origPixels[idx + 3] === 0) return; 
    
    const curPixels = dataObj.currentData.data;
    const isCurrentlyVisible = curPixels[idx + 3] > 0;
    
    const regionIndices = getContiguousRegion(dataObj.origData, x, y, dataObj.width, dataObj.height);
    if (!regionIndices) return;
    
    for (let i = 0; i < regionIndices.length; i++) {
        const pIdx = regionIndices[i];
        if (isCurrentlyVisible) {
            curPixels[pIdx + 3] = 0; // Hide
        } else {
            curPixels[pIdx] = origPixels[pIdx];
            curPixels[pIdx + 1] = origPixels[pIdx + 1];
            curPixels[pIdx + 2] = origPixels[pIdx + 2];
            curPixels[pIdx + 3] = origPixels[pIdx + 3]; // Show
        }
    }
    
    dataObj.ctx.putImageData(dataObj.currentData, 0, 0);
}

function toggleAllMasks(id, btn) {
    const dataObj = playMaskMap.get(id);
    if (!dataObj) return;
    
    dataObj.isAllHidden = !dataObj.isAllHidden;
    
    const curPixels = dataObj.currentData.data;
    const origPixels = dataObj.origData.data;
    const len = curPixels.length;
    
    for (let i = 0; i < len; i += 4) {
        if (origPixels[i + 3] > 0) { 
            if (dataObj.isAllHidden) {
                curPixels[i + 3] = 0; 
            } else {
                curPixels[i] = origPixels[i];
                curPixels[i+1] = origPixels[i+1];
                curPixels[i+2] = origPixels[i+2];
                curPixels[i+3] = origPixels[i+3];
            }
        }
    }
    
    dataObj.ctx.putImageData(dataObj.currentData, 0, 0);
    
    if (dataObj.isAllHidden) {
        btn.innerHTML = '<i class="fas fa-eye"></i> 全て表示';
    } else {
        btn.innerHTML = '<i class="fas fa-eye-slash"></i> 全て非表示';
    }
}

async function savePlayTargetContent(id, btn) {
    if (!checkAuth()) return;
    
    const targetVal = document.getElementById(`play-target-${id}`).value.trim();
    const contentVal = document.getElementById(`play-content-text-${id}`).value.trim();
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
    
    try {
        const formData = new FormData();
        formData.append('target', targetVal);
        formData.append('content', contentVal);
        
        const response = await fetch(`${API_BASE_URL}/fill_image/${id}`, {
            method: 'PUT',
            headers: {
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: formData
        });
        
        if (!response.ok) throw new Error('Update failed');
        const result = await response.json();
        
        const idx = savedRecords.findIndex(r => r.id === id);
        if (idx !== -1) {
            savedRecords[idx].target = result.item && result.item.target !== undefined ? result.item.target : targetVal;
            savedRecords[idx].content = result.item && result.item.content !== undefined ? result.item.content : contentVal;
        }
        
        alert('テキストを保存しました！');
    } catch (e) {
        console.error('Update error:', e);
        alert('保存に失敗しました。');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function saveToEz2(id, btn) {
    if (!checkAuth()) return;
    
    const targetVal = document.getElementById(`play-target-${id}`).value.trim();
    const contentVal = document.getElementById(`play-content-text-${id}`).value.trim();
    
    if (!contentVal || !targetVal) {
        alert("ez2に保存するには、Content(Sentence)とTarget(Words to hide)の両方を入力してください。");
        return;
    }

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ez2保存中...';
    
    try {
        const payload = {
            id: Date.now().toString(),
            question: contentVal.replace(/[\r\n]+/g, ''),
            answer: targetVal
        };
        
        const response = await fetch(`${API_BASE_URL}/fill_in_the_blank`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('ez2 upload failed');
        
        alert('ez2へのデータ保存に成功しました！');
    } catch (e) {
        console.error('ez2 Update error:', e);
        alert('ez2への保存に失敗しました。');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- List Save Logic ---

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

async function loadData() {
    if (!AUTH_USER_ID) return;
    try {
        const myDataOnlyToggle = document.getElementById('my-data-only-toggle');
        const isMyDataOnly = myDataOnlyToggle ? myDataOnlyToggle.checked : true;
        
        let url = `${API_BASE_URL}/fill_image`;
        if (isMyDataOnly) {
            url = `${API_BASE_URL}/fill_image/user/${AUTH_USER_ID}`;
        }
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load data');
        const data = await res.json();
        
        savedRecords = data.map(item => ({
            id: item.id,
            original: item.original,
            mask: item.mask,
            target: item.target || '',
            content: item.content || '',
            timestamp: new Date().toLocaleTimeString() // DBからロードした時刻として表示
        }));
        
        renderSavedList();
        renderPlayList();
        renderDbList();
    } catch (e) {
        console.error('Data load error:', e);
    }
}

function handleToggleMyData() {
    loadData();
}

async function saveRecord() {
    // 編集モード中の場合は「上書き保存」アクションにリダイレクト
    if (currentEditingId !== null) {
        const btn = document.getElementById(`btn-update-${currentEditingId}`);
        if (btn) {
            updateRecord(currentEditingId, btn);
        } else {
            // fallback if button not found for some reason
            alert('上書き保存ボタンが見つかりません。');
        }
        return;
    }

    if (!createOriginalImg || !createOriginalFile) {
        alert('元画像がありません。');
        return;
    }
    
    // 現在のCanvasの描画状態（マスク）をDataURL化しBlobに変換
    const maskDataUrl = createCanvas.toDataURL('image/png');
    const maskBlob = dataURLtoBlob(maskDataUrl);
    
    const record = {
        id: `temp-${Date.now()}`,
        isTemp: true,
        originalFile: createOriginalFile,
        maskBlob: maskBlob,
        originalSrc: createOriginalImg.src,
        maskSrc: maskDataUrl,
        timestamp: new Date().toLocaleTimeString(),
        name: createOriginalFile.name || '手書き作成'
    };
    
    tempRecords.push(record);
    renderSavedList();
    
    if (createOrigImgQueue.length > 0) {
        const nextFile = createOrigImgQueue.shift();
        alert(`リスト（一時保存）に追加しました。\n続いてキューの次の画像（${nextFile.name}）を読み込みます。`);
        loadSingleImage(nextFile);
    } else {
        alert('リスト（一時保存）に追加しました！');
    }
}

async function handleBulkImport(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        alert('インポートにはログインが必要です。');
        event.target.value = '';
        return;
    }

    if (currentEditingId !== null) {
        const wantsToSave = confirm(`現在「ID: ${currentEditingId}」を編集中です。現在の編集内容を上書き保存しますか？\n\n[OK] 保存してから一括インポートへ進む\n[キャンセル] 保存せずに破棄して一括インポートへ進む`);
        if (wantsToSave) {
            const btn = document.getElementById(`btn-update-${currentEditingId}`);
            if (btn) {
                await updateRecord(currentEditingId, btn);
            }
        } else {
            // 破棄する場合は編集状態をクリアするだけ
            currentEditingId = null;
            document.querySelectorAll('[id^="btn-update-"]').forEach(btn => btn.disabled = true);
            const editContainer = document.getElementById('edit-target-container');
            const editTextArea = document.getElementById('edit-target-textarea');
            const editContentArea = document.getElementById('edit-content-textarea');
            const bulkImportTargets = document.getElementById('bulk-import-targets');
            const bulkImportContents = document.getElementById('bulk-import-contents');
            if (editContainer) editContainer.style.display = 'none';
            if (editTextArea) editTextArea.value = '';
            if (editContentArea) editContentArea.value = '';
            if (bulkImportTargets) bulkImportTargets.style.display = 'block';
            if (bulkImportContents) bulkImportContents.style.display = 'block';
        }
    }

    const originalMap = new Map(); // key: baseName
    const maskMap = new Map();     // key: baseName
    
    for (const file of files) {
        const name = file.name;
        // filename-original.ext
        const origMatch = name.match(/^(.*)-original\.[a-zA-Z0-9]+$/);
        // filename-mask.png
        const maskMatch = name.match(/^(.*)-mask\.png$/);
        
        if (origMatch) {
            originalMap.set(origMatch[1], file);
        } else if (maskMatch) {
            if (file.type !== 'image/png') {
                alert(`エラー: マスク画像(${name})はPNG形式である必要があります。`);
                event.target.value = '';
                return;
            }
            maskMap.set(maskMatch[1], file);
        }
    }
    
    const validPairs = [];
    
    for (const [baseName, origFile] of originalMap.entries()) {
        const maskFile = maskMap.get(baseName);
        if (maskFile) {
            validPairs.push({ baseName, origFile, maskFile });
        }
    }
    
    if (validPairs.length === 0) {
        alert('有効なペア（「○○-original.拡張子」と「○○-mask.png」）が見つかりませんでした。');
        event.target.value = '';
        return;
    }
    
    const getImageDims = (file) => {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error(`画像の読み込みに失敗しました: ${file.name}`));
            };
            img.src = url;
        });
    };
    
    const passedPairs = [];
    
    for (const pair of validPairs) {
        try {
            const origDims = await getImageDims(pair.origFile);
            const maskDims = await getImageDims(pair.maskFile);
            
            if (origDims.width !== maskDims.width || origDims.height !== maskDims.height) {
                alert(`エラー: ペア「${pair.baseName}」の画像サイズが一致しません。\nOriginal: ${origDims.width}x${origDims.height}\nMask: ${maskDims.width}x${maskDims.height}`);
                event.target.value = '';
                return; 
            }
            passedPairs.push(pair);
        } catch (err) {
            alert(err.message);
            event.target.value = '';
            return;
        }
    }
    
    if (!confirm(`${passedPairs.length}ペア（計${passedPairs.length * 2}ファイル）の画像をインポートしますか？\n※アップロードには少し時間がかかる場合があります。`)) {
        event.target.value = '';
        return;
    }
    
    let successCount = 0;
    
    for (const pair of passedPairs) {
        const origUrl = URL.createObjectURL(pair.origFile);
        const maskUrl = URL.createObjectURL(pair.maskFile);
        
        tempRecords.push({
            id: `temp-${Date.now()}-${Math.random()}`,
            isTemp: true,
            originalFile: pair.origFile,
            maskBlob: pair.maskFile,
            originalSrc: origUrl,
            maskSrc: maskUrl,
            timestamp: new Date().toLocaleTimeString(),
            name: pair.baseName
        });
    }
    
    renderSavedList();
    alert(`${passedPairs.length}ペアを一時保存リストに追加しました。\n「全てアップロード」または「個別アップロード」でサーバーへ保存してください。`);
    event.target.value = '';
}

async function handleBulkImportOriginals(event) {
    try {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        
        if (!AUTH_USER_ID || !AUTH_PASSWORD) {
            alert('追加にはログインが必要です。');
            event.target.value = '';
            return;
        }

        if (currentEditingId !== null) {
            const wantsToSave = confirm(`現在「ID: ${currentEditingId}」を編集中です。現在の編集内容を上書き保存しますか？\n\n[OK] 保存してから一括追加へ進む\n[キャンセル] 保存せずに破棄して一括追加へ進む`);
            if (wantsToSave) {
                const btn = document.getElementById(`btn-update-${currentEditingId}`);
                if (btn) {
                    await updateRecord(currentEditingId, btn);
                }
            } else {
                currentEditingId = null;
                document.querySelectorAll('[id^="btn-update-"]').forEach(btn => btn.disabled = true);
                const editContainer = document.getElementById('edit-target-container');
                const editTextArea = document.getElementById('edit-target-textarea');
                const editContentArea = document.getElementById('edit-content-textarea');
                const bulkImportTargets = document.getElementById('bulk-import-targets');
                const bulkImportContents = document.getElementById('bulk-import-contents');
                if (editContainer) editContainer.style.display = 'none';
                if (editTextArea) editTextArea.value = '';
                if (editContentArea) editContentArea.value = '';
                if (bulkImportTargets) bulkImportTargets.style.display = 'block';
                if (bulkImportContents) bulkImportContents.style.display = 'block';
            }
        }

        if (!confirm(`${files.length}件の画像をインポートしますか？\n※アップロードには少し時間がかかる場合があります。`)) {
            event.target.value = '';
            return;
        }
        
        for (const file of files) {
            const origUrl = URL.createObjectURL(file);
            
            tempRecords.push({
                id: `temp-${Date.now()}-${Math.random()}`,
                isTemp: true,
                originalFile: file,
                maskBlob: null,
                originalSrc: origUrl,
                maskSrc: null,
                timestamp: new Date().toLocaleTimeString(),
                name: file.name
            });
        }
        
        renderSavedList();
        alert(`${files.length}件を一時保存リストに追加しました。\n「全てアップロード」または「個別アップロード」でサーバーへ保存してください。`);
        event.target.value = '';
    } catch (error) {
        console.error("オリジナル画像一括追加エラー:", error);
        alert("画像の追加中にエラーが発生しました。");
        event.target.value = '';
    }
}

function renderSavedList() {
    const listEl = document.getElementById('saved-list');
    if (!listEl) return;
    
    if (tempRecords.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-secondary);">一時保存されたデータはありません。</p>';
        return;
    }
    
    let html = `
        <div style="margin-bottom: 1rem; text-align: right;">
            <button id="btn-upload-all" class="btn btn-primary" onclick="uploadAllTempRecords()" style="padding: 0.5rem 1rem;">
                <i class="fas fa-cloud-upload-alt"></i> 全てアップロード
            </button>
        </div>
    `;
    
    html += tempRecords.map((record, index) => `
        <div style="display: flex; align-items: center; gap: 1rem; background: var(--card-bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--glass-border);">
            <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent-color); width: 30px;">#${index + 1}</div>
            
            <div style="position: relative; width: 80px; height: 80px; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);">
                <img src="${record.originalSrc}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain;">
                ${record.maskSrc ? `<img src="${record.maskSrc}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain;">` : ''}
            </div>
            
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 0.9rem;">${record.name || '名称未設定'}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">追加時刻: ${record.timestamp}</div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn btn-primary" onclick="uploadTempRecord('${record.id}', this)" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                    <i class="fas fa-cloud-upload-alt"></i> アップロード
                </button>
                <button class="btn" onclick="deleteTempRecord('${record.id}')" style="color: var(--danger); border-color: var(--danger); background: rgba(239, 68, 68, 0.1); padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                    <i class="fas fa-trash"></i> リストから削除
                </button>
            </div>
        </div>
    `).join('');
    
    listEl.innerHTML = html;
}

function deleteTempRecord(tempId) {
    tempRecords = tempRecords.filter(r => r.id !== tempId);
    renderSavedList();
}

async function uploadTempRecord(tempId, buttonEl, skipRender = false) {
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        alert('サーバー保存にはログインが必要です。');
        return false;
    }
    const idx = tempRecords.findIndex(r => r.id === tempId);
    if (idx === -1) return false;
    const record = tempRecords[idx];
    
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> アップロード中...';
    }
    
    try {
        const formData = new FormData();
        let endpoint = `${API_BASE_URL}/fill_image`;
        
        if (record.maskBlob) {
            formData.append('original', record.originalFile);
            formData.append('mask', record.maskBlob, 'mask.png');
        } else {
            formData.append('files', record.originalFile);
            endpoint = `${API_BASE_URL}/upload-originals`;
            
            const targetTextarea = document.getElementById('bulk-import-targets');
            if (targetTextarea && targetTextarea.value.trim() !== '') {
                formData.append('target', targetTextarea.value.trim());
            }
            const contentTextarea = document.getElementById('bulk-import-contents');
            if (contentTextarea && contentTextarea.value.trim() !== '') {
                formData.append('content', contentTextarea.value.trim());
            }
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        const result = await response.json();
        
        if (record.maskBlob) {
            if (result.item && result.item.original && result.item.mask) {
                tempRecords.splice(idx, 1);
                
                savedRecords.push({
                    id: result.item.id,
                    original: result.item.original,
                    mask: result.item.mask,
                    timestamp: new Date().toLocaleTimeString()
                });
                
                if (!skipRender) {
                    renderSavedList();
                    renderDbList();
                    renderPlayList();
                }
                return true;
            }
        } else {
            tempRecords.splice(idx, 1);
            if (!skipRender) {
                await loadData();
            }
            return true;
        }
    } catch (e) {
        console.error(e);
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> アップロード';
        }
        alert('アップロードに失敗しました。');
        return false;
    }
}

async function uploadAllTempRecords() {
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        alert('サーバー保存にはログインが必要です。');
        return;
    }
    if (tempRecords.length === 0) return;
    
    const btn = document.getElementById('btn-upload-all');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 全てアップロード中...';
    }
    
    let successCount = 0;
    const tempIds = tempRecords.map(r => r.id);
    
    for (const id of tempIds) {
        const success = await uploadTempRecord(id, null, true);
        if (success) successCount++;
    }
    
    await loadData(); // Reload all to get updated DB items
    
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> 全てアップロード';
    }
    
    if (successCount > 0) {
        alert(`${successCount}/${tempIds.length} ペアのサーバー保存が完了しました。`);
    }
}

async function deleteRecord(id) {
    if (!checkAuth()) return;

    if (!confirm('本当に削除しますか？')) return;

    // UI上で即時反映
    const originalRecords = [...savedRecords];
    savedRecords = savedRecords.filter(r => r.id !== id);
    renderSavedList();
    renderDbList();
    renderPlayList();
    
    try {
        const response = await fetch(`${API_BASE_URL}/fill_image/${id}`, {
            method: 'DELETE',
            headers: {
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            }
        });
        
        if (!response.ok) {
            throw new Error('Server deletion failed');
        }
    } catch (e) {
        console.error('Delete error:', e);
        alert('削除に失敗しました。');
        // 失敗した場合はリストを元に戻す
        savedRecords = originalRecords;
        renderSavedList();
        renderDbList();
        renderPlayList();
    }
}

let dbSelectAllState = false;

function toggleAllDbRecords() {
    dbSelectAllState = !dbSelectAllState;
    const checkboxes = document.querySelectorAll('.db-record-checkbox');
    checkboxes.forEach(cb => cb.checked = dbSelectAllState);
}

async function deleteSelectedDbRecords() {
    if (!checkAuth()) return;

    const checkboxes = document.querySelectorAll('.db-record-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('削除するアイテムを選択してください。');
        return;
    }

    if (!confirm(`${checkboxes.length}件のデータを本当に一括削除しますか？\n(CDNからも削除されます)`)) return;

    // UI上で即時反映
    const idsToDelete = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
    const originalRecords = [...savedRecords];
    savedRecords = savedRecords.filter(r => !idsToDelete.includes(r.id));
    renderSavedList();
    renderDbList();
    renderPlayList();
    
    let errorCount = 0;
    
    // DBとCDNから削除 (1ペア削除のAPIを順次呼び出し)
    for (const id of idsToDelete) {
        try {
            const response = await fetch(`${API_BASE_URL}/fill_image/${id}`, {
                method: 'DELETE',
                headers: {
                    'user_id': AUTH_USER_ID,
                    'password': AUTH_PASSWORD
                }
            });
            
            if (!response.ok) {
                errorCount++;
            }
        } catch (e) {
            console.error(`Delete error for ID ${id}:`, e);
            errorCount++;
        }
    }
    
    if (errorCount > 0) {
        alert(`${errorCount}件の削除に失敗しました。リストを再読み込みします。`);
        loadData();
    }
}

function renderDbList() {
    const listEl = document.getElementById('db-list');
    if (!listEl) return;
    
    if (savedRecords.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-secondary);">サーバーに保存されたデータはありません。</p>';
        return;
    }
    
    // ファイル名（URLの末尾）を抽出するヘルパー
    const getFileName = (url) => {
        try {
            return url.split('/').pop().split('?')[0];
        } catch(e) {
            return url;
        }
    };
    
    listEl.innerHTML = savedRecords.map((record, index) => `
        <div id="db-record-${record.id}" style="display: flex; align-items: center; gap: 1rem; background: var(--card-bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--glass-border);">
            <input type="checkbox" class="db-record-checkbox" value="${record.id}" style="width: 20px; height: 20px; cursor: pointer; flex-shrink: 0;">
            <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent-color); width: 30px;">#${index + 1}</div>
            
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden;">
                <div style="font-size: 0.9rem; font-weight: bold; margin-bottom: 0.2rem;">ファイル: ${getFileName(record.original)}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">ID: ${record.id}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">保存時刻: ${record.timestamp}</div>
                
                <div id="preview-container-${record.id}" style="display: none; margin-top: 10px; position: relative; width: 100px; height: 100px; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);">
                    <img id="preview-orig-${record.id}" crossorigin="anonymous" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain;">
                    <img id="preview-mask-${record.id}" crossorigin="anonymous" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain;">
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn btn-primary" onclick="showPreview(${record.id}, this)" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #8b5cf6; border-color: #8b5cf6;">
                    <i class="fas fa-image"></i> プレビュー
                </button>
                <button class="btn btn-primary" onclick="editRecord(${record.id})" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #3b82f6; border-color: #3b82f6;">
                    <i class="fas fa-edit"></i> 編集
                </button>
                <button class="btn btn-primary" onclick="updateRecord(${record.id}, this)" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #10b981; border-color: #10b981;" id="btn-update-${record.id}" disabled>
                    <i class="fas fa-save"></i> 上書き保存
                </button>
                <button class="btn" onclick="deleteRecord(${record.id})" style="color: var(--danger); border-color: var(--danger); background: rgba(239, 68, 68, 0.1); padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                    <i class="fas fa-trash"></i> 削除
                </button>
            </div>
        </div>
    `).join('');
}

// 画像データをプレビューと編集モードで共有するためのヘルパー
function loadSharedImage(record, type) {
    return new Promise((resolve) => {
        const cacheKey = type === 'original' ? '_loadedOrigImg' : '_loadedMaskImg';
        const url = type === 'original' ? record.original : record.mask;

        if (!url) {
            resolve(null);
            return;
        }

        if (record[cacheKey] && record[cacheKey].complete && record[cacheKey].naturalWidth > 0) {
            resolve(record[cacheKey]);
            return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            record[cacheKey] = img;
            resolve(img);
        };
        img.onerror = () => {
            console.error("Image load error:", url);
            resolve(null);
        };
        img.src = url;
    });
}

function showPreview(id, btn) {
    const record = savedRecords.find(r => r.id === id);
    if (!record) return;

    const container = document.getElementById(`preview-container-${id}`);
    if (!container) return;

    if (container.style.display === 'none') {
        const origImg = document.getElementById(`preview-orig-${id}`);
        const maskImg = document.getElementById(`preview-mask-${id}`);
        
        loadSharedImage(record, 'original').then(loadedOrig => {
            if (loadedOrig) origImg.src = loadedOrig.src;
            if (record.mask) {
                loadSharedImage(record, 'mask').then(loadedMask => {
                    if (loadedMask) {
                        maskImg.src = loadedMask.src;
                        maskImg.style.display = 'block';
                    }
                });
            } else {
                maskImg.style.display = 'none';
            }
        });

        container.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-image"></i> プレビュー非表示';
    } else {
        container.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-image"></i> プレビュー';
    }
}

function editRecord(id, options) {
    if (!checkAuth()) return;

    const record = savedRecords.find(r => r.id === id);
    if (!record) return;

    currentEditingId = id;

    // 自動スクロール処理
    const listEl = document.getElementById('db-list');
    const recordEl = document.getElementById(`db-record-${id}`);
    if (listEl && recordEl) {
        listEl.scrollTo({
            top: recordEl.offsetTop,
            behavior: 'smooth'
        });
    }

    document.querySelectorAll('[id^="btn-update-"]').forEach(btn => btn.disabled = true);
    const updateBtn = document.getElementById(`btn-update-${id}`);
    if (updateBtn) updateBtn.disabled = false;

    const editContainer = document.getElementById('edit-target-container');
    const editTextArea = document.getElementById('edit-target-textarea');
    const editContentArea = document.getElementById('edit-content-textarea');
    const bulkImportTargets = document.getElementById('bulk-import-targets');
    const bulkImportContents = document.getElementById('bulk-import-contents');
    if (editContainer && editTextArea && editContentArea) {
        editContainer.style.display = 'block';
        editTextArea.value = record.target || '';
        editContentArea.value = record.content || '';
    }
    if (bulkImportTargets) {
        bulkImportTargets.style.display = 'none';
    }
    if (bulkImportContents) {
        bulkImportContents.style.display = 'none';
    }

    loadSharedImage(record, 'original').then(origImg => {
        if (!origImg) return;

        createOriginalImg = origImg;

        const bgImg = document.getElementById('create-bg-img');
        bgImg.src = origImg.src;
        bgImg.style.display = 'block';

        document.getElementById('create-controls').style.display = 'flex';
        document.getElementById('create-canvas-container').style.display = 'block';
        toggleFixedUI(true);
        initCamera();

        createCanvas.width = origImg.width;
        createCanvas.height = origImg.height;

        if (record.mask) {
            loadSharedImage(record, 'mask').then(maskImg => {
                if (!maskImg) return;
                
                createCtx.clearRect(0, 0, createCanvas.width, createCanvas.height);
                createCtx.drawImage(maskImg, 0, 0, createCanvas.width, createCanvas.height);

                drawHistory = [];
                historyStep = -1;
                saveState();

                document.getElementById('create-canvas-container').scrollIntoView({ behavior: 'smooth', block: 'center' });

                // ポップアップ抑制フラグがない場合のみ表示
                if (!options || !options.suppressPopup) {
                    setTimeout(() => {
                        alert(`編集モードに入りました（ID: ${id}）。\n修正後は該当リストアイテムの「上書き保存」、または上部のフロート保存ボタンを押してください。`);
                    }, 300);
                }
            });
        } else {
            createCtx.clearRect(0, 0, createCanvas.width, createCanvas.height);
            drawHistory = [];
            historyStep = -1;
            saveState();

            document.getElementById('create-canvas-container').scrollIntoView({ behavior: 'smooth', block: 'center' });

            if (!options || !options.suppressPopup) {
                setTimeout(() => {
                    alert(`新規マスク作成モードに入りました（ID: ${id}）。\n黒く塗りつぶした後、「上書き保存」を押してください。`);
                }, 300);
            }
        }
    });
}

async function updateRecord(id, btn) {
    if (!checkAuth()) return;
    if (currentEditingId !== id) {
        alert('このデータは現在編集状態ではありません。「編集」ボタンを押してから操作してください。');
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上書き中...';
    
    try {
        const maskDataUrl = createCanvas.toDataURL('image/png');
        const maskBlob = dataURLtoBlob(maskDataUrl);
        
        const formData = new FormData();
        formData.append('mask', maskBlob, 'mask.png');
        
        const editTextArea = document.getElementById('edit-target-textarea');
        if (editTextArea && editTextArea.value !== undefined) {
            formData.append('target', editTextArea.value.trim());
        }
        const editContentArea = document.getElementById('edit-content-textarea');
        if (editContentArea && editContentArea.value !== undefined) {
            formData.append('content', editContentArea.value.trim());
        }
        
        const response = await fetch(`${API_BASE_URL}/fill_image/${id}`, {
            method: 'PUT',
            headers: {
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: formData
        });
        
        if (!response.ok) throw new Error('Update failed');
        const result = await response.json();
        
        if (result.item && result.item.mask) {
            const idx = savedRecords.findIndex(r => r.id === id);
            if (idx !== -1) {
                savedRecords[idx].mask = result.item.mask;
                savedRecords[idx].target = result.item.target !== undefined ? result.item.target : (document.getElementById('edit-target-textarea') ? document.getElementById('edit-target-textarea').value.trim() : '');
                savedRecords[idx].content = result.item.content !== undefined ? result.item.content : (document.getElementById('edit-content-textarea') ? document.getElementById('edit-content-textarea').value.trim() : '');
                savedRecords[idx].timestamp = new Date().toLocaleTimeString();
            }
            
            alert('上書き保存が完了しました！');
            
            // 編集画面を閉じずにそのまま継続できるようにするため、非表示処理をコメントアウト
            /*
            document.getElementById('create-controls').style.display = 'none';
            document.getElementById('create-canvas-container').style.display = 'none';
            toggleFixedUI(false);
            currentEditingId = null;
            
            const editContainer = document.getElementById('edit-target-container');
            const editTextArea = document.getElementById('edit-target-textarea');
            const editContentArea = document.getElementById('edit-content-textarea');
            const bulkImportTargets = document.getElementById('bulk-import-targets');
            const bulkImportContents = document.getElementById('bulk-import-contents');
            if (editContainer) editContainer.style.display = 'none';
            if (editTextArea) editTextArea.value = '';
            if (editContentArea) editContentArea.value = '';
            if (bulkImportTargets) bulkImportTargets.style.display = 'block';
            if (bulkImportContents) bulkImportContents.style.display = 'block';
            */
            
            renderDbList();
            renderPlayList();
        }
    } catch (e) {
        console.error('Update error:', e);
        alert('上書き保存に失敗しました。');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ==========================================
// 固定UIによる全方位スクロール・ズームシステム
// ==========================================

const createWorld = document.getElementById('create-world');
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const zoomSlider = document.getElementById('zoom-slider');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');

let camScale = 1.0;
let camPosX = 0;
let camPosY = 0;
let isJoyDragging = false;
let joyX = 0;
let joyY = 0;
const joyMaxRadius = 35;
let joyTouchId = null;

function toggleFixedUI(show) {
    if (joystickZone) joystickZone.style.display = show ? 'block' : 'none';
    if (zoomSlider) document.getElementById('zoom-ui').style.display = show ? 'flex' : 'none';
}

function updateCameraTransform() {
    if (createWorld) {
        createWorld.style.transform = `translate(${camPosX}px, ${camPosY}px) scale(${camScale})`;
    }
}

function initCamera() {
    camScale = 1.0;
    if (zoomSlider) zoomSlider.value = camScale;
    
    // 初期状態はコンテナの左上ピッタリ（以前と同じ表示状態）にする
    camPosX = 0;
    camPosY = 0;
    
    updateCameraTransform();
}

window.addEventListener('resize', () => {
    if (document.getElementById('create-canvas-container').style.display === 'block') {
        // initCamera(); // リサイズ時にリセットすると編集中に鬱陶しい場合はコメントアウト
    }
});

function setZoom(newScale) {
    newScale = Math.max(1.0, Math.min(10.0, newScale)); // 倍率の下限を1.0に固定（コンテナより小さくならないように）
    if (newScale === camScale) return;

    // ズームの中心をキャンバスコンテナの中心にする
    const container = document.getElementById('create-canvas-container');
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const worldCx = (cx - camPosX) / camScale;
    const worldCy = (cy - camPosY) / camScale;

    camScale = newScale;
    
    camPosX = cx - worldCx * camScale;
    camPosY = cy - worldCy * camScale;
    
    // スケールが1.0の時は位置を0,0にリセットしてピッタリ収める
    if (camScale === 1.0) {
        camPosX = 0;
        camPosY = 0;
    }
    
    if (zoomSlider) zoomSlider.value = camScale;
    updateCameraTransform();
}

if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
    btnZoomIn.addEventListener('click', () => setZoom(camScale + 0.5));
    btnZoomOut.addEventListener('click', () => setZoom(camScale - 0.5));
}

function handleJoyStart(e) {
    e.preventDefault();
    if (isJoyDragging) return;
    const touch = e.changedTouches ? e.changedTouches[0] : e;
    isJoyDragging = true;
    joyTouchId = touch.identifier;
    joystickKnob.style.transition = 'none';
    updateJoyPos(touch.clientX, touch.clientY);
}

function handleJoyMove(e) {
    if (!isJoyDragging) return;
    e.preventDefault();
    let touch;
    if (e.changedTouches) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                touch = e.changedTouches[i];
                break;
            }
        }
        if (!touch) return;
    } else {
        touch = e;
    }
    updateJoyPos(touch.clientX, touch.clientY);
}

function handleJoyEnd(e) {
    if (!isJoyDragging) return;
    e.preventDefault();
    if (e.changedTouches) {
        let found = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                found = true; break;
            }
        }
        if (!found) return;
    }
    
    isJoyDragging = false;
    joyTouchId = null;
    joyX = 0;
    joyY = 0;
    
    joystickKnob.style.transition = 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    joystickKnob.style.transform = `translate(-50%, -50%)`;
}

function updateJoyPos(clientX, clientY) {
    const rect = joystickZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > joyMaxRadius) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * joyMaxRadius;
        dy = Math.sin(angle) * joyMaxRadius;
    }
    
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    
    joyX = dx / joyMaxRadius;
    joyY = dy / joyMaxRadius;
}

if (joystickZone) {
    joystickZone.addEventListener('touchstart', handleJoyStart, {passive: false});
    window.addEventListener('touchmove', handleJoyMove, {passive: false});
    window.addEventListener('touchend', handleJoyEnd, {passive: false});
    window.addEventListener('touchcancel', handleJoyEnd, {passive: false});

    joystickZone.addEventListener('mousedown', handleJoyStart);
    window.addEventListener('mousemove', handleJoyMove);
    window.addEventListener('mouseup', handleJoyEnd);
}

const baseSpeed = 15;
function animateCamera() {
    if (isJoyDragging && (joyX !== 0 || joyY !== 0)) {
        camPosX -= joyX * baseSpeed * camScale;
        camPosY -= joyY * baseSpeed * camScale;
        updateCameraTransform();
    }
    requestAnimationFrame(animateCamera);
}
animateCamera();
