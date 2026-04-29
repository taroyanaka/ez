/**
 * BaseSpeechEngine & WebSpeechEngine: 音声合成抽象化
 */
class BaseSpeechEngine {
    constructor() { if (this.constructor === BaseSpeechEngine) throw new Error("Abstract"); }
    async speak(text, lang) { throw new Error("Abstract"); }
    stop() { throw new Error("Abstract"); }
}

class WebSpeechEngine extends BaseSpeechEngine {
    constructor() { super(); this.synth = window.speechSynthesis; }
    async speak(text, lang) {
        return new Promise((resolve) => {
            this.synth.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = lang;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            this.synth.speak(u);
        });
    }
    stop() { this.synth.cancel(); }
}

/**
 * StorageManager: JSONデータの永続化担当
 */
class StorageManager {
    static KEY = "dictation_master_data_v2";

    static load() {
        const data = localStorage.getItem(this.KEY);
        if (!data) return this.initDefault();
        try {
            return JSON.parse(data);
        } catch (e) {
            return this.initDefault();
        }
    }

    static save(data) {
        localStorage.setItem(this.KEY, JSON.stringify(data));
    }

    static initDefault() {
        const defaultData = [
            {
                id: crypto.randomUUID(),
                name: "基本日本語",
                lang: "ja-JP",
                user: "foo",
                items: ["こんにちは", "お元気ですか", "さようなら"]
            },
            {
                id: crypto.randomUUID(),
                name: "Basic English",
                lang: "en-US",
                user: "foo",
                items: ["Hello", "Good morning", "Go home"]
            }
        ];
        this.save(defaultData);
        return defaultData;
    }
}

/**
 * DictationApp: トレーニングモードのロジック
 */
class DictationApp {
    constructor(engine, onComplete) {
        this.engine = engine;
        this.onComplete = onComplete; // 終了時のコールバック
        this.list = null;
        this.currentIndex = 0;
        this.score = 0;
        this.correctChars = 0;
        this.totalTypedChars = 0;

        // Elements
        this.inputEl = document.getElementById('typer-input');
        this.feedbackContainer = document.getElementById('feedback-chars');
        this.playBtn = document.getElementById('play-button');
        this.progressBar = document.getElementById('progress-bar');
        this.scoreDisplay = document.getElementById('score-display');
        this.statAccuracy = document.getElementById('stat-accuracy');
        this.statProgress = document.getElementById('stat-progress');
        this.resultOverlay = document.getElementById('result-overlay');
        this.finalScore = document.getElementById('final-score');
        this.restartBtn = document.getElementById('restart-button');
        
        // Hint buttons
        this.btnFillChar = document.getElementById('btn-fill-char');
        this.btnFillAll = document.getElementById('btn-fill-all');
        this.btnSkip = document.getElementById('btn-skip');

        this.boundKeydown = this.handleKeydown.bind(this);
        this.setupListeners();
    }

    setupListeners() {
        this.playBtn.onclick = () => this.playCurrent();
        this.inputEl.oninput = (e) => this.handleInput(e);
        this.restartBtn.onclick = () => this.onComplete();
        this.resultOverlay.onclick = () => this.onComplete();
        this.btnFillChar.onclick = () => this.fillNextChar();
        this.btnFillAll.onclick = () => this.fillAll();
        this.btnSkip.onclick = () => this.skipCurrent();
    }

    start(list) {
        this.list = list;
        this.currentIndex = 0;
        this.score = 0;
        this.correctChars = 0;
        this.totalTypedChars = 0;
        this.resultOverlay.classList.add('hidden');
        document.getElementById('exercise-area').classList.remove('hidden');
        document.getElementById('list-selector-area').classList.add('hidden');
        document.getElementById('current-list-name').textContent = list.name;
        
        window.addEventListener('keydown', this.boundKeydown);
        this.loadProblem();
    }

    stop() {
        window.removeEventListener('keydown', this.boundKeydown);
        document.getElementById('exercise-area').classList.add('hidden');
        document.getElementById('list-selector-area').classList.remove('hidden');
        document.getElementById('current-list-name').textContent = "No List Selected";
        this.resultOverlay.classList.add('hidden');
        this.engine.stop();
    }

