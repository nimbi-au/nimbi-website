/* Readiness check on /readiness-check/. Every question for every sector is in
   the HTML; this script reveals the chosen sector's service questions, walks
   through the arrangement questions one at a time, and writes the review
   priorities from the checked answers. The wording it needs comes from the
   page's #readiness-data JSON. Nothing leaves the page. */
(function () {
  'use strict';
  var GUIDES = {
    accountants: "/who-we-help/accountants/",
    legal: "/who-we-help/lawyers-and-conveyancers/",
    real_estate: "/who-we-help/real-estate/"
  };
  var GUIDE_NAMES = {
    accountants: 'accountants guide',
    legal: 'lawyers and conveyancers guide',
    real_estate: 'real estate guide'
  };

  function $(selector) { return document.querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function safe(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var sectorSelect = document.getElementById('readiness-sector');
  var dataEl = document.getElementById('readiness-data');
  var partOne = document.getElementById('readiness-part-one');
  var partTwo = document.getElementById('readiness-part-two');
  var readinessSummary = document.getElementById('readiness-summary');
  var scopeQuestions = document.getElementById('scope-questions');
  var readinessQuestions = document.getElementById('readiness-questions');
  var questionNav = document.getElementById('readiness-question-nav');
  var stage = document.getElementById('readiness-stage');
  var scopeError = document.getElementById('readiness-stage-error');
  var scopeProgress = document.getElementById('scope-progress');
  var scopeResult = document.getElementById('scope-result');
  var readinessProgress = document.getElementById('readiness-progress');
  var readinessResult = document.getElementById('readiness-result');
  var prevButton = document.getElementById('readiness-prev');
  var nextButton = document.getElementById('readiness-next');
  var questionProgress = document.getElementById('readiness-question-progress');
  var goPartTwo = document.getElementById('go-part-two');
  var backButton = document.getElementById('readiness-back');
  var resetButton = document.getElementById('reset-readiness');
  var required = [sectorSelect, dataEl, partOne, partTwo, readinessSummary, scopeQuestions, readinessQuestions,
    questionNav, stage, scopeError, scopeProgress, scopeResult, readinessProgress, readinessResult,
    prevButton, nextButton, questionProgress, goPartTwo, backButton, resetButton];
  if (required.some(function (el) { return !el; })) return;

  var R;
  try { R = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!R || !R.scope_rules || !R.result_rules) return;
  R.questions = R.questions || [];
  R.scope = R.scope || {};

  var answerError = document.getElementById('readiness-answer-error');
  if (!answerError) {
    answerError = document.createElement('p');
    answerError.id = 'readiness-answer-error';
    answerError.className = 'form-error';
    answerError.setAttribute('role', 'status');
    answerError.hidden = true;
    questionNav.before(answerError);
  }
  /* The link to the chosen sector's guide sits under the scope result. */
  var guideLine = document.getElementById('scope-guide');
  if (!guideLine) {
    guideLine = document.createElement('p');
    guideLine.id = 'scope-guide';
    guideLine.hidden = true;
    scopeResult.after(guideLine);
  }

  var readinessStage = 1, readinessQuestion = 0, readinessComplete = false;

  /* ---------- reading the pre-rendered markup ---------- */
  function scopeSets() { return $$('.scope-set', scopeQuestions); }
  function activeScopeSet() {
    var sector = sectorSelect.value;
    if (!sector) return null;
    return scopeSets().filter(function (set) { return set.dataset.sector === sector; })[0] || null;
  }
  function scopeFieldsets() {
    var set = activeScopeSet();
    return set ? $$('.check-question', set) : [];
  }
  function readinessFieldsets() { return $$('.check-question', readinessQuestions); }
  function answersOf(fieldsets) {
    return fieldsets.map(function (fieldset) {
      var checked = fieldset.querySelector('input[type="radio"]:checked');
      return checked ? checked.value : '';
    });
  }
  function legendText(fieldset) {
    var legend = fieldset.querySelector('legend');
    return legend ? legend.textContent.trim() : '';
  }
  function titleOf(fieldset, index) {
    var q = R.questions[index];
    return q && q.title ? q.title : legendText(fieldset);
  }
  function scopeQuestionOf(fieldset, index) {
    var qs = R.scope[sectorSelect.value] || [], q = qs[index];
    return q && q.question ? q.question : legendText(fieldset);
  }

  /* ---------- errors, focus and display ---------- */
  function clearReadinessErrors() {
    scopeError.textContent = ''; scopeError.hidden = true;
    answerError.textContent = ''; answerError.hidden = true;
  }
  function focusReadinessElement(el) {
    if (!el) return;
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  function renderGuide(sector) {
    if (!GUIDES[sector]) { guideLine.hidden = true; guideLine.textContent = ''; return; }
    var link = document.createElement('a');
    link.href = GUIDES[sector];
    link.textContent = 'Read the ' + GUIDE_NAMES[sector];
    guideLine.textContent = '';
    guideLine.appendChild(link);
    guideLine.hidden = false;
  }
  function displayReadiness(focus) {
    partOne.hidden = readinessStage !== 1;
    partTwo.hidden = readinessStage !== 2;
    readinessSummary.hidden = !readinessComplete;
    var layout = $('[data-page="readiness"] .check-layout') || $('.check-layout');
    if (layout) layout.classList.toggle('readiness-complete', readinessComplete);
    stage.textContent = readinessComplete ? 'Your review priorities' : readinessStage === 1 ? 'Step 1 of 2 · Your services' : 'Step 2 of 2 · Your arrangements';
    var fieldsets = readinessFieldsets();
    fieldsets.forEach(function (fieldset, i) { fieldset.hidden = i !== readinessQuestion || readinessComplete; });
    readinessQuestions.hidden = readinessComplete;
    questionNav.hidden = readinessComplete;
    prevButton.disabled = readinessQuestion === 0;
    questionProgress.textContent = 'Question ' + (readinessQuestion + 1) + ' of ' + fieldsets.length;
    nextButton.textContent = readinessQuestion === fieldsets.length - 1 ? 'Show my priorities' : 'Next question';
    if (focus) {
      var current = fieldsets[readinessQuestion];
      focusReadinessElement(readinessComplete ? readinessSummary : readinessStage === 1 ? partOne.querySelector('h2') : current ? current.querySelector('legend') : null);
    }
  }
  function renderScope() {
    var sector = sectorSelect.value;
    scopeSets().forEach(function (set) { set.hidden = !sector || set.dataset.sector !== sector; });
    clearReadinessErrors();
    updateResults();
  }

  /* ---------- results ---------- */
  function updateResults() {
    var sector = sectorSelect.value;
    var fieldsets = scopeFieldsets(), answers = answersOf(fieldsets);
    var answered = answers.filter(function (v) { return v; });
    var complete = !!sector && answered.length === fieldsets.length;
    scopeProgress.textContent = sector ? answered.length + ' of ' + fieldsets.length + ' service questions answered' : 'Choose an industry to begin.';
    var scopeText = sector ? 'Complete the remaining questions to see the areas to check.' : 'Your services help determine which obligations may apply.';
    if (complete) {
      scopeText = answers.indexOf('yes') >= 0 ? R.scope_rules.any_yes
        : answers.indexOf('unsure') >= 0 ? R.scope_rules.any_unsure_no_yes
        : R.scope_rules.all_no;
    }
    var scopeHtml = '<p>' + safe(scopeText) + '</p>';
    if (complete && answers.indexOf('yes') >= 0 && answers.indexOf('unsure') >= 0) {
      scopeHtml += '<p><strong>Also clarify:</strong></p><ul>' + fieldsets.map(function (fieldset, i) {
        return answers[i] === 'unsure' ? '<li>' + safe(scopeQuestionOf(fieldset, i)) + '</li>' : '';
      }).join('') + '</ul>';
    }
    scopeResult.innerHTML = scopeHtml;
    renderGuide(sector);

    var rFieldsets = readinessFieldsets(), rAnswers = answersOf(rFieldsets);
    var total = rFieldsets.length;
    var done = rAnswers.filter(function (v) { return v; }).length;
    var left = total - done;
    readinessProgress.textContent = done + ' of ' + total + ' answered';
    if (left > 0) {
      readinessResult.innerHTML = '<p>Complete ' + left + ' remaining ' + (left === 1 ? 'question' : 'questions') + ' to see your review priorities.</p>';
      return;
    }
    var work = [], unsure = [];
    rFieldsets.forEach(function (fieldset, i) {
      if (rAnswers[i] === 'work') work.push(titleOf(fieldset, i));
      else if (rAnswers[i] === 'unsure') unsure.push(titleOf(fieldset, i));
    });
    var output = '';
    [['Needs attention', work], ['Clarify next', unsure]].forEach(function (group) {
      var label = group[0], list = group[1];
      if (list.length) output += '<p><strong>' + label + '</strong></p><ul>' + list.map(function (title) { return '<li>' + safe(title) + '</li>'; }).join('') + '</ul>';
    });
    if (!work.length && !unsure.length) output = '<p>' + safe(R.result_rules.all_in_place) + '</p>';
    readinessResult.innerHTML = output + '<p>' + safe(R.result_note) + '</p>';
  }

  /* ---------- wiring ---------- */
  sectorSelect.addEventListener('change', function () {
    readinessComplete = false;
    renderScope();
    displayReadiness();
  });
  scopeQuestions.addEventListener('change', function (e) {
    if (e.target.matches('input[type="radio"]')) { clearReadinessErrors(); updateResults(); }
  });
  readinessQuestions.addEventListener('change', function (e) {
    if (e.target.matches('input[type="radio"]')) { clearReadinessErrors(); updateResults(); }
  });
  goPartTwo.addEventListener('click', function (e) {
    e.preventDefault();
    clearReadinessErrors();
    var sector = sectorSelect.value, fieldsets = scopeFieldsets(), answers = answersOf(fieldsets);
    var firstUnanswered = -1;
    if (sector) {
      for (var i = 0; i < fieldsets.length; i++) { if (!answers[i]) { firstUnanswered = i; break; } }
    }
    if (!sector || firstUnanswered >= 0) {
      scopeError.textContent = !sector ? 'Choose your industry to continue.' : 'Answer each service question to continue. Choose “Not sure” if you need to check.';
      scopeError.hidden = false;
      var focusTarget = !sector ? sectorSelect : fieldsets[firstUnanswered].querySelector('input');
      if (focusTarget) {
        focusTarget.focus();
        focusTarget.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
      return;
    }
    readinessStage = 2; readinessQuestion = 0; readinessComplete = false;
    displayReadiness(true);
  });
  backButton.addEventListener('click', function () {
    clearReadinessErrors();
    readinessStage = 1; readinessComplete = false;
    displayReadiness(true);
  });
  prevButton.addEventListener('click', function () {
    if (readinessQuestion > 0) { clearReadinessErrors(); readinessQuestion--; displayReadiness(true); }
  });
  nextButton.addEventListener('click', function () {
    clearReadinessErrors();
    var fieldsets = readinessFieldsets(), answers = answersOf(fieldsets);
    if (!answers[readinessQuestion]) {
      answerError.textContent = 'Choose an answer to continue. Select “Not sure” if you need to check.';
      answerError.hidden = false;
      var input = fieldsets[readinessQuestion] ? fieldsets[readinessQuestion].querySelector('input') : null;
      if (input) input.focus();
      return;
    }
    if (readinessQuestion < fieldsets.length - 1) readinessQuestion++;
    else readinessComplete = true;
    updateResults();
    displayReadiness(true);
  });
  resetButton.addEventListener('click', function () {
    $$('input[type="radio"]', scopeQuestions).concat($$('input[type="radio"]', readinessQuestions)).forEach(function (input) { input.checked = false; });
    sectorSelect.value = '';
    readinessStage = 1; readinessQuestion = 0; readinessComplete = false;
    renderScope();
    displayReadiness(true);
  });

  /* Browsers may restore the select and radios on reload, so start from the markup. */
  renderScope();
  displayReadiness();
})();
