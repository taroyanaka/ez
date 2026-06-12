let problems = [];
let stack = [];
const resource = 'fill_in_the_blank';

let editingId = null;
let currentLearningListIndex = 0;

// DOM Elements
const tabCreate = document.getElementById('tab-create');
const tabLearn = document.getElementById('tab-learn');
const tabAudioLearn = document.getElementById('tab-audio-learn');
const sectionCreate = document.getElementById('section-create');
const sectionLearn = document.getElementById('section-learn');
const sectionAudioLearn = document.getElementById('section-audio-learn');
const problemsList = document.getElementById('problems-list');
const learningContainer = document.getElementById('learning-container');

// API Client Functions


const getAllItems = (resource) => {
    let url = `${API_BASE_URL}/${resource}`;
    const myDataOnlyToggle = document.getElementById('my-data-only-toggle');
    if (myDataOnlyToggle && myDataOnlyToggle.checked && AUTH_USER_ID) {
        url = `${API_BASE_URL}/${resource}/user/${AUTH_USER_ID}`;
    }
    return fetch(url).then(res => res.json()).then(json => json.data || json);
};
const getItemById = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`).then(res => res.json()).then(json => json.item || json.data || json);
const createItem = (resource, data) => fetch(`${API_BASE_URL}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) }).then(res => res.json()).then(json => json.item || json.data || json);
const updateItem = (resource, id, data) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD }, body: JSON.stringify(data) }).then(res => res.json()).then(json => json.item || json.data || json);
const deleteItem = (resource, id) => fetch(`${API_BASE_URL}/${resource}/${id}`, { method: 'DELETE', headers: { 'user_id': AUTH_USER_ID, 'password': AUTH_PASSWORD } }).then(res => res.json()).then(json => json.item || json.data || json);

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  const myDataContainer = document.getElementById('my-data-only-container');
  if (myDataContainer && (!AUTH_USER_ID || !AUTH_PASSWORD)) {
      myDataContainer.style.display = 'none';
  }
  await loadProblems();
  renderProblemsList();
  renderLearningMode();
});

async function handleToggleMyData() {
    await loadProblems();
    renderProblemsList();
    renderLearningMode();
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
  tabCreate.classList.remove('active');
  tabLearn.classList.remove('active');
  if (tabAudioLearn) tabAudioLearn.classList.remove('active');
  sectionCreate.classList.remove('active');
  sectionLearn.classList.remove('active');
  if (sectionAudioLearn) sectionAudioLearn.classList.remove('active');

  if (tabId === 'create') {
    tabCreate.classList.add('active');
    sectionCreate.classList.add('active');
  } else if (tabId === 'learn') {
    tabLearn.classList.add('active');
    sectionLearn.classList.add('active');
    renderLearningMode();
  } else if (tabId === 'audio-learn') {
    if (tabAudioLearn) tabAudioLearn.classList.add('active');
    if (sectionAudioLearn) sectionAudioLearn.classList.add('active');
    initAudioLearning();
  }
}

// (Save function removed - now using direct API calls)

