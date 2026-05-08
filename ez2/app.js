let problems = [];
const resource = 'fill_in_the_blank';

let editingId = null;

// DOM Elements
const tabCreate = document.getElementById('tab-create');
const tabLearn = document.getElementById('tab-learn');
const sectionCreate = document.getElementById('section-create');
const sectionLearn = document.getElementById('section-learn');
const problemsList = document.getElementById('problems-list');
const learningContainer = document.getElementById('learning-container');

// API Client Functions


const getAllItems = (resource) => fetch(`${API_BASE_URL}/${resource}`).then(res => res.json()).then(json => json.data || json);
const getItemById = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`).then(res => res.json()).then(json => json.item || json.data || json);
const createItem = (resource, data) => fetch(`${API_BASE_URL}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) }).then(res => res.json()).then(json => json.item || json.data || json);
const updateItem = (resource, id, data) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) }).then(res => res.json()).then(json => json.item || json.data || json);
const deleteItem = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'DELETE', headers: { 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD } }).then(res => res.json()).then(json => json.item || json.data || json);

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  if (!AUTH_USER_ID || !AUTH_PASSWORD) {
    alert('ログインが必要です。トップページに戻ります。');
    window.location.href = '../index.html';
    return;
  }
  await loadProblems();
  renderProblemsList();
  renderLearningMode();
});

async function loadProblems() {
  try {
    problems = await getAllItems(resource);
  } catch (error) {
    console.error('Failed to load problems:', error);
    problems = [];
  }
}

// Tab Switching
function switchTab(tabId) {
  if (tabId === 'create') {
    tabCreate.classList.add('active');
    tabLearn.classList.remove('active');
    sectionCreate.classList.add('active');
    sectionLearn.classList.remove('active');
  } else {
    tabCreate.classList.remove('active');
    tabLearn.classList.add('active');
    sectionCreate.classList.remove('active');
    sectionLearn.classList.add('active');
    renderLearningMode();
  }
}

// (Save function removed - now using direct API calls)

// Add Problem
async function addProblem() {
  const questionInput = document.getElementById('question-input');
  const answerInput = document.getElementById('answer-input');

  const question = questionInput.value.trim();
  const answerRaw = answerInput.value.trim();

  if (!question || !answerRaw) {
    alert('Please enter both a sentence and the words to hide.');
    return;
  }

  const answers = answerRaw.split('\n').map(a => a.trim()).filter(a => a !== '');

  if (answers.length === 0) {
    alert('Please enter at least one word to hide.');
    return;
  }

  if (answers.length < 3) {
    alert('バリデーションエラー: ダミーの選択肢を生成するため、単語リストには3つ以上の単語（改行区切り）を入力してください。');
    return;
  }

  const finalAnswerStr = answers.join('\n');

  try {
    if (editingId) {
      // Find the problem to get its database primary key (id_key)
      const p = problems.find(prob => prob.id_key === editingId || prob.id === editingId);
      const pk = p.id_key || editingId;

      await updateItem(resource, pk, {
        question: question,
        answer: finalAnswerStr
      });
      editingId = null;
      document.getElementById('add-problem-btn').textContent = 'Add Problem';
    } else {
      const newProblem = {
        id: Date.now().toString(),
        question: question,
        answer: finalAnswerStr
      };
      await createItem(resource, newProblem);
    }

    await loadProblems();
    renderProblemsList();

    // Clear inputs
    questionInput.value = '';
    answerInput.value = '';
  } catch (error) {
    console.error('Failed to save problem:', error);
    alert('Failed to save problem to the server.');
  }
}

