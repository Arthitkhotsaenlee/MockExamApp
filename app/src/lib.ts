import type {
  ActiveExamState,
  Choice,
  ChoiceLetter,
  DomainIndex,
  DomainSummary,
  ExamConfig,
  LearningState,
  QuestionRecord,
  SourceQuestion,
} from './types'

export const STORAGE_KEYS = {
  questionBank: 'cisa-app-question-bank-v1',
  activeExam: 'cisa-app-active-exam-v1',
  learning: 'cisa-app-learning-v1',
} as const

function hashString(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return `q_${(hash >>> 0).toString(16)}`
}

export function seededRandom(seed: number): () => number {
  let current = seed >>> 0
  return () => {
    current += 0x6d2b79f5
    let temp = Math.imul(current ^ (current >>> 15), 1 | current)
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp)
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleArray<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function normalizeDomainIndex(value: unknown): DomainIndex | null {
  if (typeof value !== 'string') {
    return null
  }
  return ['1', '2', '3', '4', '5'].includes(value) ? (value as DomainIndex) : null
}

export function parseQuestionBank(raw: unknown): QuestionRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error('JSON root must be an array of questions.')
  }

  const mapped = raw.map((item, rowIndex) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Row ${rowIndex + 1}: expected object.`)
    }
    const source = item as Partial<SourceQuestion>

    const requiredTextFields: Array<keyof SourceQuestion> = ['question', 'A', 'B', 'C', 'D', 'justification', 'domain']
    for (const field of requiredTextFields) {
      if (typeof source[field] !== 'string' || source[field]!.trim() === '') {
        throw new Error(`Row ${rowIndex + 1}: invalid ${field}.`)
      }
    }

    if (!['A', 'B', 'C', 'D'].includes(source['key answer'] ?? '')) {
      throw new Error(`Row ${rowIndex + 1}: invalid key answer.`)
    }

    const domainIndex = normalizeDomainIndex(source.domaina_index)
    if (!domainIndex) {
      throw new Error(`Row ${rowIndex + 1}: invalid domaina_index.`)
    }

    const base = `${source.question}|${source.A}|${source.B}|${source.C}|${source.D}`
    const id = hashString(base)

    const choices: Choice[] = [
      { id: `${id}_A`, letter: 'A', text: source.A!.trim() },
      { id: `${id}_B`, letter: 'B', text: source.B!.trim() },
      { id: `${id}_C`, letter: 'C', text: source.C!.trim() },
      { id: `${id}_D`, letter: 'D', text: source.D!.trim() },
    ]

    return {
      id,
      question: source.question!.trim(),
      choices,
      keyAnswer: source['key answer'] as ChoiceLetter,
      justification: source.justification!.trim(),
      domain: source.domain!.trim(),
      domainaIndex: domainIndex,
    } satisfies QuestionRecord
  })

  const unique = new Map<string, QuestionRecord>()
  for (const item of mapped) {
    if (!unique.has(item.id)) {
      unique.set(item.id, item)
    }
  }

  return [...unique.values()]
}

export function getDomainSummaries(questions: QuestionRecord[]): DomainSummary[] {
  const map = new Map<DomainIndex, DomainSummary>()
  for (const question of questions) {
    const current = map.get(question.domainaIndex)
    if (current) {
      current.count += 1
    } else {
      map.set(question.domainaIndex, {
        domainIndex: question.domainaIndex,
        domain: question.domain,
        count: 1,
      })
    }
  }
  return [...map.values()].sort((a, b) => Number(a.domainIndex) - Number(b.domainIndex))
}

const OFFICIAL_WEIGHTS: Record<DomainIndex, number> = {
  '1': 0.18,
  '2': 0.18,
  '3': 0.12,
  '4': 0.26,
  '5': 0.26,
}

function allocateByWeight(
  selectedDomains: DomainIndex[],
  pools: Record<DomainIndex, QuestionRecord[]>,
  total: number,
): Record<DomainIndex, number> {
  const allocation: Record<DomainIndex, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  const eligible = selectedDomains.filter((domain) => (pools[domain]?.length ?? 0) > 0)
  if (eligible.length === 0 || total <= 0) {
    return allocation
  }

  const raw = eligible.map((domain) => ({ domain, value: OFFICIAL_WEIGHTS[domain] * total }))
  let assigned = 0
  for (const item of raw) {
    const floor = Math.floor(item.value)
    allocation[item.domain] = Math.min(floor, pools[item.domain].length)
    assigned += allocation[item.domain]
  }

  let remaining = total - assigned
  const byRemainder = raw
    .map((item) => ({ ...item, remainder: item.value - Math.floor(item.value) }))
    .sort((a, b) => b.remainder - a.remainder)

  while (remaining > 0) {
    let changed = false
    for (const item of byRemainder) {
      if (remaining <= 0) break
      if (allocation[item.domain] < pools[item.domain].length) {
        allocation[item.domain] += 1
        remaining -= 1
        changed = true
      }
    }
    if (!changed) break
  }

  if (remaining > 0) {
    for (const domain of eligible) {
      while (remaining > 0 && allocation[domain] < pools[domain].length) {
        allocation[domain] += 1
        remaining -= 1
      }
      if (remaining <= 0) break
    }
  }

  return allocation
}

export function startMockExam(
  questions: QuestionRecord[],
  config: ExamConfig,
  seed: number = Date.now(),
): ActiveExamState {
  const pools: Record<DomainIndex, QuestionRecord[]> = { '1': [], '2': [], '3': [], '4': [], '5': [] }
  for (const question of questions) {
    pools[question.domainaIndex].push(question)
  }

  const random = seededRandom(seed)
  for (const domain of Object.keys(pools) as DomainIndex[]) {
    pools[domain] = shuffleArray(pools[domain], random)
  }

  const available = config.selectedDomains.reduce((sum, domain) => sum + pools[domain].length, 0)
  const count = Math.max(1, Math.min(config.questionCount, available))

  const allocation = allocateByWeight(config.selectedDomains, pools, count)
  const selected: QuestionRecord[] = []
  for (const domain of Object.keys(allocation) as DomainIndex[]) {
    selected.push(...pools[domain].slice(0, allocation[domain]))
  }

  const selectedShuffled = shuffleArray(selected, random)
  const orderByQuestionId: Record<string, Choice[]> = {}
  const answers = selectedShuffled.map((question) => {
    orderByQuestionId[question.id] = shuffleArray(question.choices, random)
    return { questionId: question.id, selectedChoiceId: null, flagged: false }
  })

  const startedAt = Date.now()
  const endsAt = startedAt + config.durationMinutes * 60 * 1000

  return {
    config: { ...config, questionCount: count },
    questionIds: selectedShuffled.map((item) => item.id),
    orderByQuestionId,
    answers,
    currentIndex: 0,
    startedAt,
    endsAt,
    submittedAt: null,
  }
}

export function calculateMockResult(state: ActiveExamState, questionsById: Map<string, QuestionRecord>) {
  let correct = 0
  let incorrect = 0
  let unanswered = 0

  const byDomain: Record<string, { correct: number; incorrect: number; unanswered: number; total: number }> = {}

  const details = state.answers.map((entry) => {
    const question = questionsById.get(entry.questionId)
    if (!question) {
      throw new Error(`Question missing: ${entry.questionId}`)
    }
    const orderedChoices = state.orderByQuestionId[question.id]
    const correctChoice = orderedChoices.find((choice) => choice.letter === question.keyAnswer)
    const selectedChoice = orderedChoices.find((choice) => choice.id === entry.selectedChoiceId) ?? null

    const key = `${question.domainaIndex} - ${question.domain}`
    byDomain[key] ??= { correct: 0, incorrect: 0, unanswered: 0, total: 0 }
    byDomain[key].total += 1

    let status: 'correct' | 'incorrect' | 'unanswered' = 'unanswered'
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

    return {
      question,
      orderedChoices,
      selectedChoice,
      correctChoice,
      status,
    }
  })

  return {
    total: state.answers.length,
    correct,
    incorrect,
    unanswered,
    percent: state.answers.length === 0 ? 0 : Math.round((correct / state.answers.length) * 10000) / 100,
    byDomain,
    details,
  }
}

export function createLearningState(
  questions: QuestionRecord[],
  selectedDomains: DomainIndex[],
  seed: number = Date.now(),
): LearningState {
  const random = seededRandom(seed)
  const eligible = questions.filter((question) => selectedDomains.includes(question.domainaIndex))
  const shuffled = shuffleArray(eligible, random)

  const first = shuffled[0] ?? null
  const orderByQuestionId: Record<string, Choice[]> = {}
  if (first) {
    orderByQuestionId[first.id] = shuffleArray(first.choices, random)
  }

  return {
    selectedDomains,
    remainingQuestionIds: shuffled.slice(1).map((item) => item.id),
    seenQuestionIds: first ? [first.id] : [],
    currentQuestionId: first?.id ?? null,
    orderByQuestionId,
    selectedChoiceId: null,
    isCorrect: null,
    correctCount: 0,
    incorrectCount: 0,
  }
}

export function nextLearningQuestion(
  state: LearningState,
  questionsById: Map<string, QuestionRecord>,
  seed: number = Date.now(),
): LearningState {
  if (state.remainingQuestionIds.length === 0) {
    return {
      ...state,
      currentQuestionId: null,
      selectedChoiceId: null,
      isCorrect: null,
    }
  }

  const [nextId, ...rest] = state.remainingQuestionIds
  const question = questionsById.get(nextId)
  if (!question) {
    return { ...state, remainingQuestionIds: rest }
  }

  const random = seededRandom(seed)
  return {
    ...state,
    currentQuestionId: nextId,
    remainingQuestionIds: rest,
    seenQuestionIds: [...state.seenQuestionIds, nextId],
    orderByQuestionId: {
      ...state.orderByQuestionId,
      [nextId]: shuffleArray(question.choices, random),
    },
    selectedChoiceId: null,
    isCorrect: null,
  }
}

export function safeParseLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function saveLocalStorage<T>(key: string, value: T | null): void {
  if (value === null) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}
