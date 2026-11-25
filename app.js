/* ===========================
   KONFIGURASI & DATA
=========================== */

const STORAGE_KEY = "pengeluaran";

const KATEGORI = {
  pengeluaran: ["Makan", "BBM", "Belanja", "Rokok", "Lainnya"],
  pemasukan: ["Gaji", "Bonus", "Usaha", "Hasil Panen", "Lainnya"]
};

const IKON = {
  "Makan": "utensils",
  "BBM": "gas-pump",
  "Belanja": "bag-shopping",
  "Rokok": "smoking",
  "Lainnya": "ellipsis",
  "Gaji": "money-bill-wave",
  "Bonus": "gift",
  "Usaha": "store",
  "Hasil Panen": "wheat-awn"
};

function ikon(kategori) {
  return IKON[kategori] || "tag";
}

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

function simpanData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    toast("Gagal menyimpan data. Penyimpanan browser mungkin penuh.");
  }
}

function simpanAnggaran() {
  try {
    localStorage.setItem("anggaran", JSON.stringify(anggaran));
  } catch (e) {
    toast("Gagal menyimpan anggaran.");
  }
}

/* ===========================
   HELPER
=========================== */

let timerToast;

function toast(pesan) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = pesan;
  el.classList.toggle("tampil", true);

  clearTimeout(timerToast);
  timerToast = setTimeout(
    () => el.classList.toggle("tampil", false),
    2200 + String(pesan).length * 30
  );
}

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

function dariIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function labelTanggal(iso) {
  const hariIni = new Date();
  const kemarin = new Date();
  kemarin.setDate(hariIni.getDate() - 1);

  const pendek = dariIso(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short"
  });

  if (iso === formatTanggalIso(hariIni)) return "Hari ini, " + pendek;
  if (iso === formatTanggalIso(kemarin)) return "Kemarin, " + pendek;
  return pendek;
}

function bertanda(angka) {
  return (angka < 0 ? "−" : angka > 0 ? "+" : "") + rupiah(Math.abs(angka));
}

function barisTransaksi(item, bisaHapus) {
  const masuk = item.jenis === "pemasukan";
  const sub = item.catatan
    ? escapeHtml(item.catatan)
    : masuk ? "Pemasukan" : "Pengeluaran";

  const isi = `
      <div class="chip-ikon ${masuk ? "masuk" : ""}">
        <i class="fa-solid fa-${ikon(item.kategori)}"></i>
      </div>
      <div class="baris-isi">
        <div class="baris-judul">${escapeHtml(item.kategori)}</div>
        <div class="baris-sub">${sub}</div>
      </div>
      <div class="angka ${masuk ? "masuk" : "keluar"}">
        ${masuk ? "+" : "−"}${rupiah(item.nominal)}
      </div>
  `;

  if (!bisaHapus) {
    return `<div class="baris">${isi}</div>`;
  }

  return `
    <div class="baris">
      <button class="baris-ketuk"
        aria-label="Ubah transaksi ${escapeHtml(item.kategori)} ${rupiah(item.nominal)}"
        onclick="mulaiEdit(${item.id})">${isi}</button>
      <button class="ikon-tombol" aria-label="Hapus transaksi ${escapeHtml(item.kategori)}"
        onclick="hapusData(${item.id})">
        <i class="fa-regular fa-trash-can"></i>
      </button>
    </div>
  `;
}

/* ===========================
   NAVIGASI HALAMAN
=========================== */

