// Global State
let createOriginalImg = null;
let createCanvas = null;
let createCtx = null;
let isDrawing = false;
let drawMode = 'brush'; 
let brushSize = 20;

document.addEventListener('DOMContentLoaded', () => {
    // Canvas Setup
    createCanvas = document.getElementById('create-canvas');
    createCtx = createCanvas.getContext('2d', { willReadFrequently: true });
    
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
