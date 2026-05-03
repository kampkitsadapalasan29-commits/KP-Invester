// ============================================
// STORAGE
// ============================================
const Storage = {
  get(key) { try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} },
  getArray(key) { return this.get(key) || []; }
};

// ============================================
// EXCHANGE RATE
// ============================================
let EXCHANGE_RATE = 33.5;

async function updateExchangeRate() {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    EXCHANGE_RATE = data.rates.THB;
    document.getElementById("exchangeRate").textContent = `1 USD = ${EXCHANGE_RATE.toFixed(2)} ฿`;
    document.getElementById("exchangeTime").textContent = `อัปเดต ${new Date().toLocaleTimeString("th-TH")}`;
  } catch {
    document.getElementById("exchangeRate").textContent = `1 USD = ${EXCHANGE_RATE.toFixed(2)} ฿`;
    document.getElementById("exchangeTime").textContent = "ใช้ค่าเก่า";
  }
}

// ============================================
// NAVIGATION
// ============================================
window.showSection = function(sectionId, el) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(sectionId).classList.add("active");
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".bnav-btn").forEach(t => t.classList.remove("active"));
  if (el) {
    el.classList.add("active");
    // sync both navs
    const sec = el.dataset ? el.dataset.sec : sectionId;
    document.querySelectorAll(`.bnav-btn[data-sec="${sectionId}"]`).forEach(b => b.classList.add("active"));
  }
  if (sectionId === "dashboard") updateDashboard();
  if (sectionId === "finance") loadTransactions();
  if (sectionId === "portfolio") loadHoldings();
  if (sectionId === "watchlist") renderWatchlist();
};

// ============================================
// WATCHLIST & FAVORITES
// ============================================
const AV_KEY = "EF98OLFV7JF7WTQD";
const FH_KEY = "d7qu6ohr01qudminhhpgd7qu6ohr01qudminhhq0";
let watchCache = {};

function getFavorites() { return Storage.getArray("favorites"); }
function saveFavorites(arr) { Storage.set("favorites", arr); }

window.addToWatchlist = async function() {
  const sym = document.getElementById("watchInput").value.trim().toUpperCase();
  if (!sym) return;
  const favs = getFavorites();
  if (favs.includes(sym)) { alert(`${sym} อยู่ในรายการแล้ว`); return; }
  favs.push(sym);
  saveFavorites(favs);
  document.getElementById("watchInput").value = "";
  await renderWatchlist();
};

// ใช้ Finnhub สำหรับ real-time price (ไม่จำกัด quota รายวัน)
async function fetchStockPrice(symbol) {
  if (watchCache[symbol] && watchCache[symbol]._ts && Date.now() - watchCache[symbol]._ts < 60000) {
    return watchCache[symbol];
  }
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FH_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.c || data.c === 0) return null;
    const result = {
      price: data.c,
      change: data.d,
      changePct: data.dp,
      volume: 0,
      _ts: Date.now()
    };
    watchCache[symbol] = result;
    return result;
  } catch { return null; }
}