// Edit Problem
function editProblem(id_key) {
  const p = problems.find(prob => prob.id_key === id_key || prob.id === id_key);
  if (!p) return;

  editingId = id_key;
  document.getElementById('question-input').value = p.question;
  document.getElementById('answer-input').value = p.answer;

  const btn = document.getElementById('add-problem-btn');
  btn.textContent = 'Update Problem';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Delete Problem
async function deleteProblem(id_key) {
  try {
    const result = await deleteItem(resource, id_key);
    console.log('Delete successful:', result);
    await loadProblems();
    renderProblemsList();
    //render後にaddproblemの表示にしてtextareaも空欄にして
    editingId = null;
    document.getElementById('add-problem-btn').textContent = 'Add Problem';
    document.getElementById('question-input').value = '';
    document.getElementById('answer-input').value = '';
  } catch (error) {
    console.error('Failed to delete problem:', error);
    alert('Failed to delete problem from the server: ' + error.message);
  }
}

// Render Problem List (Create Tab)
function renderProblemsList() {
  if (problems.length === 0) {
    problemsList.innerHTML = '<div class="empty-state">No problems created yet. Add one above!</div>';
    return;
  }

  problemsList.innerHTML = problems.map(p => `
    <div class="problem-item">
      <div class="problem-text">
        <div class="problem-q">${p.question}</div>
        <div class="problem-a">Hidden: ${p.answer.replace(/\n/g, ', ')}</div>
        <small style="color: var(--text-secondary); opacity: 0.7;">ID: ${p.id_key || p.id}</small>
      </div>
      <div class="problem-actions">
        <button type="button" class="edit-btn" onclick="event.preventDefault(); event.stopPropagation(); editProblem(${p.id_key || `'${p.id}'`})">Edit</button>
        <button type="button" class="delete-btn" onclick="event.preventDefault(); event.stopPropagation(); deleteProblem(${p.id_key || `'${p.id}'`})">Delete</button>
      </div>
    </div>
  `).join('');
}

// Export JSON
function exportData() {
  if (problems.length === 0) {
    alert('No data to export!');
    return;
  }

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(problems, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "fill_in_the_blank.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

// Import JSON
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (Array.isArray(importedData)) {
        // Simple verification
        if (importedData.length > 0 && importedData[0].question === undefined) {
          throw new Error("Invalid format");
        }
        problems = importedData;
        renderProblemsList();
        alert('Data imported successfully! (Note: Local only, not synced to API)');
      } else {
        alert('Invalid data format. Expected a JSON array.');
      }
    } catch (error) {
      alert('Error parsing JSON file. Please ensure it is correctly formatted.');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}

// (Unused) Utility to get all words across all answers to serve as distractors
// function getAllAnswerWords() { ... }
// Now distractors are only chosen from the SAME problem's word list.

// Utility to escape regex specials
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Render Learning Mode
function renderLearningMode() {
  if (problems.length === 0) {
    learningContainer.innerHTML = '<div class="empty-state">No problems available. Go to Problem Creation tab to add some.</div>';
    return;
  }

  // No longer using global words; we use problem-specific words.

  learningContainer.innerHTML = '';

  problems.forEach((p, pIndex) => {
    let questionHtml = p.question;
    const targets = p.answer.split('\n').map(w => w.trim()).filter(w => w);

    targets.sort((a, b) => b.length - a.length);

    let activeTargets = [];
    let placeholders = [];

    // Phase 1: Determine which targets are actually present in the text and tokenize them
    targets.forEach((targetWord, idx) => {
      const parts = questionHtml.split(targetWord);
      if (parts.length > 1) { // Word was successfully found in the text
        const token = `__PH_${idx}__`;
        questionHtml = parts.join(token);
        activeTargets.push(targetWord);
        placeholders.push({ word: targetWord, token: token });
      }
    });

    // Phase 2: Generate dropdowns ONLY for words that were actually found
    placeholders.forEach(ph => {
      const targetWord = ph.word;

      // Filter distractors to be only other ACTIVE words found in the problem
      const validDistractors = activeTargets.filter(w => w !== targetWord);
      for (let i = validDistractors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validDistractors[i], validDistractors[j]] = [validDistractors[j], validDistractors[i]];
      }

      const chosenDistractors = validDistractors.slice(0, 2);

      const options = [targetWord, ...chosenDistractors];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }

      ph.html = `<select class="blank-select" onchange="checkAnswer(this, '${targetWord.replace(/'/g, "\\'")}')"><option value="" selected disabled>___</option>${options.map(opt => `<option value="${opt.replace(/"/g, "&quot;")}">${opt}</option>`).join('')}</select>`;
    });

    // Phase 3: Replace the tokens with the generated HTML
    placeholders.forEach(ph => {
      questionHtml = questionHtml.split(ph.token).join(ph.html);
    });

    const problemDiv = document.createElement('div');
    problemDiv.className = 'learning-item';
    problemDiv.innerHTML = questionHtml;

    learningContainer.appendChild(problemDiv);
  });
}

// Global Validation Function
window.checkAnswer = function (selectEl, correctAnswer) {
  const selectedValue = selectEl.value;

  if (selectedValue === correctAnswer) {
    // Correct! Replace the select with text
    selectEl.classList.remove('error');

    const span = document.createElement('span');
    span.className = 'solved-word';
    span.textContent = selectedValue;

    selectEl.parentNode.replaceChild(span, selectEl);
  } else {
    // Incorrect! Show error animation
    selectEl.classList.add('error');
    setTimeout(() => {
      selectEl.classList.remove('error');
      // Reset after a moment? Or let them try again by keeping the incorrect value.
      // We can reset to blank to force them to pick again.
      selectEl.value = "";
    }, 500);
  }
};


// API UI Handlers for Tests
window.apiGetAll = async function () {
  try {
    const data = await getAllItems(resource);
    alert(JSON.stringify(data, null, 2));
  } catch (err) { alert(err); }
};
window.apiGetById = async function () {
  const id = prompt('Enter ID (id_key):');
  if (id) {
    try {
      const data = await getItemById(resource, id);
      alert(JSON.stringify(data, null, 2));
    } catch (err) { alert(err); }
  }
};
window.apiCreate = async function () {
  const newProblem = { id: Date.now().toString(), question: "API Test Question", answer: "Choice A\nChoice B\nChoice C" };
  try {
    const data = await createItem(resource, newProblem);
    alert("Created:\n" + JSON.stringify(data, null, 2));
    await loadProblems();
    renderProblemsList();
  } catch (err) { alert(err); }
};
window.apiUpdate = async function () {
  const id = prompt('Enter ID (id_key) to update:');
  if (id) {
    const updated = { question: "Updated via API Test", answer: "A\nB\nC" };
    try {
      const data = await updateItem(resource, id, updated);
      alert("Updated:\n" + JSON.stringify(data, null, 2));
      await loadProblems();
      renderProblemsList();
    } catch (err) { alert(err); }
  }
};
window.apiDelete = async function () {
  const id = prompt('Enter ID (id_key) to delete:');
  if (id) {
    try {
      const data = await deleteItem(resource, id);
      alert("Deleted:\n" + JSON.stringify(data, null, 2));
      await loadProblems();
      renderProblemsList();
    } catch (err) { alert(err); }
  }
};
