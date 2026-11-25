/* ===========================
   KONFIGURASI & DATA
=========================== */

const STORAGE_KEY = "pengeluaran";

const KATEGORI = {
  pengeluaran: ["Makan", "BBM", "Belanja", "Rokok", "Lainnya"],
  pemasukan: ["Gaji", "Bonus", "Usaha", "Hasil Panen", "Lainnya"]
};

function muatData() {
  try {
    const mentah = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(mentah)) return [];
    return mentah.map(item => ({
      ...item,
      jenis: item.jenis || "pengeluaran",
      nominal: Number(item.nominal) || 0
    }));
  } catch (e) {
    console.error("Data rusak, mulai dari kosong:", e);
    return [];
  }
}

let data = muatData();

function muatObjek(kunci) {
  try {
    const v = JSON.parse(localStorage.getItem(kunci));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
  }
}

let anggaran = muatObjek("anggaran");

function simpanAnggaran() {
  try {
    localStorage.setItem("anggaran", JSON.stringify(anggaran));
  } catch (e) {
    alert("Gagal menyimpan anggaran.");
  }
}

function simpanData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    alert("Gagal menyimpan data. Penyimpanan browser mungkin penuh.");
  }
}

/* ===========================
   HELPER
=========================== */

function rupiah(angka) {
  return "Rp " + Math.round(Number(angka) || 0).toLocaleString("id-ID");
}

function escapeHtml(teks) {
  return String(teks ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTanggalIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function labelJenis(jenis) {
  return jenis === "pemasukan" ? "💰 PEMASUKAN" : "💸 PENGELUARAN";
}

/* ===========================
   NAVIGASI HALAMAN
=========================== */

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === pageId);
  });

  if (pageId === "riwayatPage") {
    filterRiwayat();
  }

  if (pageId === "asetPage" && typeof renderAset === "function") {
    renderAset();
    perbaruiHarga(false);
  }

  window.scrollTo(0, 0);
}

/* ===========================
   FORM TAMBAH
=========================== */

function isiKategori() {
  const jenis = document.getElementById("jenis").value;
  const select = document.getElementById("kategori");

  select.innerHTML = KATEGORI[jenis]
    .map(k => `<option value="${k}">${k}</option>`)
    .join("");
}

function tambahTransaksi() {
  const jenis = document.getElementById("jenis").value;
  const tanggal = document.getElementById("tanggal").value;
  const kategori = document.getElementById("kategori").value;
  const nominal = Number(document.getElementById("nominal").value);
  const catatan = document.getElementById("catatan").value.trim();

  if (!tanggal || !nominal || nominal <= 0) {
    alert("Lengkapi tanggal dan nominal (harus lebih dari 0)");
    return;
  }

  data.push({
    id: Date.now(),
    jenis,
    tanggal,
    kategori,
    nominal,
    catatan
  });

  simpanData();

  document.getElementById("nominal").value = "";
  document.getElementById("catatan").value = "";

  renderDashboard();
  alert("Data berhasil disimpan");
}

/* ===========================
   DASHBOARD
=========================== */

function renderDashboard() {
  const hariIni = formatTanggalIso(new Date());
  const bulanIni = hariIni.substring(0, 7);

  let pemasukanBulan = 0;
  let pengeluaranHari = 0;
  let pengeluaranBulan = 0;
  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  const riwayatHariIni = [];

  data.forEach(item => {
    const masuk = item.jenis === "pemasukan";

    if (masuk) {
      totalPemasukan += item.nominal;
      if (item.tanggal.startsWith(bulanIni)) pemasukanBulan += item.nominal;
    } else {
      totalPengeluaran += item.nominal;
      if (item.tanggal.startsWith(bulanIni)) pengeluaranBulan += item.nominal;
      if (item.tanggal === hariIni) pengeluaranHari += item.nominal;
    }

    if (item.tanggal === hariIni) riwayatHariIni.push(item);
  });

  document.getElementById("saldoSaatIni").textContent =
    rupiah(totalPemasukan - totalPengeluaran);
  document.getElementById("pemasukanBulan").textContent = rupiah(pemasukanBulan);
  document.getElementById("pengeluaranHari").textContent = rupiah(pengeluaranHari);
  document.getElementById("pengeluaranBulan").textContent = rupiah(pengeluaranBulan);

  riwayatHariIni.sort((a, b) => b.id - a.id);

  const html = riwayatHariIni.map(item => `
    <div style="margin-bottom:10px">
      <b>${labelJenis(item.jenis)} · ${escapeHtml(item.kategori)}</b>
      <br>
      <span class="${item.jenis === "pemasukan" ? "nominal-masuk" : "nominal-keluar"}">
        ${item.jenis === "pemasukan" ? "+" : "-"} ${rupiah(item.nominal)}
      </span>
    </div>
  `).join("");

  document.getElementById("riwayatHariIni").innerHTML =
    html || "Belum ada transaksi";

  renderAnggaran();
}