async function renderWatchlist() {
  const favs = getFavorites();
  const content = document.getElementById("watchlistContent");
  const tickerWrap = document.getElementById("watchTickerWrap");
  const ticker = document.getElementById("watchTicker");

  if (!favs.length) {
    content.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:2rem;font-size:0.85rem;">⭐ ยังไม่มีหุ้นในรายการ<br>เพิ่มหุ้นด้านบนเพื่อติดตามราคา</div>`;
    tickerWrap.style.display = "none";
    return;
  }

  tickerWrap.style.display = "block";

  const results = await Promise.all(favs.map(async sym => {
    try { return { sym, data: await fetchStockPrice(sym) }; }
    catch { return { sym, data: null }; }
  }));

  ticker.innerHTML = results.map(r => {
    if (!r.data) return `<div class="ticker-item"><div class="ticker-sym">${r.sym}</div><div class="ticker-price" style="color:var(--text-dim)">—</div></div>`;
    const up = r.data.change >= 0;
    return `<div class="ticker-item" onclick="quickSearch('${r.sym}')">
      <div class="ticker-sym">${r.sym}</div>
      <div class="ticker-price">$${r.data.price.toFixed(2)}</div>
      <div class="ticker-chg ${up?'up':'dn'}">${up?'+':''}${r.data.change.toFixed(2)} (${r.data.changePct.toFixed(2)}%)</div>
    </div>`;
  }).join("");

  const rows = results.map(r => {
    if (!r.data) return `<tr>
      <td><strong style="color:var(--accent)">${r.sym}</strong></td>
      <td colspan="4" style="color:var(--text-dim);font-size:0.78rem;">⚠️ ดึงข้อมูลไม่ได้ (API limit หรือไม่พบหุ้น)</td>
      <td><button class="btn btn-outline btn-sm" onclick="quickSearch('${r.sym}')">📈</button></td>
      <td><button class="btn btn-danger btn-sm" onclick="removeFromWatchlist('${r.sym}')">ลบ</button></td>
    </tr>`;
    const up = r.data.change >= 0;
    return `<tr>
      <td><strong style="color:var(--accent)">${r.sym}</strong></td>
      <td style="font-weight:700;">$${r.data.price.toFixed(2)}</td>
      <td style="color:${up?'var(--bull)':'var(--bear)'};">${up?'+':''}${r.data.change.toFixed(2)}</td>
      <td style="color:${up?'var(--bull)':'var(--bear)'};">${up?'+':''}${r.data.changePct.toFixed(2)}%</td>
      <td>฿${(r.data.price * EXCHANGE_RATE).toFixed(0)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="quickSearch('${r.sym}')">📈 วิเคราะห์</button></td>
      <td><button class="btn btn-danger btn-sm" onclick="removeFromWatchlist('${r.sym}')">ลบ</button></td>
    </tr>`;
  }).join("");

  content.innerHTML = `<div class="table-container"><table>
    <thead><tr><th>หุ้น</th><th>ราคา</th><th>เปลี่ยน</th><th>%</th><th>฿ THB</th><th>วิเคราะห์</th><th>ลบ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div style="font-size:0.7rem;color:var(--text-dim);margin-top:8px;text-align:right;">⏱ cache 60 วิ · Alpha Vantage จำกัด 25 req/วัน</div>`;
}

window.removeFromWatchlist = async function(sym) {
  const favs = getFavorites().filter(f => f !== sym);
  saveFavorites(favs);
  await renderWatchlist();
};

window.quickSearch = function(sym) {
  document.getElementById("stockSymbol").value = sym;
  // switch to stocks tab
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById("stocks").classList.add("active");
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".bnav-btn").forEach(t => t.classList.remove("active"));
  document.querySelectorAll('[data-sec="stocks"]').forEach(b => b.classList.add("active"));
  searchStock();
};

// Fav button in stock detail
let currentSymbol = "";
window.toggleFav = function() {
  if (!currentSymbol) return;
  const favs = getFavorites();
  const idx = favs.indexOf(currentSymbol);
  if (idx >= 0) { favs.splice(idx, 1); } else { favs.push(currentSymbol); }
  saveFavorites(favs);
  updateFavBtn(currentSymbol);
};

function updateFavBtn(sym) {
  const btn = document.getElementById("favBtn");
  if (!btn) return;
  const starred = getFavorites().includes(sym);
  btn.textContent = starred ? "★" : "☆";
  btn.className = `fav-btn ${starred ? "starred" : ""}`;
  btn.title = starred ? "ถอดออกจาก Watchlist" : "เพิ่มใน Watchlist";
}

// ============================================
// STOCKS — Alpha Vantage + RSI + EMA + S/R
// ============================================
let stockChart, rsiChart;
let lastCloses = [], lastLabels = [];

const DEFAULT_EMA = [{ period: 20, color: "#f59e0b" }, { period: 50, color: "#a78bfa" }];
let emaLines = Storage.get("emaLines") || DEFAULT_EMA;

