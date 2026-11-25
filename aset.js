/* ===========================
   ASET: EMAS & CRYPTO
   Sumber harga (semua gratis, tanpa API key):
   - Emas   : xaus.com        (harga spot internasional)
   - Kurs   : open.er-api.com (USD -> IDR, update harian)
   - Crypto : coingecko.com   (keyless, limit kecil -> di-cache)
=========================== */

const ASET_KEY = "aset";
const HARGA_KEY = "hargaCache";

const TTL_KURS = 60 * 60 * 1000;      // 1 jam
const TTL_EMAS = 5 * 60 * 1000;       // 5 menit
const TTL_CRYPTO = 5 * 60 * 1000;     // 5 menit
const JEDA_MANUAL = 30 * 1000;        // tombol perbarui: min 30 detik

const KOIN = {
  bitcoin: "Bitcoin (BTC)",
  ethereum: "Ethereum (ETH)",
  solana: "Solana (SOL)",
  binancecoin: "BNB",
  dogecoin: "Dogecoin (DOGE)",
  tether: "Tether (USDT)"
};

/* ---------- penyimpanan ---------- */

function bersihkanAset(daftar) {
  const hasil = [];

  (Array.isArray(daftar) ? daftar : []).forEach((item, i) => {
    if (!item || typeof item !== "object") return;

    const jumlah = Number(item.jumlah);
    if (!(jumlah > 0)) return;

    const tipe = item.tipe === "crypto" ? "crypto" : item.tipe === "emas" ? "emas" : null;
    if (!tipe) return;
    if (tipe === "crypto" && !KOIN[item.koin]) return;

    hasil.push({
      id: Number(item.id) || Date.now() + i,
      tipe,
      koin: tipe === "crypto" ? item.koin : null,
      jumlah,
      modal: Number(item.modal) > 0 ? Number(item.modal) : 0
    });
  });

  return hasil;
}

function muatAset() {
  try {
    return bersihkanAset(JSON.parse(localStorage.getItem(ASET_KEY)));
  } catch (e) {
    return [];
  }
}

function muatHarga() {
  try {
    const v = JSON.parse(localStorage.getItem(HARGA_KEY));
    return v && typeof v === "object" ? v : {};
  } catch (e) {
    return {};
  }
}

let aset = muatAset();
let harga = muatHarga();   // { kurs:{nilai,waktu}, emas:{perGram,waktu}, crypto:{harga:{id:idr},waktu} }
let terakhirManual = 0;
let sedangMemuat = false;

function simpanAset() {
  try {
    localStorage.setItem(ASET_KEY, JSON.stringify(aset));
  } catch (e) {
    toast("Gagal menyimpan aset.");
  }
}

function simpanHarga() {
  try {
    localStorage.setItem(HARGA_KEY, JSON.stringify(harga));
  } catch (e) { /* cache gagal bukan masalah besar */ }
}

function pulihkanAset(daftar) {
  aset = bersihkanAset(daftar);
  simpanAset();
  renderAset();
}

/* ---------- ambil harga dari API ---------- */

