

let currentData = [];

// --- Utilities ---
const generateId = () => Math.random().toString(36).substring(2, 9);
const getElem = (id) => document.getElementById(id);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupTabs();
  setupCreateTab();
  setupExecuteTab();
  setupImportExport();
  renderPassageEditors();
  setupApiButtons();
});

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


const resource = 'reading_quizzes';
const BASE_URL = API_BASE_URL;



const getAllItems = (resource) => fetch(`${BASE_URL}/${resource}`).then(res => res.json()).then(json => json.data || json);
const getItemById = (resource, id) => fetch(`${BASE_URL}/${resource}/${id}`).then(res => res.json()).then(json => json.item || json.data || json);
const createItem = (resource, data) => fetch(`${BASE_URL}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) }).then(res => res.json()).then(json => json.item || json.data || json);
const updateItem = (resource, id, data) => fetch(`${BASE_URL}/${resource}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) }).then(res => res.json()).then(json => json.item || json.data || json);
const deleteItem = (resource, id) => fetch(`${BASE_URL}/${resource}/${id}`, { method: 'DELETE', headers: { 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD } }).then(res => res.json()).then(json => json.item || json.data || json);

function setupApiButtons() {
  const logResponse = (res) => {
    console.log(res);
    alert(JSON.stringify(res, null, 2));
  };

  getElem('btn-api-get-all')?.addEventListener('click', () => {
    getAllItems(resource).then(logResponse).catch(e => alert('Error: ' + e));
  });
  getElem('btn-api-get-id')?.addEventListener('click', () => {
    const id = prompt("対象のIDを入力してください");
    if (id) getItemById(resource, id).then(logResponse).catch(e => alert('Error: ' + e));
  });
  getElem('btn-api-create')?.addEventListener('click', () => {
    if (!checkAuth()) return;
    const data = { id: generateId(), title: "API Test Title", passage: "API Test Passage Data", questions: [] };
    createItem(resource, data).then(logResponse).catch(e => alert('Error: ' + e));
  });
  getElem('btn-api-update')?.addEventListener('click', () => {
    if (!checkAuth()) return;
    const id = prompt("更新するIDを入力してください");
    if (id) {
      const data = { title: "API Update Test", passage: "Updated Passage Data", questions: [] };
      updateItem(resource, id, data).then(logResponse).catch(e => alert('Error: ' + e));
    }
  });
  getElem('btn-api-delete')?.addEventListener('click', () => {
    if (!checkAuth()) return;
    const id = prompt("削除するIDを入力してください");
    if (id) deleteItem(resource, id).then(logResponse).catch(e => alert('Error: ' + e));
  });
}

async function loadData() {
  try {
    const data = await getAllItems(resource);
    currentData = Array.isArray(data) ? data : [];
    if (currentData.length === 0) {
      // Default example dummy if API is empty (optional, but keep it for first run)
      currentData = [
        {
          id: generateId(),
          title: "動物の数問題",
          passage: "犬が2匹と猫が3匹と男の人が5人と女の人が4人います",
          questions: [
            {
              id: generateId(),
              questionText: "人間は何人いますか?",
              choices: ["9", "5", "3"],
              correctIndex: 0
            },
            {
              id: generateId(),
              questionText: "動物は何匹いますか?",
              choices: ["5", "3", "2"],
              correctIndex: 0
            }
          ]
        }
      ];
    }
    updateExecutionSelect();
  } catch (e) {
    console.error('Failed to load data from API:', e);
    currentData = [];
  }
}

function saveData() {
  updateExecutionSelect();
}

// --- Tabs Logic ---
function setupTabs() {
  const btnCreate = getElem('tab-create');
  const btnExecute = getElem('tab-execute');
  const paneCreate = getElem('pane-create');
  const paneExecute = getElem('pane-execute');

  btnCreate.addEventListener('click', () => {
    btnCreate.classList.add('active');
    btnExecute.classList.remove('active');
    paneCreate.classList.add('active', 'fade-in');
    paneExecute.classList.remove('active', 'fade-in');
  });

  btnExecute.addEventListener('click', async () => {
    btnExecute.classList.add('active');
    btnCreate.classList.remove('active');
    paneExecute.classList.add('active', 'fade-in');
    paneCreate.classList.remove('active', 'fade-in');
    await loadData();
  });
}

// --- Create Tab Logic ---
function setupCreateTab() {
  const btnAddPassage = getElem('btn-add-passage');
  btnAddPassage.addEventListener('click', () => {
    const newPassage = {
      id: generateId(),
      title: "",
      passage: "",
      questions: [
        {
          id: generateId(),
          questionText: "",
          choices: ["", ""],
          correctIndex: 0
        }
      ]
    };
    currentData.unshift(newPassage);
    renderPassageEditors();
  });
}