    handleKeydown(e) {
        if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.playCurrent();
        }
        if (e.key === 'Escape') {
            this.stop();
        }
    }

    loadProblem() {
        const text = this.list.items[this.currentIndex];
        this.inputEl.blur(); // IMEの未確定状態を強制リセット
        this.inputEl.value = '';
        this.inputEl.focus();
        
        // 漢字チェック
        const hasKanji = /[\u4E00-\u9FAF]/.test(text);
        this.inputEl.placeholder = hasKanji ? "<漢字有り>聴こえた内容を入力してください..." : "聴こえた内容を入力してください...";

        this.feedbackContainer.innerHTML = '';
        [...text].forEach(() => {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = '_';
            this.feedbackContainer.appendChild(span);
        });

        this.updateUI();
        this.playCurrent();
    }

    updateUI() {
        const progress = (this.currentIndex / this.list.items.length) * 100;
        this.progressBar.style.width = `${progress}%`;
        this.scoreDisplay.textContent = `Score: ${this.score}`;
        this.statProgress.textContent = `${this.currentIndex + 1} / ${this.list.items.length}`;
        const acc = this.totalTypedChars === 0 ? 0 : Math.round((this.correctChars / this.totalTypedChars) * 100);
        this.statAccuracy.textContent = `${acc}%`;
    }

    async playCurrent() {
        const text = this.list.items[this.currentIndex];
        await this.engine.speak(text, this.list.lang);
    }

    handleInput(e) {
        const target = this.list.items[this.currentIndex];
        const typed = e.target.value;
        this.renderFeedback(typed, target);
        if (typed.toLowerCase() === target.toLowerCase()) {
            this.nextProblem();
        }
        this.updateUI();
    }

    renderFeedback(typed, target) {
        const spans = this.feedbackContainer.querySelectorAll('.char');
        this.totalTypedChars++;
        for (let i = 0; i < spans.length; i++) {
            if (i < typed.length) {
                if (typed[i]?.toLowerCase() === target[i]?.toLowerCase()) {
                    spans[i].textContent = target[i];
                    if (!spans[i].classList.contains('correct')) {
                        spans[i].className = 'char correct';
                        this.correctChars++;
                        this.score += 10;
                    }
                } else {
                    spans[i].textContent = typed[i];
                    spans[i].className = 'char incorrect';
                }
            } else {
                spans[i].textContent = '_';
                spans[i].className = 'char';
            }
        }
    }

    fillNextChar() {
        const target = this.list.items[this.currentIndex];
        const current = this.inputEl.value;
        if (current.length < target.length) {
            this.inputEl.value += target[current.length];
            this.renderFeedback(this.inputEl.value, target);
            this.updateUI();
        }
        this.inputEl.focus();
    }

    fillAll() {
        const target = this.list.items[this.currentIndex];
        this.inputEl.value = target;
        this.renderFeedback(target, target);
        this.updateUI();
        this.inputEl.focus();
    }

    skipCurrent() {
        const target = this.list.items[this.currentIndex];
        this.inputEl.value = target;
        this.renderFeedback(target, target);
        setTimeout(() => this.nextProblem(), 800);
    }

    nextProblem() {
        this.currentIndex++;
        if (this.currentIndex < this.list.items.length) {
            setTimeout(() => this.loadProblem(), 500);
        } else {
            this.finalScore.textContent = this.score;
            this.resultOverlay.classList.remove('hidden');
        }
    }
}

/**
 * ManagementManager: 管理モードのUI・ロジック担当
 */
class ManagementManager {
    static NAME_LIMIT = 30;
    static ITEM_LIMIT = 30;

    constructor(storage, onDataChange) {
        this.storage = storage;
        this.onDataChange = onDataChange;
        this.selectedListId = null;

        // Elements
        this.listUl = document.getElementById('management-list-ul');
        this.editor = document.getElementById('list-editor');
        this.nameInput = document.getElementById('edit-list-name');
        this.langSelect = document.getElementById('edit-list-lang');
        this.bulkArea = document.getElementById('bulk-textarea');
        this.itemsList = document.getElementById('items-list-container');
        
        this.setupListeners();
    }

