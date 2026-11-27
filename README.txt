UI ParkSense V5.0 — Campus Atlas / paket calon rilis

1. Ekstrak ke folder tersendiri. Salin config.js publik dari Trial 12, jangan unggah secret/service_role key.
2. Uji index.html di Chrome; guest otomatis membaca RPC V5. Login petugas tetap hanya-baca secara default.
3. Untuk GitHub, buat branch v5-campus-atlas dari main. Salin file frontend dan gabungkan folder assets, JANGAN hapus assets/makara atau file website lama. Pertahankan config.js produksi. Jangan merge sampai siap cutover.
4. Sebelum reset: koordinasikan jeda pencatatan, tutup sesi petugas lama, ekspor ulang parking_zones dan parking_events. Pertahankan juga audit kapasitas, penugasan, berita dan Storage. Simpan backup pribadi. Catat SHA main.
5. Publikasi dan reset adalah langkah terpisah; paket ini tidak menjalankan reset. Jangan reset sebelum frontend V5 tersedia. Uji website publik sebelum membuka operasional.

Batasan: pengujian lokal menggunakan respons tiruan; Realtime nyata perlu konfirmasi waktu. Foto/ilustrasi sementara; link feedback belum ada; sesi petugas dalam memori (login ulang saat kedaluwarsa); riwayat 30 catatan. Foto draft di bucket publik dapat diakses jika URL diketahui. Kode demo lama masih dalam source tetapi tidak aktif/ditawarkan. Favicon mengandalkan assets/makara/ui.png dari repositori produksi.
