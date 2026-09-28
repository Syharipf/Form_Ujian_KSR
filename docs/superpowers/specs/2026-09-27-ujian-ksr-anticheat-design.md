# Web Ujian KSR PMI Unit Universitas Telkom — Anti-Cheat (Pre/Post Test)

## Context
KSR PMI Unit Universitas Telkom butuh web ujian pre-test & post-test yang fokus anti-cheat (Google Lens, screenshot, pindah aplikasi, dll.). Peserta pakai HP Android dan masuk lewat scan QR / link. Proyek baru.

Keputusan yang sudah diambil:
- Perangkat: HP Android, **web saja** di browser (tanpa APK) supaya mudah.
- Akses: **scan QR / link** per sesi.
- Stack: **Next.js (Vercel) + Supabase Postgres**.
- Tipe soal: **pilihan ganda** + **benar/salah**, auto-grade.
- Tanpa login peserta: isi **nama + NIM** (NIM wajib, dipakai mencocokkan pre vs post).
- Pelanggaran: ke-1 & ke-2 layar terkunci + peringatan, ke-3 **auto-submit**. Semua dicatat.
- Admin: halaman sederhana, login password.
- Timer: dipilih per sesi — **per soal** (tidak bisa kembali) atau **total** (bebas bolak-balik).

Batas yang diterima (konsekuensi web saja):
- Screenshot di HP yang sama **tidak bisa diblok dan tidak terdeteksi** oleh browser.
- Circle to Search / Google Lens di HP yang sama tidak bisa diblok; kemungkinan terdeteksi sebagai hilang fokus (`blur`/`visibilitychange`) — dipastikan saat uji manual.
- Foto layar pakai HP kedua tidak bisa diblok.
- Ketiganya ditekan dengan: timer per soal, soal & opsi diacak per peserta, watermark nama + NIM, kunci jawaban tidak pernah dikirim ke HP.

## Bagian 1 — Arsitektur & anti-cheat

Komponen:
1. Next.js App Router di root repo: halaman sesi, halaman ujian, admin, API routes.
2. Supabase — hanya diakses server Next.js via service role key. RLS aktif tanpa policy (anon tidak bisa baca apa pun).

Lapisan anti-cheat:
| Lapisan | Mekanisme | Efek |
|---|---|---|
| Web | Wajib fullscreen: tombol "Mulai" memanggil `requestFullscreen()`; `fullscreenchange` keluar = pelanggaran, overlay minta tap untuk masuk fullscreen lagi | Menyembunyikan address bar & tab lain |
| Web | `visibilitychange` (hidden) dan `blur` = pelanggaran | Deteksi pindah aplikasi/tab, buka notifikasi, overlay sistem |
| Web | `resize` yang mengecilkan viewport secara signifikan = pelanggaran | Deteksi split screen / pop-up view |
| Web | Blok `contextmenu`, `copy`, `cut`, `selectstart`; CSS `user-select:none`, `-webkit-touch-callout:none`; soal dirender sebagai teks, bukan gambar | Tidak ada menu tekan-lama "Telusuri dengan Google Lens" / "Search" / salin |
| Server | Timer & nilai dihitung server; urutan soal + opsi diacak per peserta | Tidak bisa manipulasi dari HP; contekan antarpeserta tidak cocok urutannya |
| UI | Watermark nama + NIM berulang di latar (SVG background) | Foto bocor bisa dilacak |

## Bagian 2 — Data, alur, admin

### Skema (`supabase/schema.sql`)
- `exam_sessions`: id, code (6 char unik), title, kind (`pre`|`post`), timer_mode (`total`|`per_question`), duration_sec, per_question_sec, max_violations (default 3), is_open, created_at.
- `questions`: id, session_id (FK cascade), position, type (`mc`|`tf`), text, options text[], answer_index int.
- `attempts`: id uuid, session_id, name, nim, question_order uuid[], option_orders jsonb, answers jsonb, current_index, question_started_at, started_at, deadline_at, submitted_at, submit_reason (`manual`|`timeout`|`violation`), score, violation_count. Unique (session_id, nim).
  - `option_orders`: `{question_id: [indeks opsi asli sesuai urutan tampil]}`. Soal `tf` tidak diacak opsinya (Benar selalu di atas).
  - `answers`: `{question_id: indeks opsi asli}`. Client mengirim indeks tampil; server memetakan ke indeks asli.
  - `score`: 0–100, dibulatkan ke bilangan bulat.
