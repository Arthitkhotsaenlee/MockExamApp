'use strict'

const STORAGE_KEYS = {
  questionBank: 'mock-exam-app-question-bank-v1',
  activeExam: 'mock-exam-app-active-exam-v1',
  learning: 'mock-exam-app-learning-v1',
}

const DOMAIN_WEIGHTS = { '1': 0.18, '2': 0.18, '3': 0.12, '4': 0.26, '5': 0.26 }
const DOMAIN_IDS = ['1', '2', '3', '4', '5']

const state = {
  tab: 'load',
  error: null,
  questions: restoreQuestions(),
  selectedDomains: [...DOMAIN_IDS],
  questionCount: 150,
  durationMinutes: 240,
  exam: readStorage(STORAGE_KEYS.activeExam),
  learning: readStorage(STORAGE_KEYS.learning),
}

if (!state.questions.length) {
  state.exam = null
  state.learning = null
}

const main = document.querySelector('#main-content')

document.addEventListener('click', handleClick)
document.addEventListener('change', handleChange)
window.setInterval(updateTimer, 1000)
render()

function readStorage(key) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    state.error = `Browser storage is unavailable: ${error.message}`
  }
}

function restoreQuestions() {
  const questions = readStorage(STORAGE_KEYS.questionBank)
  if (!Array.isArray(questions)) return []
  const valid = questions.every((question) =>
    question && typeof question.id === 'string' && typeof question.question === 'string' &&
    Array.isArray(question.choices) && question.choices.length === 4 &&
    ['A', 'B', 'C', 'D'].includes(question.keyAnswer) && DOMAIN_IDS.includes(question.domainaIndex),
  )
  return valid ? questions : []
}

function saveState() {
  writeStorage(STORAGE_KEYS.questionBank, state.questions.length ? state.questions : null)
  writeStorage(STORAGE_KEYS.activeExam, state.exam)
  writeStorage(STORAGE_KEYS.learning, state.learning)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function hashString(input) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return `q_${(hash >>> 0).toString(16)}`
}