function showPage(pageId) {
  if (pageId !== "tambahPage" && sedangEdit !== null) {
    akhiriEdit();
  }

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
   FORM CATAT
=========================== */

function setJenis(jenis) {
  document.getElementById("jenis").value = jenis;
  document.getElementById("segKeluar").classList.toggle("aktif", jenis === "pengeluaran");
  document.getElementById("segMasuk").classList.toggle("aktif", jenis === "pemasukan");

  document.getElementById("nominal").closest(".nominal-wrap").className =
    "nominal-wrap " + (jenis === "pemasukan" ? "mode-masuk" : "mode-keluar");

  document.getElementById("tombolSimpan").textContent =
    jenis === "pemasukan" ? "Simpan pemasukan" : "Simpan pengeluaran";

  document.getElementById("kategori").value = KATEGORI[jenis][0];
  renderChipKategori();
  perbaruiCek();
}

function pilihKategori(nama) {
  document.getElementById("kategori").value = nama;
  renderChipKategori();
  perbaruiCek();
}

function perbaruiCek() {
  const el = document.getElementById("cekCatat");
  if (!el) return;

  const jenis = document.getElementById("jenis").value;
  const kategori = document.getElementById("kategori").value;
  const tanggal = document.getElementById("tanggal").value;
  const nominal = Number(document.getElementById("nominal").value);
  const nama = jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran";

  el.className = "cek-catat " + (jenis === "pemasukan" ? "masuk" : "keluar");

  el.innerHTML = nominal > 0
    ? `Akan dicatat: <b>${nama} ${rupiah(nominal)}</b> untuk <b>${escapeHtml(kategori)}</b>${
        tanggal ? ", " + labelTanggal(tanggal) : ""}`
    : `Kamu sedang mencatat <b>${nama.toLowerCase()}</b>. Isi nominal untuk melanjutkan.`;
}

function renderChipKategori() {
  const jenis = document.getElementById("jenis").value;
  const dipilih = document.getElementById("kategori").value;

  const daftarKategori = !dipilih || KATEGORI[jenis].includes(dipilih)
    ? KATEGORI[jenis]
    : [...KATEGORI[jenis], dipilih];

  document.getElementById("pilihKategori").innerHTML = daftarKategori
    .map(k => `
      <button type="button"
        class="chip ${k === dipilih ? "aktif" : ""}"
        aria-pressed="${k === dipilih}"
        onclick="pilihKategori(this.dataset.k)" data-k="${escapeHtml(k)}">
        <i class="fa-solid fa-${ikon(k)}"></i> ${escapeHtml(k)}
        ${k === dipilih ? '<i class="fa-solid fa-check centang"></i>' : ""}
      </button>
    `)
    .join("");
}

function tambahTransaksi() {
  const jenis = document.getElementById("jenis").value;
  const tanggal = document.getElementById("tanggal").value;
  const kategori = document.getElementById("kategori").value;
  const nominal = Number(document.getElementById("nominal").value);
  const catatan = document.getElementById("catatan").value.trim();

  if (!nominal || nominal <= 0) {
    toast("Isi nominal lebih dari 0");
    return;
  }

  if (!tanggal) {
    toast("Pilih tanggal transaksi");
    return;
  }

  if (sedangEdit !== null) {
    const idx = data.findIndex(item => item.id === sedangEdit);

    if (idx < 0) {
      toast("Transaksi tidak ditemukan. Mungkin sudah dihapus.");
      akhiriEdit();
      return;
    }

    data[idx] = { ...data[idx], jenis, tanggal, kategori, nominal, catatan };
    simpanData();

    akhiriEdit();
    renderDashboard();
    toast("Perubahan tersimpan");
    showPage("riwayatPage");
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

  perbaruiCek();
  renderDashboard();
  toast((jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran") + " tersimpan");
}

/* ===========================
   UBAH TRANSAKSI
=========================== */

let sedangEdit = null;

function aturTampilanEdit(aktif) {
  document.getElementById("bannerEdit").hidden = !aktif;
  document.getElementById("judulCatat").textContent = aktif ? "Ubah transaksi" : "Catat transaksi";

  document.getElementById("tombolSimpan").textContent = aktif
    ? "Simpan perubahan"
    : document.getElementById("jenis").value === "pemasukan"
      ? "Simpan pemasukan"
      : "Simpan pengeluaran";
}

function mulaiEdit(id) {
  const item = data.find(x => x.id === id);
  if (!item) return;

  showPage("tambahPage");

  setJenis(item.jenis);
  document.getElementById("kategori").value = item.kategori;
  renderChipKategori();

  document.getElementById("nominal").value = item.nominal;
  document.getElementById("tanggal").value = item.tanggal;
  document.getElementById("catatan").value = item.catatan || "";

  sedangEdit = id;
  aturTampilanEdit(true);
  perbaruiCek();
}

function akhiriEdit() {
  sedangEdit = null;

  document.getElementById("nominal").value = "";
  document.getElementById("catatan").value = "";
  document.getElementById("tanggal").value = formatTanggalIso(new Date());

  setJenis("pengeluaran");
  aturTampilanEdit(false);
}

function batalEdit() {
  akhiriEdit();
  showPage("riwayatPage");
}

/* ===========================
   HOME
=========================== */

function renderDashboard() {
  const sekarang = new Date();
  const hariIni = formatTanggalIso(sekarang);
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

  const saldo = totalPemasukan - totalPengeluaran;
  const saldoEl = document.getElementById("saldoSaatIni");

  saldoEl.textContent = (saldo < 0 ? "−" : "") + rupiah(Math.abs(saldo));
  saldoEl.classList.toggle("minus", saldo < 0);

  document.getElementById("pemasukanBulan").textContent = rupiah(pemasukanBulan);
  document.getElementById("pengeluaranBulan").textContent = rupiah(pengeluaranBulan);
  document.getElementById("pengeluaranHari").textContent = "Keluar " + rupiah(pengeluaranHari);

  document.getElementById("tanggalHariIni").textContent =
    sekarang.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

  riwayatHariIni.sort((a, b) => b.id - a.id);

  document.getElementById("riwayatHariIni").innerHTML =
    riwayatHariIni.length
      ? riwayatHariIni.map(item => barisTransaksi(item, false)).join("")
      : `<p class="kosong">Belum ada transaksi hari ini. Ketuk Catat untuk menambahkan.</p>`;

  renderAnggaran();
  renderKategoriBulan();
}

function renderKategoriBulan() {
  const wadah = document.getElementById("grafikKategori");
  if (!wadah) return;

  const bulanIni = formatTanggalIso(new Date()).substring(0, 7);
  const total = {};
  let jumlah = 0;

  data.forEach(item => {
    if (item.jenis === "pemasukan" || !item.tanggal.startsWith(bulanIni)) return;
    total[item.kategori] = (total[item.kategori] || 0) + item.nominal;
    jumlah += item.nominal;
  });

  const urut = Object.keys(total).sort((a, b) => total[b] - total[a]);

  if (!urut.length) {
    wadah.innerHTML = `<p class="kosong">Belum ada pengeluaran bulan ini.</p>`;
    return;
  }

  const maks = total[urut[0]];

  wadah.innerHTML = urut.map(k => {
    const persen = (total[k] / jumlah) * 100;
    const lebar = Math.max((total[k] / maks) * 100, 2);

    return `
      <div class="anggaran-item">
        <div class="anggaran-head">
          <b>${escapeHtml(k)}</b>
          <span>${rupiah(total[k])} · ${persen > 0 && persen < 1 ? "<1" : Math.round(persen)}%</span>
        </div>
        <div class="bar">
          <div class="bar-isi biru" style="width:${lebar}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function hitungSaldo() {
  return data.reduce((total, item) =>
    total + (item.jenis === "pemasukan" ? item.nominal : -item.nominal), 0);
}

/* ===========================
   RIWAYAT & FILTER
=========================== */

function setFilterJenis(jenis) {
  document.getElementById("filterJenis").value = jenis;
  document.getElementById("fSemua").classList.toggle("aktif", jenis === "semua");
  document.getElementById("fKeluar").classList.toggle("aktif", jenis === "pengeluaran");
  document.getElementById("fMasuk").classList.toggle("aktif", jenis === "pemasukan");
  filterRiwayat();
}

function filterRiwayat() {
  const awal = document.getElementById("tanggalAwal").value;
  const akhir = document.getElementById("tanggalAkhir").value;
  const jenisFilter = document.getElementById("filterJenis").value;

  const ringkasanDiv = document.getElementById("ringkasanPeriode");
  const hasilDiv = document.getElementById("hasilRiwayat");

  if (!awal || !akhir) {
    ringkasanDiv.innerHTML = `<p class="pesan-galat">Pilih tanggal awal dan akhir.</p>`;
    hasilDiv.innerHTML = "";
    return;
  }

  if (awal > akhir) {
    ringkasanDiv.innerHTML =
      `<p class="pesan-galat">Tanggal awal tidak boleh lebih besar dari tanggal akhir.</p>`;
    hasilDiv.innerHTML = "";
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

  let kategoriTerbesar = "";
  let nilaiTerbesar = 0;

  for (const k in perKategoriKeluar) {
    if (perKategoriKeluar[k] > nilaiTerbesar) {
      nilaiTerbesar = perKategoriKeluar[k];
      kategoriTerbesar = k;
    }
  }

  const selisih = totalMasuk - totalKeluar;

  ringkasanDiv.innerHTML = `
    <div class="ringkas">
      <div><span>Masuk</span><b class="masuk">${rupiah(totalMasuk)}</b></div>
      <div><span>Keluar</span><b class="keluar">${rupiah(totalKeluar)}</b></div>
      <div><span>Selisih</span><b>${bertanda(selisih)}</b></div>
    </div>
    ${kategoriTerbesar
      ? `<p class="catatan-kecil">Pengeluaran terbesar: ${escapeHtml(kategoriTerbesar)}, ${rupiah(nilaiTerbesar)}</p>`
      : ""}
  `;

  if (hasil.length === 0) {
    hasilDiv.innerHTML =
      `<p class="kosong">Tidak ada transaksi pada periode ini. Coba ubah tanggal atau filter.</p>`;
    return;
  }

  // kelompokkan per tanggal (hasil sudah terurut terbaru dulu)
  const grup = [];
  hasil.forEach(item => {
    const terakhir = grup[grup.length - 1];
    if (terakhir && terakhir.tanggal === item.tanggal) {
      terakhir.daftar.push(item);
    } else {
      grup.push({ tanggal: item.tanggal, daftar: [item] });
    }
  });

  hasilDiv.innerHTML = grup.map(g => {
    const netto = g.daftar.reduce((t, item) =>
      t + (item.jenis === "pemasukan" ? item.nominal : -item.nominal), 0);

    return `
      <div class="grup-tanggal">
        <span>${labelTanggal(g.tanggal)}</span>
        <span>${bertanda(netto)}</span>
      </div>
      ${g.daftar.map(item => barisTransaksi(item, true)).join("")}
    `;
  }).join("");
}

/* ===========================
   HAPUS DATA
=========================== */

function hapusData(id) {
  if (!confirm("Yakin ingin menghapus transaksi ini?")) return;

  if (sedangEdit === id) akhiriEdit();

  data = data.filter(item => item.id !== id);

  simpanData();
  renderDashboard();
  filterRiwayat();
  toast("Transaksi dihapus");
}

function hapusSemuaData() {
  if (!confirm("SEMUA TRANSAKSI AKAN DIHAPUS! Lanjutkan?")) return;

  data = [];

  simpanData();
  renderDashboard();
  filterRiwayat();

  toast("Semua transaksi dihapus");
}

/* ===========================
   EXPORT EXCEL
=========================== */

function exportExcel() {
  if (data.length === 0) {
    toast("Belum ada data untuk diexport");
    return;
  }

  if (typeof XLSX === "undefined") {
    toast("Library Excel belum termuat. Cek koneksi internet lalu coba lagi.");
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
      placeholder="Tanpa batas"
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
  toast("Anggaran tersimpan");
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
            <span>${rupiah(pakai)} dari ${rupiah(batas)}</span>
          </div>
          <div class="bar">
            <div class="bar-isi ${kelas}" style="width:${Math.min(persen, 100)}%"></div>
          </div>
          <small class="${kelas}">
            ${sisa >= 0
              ? "Sisa " + rupiah(sisa) + " (" + persen + "% terpakai)"
              : "Melebihi anggaran " + rupiah(-sisa)}
          </small>
        </div>
      `;
    });

  wadah.innerHTML = baris.length
    ? baris.join("")
    : `<p class="kosong">Belum ada anggaran. Atur batas per kategori di Setelan.</p>`;
}

/* ===========================
   BACKUP & RESTORE
=========================== */

function backupData() {
  const paket = {
    app: "catatan-keuangan",
    versi: "3.6",
    dibuat: new Date().toISOString(),
    pengeluaran: data,
    anggaran: anggaran,
    aset: typeof aset !== "undefined" ? aset : [],
    snapshot: typeof snapshot !== "undefined" ? snapshot : []
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

  toast("Backup diunduh");
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

      if (typeof pulihkanSnapshot === "function") {
        pulihkanSnapshot(Array.isArray(paket.snapshot) ? paket.snapshot : []);
      }

      renderFormAnggaran();
      renderDashboard();
      filterRiwayat();

      toast("Data berhasil dipulihkan");
    } catch (e) {
      toast("Gagal memulihkan: " + e.message);
    } finally {
      input.value = "";
    }
  };

  reader.onerror = () => {
    toast("File tidak bisa dibaca");
    input.value = "";
  };

  reader.readAsText(file);
}

/* ===========================
   INISIALISASI
=========================== */

(function init() {
  const hariIni = formatTanggalIso(new Date());

  document.getElementById("tanggal").value = hariIni;
  document.getElementById("tanggalAwal").value = hariIni.substring(0, 8) + "01";
  document.getElementById("tanggalAkhir").value = hariIni;

  document.getElementById("nominal").addEventListener("input", perbaruiCek);
  document.getElementById("tanggal").addEventListener("change", perbaruiCek);

  setJenis("pengeluaran");
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