function hitungSaldo() {
  return data.reduce((total, item) =>
    total + (item.jenis === "pemasukan" ? item.nominal : -item.nominal), 0);
}

/* ===========================
   RIWAYAT & FILTER
=========================== */

function filterRiwayat() {
  const awal = document.getElementById("tanggalAwal").value;
  const akhir = document.getElementById("tanggalAkhir").value;
  const jenisFilter = document.getElementById("filterJenis").value;

  const ringkasanDiv = document.getElementById("ringkasanPeriode");
  const hasilDiv = document.getElementById("hasilRiwayat");

  if (!awal || !akhir) {
    alert("Pilih tanggal awal dan akhir");
    return;
  }

  if (awal > akhir) {
    alert("Tanggal awal tidak boleh lebih besar dari tanggal akhir");
    return;
  }

  const hasil = data
    .filter(item =>
      item.tanggal >= awal &&
      item.tanggal <= akhir &&
      (jenisFilter === "semua" || item.jenis === jenisFilter)
    )
    .sort((a, b) =>
      b.tanggal.localeCompare(a.tanggal) || b.id - a.id
    );

  let totalMasuk = 0;
  let totalKeluar = 0;
  const perKategoriKeluar = {};

  hasil.forEach(item => {
    if (item.jenis === "pemasukan") {
      totalMasuk += item.nominal;
    } else {
      totalKeluar += item.nominal;
      perKategoriKeluar[item.kategori] =
        (perKategoriKeluar[item.kategori] || 0) + item.nominal;
    }
  });

  let kategoriTerbesar = "-";
  let nilaiTerbesar = 0;

  for (const k in perKategoriKeluar) {
    if (perKategoriKeluar[k] > nilaiTerbesar) {
      nilaiTerbesar = perKategoriKeluar[k];
      kategoriTerbesar = k;
    }
  }

  ringkasanDiv.innerHTML = `
    <div class="ringkasan-periode">
      <h3>📊 Ringkasan Periode</h3>
      <p><b>Periode:</b> ${awal} s/d ${akhir}</p>
      <p><b>Jumlah Transaksi:</b> ${hasil.length}</p>
      <p><b>Total Pemasukan:</b> ${rupiah(totalMasuk)}</p>
      <p><b>Total Pengeluaran:</b> ${rupiah(totalKeluar)}</p>
      <p><b>Selisih:</b> ${rupiah(totalMasuk - totalKeluar)}</p>
      <p><b>Kategori Pengeluaran Terbesar:</b> ${escapeHtml(kategoriTerbesar)}${
        nilaiTerbesar ? " (" + rupiah(nilaiTerbesar) + ")" : ""
      }</p>
    </div>
  `;

  if (hasil.length === 0) {
    hasilDiv.innerHTML = `<div class="empty">Tidak ada transaksi pada periode ini</div>`;
    return;
  }

  hasilDiv.innerHTML = hasil.map(item => `
    <div class="item">
      <b>
        ${labelJenis(item.jenis)}
        <br>
        ${escapeHtml(item.kategori)}
      </b>

      <div class="badge">${item.tanggal}</div>

      <br><br>
      ${escapeHtml(item.catatan) || "-"}
      <br><br>

      <b class="${item.jenis === "pemasukan" ? "nominal-masuk" : "nominal-keluar"}">
        ${rupiah(item.nominal)}
      </b>

      <button class="hapus-btn" onclick="hapusData(${item.id})">
        Hapus
      </button>
    </div>
  `).join("");
}