function setupImportExport() {
  const btnExport = getElem('btn-export-json');
  const btnImport = getElem('btn-import-json');
  const fileInput = getElem('json-file-input');

  btnExport.addEventListener('click', () => {
    const dataStr = JSON.stringify(currentData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = "reading_quizzes.json";
    a.click();

    URL.revokeObjectURL(url);
  });

  btnImport.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (Array.isArray(importedData)) {
          if (confirm('現在のデータを上書きしますか？ (キャンセルで追加します)')) {
            currentData = importedData;
          } else {
            currentData = currentData.concat(importedData);
          }
          saveData();
          renderPassageEditors();
          alert('インポートに成功しました。');
        } else {
          throw new Error('Invalid format');
        }
      } catch (err) {
        console.error('Import error:', err);
        alert('ファイルの読み込みに失敗しました。正しいJSONファイルを選択してください。');
      }
    };
    reader.readAsText(file);
    // Reset file input so the same file can be selected again
    fileInput.value = '';
  });
}

function renderPassageEditors() {
  const list = getElem('passage-list');
  list.innerHTML = '';

  currentData.forEach((passageObj, pIndex) => {
    const tpl = getElem('tpl-passage-editor').content.cloneNode(true);
    const editor = tpl.querySelector('.passage-editor');

    const titleInput = editor.querySelector('.passage-title-input');
    const textInput = editor.querySelector('.passage-text-input');
    const btnDeletePassage = editor.querySelector('.btn-delete-passage');
    const btnAddQuestion = editor.querySelector('.btn-add-question');
    const btnSave = editor.querySelector('.btn-save-passage');
    const questionsContainer = editor.querySelector('.questions-container');

    titleInput.value = passageObj.title || "";
    textInput.value = passageObj.passage || "";

    btnDeletePassage.addEventListener('click', async () => {
      if (!checkAuth()) return;
      // if(confirm('この問題セットを削除しますか?')) {
      const pk = passageObj.id_key || passageObj.id;
      if (passageObj.id_key) {
        try {
          await deleteItem(resource, passageObj.id_key);
        } catch (e) {
          console.error('Delete failed', e);
        }
      }
      currentData.splice(pIndex, 1);
      saveData();
      renderPassageEditors();
      // }
    });

    // Populate questions
    const renderQuestionsForPassage = () => {
      questionsContainer.innerHTML = '';
      passageObj.questions.forEach((qObj, qIndex) => {
        const qTpl = getElem('tpl-question-editor').content.cloneNode(true);
        const qEditor = qTpl.querySelector('.question-editor');
        const qTextInput = qEditor.querySelector('.question-text-input');
        const btnDeleteQuestion = qEditor.querySelector('.btn-delete-question');
        const btnAddChoice = qEditor.querySelector('.btn-add-choice');
        const choicesContainer = qEditor.querySelector('.choices-container');

        qTextInput.value = qObj.questionText || "";

        btnDeleteQuestion.addEventListener('click', () => {
          passageObj.questions.splice(qIndex, 1);
          renderQuestionsForPassage();
        });

        // Input handlers
        qTextInput.addEventListener('input', (e) => {
          qObj.questionText = e.target.value;
        });

        // Add choices
        const renderChoices = () => {
          choicesContainer.innerHTML = '';
          // Need a unique name for radio buttons per question
          const radioName = `radio-${qObj.id}`;

          qObj.choices.forEach((cText, cIndex) => {
            const cTpl = getElem('tpl-choice-editor').content.cloneNode(true);
            const cEditor = cTpl.querySelector('.choice-editor');

            const radioInput = cEditor.querySelector('.choice-correct-radio');
            const textInput = cEditor.querySelector('.choice-text-input');
            const btnDeleteChoice = cEditor.querySelector('.btn-delete-choice');

            radioInput.name = radioName;
            radioInput.checked = (qObj.correctIndex === cIndex);
            textInput.value = cText || "";

            radioInput.addEventListener('change', () => {
              if (radioInput.checked) qObj.correctIndex = cIndex;
            });

            textInput.addEventListener('input', (e) => {
              qObj.choices[cIndex] = e.target.value;
            });

            btnDeleteChoice.addEventListener('click', () => {
              if (qObj.choices.length <= 2) {
                alert('選択肢は最低2つ必要です。');
                return;
              }
              qObj.choices.splice(cIndex, 1);
              if (qObj.correctIndex >= qObj.choices.length) {
                qObj.correctIndex = 0;
              } else if (qObj.correctIndex > cIndex) {
                qObj.correctIndex--;
              }
              renderChoices();
            });

            choicesContainer.appendChild(cEditor);
          });
        };

        renderChoices();

        btnAddChoice.addEventListener('click', () => {
          qObj.choices.push("");
          renderChoices();
        });

        questionsContainer.appendChild(qEditor);
      });
    };

    renderQuestionsForPassage();

    btnAddQuestion.addEventListener('click', () => {
      passageObj.questions.push({
        id: generateId(),
        questionText: "",
        choices: ["", ""],
        correctIndex: 0
      });
      renderQuestionsForPassage();
    });

    // Save button logic
    btnSave.addEventListener('click', async () => {
      if (!checkAuth()) return;
      passageObj.title = titleInput.value;
      passageObj.passage = textInput.value;

      try {
        if (passageObj.id_key) {
          await updateItem(resource, passageObj.id_key, passageObj);
        } else {
          const result = await createItem(resource, passageObj);
          if (result && result.id_key) {
            passageObj.id_key = result.id_key;
          }
        }
        saveData();

        btnSave.textContent = "保存しました！";
        btnSave.style.backgroundColor = "var(--success)";
      } catch (e) {
        console.error('Save failed', e);
        alert('保存に失敗しました: ' + e);
      }

      setTimeout(() => {
        btnSave.textContent = "保存";
        btnSave.style.backgroundColor = "var(--primary-color)";
      }, 2000);
    });

    list.appendChild(editor);
  });
}

