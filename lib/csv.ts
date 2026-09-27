import Papa from 'papaparse'

export interface ParsedQuestion {
  position: number
  type: 'mc' | 'tf'
  text: string
  options: string[]
  answer_index: number
}

const TYPES: Record<string, 'mc' | 'tf'> = { mc: 'mc', pg: 'mc', tf: 'tf', bs: 'tf' }
const TF_ANSWERS: Record<string, number> = { b: 0, benar: 0, s: 1, salah: 1 }
const LETTERS = ['a', 'b', 'c', 'd', 'e']

export type QuestionInput = { type: string; text: string; options: string[]; answer: string }

// Validate one question in the CSV's vocabulary (type mc/pg/tf/bs, answer letter or B/S).
// Shared by the CSV upload and the manual question form. Returns an error message on failure.
export function toQuestion({ type: rawType, text, options, answer: rawAnswer }: QuestionInput): Omit<ParsedQuestion, 'position'> | string {
  const type = TYPES[rawType.trim().toLowerCase()]
  const answer = rawAnswer.trim().toLowerCase()
  text = text.trim()

  if (!type) return 'type harus mc/pg atau tf/bs'
  if (!text) return 'question kosong'

  if (type === 'tf') {
    const answer_index = TF_ANSWERS[answer]
    if (answer_index === undefined) return 'answer untuk tf harus B (benar) atau S (salah)'
    return { type, text, options: ['Benar', 'Salah'], answer_index }
  }

  const cells = LETTERS.map((_, i) => (options[i] ?? '').trim())
  const count = cells.filter(Boolean).length
  if (count < 2 || !cells.slice(0, count).every(Boolean)) return 'opsi harus diisi berurutan mulai dari a (minimal 2)'
  const answer_index = LETTERS.indexOf(answer)
  if (answer_index < 0 || answer_index >= count) return `answer harus huruf opsi yang terisi (A-${LETTERS[count - 1].toUpperCase()})`
  return { type, text, options: cells.slice(0, count), answer_index }
}

// Columns: type,question,a,b,c,d,e,answer. Delimiter is auto-detected (Excel may use ";").
export function parseQuestionsCsv(csv: string) {
  const { data } = Papa.parse<Record<string, string | undefined>>(csv.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  const questions: ParsedQuestion[] = []
  const errors: string[] = []

  data.forEach((row, i) => {
    const cell = (key: string) => row[key] ?? ''
    const q = toQuestion({ type: cell('type'), text: cell('question'), options: LETTERS.map(cell), answer: cell('answer') })
    if (typeof q === 'string') errors.push(`Baris ${i + 2}: ${q}`)
    else questions.push({ position: questions.length, ...q })
  })

  return { questions, errors }
}
