import { describe, expect, it } from 'bun:test'
import { parseQuestionsCsv, toQuestion } from './csv'

describe('parseQuestionsCsv', () => {
  it('parses mc and tf rows', () => {
    const csv =
      'type,question,a,b,c,d,e,answer\n' +
      'mc,"Ibu kota, Indonesia?",Jakarta,Bandung,,,,A\n' +
      'tf,Air mendidih 100°C,,,,,,B\n' +
      'bs,Api itu dingin,,,,,,S\n'
    const { questions, errors } = parseQuestionsCsv(csv)
    expect(errors).toEqual([])
    expect(questions).toEqual([
      { position: 0, type: 'mc', text: 'Ibu kota, Indonesia?', options: ['Jakarta', 'Bandung'], answer_index: 0 },
      { position: 1, type: 'tf', text: 'Air mendidih 100°C', options: ['Benar', 'Salah'], answer_index: 0 },
      { position: 2, type: 'tf', text: 'Api itu dingin', options: ['Benar', 'Salah'], answer_index: 1 },
    ])
  })

  it('accepts the semicolon delimiter, BOM and pg type that Excel produces', () => {
    const { questions, errors } = parseQuestionsCsv('﻿type;question;a;b;c;d;e;answer\npg;Soal;X;Y;Z;;;c\n')
    expect(errors).toEqual([])
    expect(questions[0]).toMatchObject({ type: 'mc', options: ['X', 'Y', 'Z'], answer_index: 2 })
  })

  it('reports row errors with spreadsheet line numbers', () => {
    const { errors } = parseQuestionsCsv(
      'type,question,a,b,c,d,e,answer\n' +
        'mc,Soal,X,,Z,,,A\n' +
        'mc,Soal,X,Y,,,,C\n' +
        'xx,Soal,,,,,,A\n' +
        'tf,,,,,,,B\n' +
        'tf,Soal,,,,,,Z\n',
    )
    expect(errors).toEqual([
      'Baris 2: opsi harus diisi berurutan mulai dari a (minimal 2)',
      'Baris 3: answer harus huruf opsi yang terisi (A-B)',
      'Baris 4: type harus mc/pg atau tf/bs',
      'Baris 5: question kosong',
      'Baris 6: answer untuk tf harus B (benar) atau S (salah)',
    ])
  })
})

describe('toQuestion (manual form)', () => {
  it('trims input and drops trailing empty options', () => {
    expect(toQuestion({ type: 'mc', text: '  Soal  ', options: [' X ', 'Y', '', '', ''], answer: 'b' })).toEqual({
      type: 'mc',
      text: 'Soal',
      options: ['X', 'Y'],
      answer_index: 1,
    })
  })

  it('ignores options for true/false and rejects a gap in options', () => {
    expect(toQuestion({ type: 'tf', text: 'Soal', options: ['junk'], answer: 'S' })).toEqual({
      type: 'tf',
      text: 'Soal',
      options: ['Benar', 'Salah'],
      answer_index: 1,
    })
    expect(toQuestion({ type: 'mc', text: 'Soal', options: ['X', '', 'Z'], answer: 'A' })).toBe('opsi harus diisi berurutan mulai dari a (minimal 2)')
  })
})
