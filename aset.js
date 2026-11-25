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

/* riwayat total kekayaan: satu catatan per hari, terisi otomatis */
const SNAP_KEY = "snapshot";
const TGL_VALID = /^\d{4}-\d{2}-\d{2}$/;

function bersihkanSnapshot(daftar) {
  const peta = {};

  (Array.isArray(daftar) ? daftar : []).forEach(item => {
    if (!item || typeof item !== "object") return;
    if (!TGL_VALID.test(item.t)) return;

    const total = Number(item.total);
    if (!Number.isFinite(total)) return;

    peta[item.t] = {
      t: item.t,
      total: Math.round(total),
      kas: Math.round(Number(item.kas) || 0),
      aset: Math.round(Number(item.aset) || 0)
    };
  });

  return Object.keys(peta).sort().map(k => peta[k]).slice(-800);
}

function muatSnapshot() {
  try {
    return bersihkanSnapshot(JSON.parse(localStorage.getItem(SNAP_KEY)));
  } catch (e) {
    return [];
  }
}

let snapshot = muatSnapshot();
let periode = 30;   // hari; 0 = semua

function simpanSnapshot() {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snapshot));
  } catch (e) { /* riwayat grafik bukan data utama */ }
}

function pulihkanSnapshot(daftar) {
  snapshot = bersihkanSnapshot(daftar);
  simpanSnapshot();
  renderGrafik();
}

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
          <div class="baris-sub lipat-baris">${formatJumlah(item.jumlah)} ${satuanTeks}${
            item.modal > 0 ? ", modal " + rupiah(item.modal) : ""
          }</div>
          ${untungRugi}
        </div>
        <div class="baris-kanan">
          <div class="angka">${nilai === null ? "Harga belum ada" : rupiah(nilai)}</div>
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

  catatSnapshot();
  renderGrafik();
}

/* ===========================
   GRAFIK
   Warna kategori mengikuti entitas (Kas selalu biru, Emas selalu oranye, dst.)
   dan sudah divalidasi untuk buta warna + kontras.
=========================== */

const URUTAN = ["kas", "emas", "bitcoin", "ethereum", "solana", "binancecoin", "dogecoin", "tether"];

const WARNA = {
  kas: "--seri-1",
  emas: "--seri-2",
  bitcoin: "--seri-3",
  ethereum: "--seri-4",
  solana: "--seri-5",
  binancecoin: "--seri-6",
  dogecoin: "--seri-7",
  tether: "--seri-abu"
};

function namaBagian(kunci) {
  if (kunci === "kas") return "Kas";
  if (kunci === "emas") return "Emas";
  return KOIN[kunci] || kunci;
}

function rincianKekayaan() {
  const kas = hitungSaldo();
  const peta = {};
  let lengkap = true;
  let totalAset = 0;

  aset.forEach(item => {
    const satuan = hargaSatuan(item);

    if (satuan === null) {
      lengkap = false;
      return;
    }

    const kunci = item.tipe === "emas" ? "emas" : item.koin;
    const nilai = satuan * item.jumlah;

    peta[kunci] = (peta[kunci] || 0) + nilai;
    totalAset += nilai;
  });

  const bagian = [{ kunci: "kas", nama: "Kas", nilai: kas }];

  URUTAN.slice(1).forEach(kunci => {
    if (peta[kunci] > 0) {
      bagian.push({ kunci, nama: namaBagian(kunci), nilai: peta[kunci] });
    }
  });

  return { kas, bagian, totalAset, lengkap };
}