function parseQuestionBank(raw) {
  if (!Array.isArray(raw)) throw new Error('JSON root must be an array of questions.')

  const questions = raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Row ${index + 1}: expected an object.`)
    const required = ['question', 'A', 'B', 'C', 'D', 'justification', 'domain']
    for (const field of required) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        throw new Error(`Row ${index + 1}: invalid ${field}.`)
      }
    }
    if (!['A', 'B', 'C', 'D'].includes(item['key answer'])) {
      throw new Error(`Row ${index + 1}: invalid key answer.`)
    }
    if (typeof item.domaina_index !== 'string' || !DOMAIN_IDS.includes(item.domaina_index)) {
      throw new Error(`Row ${index + 1}: invalid domaina_index.`)
    }

    const id = hashString(`${item.question}|${item.A}|${item.B}|${item.C}|${item.D}`)
    return {
      id,
      question: item.question.trim(),
      choices: ['A', 'B', 'C', 'D'].map((letter) => ({ id: `${id}_${letter}`, letter, text: item[letter].trim() })),
      keyAnswer: item['key answer'],
      justification: item.justification.trim(),
      domain: item.domain.trim(),
      domainaIndex: item.domaina_index,
    }
  })

  return [...new Map(questions.map((question) => [question.id, question])).values()]
}

function getDomains() {
  const domains = new Map()
  for (const question of state.questions) {
    const current = domains.get(question.domainaIndex)
    if (current) current.count += 1
    else domains.set(question.domainaIndex, { domainIndex: question.domainaIndex, domain: question.domain, count: 1 })
  }
  return [...domains.values()].sort((a, b) => Number(a.domainIndex) - Number(b.domainIndex))
}

function questionMap() {
  return new Map(state.questions.map((question) => [question.id, question]))
}

function seededRandom(seed) {
  let current = seed >>> 0
  return () => {
    current += 0x6d2b79f5
    let temp = Math.imul(current ^ (current >>> 15), 1 | current)
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp)
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items, random) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}

function allocateQuestions(selectedDomains, pools, total) {
  const allocation = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, 0]))
  const eligible = selectedDomains.filter((domain) => pools[domain].length)
  if (!eligible.length || total <= 0) return allocation

  const weightTotal = eligible.reduce((sum, domain) => sum + DOMAIN_WEIGHTS[domain], 0)
  const quotas = eligible.map((domain) => ({ domain, value: total * DOMAIN_WEIGHTS[domain] / weightTotal }))
  let assigned = 0

  for (const quota of quotas) {
    allocation[quota.domain] = Math.min(Math.floor(quota.value), pools[quota.domain].length)
    assigned += allocation[quota.domain]
  }

  const priority = quotas
    .map((quota) => ({ ...quota, remainder: quota.value - Math.floor(quota.value) }))
    .sort((a, b) => b.remainder - a.remainder)

  while (assigned < total) {
    let changed = false
    for (const quota of priority) {
      if (assigned >= total) break
      if (allocation[quota.domain] < pools[quota.domain].length) {
        allocation[quota.domain] += 1
        assigned += 1
        changed = true
      }
    }
    if (!changed) break
  }
  return allocation
}

function createExam() {
  if (!state.questions.length) throw new Error('Upload a JSON question file first.')
  if (!state.selectedDomains.length) throw new Error('Select at least one domain.')

  const pools = Object.fromEntries(DOMAIN_IDS.map((domain) => [domain, []]))
  for (const question of state.questions) pools[question.domainaIndex].push(question)
  const available = state.selectedDomains.reduce((sum, domain) => sum + pools[domain].length, 0)
  if (!available) throw new Error('No questions are available for the selected domains.')

  const count = Math.max(1, Math.min(state.questionCount, available))
  const random = seededRandom(Date.now())
  for (const domain of DOMAIN_IDS) pools[domain] = shuffle(pools[domain], random)
  const allocation = allocateQuestions(state.selectedDomains, pools, count)
  const selected = shuffle(DOMAIN_IDS.flatMap((domain) => pools[domain].slice(0, allocation[domain])), random)
  const answers = selected.map((question) => ({ questionId: question.id, selectedChoiceId: null, flagged: false }))
  const startedAt = Date.now()

  return {
    config: { selectedDomains: [...state.selectedDomains], questionCount: count, durationMinutes: state.durationMinutes },
    questionIds: selected.map((question) => question.id),
    answers,
    currentIndex: 0,
    startedAt,
    endsAt: startedAt + state.durationMinutes * 60 * 1000,
    submittedAt: null,
  }
}

function createLearning() {
  if (!state.questions.length) throw new Error('Upload a JSON question file first.')
  if (!state.selectedDomains.length) throw new Error('Select at least one domain.')
  const random = seededRandom(Date.now())
  const eligible = shuffle(state.questions.filter((question) => state.selectedDomains.includes(question.domainaIndex)), random)
  if (!eligible.length) throw new Error('No questions are available for the selected domains.')
  const first = eligible[0]
  const questionStartedAt = Date.now()
  return {
    selectedDomains: [...state.selectedDomains],
    remainingQuestionIds: eligible.slice(1).map((question) => question.id),
    seenQuestionIds: [first.id],
    currentQuestionId: first.id,
    selectedChoiceId: null,
    isCorrect: null,
    questionStartedAt,
    questionAnsweredAt: null,
    correctCount: 0,
    incorrectCount: 0,
  }
}

function nextLearningQuestion() {
  if (!state.learning.remainingQuestionIds.length) {
    state.learning.currentQuestionId = null
    state.learning.selectedChoiceId = null
    state.learning.isCorrect = null
    state.learning.questionStartedAt = null
    state.learning.questionAnsweredAt = null
    return
  }
  const [nextId, ...remaining] = state.learning.remainingQuestionIds
  const question = questionMap().get(nextId)
  state.learning.remainingQuestionIds = remaining
  if (!question) return nextLearningQuestion()
  state.learning.currentQuestionId = nextId
  state.learning.seenQuestionIds.push(nextId)
  state.learning.selectedChoiceId = null
  state.learning.isCorrect = null
  state.learning.questionStartedAt = Date.now()
  state.learning.questionAnsweredAt = null
}

function ensureLearningTiming() {
  if (!state.learning?.currentQuestionId) return false
  let changed = false
  if (!Number.isFinite(state.learning.questionStartedAt)) {
    state.learning.questionStartedAt = Date.now()
    changed = true
  }
  if (!('questionAnsweredAt' in state.learning)) {
    state.learning.questionAnsweredAt = state.learning.selectedChoiceId ? Date.now() : null
    changed = true
  }
  return changed
}

function calculateResult() {
  let correct = 0
  let incorrect = 0
  let unanswered = 0
  const byDomain = {}
  const details = []
  const questions = questionMap()

  for (const answer of state.exam.answers) {
    const question = questions.get(answer.questionId)
    if (!question) continue
    const choices = question.choices
    const selectedChoice = choices.find((choice) => choice.id === answer.selectedChoiceId) || null
    const correctChoice = choices.find((choice) => choice.letter === question.keyAnswer)
    const key = `${question.domainaIndex} - ${question.domain}`
    byDomain[key] ||= { correct: 0, incorrect: 0, unanswered: 0, total: 0 }
    byDomain[key].total += 1
    let status = 'unanswered'
    if (!selectedChoice) {
      unanswered += 1
      byDomain[key].unanswered += 1
    } else if (selectedChoice.letter === question.keyAnswer) {
      correct += 1
      status = 'correct'
      byDomain[key].correct += 1
    } else {
      incorrect += 1
      status = 'incorrect'
      byDomain[key].incorrect += 1
    }
    details.push({ question, selectedChoice, correctChoice, status })
  }

  const total = state.exam.answers.length
  return { total, correct, incorrect, unanswered, percent: total ? Math.round(correct / total * 10000) / 100 : 0, byDomain, details }
}

function render() {
  renderHeader()
  renderNavigation()
  const alert = state.error
    ? `<div class="alert" role="alert"><strong>Unable to continue</strong><span>${escapeHtml(state.error)}</span><button data-action="dismiss-error" aria-label="Dismiss error">×</button></div>`
    : ''
  const content = state.tab === 'mock' ? renderMock() : state.tab === 'learn' ? renderLearning() : renderDashboard()
  main.innerHTML = alert + content
}

function renderHeader() {
  const status = document.querySelector('#data-status')
  status.classList.toggle('ready', Boolean(state.questions.length))
  status.lastElementChild.textContent = state.questions.length ? `${state.questions.length} questions ready` : 'No question bank'
  document.querySelector('#reset-button').disabled = !state.questions.length && !state.exam && !state.learning
}

function renderNavigation() {
  document.querySelectorAll('[data-action="tab"]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.tab && button.closest('nav'))
  })
}

function pageHeading(eyebrow, title, description, extra = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${description}</p></div>${extra}</div>`
}

