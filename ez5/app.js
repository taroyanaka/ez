// Global State
let playOriginalImg = null;
let playMaskImg = null;
let playCanvas = null;
let playCtx = null;
let referenceMaskData = null; 

let createOriginalImg = null;
let createCanvas = null;
let createCtx = null;
let isDrawing = false;
let drawMode = 'brush'; 
let brushSize = 20;

document.addEventListener('DOMContentLoaded', () => {
    switchTab('play');
    
    // Play Mode Setup
    playCanvas = document.getElementById('play-canvas');
    playCtx = playCanvas.getContext('2d', { willReadFrequently: true });
    
    document.getElementById('play-orig-img').addEventListener('change', e => loadImage(e, 'play-orig'));
    document.getElementById('play-mask-img').addEventListener('change', e => loadImage(e, 'play-mask'));
    playCanvas.addEventListener('click', handlePlayClick);

    // Create Mode Setup
    createCanvas = document.getElementById('create-canvas');
    createCtx = createCanvas.getContext('2d', { willReadFrequently: true });
    
    document.getElementById('create-orig-img').addEventListener('change', e => loadImage(e, 'create-orig'));
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
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
        startDrawing(mouseEvent);
    }, { passive: false });
    
    createCanvas.addEventListener('touchmove', e => { 
        e.preventDefault(); 
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
        draw(mouseEvent);
    }, { passive: false });
    
    window.addEventListener('touchend', stopDrawing);
});

function switchTab(tab) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + '-view').classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
}

function loadImage(event, target) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            if (target === 'play-orig') {
                playOriginalImg = img;
                const bgImg = document.getElementById('play-bg-img');
                bgImg.src = img.src;
                bgImg.style.display = 'block';
                checkPlayImages();
            } else if (target === 'play-mask') {
                playMaskImg = img;
                checkPlayImages();
            } else if (target === 'create-orig') {
                createOriginalImg = img;
                const bgImg = document.getElementById('create-bg-img');
                bgImg.src = img.src;
                bgImg.style.display = 'block';
                setupCreateCanvas();
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Play Mode Logic ---
function checkPlayImages() {
    const errorEl = document.getElementById('play-error');
    errorEl.textContent = '';
    
    if (!playOriginalImg || !playMaskImg) {
        document.getElementById('play-canvas-container').style.display = 'none';
        return;
    }
    
    // サイズ検証
    if (playOriginalImg.width !== playMaskImg.width || playOriginalImg.height !== playMaskImg.height) {
        errorEl.textContent = `サイズエラー: 元画像(${playOriginalImg.width}x${playOriginalImg.height}) と マスク画像(${playMaskImg.width}x${playMaskImg.height}) のサイズが一致しません。1pxの狂いなく一致させる必要があります。`;
        document.getElementById('play-canvas-container').style.display = 'none';
        return;
    }
    
    document.getElementById('play-canvas-container').style.display = 'block';
    
    playCanvas.width = playOriginalImg.width;
    playCanvas.height = playOriginalImg.height;
    
    playCtx.clearRect(0, 0, playCanvas.width, playCanvas.height);
    playCtx.drawImage(playMaskImg, 0, 0);
    
    // オリジナルのマスク状態をメモリに保持
    referenceMaskData = playCtx.getImageData(0, 0, playCanvas.width, playCanvas.height);
}

function handlePlayClick(e) {
    if (!referenceMaskData) return;
    
    // キャンバスの表示スケールを加味した座標計算
    const rect = playCanvas.getBoundingClientRect();
    const scaleX = playCanvas.width / rect.width;
    const scaleY = playCanvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    floodFillToggle(playCtx, referenceMaskData, x, y);
}

// クリックされた位置の連続する黒塗りブロックを特定し、表示/非表示を切り替える
function floodFillToggle(ctx, refImageData, startX, startY) {
    const width = refImageData.width;
    const height = refImageData.height;
    
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    const vData = ctx.getImageData(0, 0, width, height); // 現在表示されている状態
    const rData = refImageData.data; // 元のマスク状態
    
    const startIndex = (startY * width + startX) * 4;
    // 元のマスク画像で透過(アルファ値<128)の部分をクリックした場合は何もしない
    if (rData[startIndex + 3] < 128) return; 
    
    // 現在表示されているか（隠されているか）どうかで目標状態を決定
    const isCurrentlyHidden = vData.data[startIndex + 3] > 128;
    const targetAlpha = isCurrentlyHidden ? 0 : 255; // 0 = 表示(透過), 255 = 隠す(不透明)
    
    // 反復DFSを用いた塗りつぶし判定 (スタックオーバーフロー防止)
    const stack = [[startX, startY]];
    const visited = new Uint8Array(width * height);
    visited[startY * width + startX] = 1;
    
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = (y * width + x) * 4;
        
        // 状態を切り替え
        if (targetAlpha === 0) {
            vData.data[idx + 3] = 0; // 透過にして下の画像を見せる
        } else {
            // 元のマスクデータから復元する
            vData.data[idx] = rData[idx];
            vData.data[idx + 1] = rData[idx + 1];
            vData.data[idx + 2] = rData[idx + 2];
            vData.data[idx + 3] = rData[idx + 3];
        }
        
        // 4方向を探索
        const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx1D = ny * width + nx;
                if (!visited[nIdx1D]) {
                    const nIdx4D = nIdx1D * 4;
                    // 元のマスクにおいて連続している黒塗り部分のみを対象とする
                    if (rData[nIdx4D + 3] >= 128) {
                        visited[nIdx1D] = 1;
                        stack.push([nx, ny]);
                    }
                }
            }
        }
    }
    
    ctx.putImageData(vData, 0, 0);
}

// --- Create Mode Logic ---
function setupCreateCanvas() {
    document.getElementById('create-controls').style.display = 'flex';
    document.getElementById('create-canvas-container').style.display = 'block';
    
    createCanvas.width = createOriginalImg.width;
    createCanvas.height = createOriginalImg.height;
    createCtx.clearRect(0, 0, createCanvas.width, createCanvas.height);
}

function setMode(mode) {
    drawMode = mode;
    document.getElementById('btn-brush').classList.toggle('active', mode === 'brush');
    document.getElementById('btn-eraser').classList.toggle('active', mode === 'eraser');
}

function getCreatePos(e) {
    const rect = createCanvas.getBoundingClientRect();
    const scaleX = createCanvas.width / rect.width;
    const scaleY = createCanvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function startDrawing(e) {
    if (!createOriginalImg) return;
    isDrawing = true;
    draw(e);
}

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
    }, 500); // 連続ダウンロードのブラウザブロックを回避するために少し遅延
}
