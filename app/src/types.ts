export type DomainIndex = '1' | '2' | '3' | '4' | '5'

export type SourceQuestion = {
  question: string
  A: string
  B: string
  C: string
  D: string
  'key answer': 'A' | 'B' | 'C' | 'D'
  justification: string
  domain: string
  domaina_index: DomainIndex
}

export type ChoiceLetter = 'A' | 'B' | 'C' | 'D'

export type Choice = {
  id: string
  letter: ChoiceLetter
  text: string
}

export type QuestionRecord = {
  id: string
  question: string
  choices: Choice[]
  keyAnswer: ChoiceLetter
  justification: string
  domain: string
  domainaIndex: DomainIndex
}

export type ExamConfig = {
  selectedDomains: DomainIndex[]
  questionCount: number
  durationMinutes: number
}

export type ExamQuestionState = {
  questionId: string
  selectedChoiceId: string | null
  flagged: boolean
}

export type ActiveExamState = {
  config: ExamConfig
  questionIds: string[]
  orderByQuestionId: Record<string, Choice[]>
  answers: ExamQuestionState[]
  currentIndex: number
  startedAt: number
  endsAt: number
  submittedAt: number | null
}

export type LearningState = {
  selectedDomains: DomainIndex[]
  remainingQuestionIds: string[]
  seenQuestionIds: string[]
  currentQuestionId: string | null
  orderByQuestionId: Record<string, Choice[]>
  selectedChoiceId: string | null
  isCorrect: boolean | null
  correctCount: number
  incorrectCount: number
}

export type DomainSummary = {
  domainIndex: DomainIndex
  domain: string
  count: number
}