function saveEmaLines() { Storage.set("emaLines", emaLines); }

function renderEmaControls() {
  const list = document.getElementById("emaList");
  if (!list) return;
  list.innerHTML = emaLines.length ? emaLines.map((e, i) => `
    <div class="ema-row">
      <label>คาบ/Period:</label>
      <input type="number" min="2" max="200" value="${e.period}" onchange="emaLines[${i}].period=parseInt(this.value);saveEmaLines();">
      <label>สี/Color:</label>
      <input type="color" value="${e.color}" onchange="emaLines[${i}].color=this.value;saveEmaLines();">
      <button class="btn-remove" onclick="removeEmaLine(${i})">✕ ลบ</button>
    </div>
  `).join("") : '<div style="color:var(--text-dim);font-size:0.8rem;padding:4px;">ไม่มีเส้น EMA — กด "+ เพิ่มเส้น EMA"</div>';
}

window.addEmaLine = function() { emaLines.push({ period: 100, color: "#22c55e" }); saveEmaLines(); renderEmaControls(); };
window.removeEmaLine = function(i) { emaLines.splice(i, 1); saveEmaLines(); renderEmaControls(); if (lastCloses.length) loadStockChart(currentSymbol, lastLabels, lastCloses); };
window.applyEmaChanges = function() { saveEmaLines(); if (lastCloses.length) loadStockChart(currentSymbol, lastLabels, lastCloses); };

function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) ema.push(prices[i] * k + ema[i-1] * (1 - k));
  return ema;
}

function calcRSI(prices, period = 14) {
  const rsi = Array(period).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i-1];
    ag = (ag * (period-1) + Math.max(d, 0)) / period;
    al = (al * (period-1) + Math.max(-d, 0)) / period;
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return rsi;
}

function calcSupportResistance(prices, w = 5) {
  const supports = [], resistances = [];
  for (let i = w; i < prices.length - w; i++) {
    const slice = prices.slice(i - w, i + w + 1);
    if (prices[i] === Math.min(...slice)) supports.push(prices[i]);
    if (prices[i] === Math.max(...slice)) resistances.push(prices[i]);
  }
  return {
    supports: [...new Set(supports)].sort((a,b) => b-a).slice(0,3),
    resistances: [...new Set(resistances)].sort((a,b) => a-b).slice(0,3)
  };
}

function getRsiInfo(rsi) {
  if (rsi >= 70) return { text: "Overbought — ซื้อมากเกินไป ⚠️", cls: "rsi-ob" };
  if (rsi <= 30) return { text: "Oversold — ขายมากเกินไป 🟢", cls: "rsi-os" };
  return { text: "Neutral — ปกติ", cls: "rsi-neutral" };
}