function catatSnapshot() {
  const r = rincianKekayaan();
  if (!r.lengkap) return;

  // hanya catat kalau harga yang dipakai masih segar (kurang dari 36 jam)
  const batas = Date.now() - 36 * 3600 * 1000;
  const butuhEmas = aset.some(a => a.tipe === "emas");
  const butuhCrypto = aset.some(a => a.tipe === "crypto");

  if (butuhEmas && !(harga.emas && harga.emas.waktu > batas)) return;
  if (butuhCrypto && !(harga.crypto && harga.crypto.waktu > batas)) return;

  const t = formatTanggalIso(new Date());
  const entri = {
    t,
    total: Math.round(r.kas + r.totalAset),
    kas: Math.round(r.kas),
    aset: Math.round(r.totalAset)
  };

  const idx = snapshot.findIndex(s => s.t === t);

  if (idx >= 0) {
    const lama = snapshot[idx];
    if (lama.total === entri.total && lama.kas === entri.kas && lama.aset === entri.aset) return;
    snapshot[idx] = entri;
  } else {
    snapshot.push(entri);
    snapshot.sort((a, b) => a.t.localeCompare(b.t));
    if (snapshot.length > 800) snapshot = snapshot.slice(-800);
  }

  simpanSnapshot();
}

function ringkas(n) {
  const a = Math.abs(n);
  const tanda = n < 0 ? "−" : "";
  const f = (v, u) =>
    tanda + (Math.round(v * 10) / 10).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " " + u;

  if (a >= 1e9) return f(a / 1e9, "M");
  if (a >= 1e6) return f(a / 1e6, "jt");
  if (a >= 1e3) return f(a / 1e3, "rb");
  return tanda + Math.round(a);
}

function persenTeks(p) {
  if (p > 0 && p < 1) return "<1%";
  return Math.round(p) + "%";
}

/* ---------- tooltip ---------- */

let timerTip;

function tampilTip(html, x, y) {
  const el = document.getElementById("tip");
  if (!el) return;

  el.innerHTML = html;
  el.classList.add("tampil");

  const r = el.getBoundingClientRect();
  const kiri = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
  let atas = y - r.height - 14;
  if (atas < 8) atas = y + 22;

  el.style.left = kiri + "px";
  el.style.top = atas + "px";

  clearTimeout(timerTip);
  timerTip = setTimeout(sembunyiTip, 3500);
}

function sembunyiTip() {
  const el = document.getElementById("tip");
  if (el) el.classList.remove("tampil");
}

function pasangTipUmum() {
  document.addEventListener("click", e => {
    if (e.target.closest && e.target.closest("#svgGaris")) return;
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { sembunyiTip(); return; }
    const r = el.getBoundingClientRect();
    tampilTip(el.dataset.tip, e.clientX || r.left + r.width / 2, r.top);
  });

  document.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    if (e.target.closest && e.target.closest("#svgGaris")) return;
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) tampilTip(el.dataset.tip, e.clientX, e.clientY);
    else sembunyiTip();
  });

  document.addEventListener("focusin", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    tampilTip(el.dataset.tip, r.left + r.width / 2, r.top);
  });

  window.addEventListener("scroll", sembunyiTip, { passive: true });
}

/* ---------- 1. komposisi ---------- */

function renderKomposisi() {
  const el = document.getElementById("grafikKomposisi");
  if (!el) return;

  const r = rincianKekayaan();
  const bagian = r.bagian.filter(b => b.nilai > 0);
  const total = bagian.reduce((t, b) => t + b.nilai, 0);

  if (!bagian.length || total <= 0) {
    el.innerHTML = `<p class="kosong">Belum ada saldo atau aset untuk ditampilkan. Catat pemasukan atau tambah aset dulu.</p>`;
    return;
  }

  const tip = b => escapeHtml(
    `<b>${b.nama}</b>${rupiah(b.nilai)} (${persenTeks(b.nilai / total * 100)})`
  );

  const ringkasanTeks = bagian
    .map(b => `${b.nama} ${persenTeks(b.nilai / total * 100)}`)
    .join(", ");

  const bar = bagian.map(b => `
    <div
      style="flex:${b.nilai};background:var(${WARNA[b.kunci]})"
      tabindex="0"
      data-tip="${tip(b)}"
      aria-label="${b.nama}: ${rupiah(b.nilai)}, ${persenTeks(b.nilai / total * 100)}"></div>
  `).join("");

  const baris = bagian.map(b => `
    <div class="harga-baris">
      <span><i class="swatch" style="background:var(${WARNA[b.kunci]})"></i>${b.nama}</span>
      <b>${rupiah(b.nilai)} <small style="font-weight:600;color:var(--redup)">${persenTeks(b.nilai / total * 100)}</small></b>
    </div>
  `).join("");

  el.innerHTML = `
    <div class="seg-bar" role="img" aria-label="Komposisi kekayaan: ${ringkasanTeks}">${bar}</div>
    ${baris}
    ${r.kas < 0 ? `<p class="catatan-kecil" style="margin-top:8px">Saldo kas negatif, jadi tidak ikut digambar.</p>` : ""}
    ${r.lengkap ? "" : `<p class="catatan-kecil" style="margin-top:8px">Sebagian harga belum tersedia, jadi nilainya belum dihitung.</p>`}
  `;
}

