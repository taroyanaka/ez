// State Management
let problems = JSON.parse(localStorage.getItem('fill_in_the_blank'));
if (!problems) {
  problems = [
    {
      id: 'sample-1',
      question: 'むかし、むかし、あるところに、おじいさんとおばあさんがありました。まいにち、おじいさんは山へしば刈かりに、おばあさんは川へ洗濯に行きました。\nある日、おばあさんが、川のそばで、せっせと洗濯をしていますと、川上から、大きな桃が一つ、\n「ドンブラコッコ、スッコッコ。\nドンブラコッコ、スッコッコ。」',
      answer: 'おじい\nおばあ\n山\n川\n桃\nドンブラ\nコッコ'
    }
  ];
  localStorage.setItem('fill_in_the_blank', JSON.stringify(problems));
}

let editingId = null;

// DOM Elements
const tabCreate = document.getElementById('tab-create');
const tabLearn = document.getElementById('tab-learn');
const sectionCreate = document.getElementById('section-create');
const sectionLearn = document.getElementById('section-learn');
const problemsList = document.getElementById('problems-list');
const learningContainer = document.getElementById('learning-container');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  renderProblemsList();
  renderLearningMode();
});

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

// Save to LocalStorage
function saveProblems() {
  localStorage.setItem('fill_in_the_blank', JSON.stringify(problems));
  renderProblemsList();
}

// Add Problem
function addProblem() {
  const questionInput = document.getElementById('question-input');
  const answerInput = document.getElementById('answer-input');

  const question = questionInput.value.trim();
  const answerRaw = answerInput.value.trim();

  if (!question || !answerRaw) {
    alert('Please enter both a sentence and the words to hide.');
    return;
  }

  // Format the answers as a single string of words separated by newline
  const answers = answerRaw.split('\n').map(a => a.trim()).filter(a => a !== '');
  
  if (answers.length === 0) {
    alert('Please enter at least one word to hide.');
    return;
  }
  
  if (answers.length < 3) {
    alert('ダミーの選択肢を生成するため、単語リストには3つ以上の単語を入力してください。');
    return;
  }

  const finalAnswerStr = answers.join('\n');

  // If editing an existing problem
  if (editingId) {
    const pIndex = problems.findIndex(p => p.id === editingId);
    if (pIndex > -1) {
      problems[pIndex].question = question;
      problems[pIndex].answer = finalAnswerStr;
    }
    editingId = null;
    document.getElementById('add-problem-btn').textContent = 'Add Problem';
  } else {
    // Add new problem
    const newProblem = {
      id: Date.now().toString(),
      question: question,
      answer: finalAnswerStr
    };
    problems.push(newProblem);
  }

  saveProblems();

  // Clear inputs
  questionInput.value = '';
  answerInput.value = '';
}

// Edit Problem
function editProblem(id) {
  const p = problems.find(prob => prob.id === id);
  if (!p) return;

  editingId = id;
  document.getElementById('question-input').value = p.question;
  document.getElementById('answer-input').value = p.answer;

  const btn = document.getElementById('add-problem-btn');
  btn.textContent = 'Update Problem';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Delete Problem
function deleteProblem(id) {
  problems = problems.filter(p => p.id !== id);
  saveProblems();
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
      </div>
      <div class="problem-actions">
        <button class="edit-btn" onclick="editProblem('${p.id}')">Edit</button>
        <button class="delete-btn" onclick="deleteProblem('${p.id}')">Delete</button>
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
        saveProblems();
        alert('Data imported successfully!');
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

// API Clients
const currentResource = 'fill_in_the_blank';
const BASE_URL = 'http://localhost:3000';

const getAllItems = (resource) => fetch(`${BASE_URL}/${resource}`).then(res => res.json());
const getItemById = (resource, id) => fetch(`${BASE_URL}/${resource}/${id}`).then(res => res.json());
const createItem = (resource, data) => fetch(`${BASE_URL}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(res => res.json());
const updateItem = (resource, id, data) => fetch(`${BASE_URL}/${resource}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(res => res.json());
const deleteItem = (resource, id) => fetch(`${BASE_URL}/${resource}/${id}`, { method: 'DELETE' }).then(res => res.json());

// API UI Handlers
window.apiGetAll = function() {
  getAllItems(currentResource).then(data => alert(JSON.stringify(data, null, 2))).catch(err => alert(err));
};
window.apiGetById = function() {
  const id = prompt('Enter ID:');
  if(id) getItemById(currentResource, id).then(data => alert(JSON.stringify(data, null, 2))).catch(err => alert(err));
};
window.apiCreate = function() {
  const newProblem = { id: Date.now().toString(), question: "API Test Question", answer: "API Test Answer" };
  createItem(currentResource, newProblem).then(data => alert("Created:\n" + JSON.stringify(data, null, 2))).catch(err => alert(err));
};
window.apiUpdate = function() {
  const id = prompt('Enter ID to update:');
  if(id) {
    const updated = { question: "Updated via API", answer: "Updated via API" };
    updateItem(currentResource, id, updated).then(data => alert("Updated:\n" + JSON.stringify(data, null, 2))).catch(err => alert(err));
  }
};
window.apiDelete = function() {
  const id = prompt('Enter ID to delete:');
  if(id) deleteItem(currentResource, id).then(data => alert("Deleted:\n" + JSON.stringify(data, null, 2))).catch(err => alert(err));
};