function renderDashboard() {
  const domains = getDomains()
  const success = state.questions.length
    ? `<div class="success-strip"><span>✓</span><div><strong>Question bank loaded</strong><small>${state.questions.length} valid questions across ${domains.length} domains</small></div></div>`
    : ''
  const coverage = domains.length
    ? `<section class="card domain-overview"><div class="section-title"><div><h2>Question coverage</h2><p>Your available questions by domain</p></div><span class="pill">${state.questions.length} total</span></div><div class="domain-grid">${domains.map((domain) => `<div class="domain-stat"><span class="domain-number">${domain.domainIndex}</span><div><strong>${escapeHtml(domain.domain)}</strong><small>${domain.count} questions</small></div></div>`).join('')}</div></section>`
    : ''

  return `${pageHeading('Dashboard', 'Ready to study?', 'Load your question bank, then choose how you want to practise.')}
    <section class="dashboard-grid">
      <article class="card upload-card">
        <div class="card-heading"><span class="feature-icon">↥</span><div><h2>Question bank</h2><p>Import a compatible JSON file to begin.</p></div></div>
        <label class="drop-zone"><input id="question-file" type="file" accept="application/json,.json"><span class="upload-icon">＋</span><strong>${state.questions.length ? 'Replace question bank' : 'Choose a JSON file'}</strong><small>File processing happens only on your device</small></label>
        ${success}
      </article>
      <article class="card quick-start">
        <div class="card-heading"><span class="feature-icon purple">⌁</span><div><h2>Choose a study mode</h2><p>Test your readiness or learn at your pace.</p></div></div>
        <button class="mode-card" data-action="tab" data-tab="mock" ${state.questions.length ? '' : 'disabled'}><span><strong>Mock exam</strong><small>Timed practice with results at the end</small></span><b>→</b></button>
        <button class="mode-card" data-action="tab" data-tab="learn" ${state.questions.length ? '' : 'disabled'}><span><strong>Learning mode</strong><small>Immediate feedback after every answer</small></span><b>→</b></button>
      </article>
    </section>${coverage}`
}