async function ambilJson(url) {
  const pengendali = new AbortController();
  const timer = setTimeout(() => pengendali.abort(), 10000);

  try {
    const res = await fetch(url, { signal: pengendali.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function perbaruiKurs() {
  const j = await ambilJson("https://open.er-api.com/v6/latest/USD");
  const idr = Number(j && j.rates && j.rates.IDR);

  if (!j || j.result !== "success" || !(idr > 0)) {
    throw new Error("respons kurs tidak valid");
  }

  harga.kurs = { nilai: idr, waktu: Date.now() };
}

async function perbaruiEmas() {
  // Percobaan 1: langsung rupiah per gram
  try {
    const j = await ambilJson(
      "https://xaus.com/api/v1/spot?currency=IDR&unit=gram&compact=1"
    );
    const harga1 = Number(j && j.xau && j.xau.price);

    if (j && j.xau && j.xau.currency === "IDR" && harga1 > 0) {
      harga.emas = { perGram: harga1, waktu: Date.now() };
      return;
    }
  } catch (e) { /* lanjut ke percobaan 2 */ }

  // Percobaan 2: USD per gram x kurs USD->IDR
  const j2 = await ambilJson("https://xaus.com/api/v1/spot?compact=1");
  const usd = Number(j2 && j2.per_gram_usd);

  if (!(usd > 0) || !harga.kurs) {
    throw new Error("respons emas tidak valid");
  }

  harga.emas = { perGram: usd * harga.kurs.nilai, waktu: Date.now() };
}

async function perbaruiCrypto() {
  const ids = Object.keys(KOIN).join(",");
  const j = await ambilJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=idr,usd`
  );

  const hasil = {};

  Object.keys(KOIN).forEach(id => {
    const idr = Number(j && j[id] && j[id].idr);
    const usd = Number(j && j[id] && j[id].usd);

    if (idr > 0) hasil[id] = idr;
    else if (usd > 0 && harga.kurs) hasil[id] = usd * harga.kurs.nilai;
  });

  if (Object.keys(hasil).length === 0) {
    throw new Error("respons crypto tidak valid");
  }

  harga.crypto = { harga: hasil, waktu: Date.now() };
}

async function perbaruiHarga(paksa) {
  if (sedangMemuat) return;

  if (paksa) {
    const sisa = JEDA_MANUAL - (Date.now() - terakhirManual);
    if (sisa > 0) {
      toast(`Tunggu ${Math.ceil(sisa / 1000)} detik lagi sebelum memperbarui`);
      return;
    }
    terakhirManual = Date.now();
  }

  const basi = (obj, ttl) => !obj || Date.now() - obj.waktu > ttl;

  const perluKurs = paksa || basi(harga.kurs, TTL_KURS);
  const perluEmas = paksa || basi(harga.emas, TTL_EMAS);
  const perluCrypto = paksa || basi(harga.crypto, TTL_CRYPTO);

  if (!perluKurs && !perluEmas && !perluCrypto) return;

  sedangMemuat = true;
  aturStatus("Memperbarui harga...");

  const gagal = [];

  try {
    if (perluKurs) {
      try { await perbaruiKurs(); } catch (e) { gagal.push("kurs"); }
    }

    const tugas = [];
    const nama = [];

    if (perluEmas) { tugas.push(perbaruiEmas()); nama.push("emas"); }
    if (perluCrypto) { tugas.push(perbaruiCrypto()); nama.push("crypto"); }

    const hasil = await Promise.allSettled(tugas);
    hasil.forEach((h, i) => { if (h.status === "rejected") gagal.push(nama[i]); });

    simpanHarga();
  } finally {
    sedangMemuat = false;
  }

  renderAset();

  if (gagal.length) {
    aturStatus(
      "Gagal memperbarui: " + gagal.join(", ") +
      ". Menampilkan harga terakhir yang tersimpan (kalau ada)."
    );
  } else {
    aturStatus("");
  }
}

function aturStatus(teks) {
  const el = document.getElementById("statusHarga");
  if (el) el.textContent = teks;
}

/* ---------- tampilan ---------- */

function umur(waktu) {
  if (!waktu) return "belum ada data";

  const menit = Math.floor((Date.now() - waktu) / 60000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return menit + " menit lalu";

  const jam = Math.floor(menit / 60);
  if (jam < 24) return jam + " jam lalu";

  return Math.floor(jam / 24) + " hari lalu";
}

function hargaSatuan(item) {
  if (item.tipe === "emas") {
    return harga.emas ? harga.emas.perGram : null;
  }

  return harga.crypto && harga.crypto.harga[item.koin]
    ? harga.crypto.harga[item.koin]
    : null;
}

function formatJumlah(n) {
  return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 8 });
}

function renderAset() {
  const kartuHarga = document.getElementById("kartuHarga");
  const daftar = document.getElementById("daftarAset");
  const ringkasan = document.getElementById("ringkasanAset");

  if (!kartuHarga || !daftar || !ringkasan) return;

  /* harga pasar */
  const barisHarga = [];

  const tambahHarga = (nama, nilai, waktu) => barisHarga.push(`
    <div class="harga-baris">
      <span>${nama}</span>
      <b>${nilai ? rupiah(nilai) : "-"}</b>
    </div>
  `);

  tambahHarga("Emas per gram", harga.emas && harga.emas.perGram);
  tambahHarga("1 USD", harga.kurs && harga.kurs.nilai);

  Object.keys(KOIN).forEach(id => {
    tambahHarga(KOIN[id], harga.crypto && harga.crypto.harga[id]);
  });

  kartuHarga.innerHTML = barisHarga.join("") + `
    <p class="catatan-kecil" style="margin-top:12px">
      Diperbarui: emas ${umur(harga.emas && harga.emas.waktu)},
      kurs ${umur(harga.kurs && harga.kurs.waktu)},
      crypto ${umur(harga.crypto && harga.crypto.waktu)}.
      Harga emas adalah spot internasional 24K, bukan harga Antam atau toko.
      Semua harga hanya perkiraan.
    </p>
  `;

  /* kepemilikan */
  let totalAset = 0;

  const baris = aset.map(item => {
    const satuan = hargaSatuan(item);
    const nilai = satuan === null ? null : satuan * item.jumlah;
    const nama = item.tipe === "emas" ? "Emas" : KOIN[item.koin];
    const ikonAset = item.tipe === "emas" ? "coins" : "bitcoin-sign";
    const satuanTeks = item.tipe === "emas" ? "gram" : "koin";

    if (nilai !== null) totalAset += nilai;

    let untungRugi = "";
    if (item.modal > 0 && nilai !== null) {
      const selisih = nilai - item.modal;
      const persen = (selisih / item.modal) * 100;

      untungRugi = `
        <small class="${selisih >= 0 ? "masuk" : "keluar"}">
          ${selisih >= 0 ? "Untung" : "Rugi"} ${rupiah(Math.abs(selisih))}
          (${persen >= 0 ? "+" : "−"}${Math.abs(persen).toFixed(1)}%)
        </small>
      `;
    }

    return `
      <div class="baris">
        <div class="chip-ikon"><i class="fa-solid fa-${ikonAset}"></i></div>
        <div class="baris-isi">
          <div class="baris-judul">${nama}</div>
          <div class="baris-sub">${formatJumlah(item.jumlah)} ${satuanTeks}${
            item.modal > 0 ? ", modal " + rupiah(item.modal) : ""
          }</div>
        </div>
        <div class="baris-kanan">
          <div class="angka">${nilai === null ? "Harga belum ada" : rupiah(nilai)}</div>
          ${untungRugi}
        </div>
        <button class="ikon-tombol" aria-label="Hapus aset ${nama}"
          onclick="hapusAset(${item.id})">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    `;
  });

  daftar.innerHTML = baris.length
    ? baris.join("")
    : `<p class="kosong">Belum ada aset. Ketuk Tambah aset untuk mencatat emas atau crypto.</p>`;

  /* ringkasan (panel tinta) */
  const saldoKas = hitungSaldo();
  const total = saldoKas + totalAset;

  ringkasan.innerHTML = `
    <p class="hero-label">Total kekayaan</p>
    <div class="hero-angka ${total < 0 ? "minus" : ""}">${total < 0 ? "−" : ""}${rupiah(Math.abs(total))}</div>
    <div class="hero-split">
      <div><span>Saldo kas</span><b>${bertanda(saldoKas).replace("+", "")}</b></div>
      <div><span>Nilai aset</span><b>${rupiah(totalAset)}</b></div>
    </div>
  `;
}

/* ---------- form & aksi ---------- */

function setTipeAset(tipe) {
  document.getElementById("tipeAset").value = tipe;
  document.getElementById("segEmas").classList.toggle("aktif", tipe === "emas");
  document.getElementById("segCrypto").classList.toggle("aktif", tipe === "crypto");

  document.getElementById("barisKoin").style.display =
    tipe === "crypto" ? "block" : "none";

  document.getElementById("labelJumlahAset").textContent =
    tipe === "emas" ? "Jumlah (gram)" : "Jumlah koin";
}

function tambahAset() {
  const tipe = document.getElementById("tipeAset").value;
  const koin = document.getElementById("koinAset").value;
  const jumlah = Number(document.getElementById("jumlahAset").value);
  const modal = Number(document.getElementById("modalAset").value);

  if (!(jumlah > 0)) {
    toast("Isi jumlah lebih dari 0");
    return;
  }

  if (tipe === "crypto" && !KOIN[koin]) {
    toast("Pilih koin terlebih dahulu");
    return;
  }

  aset.push({
    id: Date.now(),
    tipe,
    koin: tipe === "crypto" ? koin : null,
    jumlah,
    modal: modal > 0 ? modal : 0
  });

  simpanAset();

  document.getElementById("jumlahAset").value = "";
  document.getElementById("modalAset").value = "";
  document.getElementById("formAset").open = false;

  renderAset();
  perbaruiHarga(false);
  toast("Aset tersimpan");
}

function hapusAset(id) {
  if (!confirm("Hapus aset ini dari daftar?")) return;

  aset = aset.filter(item => item.id !== id);
  simpanAset();
  renderAset();
  toast("Aset dihapus");
}

/* ---------- init ---------- */

(function initAset() {
  const pilih = document.getElementById("koinAset");

  if (pilih) {
    pilih.innerHTML = Object.keys(KOIN)
      .map(id => `<option value="${id}">${KOIN[id]}</option>`)
      .join("");
  }

  setTipeAset("emas");
  renderAset();
})();
