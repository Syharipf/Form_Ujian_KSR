'use client'

import { useState } from 'react'
import type { Question } from '@/lib/exam'

const LETTERS = ['A', 'B', 'C', 'D', 'E']
const input = 'rounded border border-line-strong bg-surface p-2'

// Manual add/edit form. Field names match the CSV columns so the server reuses the CSV validator.
export default function QuestionForm({
  action,
  question,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>
  question?: Pick<Question, 'type' | 'text' | 'options' | 'answer_index'>
  submitLabel: string
}) {
  const [type, setType] = useState(question?.type ?? 'mc')
  const mcAnswer = question?.type === 'mc' ? LETTERS[question.answer_index] : 'A'
  const tfAnswer = question?.type === 'tf' && question.answer_index === 1 ? 'S' : 'B'

  return (
    <form action={action} className="grid gap-3 text-sm">
      <label className="grid gap-1">
        Jenis soal
        <select name="type" value={type} onChange={(e) => setType(e.target.value as 'mc' | 'tf')} className={input}>
          <option value="mc">Pilihan ganda</option>
          <option value="tf">Benar / Salah</option>
        </select>
      </label>
      <label className="grid gap-1">
        Pertanyaan
        <textarea name="question" required rows={3} defaultValue={question?.text} className={input} />
      </label>
      {type === 'mc' ? (
        <>
          <div className="grid gap-2">
            <p>Opsi jawaban (minimal A dan B, isi berurutan)</p>
            {LETTERS.map((letter, i) => (
              <label key={letter} className="flex items-center gap-2">
                <span className="w-4 font-semibold">{letter}</span>
                <input
                  name={letter.toLowerCase()}
                  required={i < 2}
                  defaultValue={question?.type === 'mc' ? question.options[i] : undefined}
                  className={`min-w-0 flex-1 ${input}`}
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1">
            Jawaban benar
            <select name="answer" defaultValue={mcAnswer} className={input}>
              {LETTERS.map((letter) => (
                <option key={letter}>{letter}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label className="grid gap-1">
          Jawaban benar
          <select name="answer" defaultValue={tfAnswer} className={input}>
            <option value="B">Benar</option>
            <option value="S">Salah</option>
          </select>
        </label>
      )}
      <button className="rounded bg-red-600 p-2 font-semibold text-white">{submitLabel}</button>
    </form>
  )
}
