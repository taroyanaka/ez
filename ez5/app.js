// Global State
let createOriginalImg = null;
let createOriginalFile = null;
let createCanvas = null;
let createCtx = null;
let isDrawing = false;
let drawMode = 'brush'; 
let brushSize = 20;
let savedRecords = []; // メモリ上に保存するリスト

// Undo/Redo State
let drawHistory = [];
let historyStep = -1;



document.addEventListener('DOMContentLoaded', () => {
    // Canvas Setup
    createCanvas = document.getElementById('create-canvas');
    createCtx = createCanvas.getContext('2d', { willReadFrequently: true });
    
    if (AUTH_USER_ID) {
        loadData();
    } else {
        renderSavedList();
    }

    
    document.getElementById('create-orig-img').addEventListener('change', e => loadImage(e));
    document.getElementById('brush-size').addEventListener('input', e => {
        brushSize = parseInt(e.target.value);
    });
    
    // Drawing events
    createCanvas.addEventListener('mousedown', startDrawing);
    createCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);
    
    // Touch support for drawing
    createCanvas.addEventListener('touchstart', e => { 
        e.preventDefault(); 
        startDrawing(e);
    }, { passive: false });
    
    createCanvas.addEventListener('touchmove', e => { 
        e.preventDefault(); 
        draw(e);
    }, { passive: false });
    
    window.addEventListener('touchend', stopDrawing);
});

function switchTab(tab) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + '-view').classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    
    if (tab === 'play') {
        renderPlayList();
    }
}

function loadImage(event) {
    const file = event.target.files[0];
    if (!file) return;
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

function renderPlayList() {
    const playListEl = document.getElementById('play-list-container');
    if (!playListEl) return;
    
    if (savedRecords.length === 0) {
        playListEl.innerHTML = '<p style="color: var(--text-secondary);">保存されたデータがありません。Createモードでリストに保存してください。</p>';
        return;
    }
    
    playListEl.innerHTML = savedRecords.map((record, index) => `
        <div class="play-card" style="background: var(--card-bg); border-radius: 8px; border: 1px solid var(--glass-border); padding: 1rem;">
            <div style="font-weight: bold; color: var(--accent-color); margin-bottom: 0.5rem;">Question #${index + 1}</div>
            
            <div class="play-canvas-wrapper" onclick="toggleMask(this)" style="position: relative; width: 100%; border-radius: 4px; overflow: hidden; background: #000; cursor: pointer; user-select: none;">
                <!-- 元画像 -->
                <img src="${record.original}" style="display: block; width: 100%; height: auto; object-fit: contain;">
                <!-- マスク画像 (デフォルト表示) -->
                <img class="play-mask-img" src="${record.mask}" style="position: absolute; top:0; left:0; width: 100%; height: 100%; object-fit: contain; transition: opacity 0.2s;">
            </div>
            
            <p style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">
                画像をタップして黒塗りを切り替え
            </p>
        </div>
    `).join('');
}

function toggleMask(element) {
    const maskImg = element.querySelector('.play-mask-img');
    if (maskImg) {
        if (maskImg.style.opacity === '0') {
            maskImg.style.opacity = '1';
        } else {
            maskImg.style.opacity = '0';
        }
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
        const res = await fetch(`${API_BASE_URL}/fill_image/user/${AUTH_USER_ID}`);
        if (!res.ok) throw new Error('Failed to load data');
        const data = await res.json();
        
        savedRecords = data.map(item => ({
            id: item.id,
            original: item.original,
            mask: item.mask,
            timestamp: new Date().toLocaleTimeString() // DBからロードした時刻として表示
        }));
        
        renderSavedList();
        renderPlayList();
    } catch (e) {
        console.error('Data load error:', e);
    }
}

async function saveRecord() {
    if (!createOriginalImg || !createOriginalFile) {
        alert('元画像がありません。');
        return;
    }
    
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        alert('保存にはログインが必要です。TOPページからログインしてください。');
        return;
    }
    
    const saveBtn = document.querySelector('button[onclick="saveRecord()"]');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // 現在のCanvasの描画状態（マスク）をDataURL化しBlobに変換
        const maskDataUrl = createCanvas.toDataURL('image/png');
        const maskBlob = dataURLtoBlob(maskDataUrl);
        
        const formData = new FormData();
        // 各ファイルを個別のキー名でAppend（サーバー側でCDNにアップされ、DBへInsertされる）
        formData.append('original', createOriginalFile);
        formData.append('mask', maskBlob, 'mask.png');
        
        const response = await fetch(`${API_BASE_URL}/fill_image`, {
            method: 'POST',
            headers: {
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.item || !result.item.original || !result.item.mask) {
            throw new Error('画像のURLが正しく取得できませんでした。');
        }
        
        const record = {
            id: result.item.id,
            original: result.item.original,
            mask: result.item.mask,
            timestamp: new Date().toLocaleTimeString()
        };
        
        savedRecords.push(record);
        renderPlayList(); // プレイモード側のリストも更新
        renderSavedList();
        
        alert('DBへの保存が完了しました！');
    } catch (e) {
        console.error('Upload error:', e);
        alert('保存に失敗しました: ' + e.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i>';
        }
    }
}

function renderSavedList() {
    const listEl = document.getElementById('saved-list');
    if (!listEl) return;
    
    if (savedRecords.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-secondary);">保存されたデータはありません。</p>';
        return;
    }
    
    // リストにプレビューと情報、削除ボタンを表示
    listEl.innerHTML = savedRecords.map((record, index) => `
        <div style="display: flex; align-items: center; gap: 1rem; background: var(--card-bg); padding: 1rem; border-radius: 8px; border: 1px solid var(--glass-border);">
            <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent-color); width: 30px;">#${index + 1}</div>
            
            <div style="position: relative; width: 80px; height: 80px; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);">
                <img src="${record.original}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain;">
                <!-- マスクを重ねて表示 -->
                <img src="${record.mask}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain;">
            </div>
            
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                <div style="font-size: 0.9rem;">保存時刻: ${record.timestamp}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    ペア (元画像 + マスク画像)
                </div>
            </div>
            
            <div>
                <button class="btn" onclick="deleteRecord(${record.id})" style="color: var(--danger); border-color: var(--danger); background: rgba(239, 68, 68, 0.1);">
                    <i class="fas fa-trash"></i> 削除
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteRecord(id) {
    if (!AUTH_USER_ID || !AUTH_PASSWORD) {
        alert('削除にはログインが必要です。');
        return;
    }

    if (!confirm('本当に削除しますか？')) return;

    // UI上で即時反映
    const originalRecords = [...savedRecords];
    savedRecords = savedRecords.filter(r => r.id !== id);
    renderSavedList();
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
        renderPlayList();
    }
}