// Add Problem
async function addProblem() {
  if (!checkAuth()) return;
  const questionInput = document.getElementById('question-input');

  const question = questionInput.value.trim();

  const answerInputs = document.querySelectorAll('.answer-input');
  const answerGroups = [];
  let tooShort = false;

  answerInputs.forEach(input => {
    const raw = input.value.trim();
    if (raw) {
      const answers = raw.split('\n').map(a => a.trim()).filter(a => a !== '');
      if (answers.length > 0) {
        if (answers.length < 3) {
          tooShort = true;
        }
        answerGroups.push(answers.join('\n'));
      }
    }
  });

  if (!question || answerGroups.length === 0) {
    alert('Please enter both a sentence and the words to hide.');
    return;
  }

  if (tooShort) {
    alert('バリデーションエラー: ダミーの選択肢を生成するため、単語リストには3つ以上の単語（改行区切り）を入力してください。');
    return;
  }

  const finalAnswerStr = answerGroups.join('|||');

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
    if (typeof resetAnswerBoxes === 'function') resetAnswerBoxes(1);
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
  
  const lists = p.answer.split('|||');
  if (typeof resetAnswerBoxes === 'function') {
    resetAnswerBoxes(lists.length);
    const inputs = document.querySelectorAll('.answer-input');
    lists.forEach((list, idx) => {
      if (inputs[idx]) inputs[idx].value = list;
    });
  }

  const btn = document.getElementById('add-problem-btn');
  btn.textContent = 'Update Problem';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Delete Problem
async function deleteProblem(id_key) {
  if (!checkAuth()) return;
  try {
    const result = await deleteItem(resource, id_key);
    console.log('Delete successful:', result);
    await loadProblems();
    renderProblemsList();
    //render後にaddproblemの表示にしてtextareaも空欄にして
    editingId = null;
    document.getElementById('add-problem-btn').textContent = 'Add Problem';
    document.getElementById('question-input').value = '';
    if (typeof resetAnswerBoxes === 'function') resetAnswerBoxes(1);
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

  problemsList.innerHTML = problems.map(p => {
    const lists = p.answer.split('|||');
    const hiddenText = `Hidden: ${lists.map((l, i) => lists.length > 1 ? `[List ${i+1}] ` + l.replace(/\n/g, ', ') : l.replace(/\n/g, ', ')).join(' | ')}`;
    const id = p.id_key || p.id;
    return `
      <div class="problem-item">
        <div class="problem-text">
          <div class="problem-q expandable-text truncated" onclick="toggleExpand(this)">${p.question}</div>
          <div class="problem-a expandable-text truncated" onclick="toggleExpand(this)">${hiddenText}</div>
          <small style="color: var(--text-secondary); opacity: 0.7;">ID: ${id}</small>
        </div>
        <div class="problem-actions">
          <button type="button" class="edit-btn" onclick="event.preventDefault(); event.stopPropagation(); editProblem(${p.id_key || `'${p.id}'` || `'${id}'`})">Edit</button>
          <button type="button" class="delete-btn" onclick="event.preventDefault(); event.stopPropagation(); deleteProblem(${p.id_key || `'${p.id}'` || `'${id}'`})">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleExpand = function(el) {
  el.classList.toggle('truncated');
  el.classList.toggle('expanded');
};

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

// Answer Box Dynamic UI Helpers
window.addAnswerBox = function() {
  const container = document.getElementById('answers-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'answer-box';
  div.innerHTML = `<textarea class="answer-input" rows="3" placeholder="apple\nbanana"></textarea>
                   <button type="button" class="remove-btn" onclick="removeAnswerBox(this)" title="Remove list">&times;</button>`;
  container.appendChild(div);
  updateRemoveButtons();
};

window.removeAnswerBox = function(btn) {
  btn.closest('.answer-box').remove();
  updateRemoveButtons();
};

window.resetAnswerBoxes = function(count = 1) {
  const container = document.getElementById('answers-container');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    div.className = 'answer-box';
    div.innerHTML = `<textarea class="answer-input" rows="3" placeholder="apple\nbanana"></textarea>
                     <button type="button" class="remove-btn" onclick="removeAnswerBox(this)" title="Remove list">&times;</button>`;
    container.appendChild(div);
  }
  updateRemoveButtons();
};

function updateRemoveButtons() {
  const boxes = document.querySelectorAll('.answer-box');
  boxes.forEach((box) => {
    const btn = box.querySelector('.remove-btn');
    if (btn) {
      btn.style.display = boxes.length > 1 ? 'flex' : 'none';
    }
  });
}

// Render Learning Mode
function renderLearningMode(preserveListIndex = false) {
  if (!preserveListIndex) {
    currentLearningListIndex = 0;
  }
  const selector = document.getElementById('learning-problem-select');
  if (!selector) return;

  // Populate selector if it's empty or the number of problems changed
  if (selector.options.length !== problems.length) {
    const currentSelection = selector.value;
    selector.innerHTML = problems.map((p, index) => {
      const title = p.question.trim().substring(0, 10).replace(/\n/g, ' ') + (p.question.length > 10 ? '...' : '');
      return `<option value="${index}">${index + 1}. ${title}</option>`;
    }).join('');
    
    // Try to restore selection or default to 0
    if (currentSelection !== "" && parseInt(currentSelection) < problems.length) {
      selector.value = currentSelection;
    } else if (problems.length > 0) {
      selector.value = "0";
    }
  }

  if (problems.length === 0) {
    learningContainer.innerHTML = '<div class="empty-state">No problems available. Go to Problem Creation tab to add some.</div>';
    return;
  }

  const selectedIndex = parseInt(selector.value) || 0;
  const p = problems[selectedIndex];
  if (!p) return;

  learningContainer.innerHTML = '';

  let questionHtml = p.question;
  const lists = p.answer.split('|||');
  if (currentLearningListIndex >= lists.length) currentLearningListIndex = 0;
  const targets = lists[currentLearningListIndex].split('\n').map(w => w.trim()).filter(w => w);

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

    ph.html = `<select class="blank-select" data-answer="${targetWord.replace(/"/g, "&quot;")}" onchange="checkAnswer(this, '${targetWord.replace(/'/g, "\\'")}')"><option value="" selected disabled>___</option>${options.map(opt => `<option value="${opt.replace(/"/g, "&quot;")}">${opt}</option>`).join('')}</select>`;
  });

  // Phase 3: Replace the tokens with the generated HTML
  placeholders.forEach(ph => {
    questionHtml = questionHtml.split(ph.token).join(ph.html);
  });

  const problemDiv = document.createElement('div');
  problemDiv.className = 'learning-item';
  problemDiv.style.marginBottom = '0'; // Only one item displayed
  problemDiv.innerHTML = questionHtml;

  if (lists.length > 1) {
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'learning-tabs';
    lists.forEach((_, idx) => {
      const btn = document.createElement('button');
      btn.className = `learning-tab-btn ${idx === currentLearningListIndex ? 'active' : ''}`;
      btn.textContent = `List ${idx + 1}`;
      btn.onclick = () => {
        currentLearningListIndex = idx;
        renderLearningMode(true);
      };
      tabsContainer.appendChild(btn);
    });
    problemDiv.appendChild(tabsContainer);
  }

  learningContainer.appendChild(problemDiv);
}