/* ===========================
   HAPUS DATA
=========================== */

function hapusData(id) {
  if (!confirm("Yakin ingin menghapus data ini?")) return;

  data = data.filter(item => item.id !== id);

  simpanData();
  renderDashboard();
  filterRiwayat();
}

function hapusSemuaData() {
  if (!confirm("SEMUA DATA AKAN DIHAPUS! Lanjutkan?")) return;

  data = [];

  simpanData();
  renderDashboard();

  document.getElementById("hasilRiwayat").innerHTML = "";
  document.getElementById("ringkasanPeriode").innerHTML = "";

  alert("Semua data berhasil dihapus");
}

/* ===========================
   EXPORT EXCEL
=========================== */

function exportExcel() {
  if (data.length === 0) {
    alert("Belum ada data untuk diexport");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("Library Excel belum termuat. Cek koneksi internet lalu coba lagi.");
    return;
  }

  const transaksi = [...data]
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id - b.id)
    .map(item => ({
      Jenis: item.jenis,
      Tanggal: item.tanggal,
      Kategori: item.kategori,
      Nominal: item.nominal,
      Catatan: item.catatan || ""
    }));

  const ringkasan = {};

  data.forEach(item => {
    const kunci = item.jenis + "|" + item.kategori;
    ringkasan[kunci] = (ringkasan[kunci] || 0) + item.nominal;
  });

  const sheetRingkasan = Object.keys(ringkasan).map(kunci => {
    const [jenis, kategori] = kunci.split("|");
    return { Jenis: jenis, Kategori: kategori, Total: ringkasan[kunci] };
  });

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(transaksi),
    "Transaksi"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(sheetRingkasan),
    "Ringkasan"
  );

  XLSX.writeFile(
    workbook,
    `Catatan-Keuangan_${formatTanggalIso(new Date())}.xlsx`
  );
}

/* ===========================
   ANGGARAN BULANAN
=========================== */

function renderFormAnggaran() {
  const wadah = document.getElementById("formAnggaran");
  if (!wadah) return;

  wadah.innerHTML = KATEGORI.pengeluaran.map(k => `
    <label>${k}</label>
    <input
      type="number"
      inputmode="numeric"
      min="0"
      class="input-anggaran"
      data-kategori="${k}"
      placeholder="Batas per bulan (kosongkan = tanpa batas)"
      value="${anggaran[k] > 0 ? anggaran[k] : ""}">
  `).join("");
}

function simpanFormAnggaran() {
  const baru = {};

  document.querySelectorAll(".input-anggaran").forEach(input => {
    const nilai = Number(input.value);
    if (nilai > 0) baru[input.dataset.kategori] = nilai;
  });

  anggaran = baru;
  simpanAnggaran();
  renderAnggaran();
  alert("Anggaran disimpan");
}

function renderAnggaran() {
  const wadah = document.getElementById("anggaranBulan");
  if (!wadah) return;

  const bulanIni = formatTanggalIso(new Date()).substring(0, 7);
  const terpakai = {};

  data.forEach(item => {
    if (item.jenis !== "pemasukan" && item.tanggal.startsWith(bulanIni)) {
      terpakai[item.kategori] = (terpakai[item.kategori] || 0) + item.nominal;
    }
  });

  const baris = KATEGORI.pengeluaran
    .filter(k => anggaran[k] > 0)
    .map(k => {
      const batas = anggaran[k];
      const pakai = terpakai[k] || 0;
      const persen = Math.round((pakai / batas) * 100);
      const kelas = persen >= 100 ? "bahaya" : persen >= 80 ? "waspada" : "";
      const sisa = batas - pakai;

      return `
        <div class="anggaran-item">
          <div class="anggaran-head">
            <b>${escapeHtml(k)}</b>
            <span>${rupiah(pakai)} / ${rupiah(batas)}</span>
          </div>
          <div class="bar">
            <div class="bar-isi ${kelas}" style="width:${Math.min(persen, 100)}%"></div>
          </div>
          <small class="${kelas}">
            ${sisa >= 0
              ? "Sisa " + rupiah(sisa) + " (" + persen + "% terpakai)"
              : "⚠️ Melebihi " + rupiah(-sisa)}
          </small>
        </div>
      `;
    });

  wadah.innerHTML = baris.length
    ? baris.join("")
    : "Belum ada anggaran. Atur di menu Setelan.";
}

