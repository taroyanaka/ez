// chunk-widget.js
// Common widget for chunk selection and creation across all ez services

window.currentChunkId = null;
window.onChunkChange = null; // Apps can assign a callback here

async function fetchChunks(resourceType) {
    let url = `${API_BASE_URL}/api/chunks?limit=100`;
    if (resourceType) {
        url += `&service_type=${encodeURIComponent(resourceType)}`;
    }
    const myDataOnlyToggle = document.getElementById('my-data-only-toggle');
    if (myDataOnlyToggle && myDataOnlyToggle.checked && AUTH_USER_ID) {
        url += `&my_data_only=true&user_id=${AUTH_USER_ID}`;
    }
    const res = await fetch(url);
    const json = await res.json();
    let chunks = json.data || [];
    if (resourceType) {
        chunks = chunks.filter(c => c.service_type === resourceType || !c.service_type);
    }
    return chunks;
}

async function createChunk(resourceType) {
    const name = prompt('新しい問題集(チャンク)の名前を入力してください:');
    if (!name) return;
    try {
        const res = await fetch(`${API_BASE_URL}/chunks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user_id': AUTH_USER_ID,
                'password': AUTH_PASSWORD
            },
            body: JSON.stringify({ name, service_type: resourceType })
        });
        const json = await res.json();
        const newChunk = json.item || json.data || json;
        window.currentChunkId = newChunk.id;
        await renderChunkWidget(resourceType);
        if (window.onChunkChange) window.onChunkChange();
    } catch (e) {
        console.error(e);
        alert('チャンクの作成に失敗しました。');
    }
}

async function renderChunkWidget(resourceType) {
    const container = document.getElementById('ez-chunk-container');
    if (!container) return;

    if (!AUTH_USER_ID && resourceType !== 'fill_image') {
        container.innerHTML = `<div style="padding:10px; background:#fee2e2; color:#ef4444; border-radius:8px;">チャンク機能を使用するにはログインしてください。</div>`;
        return;
    }

    try {
        const chunks = await fetchChunks(resourceType);
        
        // パラメータからchunk_idを取得してセットする
        const urlParams = new URLSearchParams(window.location.search);
        const urlChunkId = urlParams.get('chunk_id');
        if (urlChunkId && chunks.find(c => String(c.id) === String(urlChunkId))) {
            window.currentChunkId = urlChunkId;
        }

        let options = chunks.map(c => `<option value="${c.id}" ${c.id == window.currentChunkId ? 'selected' : ''}>${c.name}</option>`).join('');
        options += `<option value="all" ${window.currentChunkId === 'all' ? 'selected' : ''}>全てのチャンク</option>`;
        options += `<option value="null" ${window.currentChunkId === 'null' ? 'selected' : ''}>未分類 (既存データ)</option>`;
        
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; border: 1px solid var(--glass-border, #ccc);">
                <label style="font-size: 0.875rem; font-weight: bold;">問題集(チャンク)を選択:</label>
                <select id="ez-chunk-select" style="flex: 1; min-width: 200px; padding: 0.5rem; border-radius: 4px;">
                    <option value="">-- 未選択 (新規作成してください) --</option>
                    ${options}
                </select>
                ${AUTH_USER_ID ? `<button id="ez-chunk-create-btn" class="primary-btn" style="padding: 0.5rem 1rem;">
                    新規作成
                </button>` : ''}
            </div>
        `;

        const selectEl = document.getElementById('ez-chunk-select');
        selectEl.addEventListener('change', (e) => {
            window.currentChunkId = e.target.value;
            if (window.onChunkChange) window.onChunkChange();
        });

        const createBtn = document.getElementById('ez-chunk-create-btn');
        if (createBtn) {
            createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                createChunk(resourceType);
            });
        }

        if (!window.currentChunkId && chunks.length > 0) {
            window.currentChunkId = chunks[0].id;
            selectEl.value = window.currentChunkId;
            if (window.onChunkChange) window.onChunkChange();
        }

    } catch (e) {
        console.error('Failed to render chunk widget:', e);
    }
}

// Automatically re-render when "my data only" changes
document.addEventListener('DOMContentLoaded', () => {
    const myDataToggle = document.getElementById('my-data-only-toggle');
    if (myDataToggle) {
        myDataToggle.addEventListener('change', () => {
            const container = document.getElementById('ez-chunk-container');
            if (container && container.dataset.resourceType) {
                renderChunkWidget(container.dataset.resourceType);
            }
        });
    }
});