    setupListeners() {
        document.getElementById('btn-create-list').onclick = () => this.createList();
        document.getElementById('btn-delete-list').onclick = () => this.deleteList();
        document.getElementById('btn-bulk-add').onclick = () => this.bulkAdd();
        document.getElementById('btn-export').onclick = () => this.exportData();
        document.getElementById('btn-import-trigger').onclick = () => document.getElementById('import-file').click();
        document.getElementById('import-file').onchange = (e) => this.importData(e);
        
        this.bulkArea.oninput = () => {
            const lines = this.bulkArea.value.split('\n');
            const hasError = lines.some(line => line.trim().length > ManagementManager.ITEM_LIMIT);
            this.bulkArea.classList.toggle('invalid', hasError);
            document.getElementById('bulk-error').classList.toggle('hidden', !hasError);
        };

        this.nameInput.oninput = () => {
            this.validateInput(this.nameInput, 1, ManagementManager.NAME_LIMIT);
            this.updateListMeta();
        };
        this.langSelect.onchange = () => this.updateListMeta();
    }

    validateInput(el, min, max) {
        const val = el.value.trim();
        const isValid = val.length >= min && val.length <= max;
        el.classList.toggle('invalid', !isValid);
        return isValid;
    }

    render() {
        const data = this.storage.load();
        this.listUl.innerHTML = '';
        data.forEach(list => {
            const li = document.createElement('li');
            li.className = `list-item-link ${list.id === this.selectedListId ? 'selected' : ''}`;
            li.textContent = list.name || "Untitled";
            li.onclick = () => this.selectList(list.id);
            this.listUl.appendChild(li);
        });

        if (this.selectedListId) {
            this.renderEditor();
        } else {
            this.editor.classList.add('hidden');
        }
    }

    selectList(id) {
        this.selectedListId = id;
        this.render();
    }

    createList() {
        // 即座に保存せず、ドラフト状態として設定
        this.selectedListId = 'new_draft';
        this.draftMeta = { name: "", lang: "ja-JP" };
        this.render();
    }

    deleteList() {
        if (this.selectedListId === 'new_draft') {
            this.selectedListId = null;
            this.render();
            return;
        }
        if (!confirm("本当にこのリストを削除しますか？")) return;
        let data = this.storage.load();
        data = data.filter(l => l.id !== this.selectedListId);
        this.storage.save(data);
        this.selectedListId = null;
        this.render();
        this.onDataChange();
    }

    updateListMeta() {
        if (this.selectedListId === 'new_draft') {
            this.draftMeta.name = this.nameInput.value;
            this.draftMeta.lang = this.langSelect.value;
            return;
        }
        const data = this.storage.load();
        const list = data.find(l => l.id === this.selectedListId);
        if (list) {
            list.name = this.nameInput.value;
            list.lang = this.langSelect.value;
            this.storage.save(data);
            this.render(); // Sidebar name update
            this.onDataChange();
        }
    }

    renderEditor() {
        if (this.selectedListId === 'new_draft') {
            this.editor.classList.remove('hidden');
            this.nameInput.value = this.draftMeta.name;
            this.langSelect.value = this.draftMeta.lang;
            this.validateInput(this.nameInput, 1, ManagementManager.NAME_LIMIT); // Initial validation for draft
            this.itemsList.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-secondary); border: 2px dashed var(--glass-border); border-radius:12px;">問題を登録するとリストが作成されます</div>';
            return;
        }

        const data = this.storage.load();
        const list = data.find(l => l.id === this.selectedListId);
        if (!list) return;

        this.editor.classList.remove('hidden');
        this.nameInput.value = list.name;
        this.langSelect.value = list.lang;
        this.validateInput(this.nameInput, 1, ManagementManager.NAME_LIMIT);

        this.itemsList.innerHTML = '';
        list.items.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'problem-row';
            row.innerHTML = `
                <input type="text" value="${item.replace(/"/g, '&quot;')}" data-idx="${idx}" maxlength="${ManagementManager.ITEM_LIMIT}">
                <button class="mini-btn danger" style="background:var(--danger)">×</button>
            `;
            const input = row.querySelector('input');
            this.validateInput(input, 1, ManagementManager.ITEM_LIMIT); // Initial check
            