/* ===========================
   BACKUP & RESTORE
=========================== */

function backupData() {
  const paket = {
    app: "catatan-keuangan",
    versi: "3.3",
    dibuat: new Date().toISOString(),
    pengeluaran: data,
    anggaran: anggaran,
    aset: typeof aset !== "undefined" ? aset : []
  };

  const blob = new Blob(
    [JSON.stringify(paket, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Backup-Keuangan_${formatTanggalIso(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bersihkanTransaksi(daftar) {
  const hasil = [];
  const tanggalValid = /^\d{4}-\d{2}-\d{2}$/;

  daftar.forEach((item, i) => {
    if (!item || typeof item !== "object") return;

    const nominal = Number(item.nominal);
    const jenis = item.jenis === "pemasukan" ? "pemasukan" : "pengeluaran";

    if (!tanggalValid.test(item.tanggal) || !(nominal > 0) || !item.kategori) return;

    hasil.push({
      id: Number(item.id) || Date.now() + i,
      jenis,
      tanggal: item.tanggal,
      kategori: String(item.kategori),
      nominal,
      catatan: String(item.catatan || "")
    });
  });

  return hasil;
}

function restoreData(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const paket = JSON.parse(reader.result);

      if (!paket || paket.app !== "catatan-keuangan" || !Array.isArray(paket.pengeluaran)) {
        throw new Error("Bukan file backup Catatan Keuangan");
      }

      const transaksi = bersihkanTransaksi(paket.pengeluaran);
      const dilewati = paket.pengeluaran.length - transaksi.length;

      const pesan =
        `Ganti SEMUA data sekarang dengan backup ini?\n\n` +
        `Transaksi: ${transaksi.length}` +
        (dilewati > 0 ? ` (${dilewati} data rusak dilewati)` : "") +
        `\nDibuat: ${String(paket.dibuat || "-").substring(0, 10)}`;

      if (!confirm(pesan)) return;

      data = transaksi;
      simpanData();

      anggaran = {};
      if (paket.anggaran && typeof paket.anggaran === "object") {
        KATEGORI.pengeluaran.forEach(k => {
          if (Number(paket.anggaran[k]) > 0) anggaran[k] = Number(paket.anggaran[k]);
        });
      }
      simpanAnggaran();

      if (typeof pulihkanAset === "function") {
        pulihkanAset(Array.isArray(paket.aset) ? paket.aset : []);
      }

      renderFormAnggaran();
      renderDashboard();
      document.getElementById("hasilRiwayat").innerHTML = "";
      document.getElementById("ringkasanPeriode").innerHTML = "";

      alert("Restore berhasil");
    } catch (e) {
      alert("Restore gagal: " + e.message);
    } finally {
      input.value = "";
    }
  };

  reader.onerror = () => {
    alert("File tidak bisa dibaca");
    input.value = "";
  };

  reader.readAsText(file);
}

/* ===========================
   INISIALISASI
=========================== */

(function init() {
  const sekarang = new Date();
  const hariIni = formatTanggalIso(sekarang);
  const awalBulan = hariIni.substring(0, 8) + "01";

  document.getElementById("tanggal").value = hariIni;
  document.getElementById("tanggalAwal").value = awalBulan;
  document.getElementById("tanggalAkhir").value = hariIni;

  document.getElementById("jenis").addEventListener("change", isiKategori);
  isiKategori();
  renderFormAnggaran();

  renderDashboard();
})();

/* ===========================
   SERVICE WORKER
=========================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(err => console.error("Service Worker gagal:", err));
  });
}