function renderDomainSelector() {
  const domains = getDomains()
  if (!domains.length) return `<fieldset class="domain-selector"><legend>Included domains</legend><div class="empty-state"><span>↥</span><strong>No question bank loaded</strong><p>Go to the dashboard and upload a JSON file first.</p></div></fieldset>`
  return `<fieldset class="domain-selector"><legend>Included domains</legend><div class="domain-options">${domains.map((domain) => {
    const selected = state.selectedDomains.includes(domain.domainIndex)
    return `<label class="${selected ? 'selected' : ''}"><input type="checkbox" data-setting="domain" value="${domain.domainIndex}" ${selected ? 'checked' : ''}><span class="checkmark">✓</span><span class="domain-number">${domain.domainIndex}</span><span class="domain-copy"><strong>${escapeHtml(domain.domain)}</strong><small>${domain.count} questions available</small></span></label>`
  }).join('')}</div></fieldset>`
}

function renderMock() {
  const timer = state.exam && !state.exam.submittedAt
    ? `<div class="timer"><small>Time remaining</small><strong id="timer-value">${formatTime(state.exam.endsAt - Date.now())}</strong></div>`
    : ''
  let body = ''
  if (!state.exam) body = renderMockSetup()
  else if (state.exam.submittedAt) body = renderResult()
  else body = `<section class="card exam-card">${renderExamQuestion()}</section>`
  return `${pageHeading('Exam simulator', 'Mock exam', 'Build a focused, timed exam from your question bank.', timer)}${body}`
}

function renderMockSetup() {
  return `<section class="card setup-card">
    <div class="section-title"><div><h2>Exam settings</h2><p>Customise the session before you begin.</p></div></div>
    <div class="controls">
      <label><span>Number of questions</span><input data-setting="question-count" type="number" min="1" max="${state.questions.length || 1}" value="${state.questionCount}"><small>${state.questions.length} available</small></label>
      <label><span>Time limit</span><div class="input-suffix"><input data-setting="duration" type="number" min="1" value="${state.durationMinutes}"><span>min</span></div><small>Recommended: 1.6 minutes per question</small></label>
    </div>
    ${renderDomainSelector()}
    <div class="setup-footer"><p>Questions are randomized; answer choices remain in A–D order.</p><button class="primary" data-action="start-mock">Start mock exam <span>→</span></button></div>
  </section>`
}

function renderExamQuestion() {
  const exam = state.exam
  const answer = exam.answers[exam.currentIndex]
  const question = questionMap().get(answer.questionId)
  if (!question) return `<div class="empty-state"><strong>Question not found</strong></div>`
  const answered = exam.answers.filter((entry) => entry.selectedChoiceId).length
  const progress = (exam.currentIndex + 1) / exam.answers.length * 100
  const choices = question.choices

  return `<section class="question-layout">
    <aside class="question-map"><div><strong>Questions</strong><small>${answered} of ${exam.answers.length} answered</small></div><div class="navigator">${exam.answers.map((entry, index) => `<button data-action="exam-goto" data-index="${index}" class="${index === exam.currentIndex ? 'active' : ''} ${entry.selectedChoiceId ? 'answered' : ''} ${entry.flagged ? 'flagged' : ''}" aria-label="Question ${index + 1}${entry.flagged ? ', flagged' : ''}">${index + 1}</button>`).join('')}</div><div class="map-legend"><span><i class="answered"></i> Answered</span><span><i class="flagged"></i> Flagged</span></div></aside>
    <div class="question-panel"><div class="progress"><span style="width:${progress}%"></span></div><div class="question-meta"><span>Question ${exam.currentIndex + 1} of ${exam.answers.length}</span><span>Domain ${question.domainaIndex}</span></div><h2 class="question-text">${escapeHtml(question.question)}</h2><div class="choices">${choices.map((choice) => `<button data-action="exam-answer" data-choice="${choice.id}" class="${answer.selectedChoiceId === choice.id ? 'selected' : ''}"><span class="choice-letter">${choice.letter}</span><span>${escapeHtml(choice.text)}</span><span class="choice-check">✓</span></button>`).join('')}</div>
      <div class="exam-actions"><button class="flag-button ${answer.flagged ? 'active' : ''}" data-action="exam-flag">⚑ ${answer.flagged ? 'Flagged' : 'Flag for review'}</button><div><button class="secondary" data-action="exam-prev" ${exam.currentIndex === 0 ? 'disabled' : ''}>← Previous</button>${exam.currentIndex < exam.answers.length - 1 ? '<button class="primary" data-action="exam-next">Next <span>→</span></button>' : '<button class="primary" data-action="exam-submit">Submit exam</button>'}</div></div>
    </div>
  </section>`
}