// --- Execute Tab Logic ---
let activeExecutionData = null;

function setupExecuteTab() {
  const selectPassage = getElem('select-passage');
  const container = getElem('execution-container');
  const emptyState = getElem('execution-empty-state');

  selectPassage.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      startExecution(val);
      container.classList.remove('hidden');
      emptyState.classList.add('hidden');
    } else {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }
  });
}

function updateExecutionSelect() {
  const select = getElem('select-passage');

  select.innerHTML = '<option value="">文章を選択してください</option>';

  currentData.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title || p.passage.substring(0, 20) + '...';
    select.appendChild(opt);
  });

  const container = getElem('execution-container');
  const emptyState = getElem('execution-empty-state');

  if (currentData.length === 0) {
    select.classList.add('hidden');
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
  } else {
    select.classList.remove('hidden');
    container.classList.add('hidden');
    emptyState.classList.add('hidden');
  }
}

function startExecution(passageId) {
  const pData = currentData.find(p => p.id === passageId);
  if (!pData) return;

  activeExecutionData = pData;

  getElem('execution-passage-text').textContent = pData.passage;

  const qContainer = getElem('execution-questions');
  qContainer.innerHTML = '';

  pData.questions.forEach((q, qIndex) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'execution-question-item';
    qDiv.id = `exec-q-${q.id}`;

    const qTitle = document.createElement('div');
    qTitle.className = 'execution-question-text';
    qTitle.textContent = `問題 ${qIndex + 1}: ${q.questionText}`;
    qDiv.appendChild(qTitle);

    q.choices.forEach((cText, cIndex) => {
      const label = document.createElement('label');
      label.className = 'execution-choice-label';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `exec-ans-${q.id}`;
      radio.value = cIndex;

      radio.addEventListener('change', () => {
        const itemDiv = getElem(`exec-q-${q.id}`);
        if (cIndex === q.correctIndex) {
          itemDiv.style.borderColor = "var(--success)";
        } else {
          itemDiv.style.borderColor = "var(--danger)";
        }
        checkAllAnswers();
      });

      label.appendChild(radio);
      label.appendChild(document.createTextNode(cText));

      qDiv.appendChild(label);
    });

    qContainer.appendChild(qDiv);
  });

  const feedback = getElem('execution-feedback');
  feedback.className = 'feedback-message hidden';
  feedback.textContent = '';
}

function checkAllAnswers() {
  if (!activeExecutionData) return;

  let correctCount = 0;
  const total = activeExecutionData.questions.length;
  let answeredCount = 0;

  activeExecutionData.questions.forEach(q => {
    const selected = document.querySelector(`input[name="exec-ans-${q.id}"]:checked`);
    if (selected) {
      answeredCount++;
      const ansIndex = parseInt(selected.value, 10);
      if (ansIndex === q.correctIndex) correctCount++;
    }
  });

  const feedback = getElem('execution-feedback');
  if (answeredCount === total) {
    feedback.classList.remove('hidden');
    if (correctCount === total) {
      feedback.className = 'feedback-message success';
      feedback.textContent = `全問正解！素晴らしい！ (${correctCount}/${total})`;
    } else {
      feedback.className = 'feedback-message error';
      feedback.textContent = `${total}問中、${correctCount}問正解。惜しい！間違えた問題（赤枠）を確認しましょう。`;
    }
  } else {
    feedback.classList.add('hidden');
  }
}
