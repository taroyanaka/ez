// Global State
let createOriginalImg = null;
let createCanvas = null;
let createCtx = null;
let isDrawing = false;
let drawMode = 'brush'; 
let brushSize = 20;
let savedRecords = []; // メモリ上に保存するリスト

document.addEventListener('DOMContentLoaded', () => {
    // Canvas Setup
    createCanvas = document.getElementById('create-canvas');
    createCtx = createCanvas.getContext('2d', { willReadFrequently: true });
    
    renderSavedList();

    
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
    isDrawing = false;
    if (createCtx) {
        createCtx.beginPath();
    }
}

function exportFiles() {
    if (!createOriginalImg) {
        alert('元画像がありません。');
        return;
    }
    
    // 1. Download Original Image
    const a1 = document.createElement('a');
    a1.href = createOriginalImg.src; 
    a1.download = 'ez5_original_image.png';
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);
    
    // 2. Download Mask Image
    setTimeout(() => {
        const a2 = document.createElement('a');
        a2.href = createCanvas.toDataURL('image/png');
        a2.download = 'ez5_mask_image.png';
        document.body.appendChild(a2);
        a2.click();
        document.body.removeChild(a2);
    }, 500);
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

function saveRecord() {
    if (!createOriginalImg) {
        alert('元画像がありません。');
        return;
    }
    
    // 現在のCanvasの描画状態（マスク）をDataURL化
    const maskDataUrl = createCanvas.toDataURL('image/png');
    // 読み込んだ元画像のDataURL
    const originalDataUrl = createOriginalImg.src;
    
    const record = {
        id: Date.now(),
        original: originalDataUrl,
        mask: maskDataUrl,
        timestamp: new Date().toLocaleTimeString()
    };
    
    savedRecords.push(record);
    renderSavedList();
    alert('リストに保存しました！');
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

function deleteRecord(id) {
    savedRecords = savedRecords.filter(r => r.id !== id);
    renderSavedList();
}