- `violations`: id, attempt_id, type, created_at.

### Akses via QR / link
- Tiap sesi punya link `https://<domain>/s/<CODE>`; admin menampilkan QR-nya (lib `qrcode`) untuk ditayangkan/dicetak.
- Scan QR → terbuka di browser HP (Chrome) → kode sesi terisi otomatis.

### Alur peserta
1. Scan QR / buka link → `/s/<CODE>` → isi nama, NIM → baca aturan → tombol "Mulai" (masuk fullscreen).
2. `POST /api/attempts` → cek sesi open; buat attempt dengan urutan acak; balas attempt id (uuid acak = token). Disimpan di `localStorage` untuk resume. NIM yang sudah punya attempt di sesi itu → ditolak (409, "hubungi panitia"); admin bisa reset attempt.
3. `GET /api/attempts/[id]` → soal tanpa `answer_index` + sisa waktu. Mode total: semua soal. Mode per soal: soal aktif saja.
4. `POST /api/attempts/[id]/answer` → cek deadline; mode per soal: maju index, tolak soal lama.
5. `POST /api/attempts/[id]/violation` → tambah counter; ≥ max → submit (`violation`).
6. `POST /api/attempts/[id]/submit` → nilai.
- Timeout ditegakkan server di setiap request (lewat deadline → finalize; soal per-soal kedaluwarsa → dianggap kosong, loncat ke soal berikutnya). Timer di HP hanya tampilan.
- Buka ulang attempt (tab/browser ditutup lalu dibuka lagi) = resume + dicatat 1 pelanggaran.
- Satu event hilang fokus bisa memicu beberapa listener sekaligus (`blur` + `visibilitychange` + `fullscreenchange`) → client menggabungkan jadi 1 pelanggaran (jeda ~2 detik).
- Selesai → keluar fullscreen, tampil halaman "Terima kasih" (nilai tidak ditampilkan ke peserta).

### Admin (`/admin`)
- Semua operasi panitia lewat web `/admin`, bisa dibuka di laptop maupun HP (layout responsif). Dashboard Supabase hanya dipakai sekali saat setup awal (jalankan `schema.sql`).
- Login: `ADMIN_PASSWORD` env → cookie httpOnly bertanda HMAC.
- Kelola sesi: buat/edit pengaturan, buka/tutup, reset attempt peserta, tampilkan QR + link sesi.
- Upload soal CSV (`papaparse`): `type,question,a,b,c,d,e,answer` (answer huruf; tf pakai B/S). Excel → simpan sebagai CSV.
- Hasil per sesi: nama, NIM, nilai, jumlah pelanggaran, alasan submit, log pelanggaran; export CSV.
- Bandingkan pre vs post: pilih 2 sesi → join by NIM → nilai pre, post, selisih.

### Struktur
```
app/              halaman & API routes
lib/exam.ts       logika murni: acak, nilai, deadline
supabase/schema.sql
```

## Pengujian
- `lib/exam.test.ts` (`bun test`): mapping acak opsi → nilai benar, deadline total & per soal, auto-submit di pelanggaran ke-3.
- Manual desktop: `npm run dev`, buat sesi, upload CSV contoh, kerjakan di browser, pindah tab 3× → auto-submit, cek hasil + export + halaman bandingkan.
- Manual HP Android (Chrome, via Vercel preview): scan QR → masuk sesi; uji pindah aplikasi, tarik notifikasi, split screen, keluar fullscreen, tekan lama teks, Circle to Search — catat mana yang terdeteksi.