            input.oninput = () => this.validateInput(input, 1, ManagementManager.ITEM_LIMIT);
            input.onchange = (e) => this.updateItem(idx, e.target.value);
            row.querySelector('.danger').onclick = () => this.deleteItem(idx);
            this.itemsList.appendChild(row);
        });
    }

    bulkAdd() {
        const text = this.bulkArea.value.trim();
        if (!text) {
            alert("問題を入力してください。");
            return;
        }
        
        const lines = text.split('\n').map(s => s.trim()).filter(s => s);
        
        // Validation for each line
        for (const line of lines) {
            if (line.length > ManagementManager.ITEM_LIMIT) {
                alert(`${ManagementManager.ITEM_LIMIT}文字を超える問題が含まれています：\n"${line.substring(0, 20)}..."`);
                return;
            }
        }

        const listName = this.nameInput.value.trim();
        if (listName.length === 0 || listName.length > ManagementManager.NAME_LIMIT) {
            alert(`リスト名は1文字以上${ManagementManager.NAME_LIMIT}文字以内で入力してください。`);
            this.nameInput.focus();
            return;
        }
        
        if (this.selectedListId === 'new_draft') {
            // 新規作成
            const data = this.storage.load();
            const newList = {
                id: crypto.randomUUID(),
                name: listName || "無題のリスト",
                lang: this.langSelect.value,
                user: "foo",
                items: lines
            };
            data.push(newList);
            this.storage.save(data);
            this.selectedListId = newList.id;
            this.bulkArea.value = '';
            this.bulkArea.classList.remove('invalid');
            document.getElementById('bulk-error').classList.add('hidden');
        } else {
            // 既存リストへの追加
            const data = this.storage.load();
            const list = data.find(l => l.id === this.selectedListId);
            if (list) {
                list.items = [...list.items, ...lines];
                this.storage.save(data);
                this.bulkArea.value = '';
                this.bulkArea.classList.remove('invalid');
                document.getElementById('bulk-error').classList.add('hidden');
            }
        }
        this.render();
        this.onDataChange();
    }

    updateItem(idx, val) {
        if (!val.trim() || val.length > ManagementManager.ITEM_LIMIT) {
            alert(`1文字以上${ManagementManager.ITEM_LIMIT}文字以内で入力してください。`);
            this.render();
            return;
        }
        const data = this.storage.load();
        const list = data.find(l => l.id === this.selectedListId);
        if (list) {
            list.items[idx] = val;
            this.storage.save(data);
            this.onDataChange();
        }
    }

    deleteItem(idx) {
        const data = this.storage.load();
        const list = data.find(l => l.id === this.selectedListId);
        if (list) {
            list.items.splice(idx, 1);
            this.storage.save(data);
            this.render();
            this.onDataChange();
        }
    }

    exportData() {
        const data = this.storage.load();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dictation_export_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    }

    importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (Array.isArray(data)) {
                    this.storage.save(data);
                    this.render();
                    this.onDataChange();
                    alert("インポートが完了しました。");
                }
            } catch (err) {
                alert("不正なJSONファイルです。");
            }
        };
        reader.readAsText(file);
    }
}

/**
 * Main Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    const speechEngine = new WebSpeechEngine();
    
    // Tab Switching
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.tab-content');
    tabs.forEach(btn => {
        btn.onclick = () => {
            const target = btn.dataset.tab;
            tabs.forEach(b => b.classList.toggle('active', b === btn));
            views.forEach(v => v.classList.toggle('active', v.id === `${target}-view`));
            if (target === 'training') {
                app.stop();
                renderTrainingList();
            } else {
                if (!mgmt.selectedListId) mgmt.createList();
                mgmt.render();
            }
        };
    });

    const app = new DictationApp(speechEngine, () => {
        app.stop();
        renderTrainingList();
    });

    const mgmt = new ManagementManager(StorageManager, () => {
        renderTrainingList();
    });

    function renderTrainingList() {
        const data = StorageManager.load();
        const container = document.getElementById('training-list-container');
        container.innerHTML = '';
        data.forEach(list => {
            const card = document.createElement('div');
            card.className = 'list-card';
            card.innerHTML = `
                <h3>${list.name}</h3>
                <span class="count">${list.items.length} problems (${list.lang})</span>
            `;
            card.onclick = () => app.start(list);
            container.appendChild(card);
        });
    }

    // Initial render
    renderTrainingList();
});