/* ---------- 2. perkembangan kekayaan (garis) ---------- */

function setPeriode(hari) {
  periode = hari;

  [["p7", 7], ["p30", 30], ["p0", 0]].forEach(([id, nilai]) => {
    const tombol = document.getElementById(id);
    if (tombol) tombol.classList.toggle("aktif", nilai === hari);
  });

  renderGaris();
}

function tickBagus(min, max, jumlah) {
  if (max - min < 1) { max = min + 1; }

  const mentah = (max - min) / jumlah;
  const p = Math.pow(10, Math.floor(Math.log10(mentah)));
  const m = mentah / p;
  const langkah = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;

  const bawah = Math.floor(min / langkah) * langkah;
  const atas = Math.ceil(max / langkah) * langkah;
  const tick = [];

  for (let v = bawah; v <= atas + langkah / 2; v += langkah) tick.push(v);

  return { tick, bawah, atas };
}

function labelTgl(iso) {
  return dariIso(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function renderGaris() {
  const el = document.getElementById("grafikGaris");
  if (!el) return;

  let titik = snapshot;

  if (periode > 0) {
    const batas = new Date();
    batas.setDate(batas.getDate() - periode);
    const batasIso = formatTanggalIso(batas);
    titik = snapshot.filter(s => s.t >= batasIso);
  }

  if (titik.length < 2) {
    el.innerHTML = `<p class="kosong">${
      snapshot.length < 2
        ? "Grafik terisi otomatis setiap hari kamu membuka tab Aset dengan harga terbaru. Buka lagi besok untuk melihat perubahannya."
        : "Belum cukup data pada periode ini. Coba pilih periode yang lebih panjang."
    }</p>`;
    return;
  }

  const W = 360, H = 210, kiri = 46, kanan = 18, atas = 26, bawah = 28;
  const lebar = W - kiri - kanan;
  const tinggi = H - atas - bawah;

  const nilai = titik.map(p => p.total);
  let min = Math.min(...nilai);
  let max = Math.max(...nilai);

  if (min === max) {
    const sela = Math.max(Math.abs(min) * 0.05, 1);
    min -= sela;
    max += sela;
  }

  const skala = tickBagus(min, max, 4);
  const t0 = dariIso(titik[0].t).getTime();
  const t1 = dariIso(titik[titik.length - 1].t).getTime();

  const px = p => t1 === t0
    ? kiri + lebar / 2
    : kiri + ((dariIso(p.t).getTime() - t0) / (t1 - t0)) * lebar;

  const py = v => atas + tinggi - ((v - skala.bawah) / (skala.atas - skala.bawah)) * tinggi;

  const garisPath = titik
    .map((p, i) => (i ? "L" : "M") + px(p).toFixed(1) + " " + py(p.total).toFixed(1))
    .join(" ");

  const dasar = (atas + tinggi).toFixed(1);
  const areaPath =
    garisPath +
    ` L${px(titik[titik.length - 1]).toFixed(1)} ${dasar} L${px(titik[0]).toFixed(1)} ${dasar} Z`;

  const grid = skala.tick.map(v => `
    <line x1="${kiri}" x2="${W - kanan}" y1="${py(v).toFixed(1)}" y2="${py(v).toFixed(1)}"
      style="stroke:var(--grid)" stroke-width="1"/>
    <text x="${kiri - 8}" y="${(py(v) + 4).toFixed(1)}" text-anchor="end"
      font-size="11" style="fill:var(--redup)">${ringkas(v)}</text>
  `).join("");

  const awalP = titik[0];
  const akhirP = titik[titik.length - 1];
  const tengahP = titik[Math.floor(titik.length / 2)];
  const jarakHari = (t1 - t0) / 86400000;

  const labelX = [
    `<text x="${kiri}" y="${H - 8}" text-anchor="start" font-size="11" style="fill:var(--redup)">${labelTgl(awalP.t)}</text>`,
    jarakHari >= 4
      ? `<text x="${px(tengahP).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" style="fill:var(--redup)">${labelTgl(tengahP.t)}</text>`
      : "",
    `<text x="${W - kanan}" y="${H - 8}" text-anchor="end" font-size="11" style="fill:var(--redup)">${labelTgl(akhirP.t)}</text>`
  ].join("");

  const ex = px(akhirP).toFixed(1);
  const ey = py(akhirP.total).toFixed(1);

  const naik = akhirP.total - awalP.total;
  const ringkasanTeks =
    `Total kekayaan dari ${rupiah(awalP.total)} pada ${labelTgl(awalP.t)} ` +
    `menjadi ${rupiah(akhirP.total)} pada ${labelTgl(akhirP.t)}, ` +
    (naik >= 0 ? "naik " : "turun ") + rupiah(Math.abs(naik));

  const tabel = [...titik].reverse().slice(0, 90).map(p => `
    <tr><td>${labelTgl(p.t)}</td><td>${rupiah(p.total)}</td></tr>
  `).join("");

  el.innerHTML = `
    <svg id="svgGaris" class="grafik-garis" viewBox="0 0 ${W} ${H}"
      role="img" aria-label="${escapeHtml(ringkasanTeks)}">
      ${grid}
      <path d="${areaPath}" style="fill:var(--seri-1)" opacity="0.1"/>
      <path d="${garisPath}" fill="none" style="stroke:var(--seri-1)"
        stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${labelX}
      <line id="garisSilang" x1="0" x2="0" y1="${atas}" y2="${atas + tinggi}"
        style="stroke:var(--redup)" stroke-width="1" opacity="0"/>
      <circle id="titikSilang" r="5" cx="0" cy="0" style="fill:var(--seri-1);stroke:var(--kertas)"
        stroke-width="2" opacity="0"/>
      <circle cx="${ex}" cy="${ey}" r="5" style="fill:var(--seri-1);stroke:var(--kertas)" stroke-width="2"/>
      <text x="${Math.min(Number(ex), W - kanan)}" y="${(Number(ey) - 12).toFixed(1)}"
        text-anchor="end" font-size="12" font-weight="700" style="fill:var(--teks)">${rupiah(akhirP.total)}</text>
      <rect id="lapisSentuh" x="${kiri}" y="${atas}" width="${lebar}" height="${tinggi}" fill="transparent"/>
    </svg>
    <p class="catatan-kecil" style="margin-top:6px">Total kas ditambah nilai aset, dalam rupiah. Sentuh grafik untuk melihat nilai tiap hari.</p>
    <details class="tabel-data">
      <summary>Lihat sebagai tabel</summary>
      <table><tbody>${tabel}</tbody></table>
    </details>
  `;

  const svg = document.getElementById("svgGaris");
  const lapis = document.getElementById("lapisSentuh");
  const garis = document.getElementById("garisSilang");
  const dot = document.getElementById("titikSilang");

  const sorot = e => {
    const kotak = svg.getBoundingClientRect();
    const xSvg = ((e.clientX - kotak.left) / kotak.width) * W;

    let terdekat = titik[0];
    let jarak = Infinity;

    titik.forEach(p => {
      const d = Math.abs(px(p) - xSvg);
      if (d < jarak) { jarak = d; terdekat = p; }
    });

    const x = px(terdekat);
    const y = py(terdekat.total);

    garis.setAttribute("x1", x);
    garis.setAttribute("x2", x);
    garis.setAttribute("opacity", "0.5");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("opacity", "1");

    tampilTip(
      `<b>${dariIso(terdekat.t).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>` +
      `Total ${rupiah(terdekat.total)}<br>Kas ${rupiah(terdekat.kas)}, aset ${rupiah(terdekat.aset)}`,
      kotak.left + (x / W) * kotak.width,
      kotak.top + (y / H) * kotak.height
    );
  };

  const lepas = () => {
    garis.setAttribute("opacity", "0");
    dot.setAttribute("opacity", "0");
    sembunyiTip();
  };

  lapis.addEventListener("pointermove", sorot);
  lapis.addEventListener("pointerdown", sorot);
  // di layar sentuh, pointerleave datang tepat setelah jari diangkat;
  // tooltip dibiarkan tampil sebentar dan hilang sendiri.
  lapis.addEventListener("pointerleave", e => {
    if (e.pointerType === "mouse") lepas();
  });
}

/* ---------- 3. modal vs nilai sekarang (batang) ---------- */

function renderModal() {
  const blok = document.getElementById("blokModal");
  const el = document.getElementById("grafikModal");
  if (!blok || !el) return;

  const baris = aset
    .map(a => {
      const satuan = hargaSatuan(a);
      return { a, nilai: satuan === null ? null : satuan * a.jumlah };
    })
    .filter(x => x.a.modal > 0 && x.nilai !== null);

  if (!baris.length) {
    blok.style.display = "none";
    return;
  }

  blok.style.display = "";

  const maks = Math.max(...baris.flatMap(x => [x.a.modal, x.nilai]));

  const lebar = v => Math.max((v / maks) * 56, 1);

  const isi = baris.map(({ a, nilai }) => {
    const nama = a.tipe === "emas"
      ? `Emas ${formatJumlah(a.jumlah)} gram`
      : `${KOIN[a.koin]}, ${formatJumlah(a.jumlah)} koin`;

    const selisih = nilai - a.modal;
    const persen = (selisih / a.modal) * 100;

    const tipModal = escapeHtml(`<b>Modal beli</b>${rupiah(a.modal)}`);
    const tipNilai = escapeHtml(`<b>Nilai sekarang</b>${rupiah(nilai)}`);

    return `
      <div class="baris-bar">
        <div class="baris-bar-nama">${escapeHtml(nama)}</div>
        <div class="batang">
          <i style="width:${lebar(a.modal)}%;background:var(--seri-abu)" data-tip="${tipModal}"></i>
          <span>${rupiah(a.modal)}</span>
        </div>
        <div class="batang">
          <i style="width:${lebar(nilai)}%;background:var(--seri-1)" data-tip="${tipNilai}"></i>
          <span>${rupiah(nilai)}</span>
        </div>
        <small class="${selisih >= 0 ? "masuk" : "keluar"}" style="font-weight:700">
          ${selisih >= 0 ? "Untung" : "Rugi"} ${rupiah(Math.abs(selisih))}
          (${persen >= 0 ? "+" : "−"}${Math.abs(persen).toFixed(1)}%)
        </small>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="legenda">
      <span><i class="swatch" style="background:var(--seri-abu)"></i>Modal beli</span>
      <span><i class="swatch" style="background:var(--seri-1)"></i>Nilai sekarang</span>
    </div>
    ${isi}
  `;
}

function renderGrafik() {
  renderKomposisi();
  renderGaris();
  renderModal();
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
  pasangTipUmum();
  renderAset();
})();