function renderResult() {
  const result = calculateResult()
  const passed = result.percent >= 70
  const color = passed ? 'var(--green)' : 'var(--red)'
  return `<div class="result-layout"><section class="card result-card"><div class="score-ring ${passed ? 'passed' : ''}" style="background:conic-gradient(${color} ${result.percent}%, #eef0f5 0)"><strong>${result.percent}%</strong><span>${passed ? 'Great work' : 'Keep learning'}</span></div><div class="result-copy"><p class="eyebrow">Exam complete</p><h2>Your results</h2><p>You answered ${result.correct} of ${result.total} questions correctly.</p><div class="result-stats"><div><strong>${result.correct}</strong><span>Correct</span></div><div><strong>${result.incorrect}</strong><span>Incorrect</span></div><div><strong>${result.unanswered}</strong><span>Unanswered</span></div></div><button class="primary" data-action="new-exam">Create another exam</button></div></section>${renderAnswerReview(result)}</div>`
}

function renderAnswerReview(result) {
  const questions = result.details.map((detail, index) => {
    const statusLabel = detail.status === 'correct' ? 'Correct' : detail.status === 'incorrect' ? 'Incorrect' : 'Unanswered'
    const selectedAnswer = detail.selectedChoice
      ? `${detail.selectedChoice.letter}. ${detail.selectedChoice.text}`
      : 'Not answered'
    const correctAnswer = detail.correctChoice
      ? `${detail.correctChoice.letter}. ${detail.correctChoice.text}`
      : detail.question.keyAnswer
    const choices = detail.question.choices.map((choice) => {
      const isCorrect = choice.letter === detail.question.keyAnswer
      const isSelected = detail.selectedChoice?.id === choice.id
      const className = isCorrect ? 'correct' : isSelected ? 'incorrect' : ''
      const marker = isCorrect ? '✓' : isSelected ? '×' : ''
      return `<button type="button" disabled class="${className}"><span class="choice-letter">${choice.letter}</span><span>${escapeHtml(choice.text)}</span><span class="choice-check">${marker}</span></button>`
    }).join('')

    return `<details class="card review-item ${detail.status}"><summary><span class="review-number">${index + 1}</span><span class="review-summary"><strong>${escapeHtml(detail.question.question)}</strong><small>Domain ${detail.question.domainaIndex} · ${escapeHtml(detail.question.domain)}</small></span><span class="review-status ${detail.status}">${statusLabel}</span></summary><div class="review-body"><div class="review-answer-line"><span>Your answer: <strong>${escapeHtml(selectedAnswer)}</strong></span><span>Correct answer: <strong>${escapeHtml(correctAnswer)}</strong></span></div><div class="choices review-choices">${choices}</div><div class="explanation"><strong>Explanation</strong><p>${escapeHtml(detail.question.justification)}</p></div></div></details>`
  }).join('')

  return `<section class="answer-review" aria-labelledby="answer-review-title"><div class="review-heading"><div><p class="eyebrow">Answer key</p><h2 id="answer-review-title">Review every question</h2><p>Open a question to compare your answer with the correct answer and explanation.</p></div></div><div class="review-list">${questions}</div></section>`
}