window.searchStock = async function() {
  const symbol = document.getElementById("stockSymbol").value.trim().toUpperCase();
  if (!symbol) return alert("กรุณาใส่ชื่อหุ้น");
  currentSymbol = symbol;
  document.getElementById("stockInfo").style.display = "none";

  try {
    // ดึงราคาปัจจุบันจาก Finnhub ก่อน (real-time ไม่จำกัด quota)
    let currentPrice = null, currentChange = null, currentChangePct = null, currentVolume = null;
    try {
      const fhRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FH_KEY}`);
      const fhData = await fhRes.json();
      if (fhData && fhData.c && fhData.c !== 0) {
        currentPrice = fhData.c;
        currentChange = fhData.d;
        currentChangePct = fhData.dp;
        currentVolume = null;
      }
    } catch {}

    // ดึงข้อมูลย้อนหลังจาก Alpha Vantage สำหรับกราฟ
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data["Note"] || data["Information"]) {
      // API limit — ถ้ามีราคา Finnhub ให้แสดงราคาได้ แต่ไม่มีกราฟ
      if (currentPrice) {
        alert(`⚠️ Alpha Vantage ครบ 25 req/วัน — แสดงราคาปัจจุบันจาก Finnhub ได้ แต่ไม่มีกราฟวันนี้`);
      } else {
        alert("⚠️ API ครบโควต้า 25 req/วัน — ลองใหม่พรุ่งนี้ครับ");
        return;
      }
    }
    const ts = data["Time Series (Daily)"];
    if (!ts && !currentPrice) { alert("ไม่พบหุ้น ลองใช้: AAPL, MSFT, TSLA, GOOGL, META"); return; }

    let closes = [], volumes = [], labels = [];
    if (ts) {
      const dates = Object.keys(ts).sort().slice(-100);
      closes = dates.map(d => parseFloat(ts[d]["4. close"]));
      volumes = dates.map(d => parseInt(ts[d]["5. volume"]));
      labels = dates.map(d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
    lastCloses = closes; lastLabels = labels;

    const latest = currentPrice || (closes.length ? closes[closes.length - 1] : 0);
    const prev = closes.length >= 2 ? closes[closes.length - 2] : latest;
    const change = currentChange !== null ? currentChange : (latest - prev);
    const changePct = currentChangePct !== null ? currentChangePct : ((change / (prev||1)) * 100);
    const rsiVals = closes.length > 15 ? calcRSI(closes) : [];
    const latestRsi = rsiVals.length ? rsiVals[rsiVals.length - 1] : null;
    const { supports, resistances } = closes.length ? calcSupportResistance(closes) : { supports: [], resistances: [] };
    const rsiInfo = latestRsi !== null ? getRsiInfo(latestRsi) : { text: "ต้องการข้อมูลกราฟ", cls: "rsi-neutral" };

    document.getElementById("stockName").innerHTML = `<span style="color:var(--accent)">${symbol}</span> — ข้อมูลหุ้น`;
    document.getElementById("stockPrice").textContent = `$${latest.toFixed(2)}`;
    const chgEl = document.getElementById("stockChange");
    chgEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`;
    chgEl.style.color = change >= 0 ? "var(--bull)" : "var(--bear)";
    document.getElementById("stockVolume").textContent = volumes.length ? volumes[volumes.length-1].toLocaleString() : "—";
    document.getElementById("stockRsi").textContent = latestRsi !== null ? latestRsi.toFixed(1) : "—";
    document.getElementById("stockRsi").style.color = latestRsi >= 70 ? "var(--danger)" : latestRsi <= 30 ? "var(--success)" : "var(--text)";
    document.getElementById("rsiZone").innerHTML = `<span class="rsi-zone ${rsiInfo.cls}">${rsiInfo.text}</span>`;

    const emaVals = closes.length ? emaLines.map(e => ({ period: e.period, val: calcEMA(closes, e.period).slice(-1)[0] })) : [];
    const srBadges = [
      ...resistances.map(r => `<span class="sr-badge sr-resistance">แนวต้าน $${r.toFixed(2)}</span>`),
      ...supports.map(s => `<span class="sr-badge sr-support">แนวรับ $${s.toFixed(2)}</span>`)
    ].join("");
    document.getElementById("srBadges").innerHTML = srBadges || '<span style="color:var(--text-dim);font-size:0.78rem;">ไม่มีข้อมูลกราฟวันนี้ (API limit)</span>';

    // Analysis
    let signal = "";
    if (latestRsi !== null) {
      if (latestRsi <= 30 && supports.length && latest <= supports[0] * 1.02) signal = "🟢 <b>สัญญาณซื้อ:</b> RSI Oversold + ใกล้แนวรับ";
      else if (latestRsi >= 70 && resistances.length && latest >= resistances[0] * 0.98) signal = "🔴 <b>สัญญาณขาย:</b> RSI Overbought + ใกล้แนวต้าน";
      else signal = "⚪ <b>สัญญาณ:</b> รอดูท่าที (Neutral)";
    } else { signal = "⚪ ไม่มีข้อมูลกราฟเพียงพอสำหรับวิเคราะห์ (Alpha Vantage limit)"; }
    const emaAnalysis = emaVals.map(e => `📉 EMA${e.period}: $${e.val.toFixed(2)} — ราคา${latest > e.val ? "เหนือ (Bullish 📈)" : "ต่ำกว่า (Bearish 📉)"}`).join("<br>");
    document.getElementById("analysisBox").innerHTML = `📊 <b>RSI:</b> ${latestRsi.toFixed(1)} — ${rsiInfo.text}<br>${emaAnalysis}<br>${signal}`;
    document.getElementById("analysisBox").style.display = "block";

    updateFavBtn(symbol);
    document.getElementById("stockInfo").style.display = "block";
    renderEmaControls();
    loadStockChart(symbol, labels, closes);
    loadRsiChart(labels, rsiVals);
  } catch (err) {
    console.error(err);
    alert("ดึงข้อมูลไม่ได้ กรุณาลองใหม่");
  }
};

