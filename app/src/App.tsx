import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'
import {
  STORAGE_KEYS,
  calculateMockResult,
  createLearningState,
  getDomainSummaries,
  nextLearningQuestion,
  parseQuestionBank,
  safeParseLocalStorage,
  saveLocalStorage,
  startMockExam,
} from './lib'
import type { ActiveExamState, DomainIndex, LearningState, QuestionRecord } from './types'

type Tab = 'load' | 'mock' | 'learn'

function App() {
  const [tab, setTab] = useState<Tab>('load')
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuestionRecord[]>(() => safeParseLocalStorage<QuestionRecord[]>(STORAGE_KEYS.questionBank) ?? [])

  const [selectedDomains, setSelectedDomains] = useState<DomainIndex[]>(['1', '2', '3', '4'])
  const [questionCount, setQuestionCount] = useState<number>(150)
  const [durationMinutes, setDurationMinutes] = useState<number>(240)

  const [exam, setExam] = useState<ActiveExamState | null>(() => safeParseLocalStorage<ActiveExamState>(STORAGE_KEYS.activeExam))
  const [learning, setLearning] = useState<LearningState | null>(() => safeParseLocalStorage<LearningState>(STORAGE_KEYS.learning))
  const [now, setNow] = useState<number>(Date.now())

  const questionsById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions])
  const domains = useMemo(() => getDomainSummaries(questions), [questions])

  useEffect(() => {
    saveLocalStorage(STORAGE_KEYS.questionBank, questions.length > 0 ? questions : null)
  }, [questions])

  useEffect(() => {
    saveLocalStorage(STORAGE_KEYS.activeExam, exam)
  }, [exam])

  useEffect(() => {
    saveLocalStorage(STORAGE_KEYS.learning, learning)
  }, [learning])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!exam || exam.submittedAt) return
    if (now >= exam.endsAt) {
      setExam((prev) => (prev ? { ...prev, submittedAt: Date.now() } : prev))
    }
  }, [exam, now])

  const remainingSeconds = exam ? Math.max(0, Math.floor((exam.endsAt - now) / 1000)) : 0
  const examResult = exam?.submittedAt ? calculateMockResult(exam, questionsById) : null

  async function onFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text())
      const questionBank = parseQuestionBank(parsed)
      if (questionBank.length === 0) {
        throw new Error('No valid questions found in the selected file.')
      }
      setQuestions(questionBank)
      setExam(null)
      setLearning(null)
      setError(null)
      setTab('mock')
    } catch (uploadError) {
      console.error('Question file import failed:', uploadError)
      setError(
        uploadError instanceof Error
          ? `Could not load ${file.name}: ${uploadError.message}`
          : `Could not load ${file.name}.`,
      )
    }
  }

  function toggleDomain(domain: DomainIndex) {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((item) => item !== domain) : [...prev, domain].sort(),
    )
  }

  function startExam() {
    if (questions.length === 0) {
      setError('Upload a JSON question file first.')
      setTab('load')
      return
    }
    if (selectedDomains.length === 0) {
      setError('Select at least one domain.')
      return
    }
    const state = startMockExam(questions, {
      selectedDomains,
      questionCount,
      durationMinutes,
    })
    setExam(state)
    setError(null)
    setTab('mock')
  }

  function startLearning() {
    if (questions.length === 0) {
      setError('Upload a JSON question file first.')
      setTab('load')
      return
    }
    if (selectedDomains.length === 0) {
      setError('Select at least one domain.')
      return
    }
    setLearning(createLearningState(questions, selectedDomains))
    setError(null)
    setTab('learn')
  }

  function resetApplication() {
    if (!window.confirm('Reset the application? This will remove the question bank and all saved progress from this browser.')) return

    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key))
    setQuestions([])
    setExam(null)
    setLearning(null)
    setSelectedDomains(['1', '2', '3', '4'])
    setQuestionCount(150)
    setDurationMinutes(240)
    setError(null)
    setTab('load')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('load')} aria-label="Open dashboard">
          <span className="brand-mark">C</span>
          <span><strong>CISA Study</strong><small>Exam preparation</small></span>
        </button>
        <div className="topbar-actions">
          <span className={`data-status ${questions.length ? 'ready' : ''}`}>
            <span className="status-dot" />
            {questions.length ? `${questions.length} questions ready` : 'No question bank'}
          </span>
          <button className="reset-button" onClick={resetApplication} disabled={!questions.length && !exam && !learning} title="Clear the question bank and all saved progress">
            <span>↻</span> Reset app
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <p className="nav-label">Workspace</p>
          <nav aria-label="Main navigation">
            <button onClick={() => setTab('load')} className={tab === 'load' ? 'active' : ''}>
              <span className="nav-icon">⌂</span><span>Dashboard</span>
            </button>
            <button onClick={() => setTab('mock')} className={tab === 'mock' ? 'active' : ''}>
              <span className="nav-icon">◷</span><span>Mock exam</span>
            </button>
            <button onClick={() => setTab('learn')} className={tab === 'learn' ? 'active' : ''}>
              <span className="nav-icon">◇</span><span>Learning mode</span>
            </button>
          </nav>
          <div className="privacy-note">
            <span>✓</span>
            <div><strong>Private by design</strong><small>Your data stays in this browser.</small></div>
          </div>
        </aside>

        <main>
          {error ? <div className="alert" role="alert"><strong>Unable to continue</strong><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}

          {tab === 'load' ? (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">Dashboard</p><h1>Ready to study?</h1><p>Load your question bank, then choose how you want to practise.</p></div>
              </div>
              <section className="dashboard-grid">
                <article className="card upload-card">
                  <div className="card-heading"><span className="feature-icon">↥</span><div><h2>Question bank</h2><p>Import a compatible JSON file to begin.</p></div></div>
                  <label className="drop-zone">
                    <input type="file" accept="application/json,.json" onChange={onFileUpload} />
                    <span className="upload-icon">＋</span>
                    <strong>{questions.length ? 'Replace question bank' : 'Choose a JSON file'}</strong>
                    <small>File processing happens only on your device</small>
                  </label>
                  {questions.length ? <div className="success-strip"><span>✓</span><div><strong>Question bank loaded</strong><small>{questions.length} valid questions across {domains.length} domains</small></div></div> : null}
                </article>

                <article className="card quick-start">
                  <div className="card-heading"><span className="feature-icon purple">⌁</span><div><h2>Choose a study mode</h2><p>Test your readiness or learn at your pace.</p></div></div>
                  <button className="mode-card" onClick={() => setTab('mock')} disabled={!questions.length}>
                    <span><strong>Mock exam</strong><small>Timed practice with results at the end</small></span><b>→</b>
                  </button>
                  <button className="mode-card" onClick={() => setTab('learn')} disabled={!questions.length}>
                    <span><strong>Learning mode</strong><small>Immediate feedback after every answer</small></span><b>→</b>
                  </button>
                </article>
              </section>

              {domains.length ? <section className="card domain-overview"><div className="section-title"><div><h2>Question coverage</h2><p>Your available questions by domain</p></div><span className="pill">{questions.length} total</span></div><div className="domain-grid">{domains.map((domain) => <div className="domain-stat" key={domain.domainIndex}><span className="domain-number">{domain.domainIndex}</span><div><strong>{domain.domain}</strong><small>{domain.count} questions</small></div></div>)}</div></section> : null}
            </>
          ) : null}

          {tab === 'mock' ? (
            <>
              <div className="page-heading"><div><p className="eyebrow">Exam simulator</p><h1>Mock exam</h1><p>Build a focused, timed exam from your question bank.</p></div>{exam && !exam.submittedAt ? <div className="timer"><small>Time remaining</small><strong>{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}</strong></div> : null}</div>
              {!exam || exam.submittedAt ? <section className="card setup-card">
                <div className="section-title"><div><h2>Exam settings</h2><p>Customise the session before you begin.</p></div></div>
                <div className="controls"><label><span>Number of questions</span><input type="number" min={1} max={questions.length || 1} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value || 1))} /><small>{questions.length} available</small></label><label><span>Time limit</span><div className="input-suffix"><input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value || 1))} /><span>min</span></div><small>Recommended: 1.6 minutes per question</small></label></div>
                <DomainSelector domains={domains} selectedDomains={selectedDomains} toggleDomain={toggleDomain} />
                <div className="setup-footer"><p>Questions and choices will be shuffled automatically.</p><button className="primary" onClick={startExam}>Start mock exam <span>→</span></button></div>
              </section> : null}

              {exam ? examResult ? <ResultView result={examResult} onNewExam={() => setExam(null)} /> : <section className="card exam-card"><MockExamView exam={exam} questionsById={questionsById} setExam={setExam} /></section> : null}
            </>
          ) : null}

          {tab === 'learn' ? (
            <>
              <div className="page-heading"><div><p className="eyebrow">Guided practice</p><h1>Learning mode</h1><p>Answer one question at a time with instant explanations.</p></div></div>
              {!learning ? <section className="card setup-card"><div className="section-title"><div><h2>Choose your focus</h2><p>Select one or more domains for this session.</p></div></div><DomainSelector domains={domains} selectedDomains={selectedDomains} toggleDomain={toggleDomain} /><div className="setup-footer"><p>Questions will not repeat during this session.</p><button className="primary" onClick={startLearning}>Start learning <span>→</span></button></div></section> : null}
              {learning ? <section className="card exam-card"><LearningView learning={learning} setLearning={setLearning} questionsById={questionsById} /></section> : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}

function DomainSelector({
  domains,
  selectedDomains,
  toggleDomain,
}: {
  domains: ReturnType<typeof getDomainSummaries>
  selectedDomains: DomainIndex[]
  toggleDomain: (domain: DomainIndex) => void
}) {
  return (
    <fieldset className="domain-selector">
      <legend>Included domains</legend>
      {domains.length ? <div className="domain-options">{domains.map((domain) => (
        <label key={domain.domainIndex} className={selectedDomains.includes(domain.domainIndex) ? 'selected' : ''}>
          <input type="checkbox" checked={selectedDomains.includes(domain.domainIndex)} onChange={() => toggleDomain(domain.domainIndex)} />
          <span className="checkmark">✓</span>
          <span className="domain-number">{domain.domainIndex}</span>
          <span className="domain-copy"><strong>{domain.domain}</strong><small>{domain.count} questions available</small></span>
        </label>
      ))}</div> : <div className="empty-state"><span>↥</span><strong>No question bank loaded</strong><p>Go to the dashboard and upload a JSON file first.</p></div>}
    </fieldset>
  )
}

function ResultView({ result, onNewExam }: { result: ReturnType<typeof calculateMockResult>; onNewExam: () => void }) {
  const passed = result.percent >= 70
  return (
    <section className="card result-card">
      <div className={`score-ring ${passed ? 'passed' : ''}`} style={{ background: `conic-gradient(${passed ? 'var(--green)' : 'var(--red)'} ${result.percent}%, #eef0f5 0)` }}><strong>{result.percent}%</strong><span>{passed ? 'Great work' : 'Keep learning'}</span></div>
      <div className="result-copy"><p className="eyebrow">Exam complete</p><h2>Your results</h2><p>You answered {result.correct} of {result.total} questions correctly.</p><div className="result-stats"><div><strong>{result.correct}</strong><span>Correct</span></div><div><strong>{result.incorrect}</strong><span>Incorrect</span></div><div><strong>{result.unanswered}</strong><span>Unanswered</span></div></div><button className="primary" onClick={onNewExam}>Create another exam</button></div>
    </section>
  )
}

function MockExamView({
  exam,
  questionsById,
  setExam,
}: {
  exam: ActiveExamState
  questionsById: Map<string, QuestionRecord>
  setExam: React.Dispatch<React.SetStateAction<ActiveExamState | null>>
}) {
  const current = exam.answers[exam.currentIndex]
  const question = questionsById.get(current.questionId)
  if (!question) {
    return <p>Question not found.</p>
  }

  const choices = exam.orderByQuestionId[question.id]

  const answeredCount = exam.answers.filter((answer) => answer.selectedChoiceId).length
  const progress = ((exam.currentIndex + 1) / exam.answers.length) * 100

  return (
    <section className="question-layout">
      <aside className="question-map">
        <div><strong>Questions</strong><small>{answeredCount} of {exam.answers.length} answered</small></div>
        <div className="navigator">
          {exam.answers.map((item, index) => (
            <button key={item.questionId} onClick={() => setExam((prev) => (prev ? { ...prev, currentIndex: index } : prev))} className={`${index === exam.currentIndex ? 'active' : ''} ${item.selectedChoiceId ? 'answered' : ''} ${item.flagged ? 'flagged' : ''}`} aria-label={`Question ${index + 1}${item.flagged ? ', flagged' : ''}`}>{index + 1}</button>
          ))}
        </div>
        <div className="map-legend"><span><i className="answered" /> Answered</span><span><i className="flagged" /> Flagged</span></div>
      </aside>
      <div className="question-panel">
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="question-meta"><span>Question {exam.currentIndex + 1} of {exam.answers.length}</span><span>Domain {question.domainaIndex}</span></div>
        <h2 className="question-text">{question.question}</h2>
        <div className="choices">
          {choices.map((choice) => (
            <button key={choice.id} className={current.selectedChoiceId === choice.id ? 'selected' : ''} onClick={() => setExam((prev) => { if (!prev) return prev; const answers = [...prev.answers]; answers[prev.currentIndex] = { ...answers[prev.currentIndex], selectedChoiceId: choice.id }; return { ...prev, answers } })}>
              <span className="choice-letter">{choice.letter}</span><span>{choice.text}</span><span className="choice-check">✓</span>
            </button>
          ))}
        </div>
        <div className="exam-actions">
          <button className={`flag-button ${current.flagged ? 'active' : ''}`} onClick={() => setExam((prev) => { if (!prev) return prev; const answers = [...prev.answers]; answers[prev.currentIndex] = { ...answers[prev.currentIndex], flagged: !answers[prev.currentIndex].flagged }; return { ...prev, answers } })}>⚑ {current.flagged ? 'Flagged' : 'Flag for review'}</button>
          <div><button className="secondary" disabled={exam.currentIndex === 0} onClick={() => setExam((prev) => (prev ? { ...prev, currentIndex: Math.max(0, prev.currentIndex - 1) } : prev))}>← Previous</button>{exam.currentIndex < exam.answers.length - 1 ? <button className="primary" onClick={() => setExam((prev) => (prev ? { ...prev, currentIndex: Math.min(prev.answers.length - 1, prev.currentIndex + 1) } : prev))}>Next <span>→</span></button> : <button className="primary" onClick={() => setExam((prev) => (prev && window.confirm('Submit this exam and view your results?') ? { ...prev, submittedAt: Date.now() } : prev))}>Submit exam</button>}</div>
        </div>
      </div>
    </section>
  )
}

function LearningView({
  learning,
  setLearning,
  questionsById,
}: {
  learning: LearningState
  setLearning: React.Dispatch<React.SetStateAction<LearningState | null>>
  questionsById: Map<string, QuestionRecord>
}) {
  if (!learning.currentQuestionId) {
    return (
      <section className="session-complete">
        <span>✓</span>
        <h2>Session complete</h2>
        <p>You answered {learning.correctCount} correctly and {learning.incorrectCount} incorrectly.</p>
        <button className="primary" onClick={() => setLearning(null)}>Start another session</button>
      </section>
    )
  }

  const question = questionsById.get(learning.currentQuestionId)
  if (!question) {
    return <p>Question not found.</p>
  }

  const order = learning.orderByQuestionId[question.id] ?? question.choices

  const currentNumber = learning.seenQuestionIds.length
  const totalQuestions = currentNumber + learning.remainingQuestionIds.length

  return (
    <section className="learning-panel">
      <div className="learning-stats"><div><span>Progress</span><strong>{currentNumber} / {totalQuestions}</strong></div><div className="stat-correct"><span>Correct</span><strong>{learning.correctCount}</strong></div><div className="stat-incorrect"><span>Incorrect</span><strong>{learning.incorrectCount}</strong></div></div>
      <div className="question-meta"><span>Domain {question.domainaIndex}</span><span>{question.domain}</span></div>
      <h2 className="question-text">{question.question}</h2>
      <div className="choices">
        {order.map((choice) => {
          const answered = learning.selectedChoiceId !== null
          const isCorrectChoice = answered && choice.letter === question.keyAnswer
          const isWrongSelection = answered && learning.selectedChoiceId === choice.id && !isCorrectChoice
          return <button key={choice.id} disabled={answered} className={`${learning.selectedChoiceId === choice.id ? 'selected' : ''} ${isCorrectChoice ? 'correct' : ''} ${isWrongSelection ? 'incorrect' : ''}`} onClick={() => setLearning((prev) => { if (!prev || !prev.currentQuestionId) return prev; const currentQuestion = questionsById.get(prev.currentQuestionId); if (!currentQuestion) return prev; const correct = choice.letter === currentQuestion.keyAnswer; return { ...prev, selectedChoiceId: choice.id, isCorrect: correct, correctCount: prev.correctCount + (correct ? 1 : 0), incorrectCount: prev.incorrectCount + (correct ? 0 : 1) } })}>
            <span className="choice-letter">{choice.letter}</span><span>{choice.text}</span><span className="choice-check">{isWrongSelection ? '×' : '✓'}</span>
          </button>
        })}
      </div>
      {learning.selectedChoiceId ? <section className={`feedback ${learning.isCorrect ? 'good' : 'bad'}`}><div className="feedback-title"><span>{learning.isCorrect ? '✓' : '!'}</span><div><strong>{learning.isCorrect ? 'Correct answer' : 'Not quite'}</strong><small>{learning.isCorrect ? 'Well done — keep it going.' : `The correct answer is ${question.keyAnswer}.`}</small></div></div><div className="explanation"><strong>Explanation</strong><p>{question.justification}</p></div><button className="primary" onClick={() => setLearning((prev) => (prev ? nextLearningQuestion(prev, questionsById) : prev))}>Next question <span>→</span></button></section> : null}
    </section>
  )
}

export default App