function renderLearning() {
  if (ensureLearningTiming()) saveState()
  const timer = state.learning?.currentQuestionId
    ? `<div class="timer"><small>${state.learning.questionAnsweredAt ? 'Time taken' : 'Time on question'}</small><strong id="learning-timer-value">${formatTime((state.learning.questionAnsweredAt || Date.now()) - state.learning.questionStartedAt)}</strong></div>`
    : ''
  let body
  if (!state.learning) {
    body = `<section class="card setup-card"><div class="section-title"><div><h2>Choose your focus</h2><p>Select one or more domains for this session.</p></div></div>${renderDomainSelector()}<div class="setup-footer"><p>Questions will not repeat during this session.</p><button class="primary" data-action="start-learning">Start learning <span>→</span></button></div></section>`
  } else if (!state.learning.currentQuestionId) {
    body = `<section class="card exam-card"><div class="session-complete"><span>✓</span><h2>Session complete</h2><p>You answered ${state.learning.correctCount} correctly and ${state.learning.incorrectCount} incorrectly.</p><button class="primary" data-action="new-learning">Start another session</button></div></section>`
  } else {
    body = `<section class="card exam-card">${renderLearningQuestion()}</section>`
  }
  return `${pageHeading('Guided practice', 'Learning mode', 'Answer one question at a time with instant explanations.', timer)}${body}`
}

