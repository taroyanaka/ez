// packaging.js
document.addEventListener('DOMContentLoaded', () => {
    const pkgApp = document.getElementById('pkg-app');
    const pkgLoginMsg = document.getElementById('pkg-login-msg');
    const chunkListEl = document.getElementById('chunk-list');
    const pkgChunksListEl = document.getElementById('package-chunks-list');
    const pkgSelectEl = document.getElementById('package-select');
    const pkgNameEl = document.getElementById('package-name');
    const savePkgBtn = document.getElementById('save-package-btn');
    const delPkgBtn = document.getElementById('delete-package-btn');
    const pkgMyData = document.getElementById('pkg-my-data');

    let allChunks = [];
    let allPackages = [];
    let currentPackageChunks = []; // array of { chunk_id: 1, name: "...", order_index: 0 }
    let currentPackageId = null;

    // Check auth periodically or once
    function checkAuth() {
        const uid = localStorage.getItem('user_id');
        const pwd = localStorage.getItem('password');
        if (uid && pwd) {
            pkgApp.style.display = 'block';
            pkgLoginMsg.style.display = 'none';
            return { uid, pwd };
        } else {
            pkgApp.style.display = 'none';
            pkgLoginMsg.style.display = 'block';
            return null;
        }
    }

    async function loadData() {
        const auth = checkAuth();
        if (!auth) return;

        try {
            // Load chunks
            let chunksUrl = `${API_BASE_URL}/api/chunks?limit=1000`;
            if (pkgMyData.checked) {
                chunksUrl += `&my_data_only=true&user_id=${auth.uid}`;
            }
            const cRes = await fetch(chunksUrl);
            const cData = await cRes.json();
            allChunks = cData.data || [];

            // Load packages
            const pRes = await fetch(`${API_BASE_URL}/api/packages`);
            allPackages = await pRes.json() || [];

            renderChunks();
            renderPackages();
        } catch (e) {
            console.error(e);
        }
    }

    function renderChunks() {
        chunkListEl.innerHTML = '';
        allChunks.forEach(c => {
            const li = document.createElement('li');
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid #eee';
            li.style.cursor = 'pointer';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.innerHTML = `<span>${c.name} <small style='color:#999'>(${c.service_type || 'unknown'})</small></span> <button style='background:#f0f0f0; border:1px solid #ccc; cursor:pointer;'>追加</button>`;
            li.onclick = () => {
                currentPackageChunks.push({
                    chunk_id: c.id,
                    name: c.name,
                    order_index: currentPackageChunks.length
                });
                renderPackageChunks();
            };
            chunkListEl.appendChild(li);
        });
    }

    function renderPackages() {
        pkgSelectEl.innerHTML = '<option value="">-- 新規パッケージ --</option>';
        allPackages.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            if (p.id == currentPackageId) opt.selected = true;
            pkgSelectEl.appendChild(opt);
        });
    }

    function renderPackageChunks() {
        pkgChunksListEl.innerHTML = '';
        currentPackageChunks.sort((a, b) => a.order_index - b.order_index);
        
        if (currentPackageChunks.length === 0) {
            pkgChunksListEl.innerHTML = '<li style="color:#999; padding:10px;">追加された問題集はありません</li>';
            return;
        }

        currentPackageChunks.forEach((pc, idx) => {
            pc.order_index = idx; // fix order
            const li = document.createElement('li');
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid #ccc';
            li.style.cursor = 'pointer';
            li.style.background = '#fff';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.innerHTML = `<span>${idx + 1}. ${pc.name}</span> <span style='color:red'>✖</span>`;
            li.onclick = () => {
                currentPackageChunks.splice(idx, 1);
                renderPackageChunks();
            };
            pkgChunksListEl.appendChild(li);
        });
    }

    pkgSelectEl.addEventListener('change', async (e) => {
        const id = e.target.value;
        currentPackageId = id || null;
        if (!currentPackageId) {
            pkgNameEl.value = '';
            currentPackageChunks = [];
            delPkgBtn.style.display = 'none';
            renderPackageChunks();
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/packages/${id}`);
            const pkg = await res.json();
            pkgNameEl.value = pkg.name;
            currentPackageChunks = (pkg.chunks || []).map(c => ({
                chunk_id: c.id,
                name: c.name,
                order_index: c.order_index
            }));
            const auth = checkAuth();
            if (auth && String(pkg.user_id) === String(auth.uid)) {
                delPkgBtn.style.display = 'inline-block';
            } else {
                delPkgBtn.style.display = 'none';
            }
            renderPackageChunks();
        } catch (e) {
            console.error(e);
        }
    });

    savePkgBtn.addEventListener('click', async () => {
        const auth = checkAuth();
        if (!auth) return;
        const name = pkgNameEl.value.trim();
        if (!name) return alert('パッケージ名を入力してください');

        const chunksData = currentPackageChunks.map((pc, i) => ({
            chunk_id: pc.chunk_id,
            order_index: i
        }));

        try {
            savePkgBtn.textContent = '保存中...';
            savePkgBtn.disabled = true;

            const method = currentPackageId ? 'PUT' : 'POST';
            const url = currentPackageId 
                ? `${API_BASE_URL}/api/packages/${currentPackageId}` 
                : `${API_BASE_URL}/api/packages`;

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'user_id': auth.uid,
                    'password': auth.pwd
                },
                body: JSON.stringify({ name, chunks: chunksData })
            });

            if (!res.ok) throw new Error(await res.text());

            alert('保存しました');
            await loadData();
        } catch (e) {
            console.error(e);
            alert('保存に失敗しました。オーナー権限がない可能性があります。');
        } finally {
            savePkgBtn.textContent = '保存';
            savePkgBtn.disabled = false;
        }
    });

    delPkgBtn.addEventListener('click', async () => {
        if (!currentPackageId) return;
        const auth = checkAuth();
        if (!auth) return;
        if (!confirm('本当に削除しますか？')) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/packages/${currentPackageId}`, {
                method: 'DELETE',
                headers: { 'user_id': auth.uid, 'password': auth.pwd }
            });
            if (!res.ok) throw new Error(await res.text());
            alert('削除しました');
            currentPackageId = null;
            pkgNameEl.value = '';
            currentPackageChunks = [];
            delPkgBtn.style.display = 'none';
            await loadData();
        } catch (e) {
            console.error(e);
            alert('削除に失敗しました。');
        }
    });

    pkgMyData.addEventListener('change', loadData);

    // Initial load
    setTimeout(loadData, 500); // Wait a bit for env.js and localstorage
    // Hook into main page login/logout buttons
    document.getElementById('btn-login').addEventListener('click', () => setTimeout(loadData, 1000));
    document.getElementById('btn-logout').addEventListener('click', () => setTimeout(loadData, 100));
});