// Global Validation Function
window.checkAnswer = function (selectEl, correctAnswer, isAutoFill = false) {
  const selectedValue = selectEl.value;

  if (selectedValue === correctAnswer) {
    // Correct! Replace the select with text
    selectEl.classList.remove('error');

    const span = document.createElement('span');
    span.className = 'solved-word';
    span.textContent = selectedValue;

    selectEl.parentNode.replaceChild(span, selectEl);

    // Once OKロジック: ユーザーが手動で正解した場合のみ、他の同じ答えの枠を自動で埋める
    if (!isAutoFill) {
      const onceOkCheckbox = document.getElementById('once-ok-checkbox');
      if (onceOkCheckbox && onceOkCheckbox.checked) {
        const otherSelects = Array.from(document.querySelectorAll('select.blank-select'));
        otherSelects.forEach(sel => {
          if (sel.getAttribute('data-answer') === correctAnswer) {
            sel.value = correctAnswer;
            // autoFillフラグをtrueにして再帰呼び出し（無限ループ防止）
            window.checkAnswer(sel, correctAnswer, true);
          }
        });
      }
    }
  } else {
    // Incorrect! Show error animation
    selectEl.classList.add('error');

    // Auto-add to stack logic
    const autoAddCheckbox = document.getElementById('auto-add-stack');
    if (autoAddCheckbox && autoAddCheckbox.checked) {
      if (!stack.some(item => item.question === correctAnswer)) {
        stack.push({ question: correctAnswer, answer: "" });
        updateStackUI();
      }
    }

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
  if (!checkAuth()) return;
  const newProblem = { id: Date.now().toString(), question: "API Test Question", answer: "Choice A\nChoice B\nChoice C" };
  try {
    const data = await createItem(resource, newProblem);
    alert("Created:\n" + JSON.stringify(data, null, 2));
    await loadProblems();
    renderProblemsList();
  } catch (err) { alert(err); }
};
window.apiUpdate = async function () {
  if (!checkAuth()) return;
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
  if (!checkAuth()) return;
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

// --- Audio Learning Mode Logic ---
let audioSequence = [];
let currentAudioIndex = 0;
let currentUtterance = null;
let audioTimer = null;

window.initAudioLearning = function() {
    window.stopAudioSequence(); // Stop any playing audio
    const selector = document.getElementById('audio-problem-select');
    if (!selector) return;

    if (selector.options.length !== problems.length) {
        const currentSelection = selector.value;
        selector.innerHTML = problems.map((p, index) => {
            const title = p.question.trim().substring(0, 10).replace(/\n/g, ' ') + (p.question.length > 10 ? '...' : '');
            return `<option value="${index}">${index + 1}. ${title}</option>`;
        }).join('');
        if (currentSelection !== "" && parseInt(currentSelection) < problems.length) {
            selector.value = currentSelection;
        } else if (problems.length > 0) {
            selector.value = "0";
        }
    }
    
    document.getElementById('audio-learning-container').style.display = 'none';
    document.getElementById('audio-error-msg').style.display = 'none';
};

window.startAudioSequence = function() {
    window.stopAudioSequence();
    
    const selector = document.getElementById('audio-problem-select');
    if (!selector) return;
    const selectedIndex = parseInt(selector.value);
    if (isNaN(selectedIndex)) return;
    
    const p = problems[selectedIndex];
    if (!p) return;
    
    const lists = p.answer.split('|||');
    const targets = lists[0].split('\n').map(w => w.trim()).filter(w => w);
    
    if (targets.length < 3) {
        const errorEl = document.getElementById('audio-error-msg');
        errorEl.textContent = 'エラー: ダミー生成のため、リストには3つ以上の単語が必要です。問題作成画面で修正してください。';
        errorEl.style.display = 'block';
        return;
    }
    
    const sortedTargets = [...targets].sort((a, b) => b.length - a.length);
    
    let qParts = [p.question];
    let foundTargets = [];
    
    sortedTargets.forEach(targetWord => {
        let newParts = [];
        let replacedThisWord = false;
        qParts.forEach(part => {
            if (typeof part === 'string') {
                if (!replacedThisWord && part.includes(targetWord)) {
                    const index = part.indexOf(targetWord);
                    const before = part.substring(0, index);
                    const after = part.substring(index + targetWord.length);
                    if (before) newParts.push(before);
                    newParts.push({ isTarget: true, word: targetWord });
                    if (after) newParts.push(after);
                    replacedThisWord = true;
                    if (!foundTargets.includes(targetWord)) foundTargets.push(targetWord);
                } else {
                    newParts.push(part);
                }
            } else {
                newParts.push(part);
            }
        });
        qParts = newParts;
    });
    
    if (foundTargets.length < 3) {
        const errorEl = document.getElementById('audio-error-msg');
        errorEl.textContent = 'エラー: 文章の中に適用できる単語が3つ以上見つかりません。';
        errorEl.style.display = 'block';
        return;
    }
    
    audioSequence = [];
    let currentText = "";
    
    qParts.forEach(part => {
        if (typeof part === 'string') {
            currentText += part;
        } else if (part.isTarget) {
            audioSequence.push({
                textBlock: currentText,
                targetWord: part.word,
                allTargets: foundTargets
            });
            currentText = "";
        }
    });
    if (currentText) {
        audioSequence.push({ textBlock: currentText, targetWord: null });
    }
    
    document.getElementById('audio-error-msg').style.display = 'none';
    document.getElementById('audio-learning-container').style.display = 'flex';
    document.getElementById('audio-play-btn').style.display = 'none';
    document.getElementById('audio-stop-btn').style.display = 'inline-block';
    
    currentAudioIndex = 0;
    renderAudioUI();
    playCurrentAudioStep();
};

window.stopAudioSequence = function() {
    window.speechSynthesis.cancel();
    clearTimeout(audioTimer);
    
    const playBtn = document.getElementById('audio-play-btn');
    const stopBtn = document.getElementById('audio-stop-btn');
    if (playBtn) playBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    
    const timerBar = document.getElementById('audio-timer-bar');
    if (timerBar) {
        timerBar.style.transition = 'none';
        timerBar.style.width = '0%';
    }
};

function renderAudioUI() {
    const textDisplay = document.getElementById('audio-text-display');
    if (!textDisplay) return;
    let html = "";
    
    audioSequence.forEach((step, index) => {
        if (index === currentAudioIndex) {
            html += `<span class="speaking-highlight" id="audio-hl-${index}">${step.textBlock}</span>`;
            if (step.targetWord) {
                html += `<span id="audio-blank-${index}" style="color: var(--primary);"> [___] </span>`;
            }
        } else if (index < currentAudioIndex) {
            html += `<span>${step.textBlock}</span>`;
            if (step.targetWord) {
                html += `<span class="solved-word" style="color: var(--success); border-bottom-color: var(--success);">${step.targetWord}</span>`;
            }
        } else {
            html += `<span style="opacity: 0.5;">${step.textBlock}</span>`;
            if (step.targetWord) {
                html += `<span style="opacity: 0.5;"> [___] </span>`;
            }
        }
    });
    textDisplay.innerHTML = html;
}

function playCurrentAudioStep() {
    if (currentAudioIndex >= audioSequence.length) {
        window.stopAudioSequence();
        return;
    }
    
    renderAudioUI();
    
    const step = audioSequence[currentAudioIndex];
    const lang = document.getElementById('audio-lang').value;
    const speed = parseFloat(document.getElementById('audio-speed').value);
    
    if (step.textBlock.trim()) {
        currentUtterance = new SpeechSynthesisUtterance(step.textBlock);
        currentUtterance.lang = lang;
        currentUtterance.rate = speed;
        
        currentUtterance.onend = () => {
            if (!step.targetWord) {
                currentAudioIndex++;
                playCurrentAudioStep();
            }
        };
        window.speechSynthesis.speak(currentUtterance);
    } else if (!step.targetWord) {
        currentAudioIndex++;
        playCurrentAudioStep();
        return;
    }
    
    if (step.targetWord) {
        setupAudioChoices(step);
    } else {
        document.getElementById('audio-choices-container').innerHTML = '';
    }
}

function setupAudioChoices(step) {
    const choicesContainer = document.getElementById('audio-choices-container');
    const waitTime = parseFloat(document.getElementById('audio-wait').value) || 3;
    
    const validDistractors = step.allTargets.filter(w => w !== step.targetWord);
    for (let i = validDistractors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validDistractors[i], validDistractors[j]] = [validDistractors[j], validDistractors[i]];
    }
    const chosenDistractors = validDistractors.slice(0, 2);
    const options = [step.targetWord, ...chosenDistractors];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    
    let isAnswered = false;
    let timerExpired = false;
    
    choicesContainer.innerHTML = options.map(opt => `
        <button class="audio-choice-btn" data-val="${opt.replace(/"/g, "&quot;")}">
            ${opt}
        </button>
    `).join('');
    
    const btns = choicesContainer.querySelectorAll('.audio-choice-btn');
    btns.forEach(btn => {
        btn.onclick = () => {
            if (isAnswered || timerExpired) return;
            isAnswered = true;
            
            clearTimeout(audioTimer);
            const val = btn.getAttribute('data-val');
            
            btns.forEach(b => b.disabled = true);
            
            if (val === step.targetWord) {
                btn.classList.add('correct');
                window.speechSynthesis.cancel();
                proceedToAnswerReveal(step.targetWord);
            } else {
                btn.classList.add('incorrect');
                const correctBtn = Array.from(btns).find(b => b.getAttribute('data-val') === step.targetWord);
                if (correctBtn) correctBtn.classList.add('correct');
                
                if (!stack.some(item => item.question === step.targetWord)) {
                    stack.push({ question: step.targetWord, answer: "" });
                    updateStackUI();
                }
                
                if (!window.speechSynthesis.speaking) {
                    proceedToAnswerReveal(step.targetWord);
                } else {
                    if (currentUtterance) {
                        currentUtterance.onend = () => proceedToAnswerReveal(step.targetWord);
                    }
                }
            }
        };
    });
    
    const timerBar = document.getElementById('audio-timer-bar');
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    void timerBar.offsetWidth; // reflow
    
    timerBar.style.transition = `width ${waitTime}s linear`;
    timerBar.style.width = '0%';
    
    audioTimer = setTimeout(() => {
        if (isAnswered) return;
        timerExpired = true;
        btns.forEach(b => b.disabled = true);
        
        const correctBtn = Array.from(btns).find(b => b.getAttribute('data-val') === step.targetWord);
        if (correctBtn) correctBtn.classList.add('correct');
        
        if (!stack.some(item => item.question === step.targetWord)) {
            stack.push({ question: step.targetWord, answer: "" });
            updateStackUI();
        }
        
        if (!window.speechSynthesis.speaking) {
            proceedToAnswerReveal(step.targetWord);
        } else {
            if (currentUtterance) {
                currentUtterance.onend = () => proceedToAnswerReveal(step.targetWord);
            }
        }
    }, waitTime * 1000);
}

function proceedToAnswerReveal(targetWord) {
    const blankEl = document.getElementById(`audio-blank-${currentAudioIndex}`);
    if (blankEl) {
        blankEl.innerHTML = `<span class="solved-word">${targetWord}</span>`;
    }
    
    const lang = document.getElementById('audio-lang').value;
    const speed = parseFloat(document.getElementById('audio-speed').value);
    
    const ansUtterance = new SpeechSynthesisUtterance(targetWord);
    ansUtterance.lang = lang;
    ansUtterance.rate = speed;
    ansUtterance.onend = () => {
        currentAudioIndex++;
        setTimeout(playCurrentAudioStep, 300);
    };
    window.speechSynthesis.speak(ansUtterance);
}

// --- Stack Logic ---

function addWordsToStack() {
    const answerInputs = document.querySelectorAll('.answer-input');
    if (answerInputs.length === 0) return;
    
    let addedCount = 0;
    
    answerInputs.forEach(input => {
      const words = input.value.split('\n').map(w => w.trim()).filter(w => w !== '');
      words.forEach(word => {
          if (!stack.some(item => item.question === word)) {
              stack.push({ question: word, answer: "" });
              addedCount++;
          }
      });
    });
    
    if (addedCount > 0) {
        updateStackUI();
        alert(`${addedCount}個の単語をスタックに追加しました。`);
    } else {
        alert('追加できる新しい単語がありません（既にスタックにあるか、入力が空です）。');
    }
}

function updateStackUI() {
    const listEl = document.getElementById('stack-list');
    const badgeEl = document.getElementById('stack-badge');
    if (!listEl || !badgeEl) return;

    listEl.innerHTML = stack.map((item, index) => `
        <div class="stack-item" style="position: relative; padding-right: 2rem;">
            <div class="item-q">${item.question}</div>
            <div class="item-a">${item.answer}</div>
            <button onclick="removeFromStack(${index})" title="このアイテムを削除" style="position: absolute; top: 50%; right: 0.4rem; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0.2rem; opacity: 0.5;" onmouseover="this.style.opacity='1'; this.style.color='var(--error)'" onmouseout="this.style.opacity='0.5'; this.style.color='var(--text-secondary)'">&times;</button>
        </div>
    `).join('');

    badgeEl.textContent = stack.length;
    badgeEl.style.display = stack.length > 0 ? 'block' : 'none';
}

function toggleStack() {
    const panel = document.getElementById('stack-panel');
    if (panel) {
        panel.classList.toggle('open');
    }
}

function clearStack() {
    if (stack.length === 0) return;
    if (confirm('スタックをすべてクリアしますか？')) {
        stack = [];
        updateStackUI();
    }
}

function removeFromStack(index) {
    stack.splice(index, 1);
    updateStackUI();
}

async function copyStackToClipboard(withEquals) {
    if (stack.length === 0) {
        alert('スタックが空です。');
        return;
    }
    const text = stack.map(item => withEquals ? `${item.question}=` : `${item.question}`).join('\n');
    try {
        await navigator.clipboard.writeText(text);
        alert('クリップボードにコピーしました！\n\n' + text);
    } catch (err) {
        alert('コピーに失敗しました。');
    }
}

// Ensure UI is updated initially if stack has elements (though it starts empty)
document.addEventListener('DOMContentLoaded', () => {
    updateStackUI();
});