function loadStockChart(symbol, labels, closes) {
  const { supports, resistances } = calcSupportResistance(closes);
  const datasets = [{
    label: symbol,
    data: closes,
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56,189,248,0.06)",
    tension: 0.3, fill: true, borderWidth: 2, pointRadius: 0
  }];
  emaLines.forEach(e => datasets.push({
    label: `EMA${e.period}`,
    data: calcEMA(closes, e.period),
    borderColor: e.color, borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0
  }));
  resistances.forEach(r => datasets.push({ label: `แนวต้าน $${r.toFixed(0)}`, data: Array(closes.length).fill(r), borderColor: "#ef5350", borderWidth: 1.5, borderDash: [6,4], fill: false, pointRadius: 0, tension: 0 }));
  supports.forEach(s => datasets.push({ label: `แนวรับ $${s.toFixed(0)}`, data: Array(closes.length).fill(s), borderColor: "#26a69a", borderWidth: 1.5, borderDash: [6,4], fill: false, pointRadius: 0, tension: 0 }));

  if (stockChart) stockChart.destroy();
  stockChart = new Chart(document.getElementById("stockChart").getContext("2d"), {
    type: "line", data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "top", labels: { color: "#94a3b8", font: { size: 11 }, boxWidth: 16, padding: 10 } } },
      scales: {
        x: { ticks: { color: "#4a5568", font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { beginAtZero: false, ticks: { color: "#4a5568", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
}

function loadRsiChart(labels, rsiValues) {
  if (rsiChart) rsiChart.destroy();
  rsiChart = new Chart(document.getElementById("rsiChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "RSI(14)", data: rsiValues, borderColor: "#a78bfa", borderWidth: 2, fill: false, tension: 0.3, pointRadius: 0 },
        { label: "70", data: Array(labels.length).fill(70), borderColor: "#ef5350", borderWidth: 1, borderDash: [4,4], fill: false, pointRadius: 0, tension: 0 },
        { label: "30", data: Array(labels.length).fill(30), borderColor: "#26a69a", borderWidth: 1, borderDash: [4,4], fill: false, pointRadius: 0, tension: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "top", labels: { color: "#94a3b8", font: { size: 10 }, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: "#4a5568", font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { min: 0, max: 100, ticks: { color: "#4a5568", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
}

// ============================================
// DCA
// ============================================
let dcaChart;
window.calculateDCA = function() {
  const initial = parseFloat(document.getElementById("dcaInitial").value);
  const monthly = parseFloat(document.getElementById("dcaMonthly").value);
  const years = parseInt(document.getElementById("dcaYears").value);
  const rate = parseFloat(document.getElementById("dcaReturn").value) / 100;
  const retireAge = parseInt(document.getElementById("dcaRetireAge").value);
  const currentAge = parseInt(document.getElementById("dcaAge").value);
  const mr = rate / 12;

  Storage.set("dcaSettings", { initial, monthly, years, rate: rate*100, retireAge, currentAge });

  let bal = initial, inv = initial;
  const bals = [initial], invs = [initial], labs = ["เริ่มต้น"];
  for (let i = 1; i <= years * 12; i++) {
    bal = (bal + monthly) * (1 + mr); inv += monthly;
    if (i % 12 === 0) { bals.push(bal); invs.push(inv); labs.push(`ปี ${i/12}`); }
  }
  const gains = bal - inv;
  document.getElementById("dcaFinal").textContent = `$${bal.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("dcaFinalTHB").textContent = (bal*EXCHANGE_RATE).toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById("dcaInvested").textContent = `$${inv.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("dcaGains").textContent = `$${gains.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("dcaReturnPercent").textContent = ((gains/inv)*100).toFixed(1);
  const r1 = (bal*0.05/12)/(1-Math.pow(1+0.05/12,-300));
  document.getElementById("retirement1").textContent = `$${r1.toFixed(0)}`;
  const r2 = bal*0.04/12;
  document.getElementById("retirement2").textContent = `$${r2.toFixed(0)}`;
  document.getElementById("retirement2b").textContent = `$${r2.toFixed(0)}`;
  document.getElementById("retirement3").textContent = `$${(bal*0.05/12).toFixed(0)}`;
  document.getElementById("depleteAge").textContent = retireAge + 25;
  document.getElementById("dcaResults").style.display = "block";

  if (dcaChart) dcaChart.destroy();
  dcaChart = new Chart(document.getElementById("dcaChart").getContext("2d"), {
    type: "line",
    data: { labels: labs, datasets: [
      { label: "มูลค่ารวม", data: bals, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.08)", tension: 0.4, fill: true, borderWidth: 2, pointRadius: 0 },
      { label: "เงินลงทุน", data: invs, borderColor: "#22c55e", borderDash: [5,5], tension: 0.4, fill: false, borderWidth: 2, pointRadius: 0 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "top", labels: { color: "#94a3b8", font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: "#4a5568", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#4a5568", font: { size: 10 }, callback: v => "$"+v.toLocaleString() }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
};

// ============================================
// FINANCE (THB primary)
// ============================================
window.deleteTransaction = function(id) {
  if (!confirm("ลบรายการนี้?")) return;
  Storage.set("transactions", Storage.getArray("transactions").filter(t => t.id !== id));
  loadTransactions(); updateDashboard();
};

function loadTransactions() {
  const txs = Storage.getArray("transactions");
  const tbody = document.getElementById("transactionsList");
  if (!txs.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:1.5rem;">ยังไม่มีรายการ</td></tr>'; return; }
  tbody.innerHTML = txs.slice().reverse().map(tx => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td><span class="badge ${tx.type==="income"?"badge-success":"badge-danger"}">${tx.category}</span></td>
      <td style="font-weight:700;">฿${tx.amountTHB.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td style="color:var(--text-sub);">$${tx.amountUSD.toFixed(2)}</td>
      <td><span class="badge ${tx.type==="income"?"badge-success":"badge-danger"}">${tx.type==="income"?"รายรับ":"รายจ่าย"}</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteTransaction(${tx.id})">ลบ</button></td>
    </tr>`).join("");

  document.getElementById("recentTransactions").innerHTML = txs.slice(-5).reverse().map(tx => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td>${tx.category}</td>
      <td style="font-weight:700;color:${tx.type==="income"?"var(--success)":"var(--danger)"};">฿${tx.amountTHB.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td><span class="badge ${tx.type==="income"?"badge-success":"badge-danger"}">${tx.type==="income"?"รายรับ":"รายจ่าย"}</span></td>
    </tr>`).join("");
}

// ============================================
// PORTFOLIO
// ============================================
function loadHoldings() {
  const positions = Storage.getArray("positions");
  const holdings = {};
  positions.forEach(p => {
    if (!holdings[p.symbol]) holdings[p.symbol] = { symbol: p.symbol, shares: 0, totalCost: 0 };
    if (p.type === "buy") { holdings[p.symbol].shares += p.shares; holdings[p.symbol].totalCost += p.total; }
    else { holdings[p.symbol].shares -= p.shares; holdings[p.symbol].totalCost -= p.total; }
  });
  const items = Object.values(holdings).filter(h => h.shares > 0);
  const tbody = document.getElementById("holdingsList");
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:1.5rem;">ยังไม่มีหุ้น</td></tr>'; return; }
  tbody.innerHTML = items.map(h => {
    const avg = h.totalCost / h.shares;
    const cur = avg * (1 + (Math.random() * 0.2 - 0.1));
    const val = h.shares * cur;
    const pl = val - h.totalCost;
    const plp = (pl / h.totalCost) * 100;
    return `<tr>
      <td><strong style="color:var(--accent)">${h.symbol}</strong></td>
      <td>${h.shares}</td>
      <td>$${avg.toFixed(2)}</td>
      <td>$${cur.toFixed(2)}</td>
      <td>$${val.toFixed(2)}</td>
      <td style="color:${pl>=0?"var(--success)":"var(--danger)"};">$${pl.toFixed(2)}</td>
      <td style="color:${pl>=0?"var(--success)":"var(--danger)"};">${plp>=0?"+":""}${plp.toFixed(2)}%</td>
    </tr>`;
  }).join("");
}

// ============================================
// DASHBOARD
// ============================================
let financeChart, portfolioChart;
function updateDashboard() {
  const txs = Storage.getArray("transactions");
  const positions = Storage.getArray("positions");
  const now = new Date();

  let incTHB = 0, expTHB = 0;
  txs.forEach(tx => {
    const d = new Date(tx.date);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      if (tx.type === "income") incTHB += tx.amountTHB; else expTHB += tx.amountTHB;
    }
  });

  let portVal = 0, portCost = 0;
  positions.forEach(p => { if (p.type==="buy") { portCost += p.total; portVal += p.total * 1.05; } });
  const portTHB = portVal * EXCHANGE_RATE;
  const netTHB = incTHB - expTHB + portTHB;
  const ret = portCost > 0 ? ((portVal - portCost) / portCost * 100) : 0;

  document.getElementById("totalNetWorth").textContent = `฿${netTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("totalNetWorthUSD").textContent = (netTHB/EXCHANGE_RATE).toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById("monthIncome").textContent = `฿${incTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("monthExpense").textContent = `฿${expTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("portfolioValue").textContent = `฿${portTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("portfolioReturn").textContent = ret.toFixed(1);
  updateDashboardCharts();
}

function updateDashboardCharts() {
  const txs = Storage.getArray("transactions");
  const now = new Date();
  const thaiMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const monthLabels = [], incomeData = [], expenseData = [], portData = [];

  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const mo = d.getMonth(), yr = d.getFullYear();
    monthLabels.push(thaiMonths[mo]);
    let inc = 0, exp = 0;
    txs.forEach(tx => {
      const td = new Date(tx.date);
      if (td.getMonth() === mo && td.getFullYear() === yr) {
        if (tx.type === "income") inc += (tx.amountTHB || 0);
        else exp += (tx.amountTHB || 0);
      }
    });
    incomeData.push(inc);
    expenseData.push(exp);
    let pVal = 0;
    const lastDay = new Date(yr, mo + 1, 0);
    Storage.getArray("positions").forEach(p => {
      if (p.type === "buy" && new Date(p.date) <= lastDay) pVal += (p.total || 0) * EXCHANGE_RATE * 1.05;
    });
    portData.push(pVal);
  }

  const scaleColor = { color: "#4a5568", font: { size: 10 } };
  const gridColor = { color: "rgba(255,255,255,0.04)" };
  const legendOpts = { display: true, position: "top", labels: { color: "#94a3b8", font: { size: 11 }, boxWidth: 14 } };

  if (financeChart) financeChart.destroy();
  financeChart = new Chart(document.getElementById("financeChart").getContext("2d"), {
    type: "bar",
    data: { labels: monthLabels, datasets: [
      { label: "รายรับ (฿)", data: incomeData, backgroundColor: "rgba(34,197,94,0.7)", borderRadius: 6 },
      { label: "รายจ่าย (฿)", data: expenseData, backgroundColor: "rgba(239,68,68,0.7)", borderRadius: 6 }
    ]},
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: legendOpts },
      scales: { x: { ticks: scaleColor, grid: gridColor }, y: { ticks: { ...scaleColor, callback: v => "฿"+v.toLocaleString() }, grid: gridColor } }
    }
  });

  if (portfolioChart) portfolioChart.destroy();
  portfolioChart = new Chart(document.getElementById("portfolioChart").getContext("2d"), {
    type: "line",
    data: { labels: monthLabels, datasets: [
      { label: "มูลค่าพอร์ต (฿)", data: portData, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.07)", tension: 0.4, fill: true, borderWidth: 2, pointRadius: 3 }
    ]},
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: legendOpts },
      scales: { x: { ticks: scaleColor, grid: gridColor }, y: { ticks: { ...scaleColor, callback: v => "฿"+v.toLocaleString() }, grid: gridColor } }
    }
  });
}

// ============================================
// INIT
// ============================================
document.addEventListener("DOMContentLoaded", function() {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("txDate").value = today;
  document.getElementById("posDate").value = today;
  renderEmaControls();

  // Restore DCA settings
  const savedDca = Storage.get("dcaSettings");
  if (savedDca) {
    try {
      document.getElementById("dcaInitial").value = savedDca.initial || 10000;
      document.getElementById("dcaMonthly").value = savedDca.monthly || 1000;
      document.getElementById("dcaYears").value = savedDca.years || 30;
      document.getElementById("dcaReturn").value = savedDca.rate || 8;
      document.getElementById("dcaRetireAge").value = savedDca.retireAge || 65;
      document.getElementById("dcaAge").value = savedDca.currentAge || 35;
      calculateDCA();
    } catch(e) {}
  }

  document.getElementById("transactionForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const thb = parseFloat(document.getElementById("txAmount").value);
    Storage.set("transactions", [...Storage.getArray("transactions"), {
      id: Date.now(),
      date: document.getElementById("txDate").value,
      type: document.getElementById("txType").value,
      category: document.getElementById("txCategory").value,
      amountTHB: thb,
      amountUSD: thb / EXCHANGE_RATE,
      description: document.getElementById("txDescription").value,
      exchangeRate: EXCHANGE_RATE
    }]);
    this.reset();
    document.getElementById("txDate").value = today;
    loadTransactions(); updateDashboard();
    alert("✓ เพิ่มรายการสำเร็จ");
  });

  document.getElementById("positionForm").addEventListener("submit", function(e) {
    e.preventDefault();
    Storage.set("positions", [...Storage.getArray("positions"), {
      id: Date.now(),
      date: document.getElementById("posDate").value,
      symbol: document.getElementById("posSymbol").value.toUpperCase(),
      type: document.getElementById("posType").value,
      shares: parseFloat(document.getElementById("posShares").value),
      price: parseFloat(document.getElementById("posPrice").value),
      total: parseFloat(document.getElementById("posTotal").value),
      exchangeRate: EXCHANGE_RATE
    }]);
    this.reset();
    document.getElementById("posDate").value = today;
    loadHoldings(); updateDashboard();
    alert("✓ เพิ่มรายการซื้อขายสำเร็จ");
  });

  ["posShares","posPrice"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      const s = parseFloat(document.getElementById("posShares").value) || 0;
      const p = parseFloat(document.getElementById("posPrice").value) || 0;
      document.getElementById("posTotal").value = (s*p).toFixed(2);
    });
  });

  // Enter key on watchlist input
  document.getElementById("watchInput").addEventListener("keydown", e => { if (e.key === "Enter") addToWatchlist(); });
  // Enter key on stock search
  document.getElementById("stockSymbol").addEventListener("keydown", e => { if (e.key === "Enter") searchStock(); });

  updateExchangeRate();
  updateDashboard();
  setInterval(updateExchangeRate, 60000);
});
