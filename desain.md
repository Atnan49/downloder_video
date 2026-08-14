# Design System: Elegant Minimalist (Wireframe-Inspired)

Dokumen ini berisi panduan sistem desain yang digunakan dalam proyek ini. Tujuan dokumen ini adalah memberikan referensi kepada AI atau *developer* lain agar dapat mempertahankan konsistensi gaya visual saat menambahkan komponen atau halaman baru di masa depan.

## Filosofi Desain
Gaya yang diusung adalah **"Minimalis yang Elegan"**, yang mengambil inspirasi dari *Neo-Brutalism* dan rancangan dasar kerangka (*Wireframe*). Desain ini mengutamakan keterbacaan tinggi, kontras warna mutlak, bentuk kaku yang tegas, dan penghapusan total elemen-elemen dekoratif yang berat (seperti gradasi warna, efek blur, atau bayangan halus).

## 1. Palet Warna (Monokrom Solid)
- **Background Utama**: Putih murni (`#ffffff` atau `bg-white`).
- **Elemen / Kontainer Sekunder**: Putih murni, atau Abu-abu sangat muda jika butuh separasi minimal (`bg-zinc-50`).
- **Teks Utama**: Hitam solid (`#000000` atau `text-black`).
- **Teks Sekunder**: Abu-abu gelap (`text-zinc-600` atau `text-zinc-700`).
- **Warna Aksen**: Tidak ada warna primer/sekunder bergaya pelangi. Hitam adalah aksen utama. Jika ada peringatan atau *error*, gunakan garis atau warna solid Merah pekat tanpa gradasi.

## 2. Garis dan Bentuk (Borders & Shapes)
- **Border Radius**: **DILARANG** menggunakan sudut melengkung. Semuanya harus bersudut kaku dan tajam. Gunakan `rounded-none` pada kelas Tailwind.
- **Borders**: Setiap komponen (kartu, input teks, tombol, panel) wajib memiliki garis tepi hitam tegas. Gunakan `border-2 border-black`.

## 3. Efek dan Kedalaman (Shadows & Depth)
- **DILARANG** menggunakan efek kaca transparan (*Glassmorphism*, `backdrop-blur`), *glow effect*, atau bayangan memudar.
- **Shadow**: Untuk memberikan dimensi (kedalaman) saat elemen di-hover atau ditekankan, gunakan efek bayangan solid asimetris, bukan bayangan kabur.
  - *Contoh CSS*: `box-shadow: 4px 4px 0px rgba(0,0,0,1);`
  - Saat tombol/kartu ditekan (*active/hover*), translasikan elemen mendekati bayangannya (`transform: translate(2px, 2px)`) lalu kurangi jarak bayangannya menjadi `2px 2px 0px` untuk memberikan efek fisik "ditekan".

## 4. Tipografi
- **Headings (Judul)**: Gunakan *font-weight* tebal (`font-bold` atau `font-extrabold`), sering kali dipadukan dengan huruf kapital semua (`uppercase`) dan spasi antar huruf yang lebar (`tracking-wider` atau `tracking-widest`).
- **Detail Teknis**: Untuk label seperti status server, ukuran file, resolusi video, atau tag, gunakan *Font Monospace* (`font-mono`) agar memberikan kesan teknikal dan mentah.
- **Warna Teks**: Harus solid. Dilarang menggunakan teks transparan (`text-transparent`) atau `bg-clip-text` dengan gradien.

## 5. Implementasi Kelas Tailwind Khas
Jika Anda membuat komponen baru, gunakan pola kombinasi kelas berikut:

**A. Tombol Utama (Primary Button)**
```jsx
<button className="bg-black text-white font-bold border-2 border-black rounded-none px-4 py-2 hover:bg-white hover:text-black transition-all">
  TOMBOL
</button>
```

**B. Tombol Sekunder / Ikon (Secondary Button)**
```jsx
<button className="bg-white text-black font-bold border-2 border-black rounded-none px-4 py-2 hover:bg-zinc-100 transition-all shadow-[2px_2px_0px_black]">
  SEKUNDER
</button>
```

**C. Kartu atau Panel (Card / Panel)**
```jsx
<div className="bg-white border-2 border-black rounded-none p-4 shadow-[4px_4px_0px_black]">
  <!-- Konten -->
</div>
```

**D. Input Teks (Text Input)**
```jsx
<input className="bg-white text-black border-2 border-black rounded-none px-3 py-2 focus:outline-none focus:ring-0" placeholder="Ketik sesuatu..." />
```

## Ringkasan Aturan Emas
Jika ragu saat mendesain fitur baru, ingat 3 aturan ini:
1. **Hitam dan Putih Saja**.
2. **Kaku dan Tajam (Tanpa Lengkungan)**.
3. **Garis Tepi Hitam Tebal (`border-2 border-black`) pada segalanya**.