function renderLearningQuestion() {
  const learning = state.learning
  const question = questionMap().get(learning.currentQuestionId)
  if (!question) return `<div class="empty-state"><strong>Question not found</strong></div>`
  const choices = question.choices
  const currentNumber = learning.seenQuestionIds.length
  const totalQuestions = currentNumber + learning.remainingQuestionIds.length
  const answered = learning.selectedChoiceId !== null
  const choiceMarkup = choices.map((choice) => {
    const correct = answered && choice.letter === question.keyAnswer
    const incorrect = answered && learning.selectedChoiceId === choice.id && !correct
    return `<button data-action="learning-answer" data-choice="${choice.id}" ${answered ? 'disabled' : ''} class="${learning.selectedChoiceId === choice.id ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}"><span class="choice-letter">${choice.letter}</span><span>${escapeHtml(choice.text)}</span><span class="choice-check">${incorrect ? '×' : '✓'}</span></button>`
  }).join('')
  const feedback = answered
    ? `<section class="feedback ${learning.isCorrect ? 'good' : 'bad'}"><div class="feedback-title"><span>${learning.isCorrect ? '✓' : '!'}</span><div><strong>${learning.isCorrect ? 'Correct answer' : 'Not quite'}</strong><small>${learning.isCorrect ? 'Well done — keep it going.' : `The correct answer is ${question.keyAnswer}.`}</small></div></div><div class="explanation"><strong>Explanation</strong><p>${escapeHtml(question.justification)}</p></div><button class="primary" data-action="learning-next">Next question <span>→</span></button></section>`
    : ''
  return `<section class="learning-panel"><div class="learning-stats"><div><span>Progress</span><strong>${currentNumber} / ${totalQuestions}</strong></div><div class="stat-correct"><span>Correct</span><strong>${learning.correctCount}</strong></div><div class="stat-incorrect"><span>Incorrect</span><strong>${learning.incorrectCount}</strong></div></div><div class="question-meta"><span>Domain ${question.domainaIndex}</span><span>${escapeHtml(question.domain)}</span></div><h2 class="question-text">${escapeHtml(question.question)}</h2><div class="choices">${choiceMarkup}</div>${feedback}</section>`
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function updateTimer() {
  const now = Date.now()
  if (state.exam && !state.exam.submittedAt) {
    const remaining = state.exam.endsAt - now
    if (remaining <= 0) {
      state.exam.submittedAt = now
      saveState()
      render()
    } else {
      const timer = document.querySelector('#timer-value')
      if (timer) timer.textContent = formatTime(remaining)
    }
  }

  if (state.learning?.currentQuestionId && !state.learning.questionAnsweredAt) {
    if (ensureLearningTiming()) saveState()
    const timer = document.querySelector('#learning-timer-value')
    if (timer) timer.textContent = formatTime(now - state.learning.questionStartedAt)
  }
}

async function loadQuestionFile(file) {
  if (!file) return
  try {
    const questions = parseQuestionBank(JSON.parse(await file.text()))
    if (!questions.length) throw new Error('No valid questions found in the selected file.')
    state.questions = questions
    state.selectedDomains = [...DOMAIN_IDS]
    state.exam = null
    state.learning = null
    state.error = null
    state.tab = 'mock'
    saveState()
  } catch (error) {
    console.error('Question file import failed:', error)
    state.error = `Could not load ${file.name}: ${error.message || 'Unknown error.'}`
  }
  render()
}

function handleChange(event) {
  const target = event.target
  if (target.id === 'question-file') {
    loadQuestionFile(target.files?.[0])
    target.value = ''
    return
  }
  if (target.dataset.setting === 'question-count') state.questionCount = Math.max(1, Number(target.value) || 1)
  if (target.dataset.setting === 'duration') state.durationMinutes = Math.max(1, Number(target.value) || 1)
  if (target.dataset.setting === 'domain') {
    const domain = target.value
    if (target.checked) state.selectedDomains = [...new Set([...state.selectedDomains, domain])].sort()
    else state.selectedDomains = state.selectedDomains.filter((item) => item !== domain)
    render()
  }
}

function handleClick(event) {
  const button = event.target.closest('[data-action]')
  if (!button || button.disabled) return
  const action = button.dataset.action

  if (action === 'tab') {
    state.tab = button.dataset.tab
    state.error = null
    render()
  } else if (action === 'dismiss-error') {
    state.error = null
    render()
  } else if (action === 'reset') {
    if (!window.confirm('Reset the application? This will remove the question bank and all saved progress from this browser.')) return
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key))
    state.tab = 'load'
    state.error = null
    state.questions = []
    state.selectedDomains = [...DOMAIN_IDS]
    state.questionCount = 150
    state.durationMinutes = 240
    state.exam = null
    state.learning = null
    render()
  } else if (action === 'start-mock') {
    try {
      state.exam = createExam()
      state.error = null
      saveState()
      render()
    } catch (error) {
      state.error = error.message
      render()
    }
  } else if (action === 'exam-goto') {
    state.exam.currentIndex = Number(button.dataset.index)
    saveState()
    render()
  } else if (action === 'exam-answer') {
    state.exam.answers[state.exam.currentIndex].selectedChoiceId = button.dataset.choice
    saveState()
    render()
  } else if (action === 'exam-flag') {
    const answer = state.exam.answers[state.exam.currentIndex]
    answer.flagged = !answer.flagged
    saveState()
    render()
  } else if (action === 'exam-prev' || action === 'exam-next') {
    const offset = action === 'exam-prev' ? -1 : 1
    state.exam.currentIndex = Math.max(0, Math.min(state.exam.answers.length - 1, state.exam.currentIndex + offset))
    saveState()
    render()
  } else if (action === 'exam-submit') {
    if (!window.confirm('Submit this exam and view your results?')) return
    state.exam.submittedAt = Date.now()
    saveState()
    render()
  } else if (action === 'new-exam') {
    state.exam = null
    saveState()
    render()
  } else if (action === 'start-learning') {
    try {
      state.learning = createLearning()
      state.error = null
      saveState()
      render()
    } catch (error) {
      state.error = error.message
      render()
    }
  } else if (action === 'learning-answer') {
    if (state.learning.selectedChoiceId !== null) return
    const question = questionMap().get(state.learning.currentQuestionId)
    const choice = question.choices.find((item) => item.id === button.dataset.choice)
    const correct = choice.letter === question.keyAnswer
    state.learning.selectedChoiceId = choice.id
    state.learning.isCorrect = correct
    state.learning.questionAnsweredAt = Date.now()
    state.learning.correctCount += correct ? 1 : 0
    state.learning.incorrectCount += correct ? 0 : 1
    saveState()
    render()
  } else if (action === 'learning-next') {
    nextLearningQuestion()
    saveState()
    render()
  } else if (action === 'new-learning') {
    state.learning = null
    saveState()
    render()
  }
}
