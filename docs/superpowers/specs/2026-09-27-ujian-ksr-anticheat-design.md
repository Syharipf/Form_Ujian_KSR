# Web Ujian KSR PMI Telkom — Anti-Cheat (Pre/Post Test)

## Context
KSR PMI Telkom butuh web ujian pre-test & post-test yang fokus anti-cheat (Google Lens, screenshot, pindah aplikasi, dll.). Peserta pakai HP Android. Proyek baru.

Keputusan yang sudah diambil:
- Perangkat: HP Android → **web + APK wrapper** (lock level OS).
- Stack: **Next.js (Vercel) + Supabase Postgres**.
- Tipe soal: **pilihan ganda** + **benar/salah**, auto-grade.
- Tanpa login peserta: isi **nama + NIM** (NIM wajib, dipakai mencocokkan pre vs post).
- Pelanggaran: ke-1 & ke-2 layar terkunci + peringatan, ke-3 **auto-submit**. Semua dicatat.
- Admin: halaman sederhana, login password.
- Timer: dipilih per sesi — **per soal** (tidak bisa kembali) atau **total** (bebas bolak-balik).

Batas yang diterima: foto layar pakai HP kedua tidak bisa diblok (ditekan via watermark + acak + timer). Penanda APK (User-Agent) bisa dipalsukan orang teknis — cukup untuk pre/post test.

## Bagian 1 — Arsitektur & anti-cheat

Komponen:
1. `web/` — Next.js App Router: halaman masuk, halaman ujian, admin, API routes.
2. Supabase — hanya diakses server Next.js via service role key. RLS aktif tanpa policy (anon tidak bisa baca apa pun). Kunci jawaban tidak pernah dikirim ke HP.
3. `android/` — APK Kotlin, satu `MainActivity.kt` berisi WebView.

Lapisan anti-cheat:
| Lapisan | Mekanisme | Efek |
|---|---|---|
| APK | `FLAG_SECURE` | Screenshot, screen record, Circle to Search/Lens = layar hitam |
| APK | `startLockTask` (screen pinning) + back button diabaikan | Tidak bisa keluar app |
| APK | `onPause` / `onWindowFocusChanged(false)` → `evaluateJavascript("window.__examViolation(...)")` | Deteksi tarik notifikasi, split screen, dialog sistem |
| Web | `visibilitychange`, `blur`, `resize`, blok `contextmenu`/`copy`/`selectstart`, `user-select:none` | Cadangan bila bukan APK |
| Server | Sesi `require_apk` → tolak request tanpa `KSRExam/` di User-Agent | Tolak browser biasa |
| Server | Timer & nilai dihitung server; urutan soal + opsi diacak per peserta | Tidak bisa manipulasi dari HP |
| UI | Watermark nama + NIM berulang di latar (SVG background) | Foto bocor bisa dilacak |

## Bagian 2 — Data, alur, admin

### Skema (`supabase/schema.sql`)
- `exam_sessions`: id, code (6 char unik), title, kind (`pre`|`post`), timer_mode (`total`|`per_question`), duration_sec, per_question_sec, max_violations (default 3), require_apk (default true), is_open, created_at.
- `questions`: id, session_id (FK cascade), position, type (`mc`|`tf`), text, options text[], answer_index int.
- `attempts`: id uuid, session_id, name, nim, question_order uuid[], option_orders jsonb, answers jsonb, current_index, question_started_at, started_at, deadline_at, submitted_at, submit_reason (`manual`|`timeout`|`violation`), score, violation_count. Unique (session_id, nim).
  - `option_orders`: `{question_id: [indeks opsi asli sesuai urutan tampil]}`. Soal `tf` tidak diacak opsinya (Benar selalu di atas).
  - `answers`: `{question_id: indeks opsi asli}`. Client mengirim indeks tampil; server memetakan ke indeks asli.
  - `score`: 0–100, dibulatkan ke bilangan bulat.
- `violations`: id, attempt_id, type, detail, created_at.

### Akses via QR / link
- Tiap sesi punya link `https://<domain>/s/<CODE>`; admin menampilkan QR-nya (lib `qrcode`) untuk ditayangkan/dicetak.
- APK mendaftarkan Android App Link untuk `/s/*` (`autoVerify`, file `public/.well-known/assetlinks.json` berisi SHA-256 sertifikat signing APK). Scan QR di HP yang sudah pasang APK → langsung terbuka di APK, tanpa pilihan browser.
- Belum pasang APK (link terbuka di browser) dan sesi `require_apk` → halaman berisi tombol unduh APK (`public/ksr-ujian.apk`) + langkah install; setelah install, scan QR lagi.
- Sesi tanpa `require_apk` → ujian bisa langsung dikerjakan di browser (lock level web saja).

### Alur peserta
1. Scan QR / buka link → `/s/<CODE>` (kode sesi terisi otomatis) → isi nama, NIM.
2. `POST /api/attempts` → cek sesi open + require_apk; buat attempt dengan urutan acak; balas attempt id (uuid acak = token). Disimpan di `localStorage` untuk resume. NIM yang sudah punya attempt di sesi itu → ditolak (409, "hubungi panitia"); admin bisa reset attempt.
3. `GET /api/attempts/[id]` → soal tanpa `answer_index` + sisa waktu. Mode total: semua soal. Mode per soal: soal aktif saja.
4. `POST /api/attempts/[id]/answer` → cek deadline; mode per soal: maju index, tolak soal lama.
5. `POST /api/attempts/[id]/violation` → tambah counter; ≥ max → submit (`violation`).
6. `POST /api/attempts/[id]/submit` → nilai.
- Timeout ditegakkan server di setiap request (lewat deadline → finalize; soal per-soal kedaluwarsa → dianggap kosong, loncat ke soal berikutnya). Timer di HP hanya tampilan.
- Buka ulang attempt (app ditutup paksa) = resume + dicatat 1 pelanggaran.
- Deteksi pelanggaran baru aktif setelah ujian mulai (dialog konfirmasi screen pinning tidak dihitung).
- Selesai → JS panggil `Android.finish()` → `stopLockTask()`.

### Admin (`/admin`)
- Login: `ADMIN_PASSWORD` env → cookie httpOnly bertanda HMAC.
- Kelola sesi: buat/edit pengaturan, buka/tutup, reset attempt peserta, tampilkan QR + link sesi.
- Upload soal CSV (`papaparse`): `type,question,a,b,c,d,e,answer` (answer huruf; tf pakai B/S). Excel → simpan sebagai CSV.
- Hasil per sesi: nama, NIM, nilai, jumlah pelanggaran, alasan submit, log pelanggaran; export CSV.
- Bandingkan pre vs post: pilih 2 sesi → join by NIM → nilai pre, post, selisih.

### Struktur
```
web/            Next.js (app/, lib/exam.ts logika murni: acak, nilai, deadline)
android/        Gradle project, app/src/main/java/.../MainActivity.kt
supabase/schema.sql
```

## Pengujian
- `lib/exam.test.ts` (vitest): mapping acak opsi → nilai benar, deadline total & per soal, auto-submit di pelanggaran ke-3.
- Manual web: `npm run dev`, buat sesi (require_apk off), upload CSV contoh, kerjakan di browser, pindah tab 3× → auto-submit, cek hasil + export + halaman bandingkan.
- Manual APK: `./gradlew assembleRelease` → `adb install`, scan QR sesi → terbuka langsung di APK, screenshot = hitam, Circle to Search diblok, tarik notifikasi → peringatan, ke-3 → submit, tombol home/recent terkunci selama ujian.
