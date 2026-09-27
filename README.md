# Ujian KSR PMI Telkom

Web ujian pre-test / post-test dengan anti-cheat untuk HP Android. Peserta masuk lewat scan QR, panitia mengelola semuanya di `/admin`.

## Setup (sekali saja)

1. **Supabase**: buat project di [supabase.com](https://supabase.com) → SQL Editor → jalankan isi `supabase/schema.sql`.
2. **Env**: salin `.env.example` ke `.env.local`, isi:
   - `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` (Project Settings → API; pakai *secret key* / `service_role`, **bukan** anon key).
   - `ADMIN_PASSWORD` untuk login `/admin`.
3. **Jalankan lokal**: `bun install` lalu `bun run dev` → buka http://localhost:3000/admin.
4. **Deploy**: import repo ke [Vercel](https://vercel.com), isi tiga env di atas, deploy. QR di halaman admin otomatis memakai domain Vercel.

## Alur panitia

1. `/admin` → buat sesi (pre-test / post-test, timer per soal atau total, batas pelanggaran).
2. Upload soal CSV (contoh: `public/contoh-soal.csv`, bisa dari Excel → Save As CSV).
3. Klik **Buka sesi**, tayangkan QR.
4. Lihat nilai + log pelanggaran, export CSV, reset peserta bila perlu.
5. **Bandingkan pre-test vs post-test** (dicocokkan lewat NIM).

## Anti-cheat — yang bisa dan tidak bisa

Bisa: wajib layar penuh; deteksi pindah aplikasi/tab, buka notifikasi, split screen, keluar layar penuh, buka ulang halaman; blok tekan-lama (menu Google Lens / salin); soal & opsi diacak per peserta; timer dan nilai dihitung di server; kunci jawaban tidak pernah dikirim ke HP; watermark nama + NIM. Pelanggaran ke-1..(N-1) mengunci layar dengan peringatan, pelanggaran ke-N mengumpulkan jawaban otomatis.

Tidak bisa (keterbatasan browser): memblokir screenshot, Circle to Search, atau foto dari HP lain. Ditekan dengan timer per soal, pengacakan, dan watermark.

## Pengembangan

```bash
bun test       # unit + skema database (PGlite)
bun run e2e    # uji penuh di browser tanpa akun Supabase (butuh Chromium)
bun run lint && bun run build
```
