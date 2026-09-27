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

// Columns: type,question,a,b,c,d,e,answer. Delimiter is auto-detected (Excel may use ";").
export function parseQuestionsCsv(csv: string) {
  const { data } = Papa.parse<Record<string, string | undefined>>(csv.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  const questions: ParsedQuestion[] = []
  const errors: string[] = []

  data.forEach((row, i) => {
    const fail = (message: string) => errors.push(`Baris ${i + 2}: ${message}`)
    const cell = (key: string) => (row[key] ?? '').trim()
    const type = TYPES[cell('type').toLowerCase()]
    const text = cell('question')
    const answer = cell('answer').toLowerCase()

    if (!type) return fail('type harus mc/pg atau tf/bs')
    if (!text) return fail('question kosong')

    if (type === 'tf') {
      const answer_index = TF_ANSWERS[answer]
      if (answer_index === undefined) return fail('answer untuk tf harus B (benar) atau S (salah)')
      questions.push({ position: questions.length, type, text, options: ['Benar', 'Salah'], answer_index })
      return
    }

    const cells = LETTERS.map((l) => cell(l))
    const count = cells.filter(Boolean).length
    if (count < 2 || !cells.slice(0, count).every(Boolean)) return fail('opsi harus diisi berurutan mulai dari a (minimal 2)')
    const answer_index = LETTERS.indexOf(answer)
    if (answer_index < 0 || answer_index >= count) {
      return fail(`answer harus huruf opsi yang terisi (A-${LETTERS[count - 1].toUpperCase()})`)
    }
    questions.push({ position: questions.length, type, text, options: cells.slice(0, count), answer_index })
  })

  return { questions, errors }
}
