// ============================================
// DATA STORAGE
// ============================================
const Storage = {
  get(key) { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
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
    document.getElementById("exchangeRate").textContent = `1 USD = ${EXCHANGE_RATE.toFixed(2)} THB`;
    document.getElementById("exchangeTime").textContent = `อัปเดต: ${new Date().toLocaleTimeString("th-TH")}`;
  } catch {
    document.getElementById("exchangeRate").textContent = `1 USD = ${EXCHANGE_RATE.toFixed(2)} THB`;
    document.getElementById("exchangeTime").textContent = "ใช้ค่าเก่า";
  }
}

// ============================================
// NAVIGATION
// ============================================
window.showSection = function(sectionId) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.getElementById(sectionId).classList.add("active");
  event.target.classList.add("active");
  if (sectionId === "dashboard") updateDashboard();
  if (sectionId === "finance") loadTransactions();
  if (sectionId === "portfolio") loadHoldings();
};

// ============================================
// STOCKS — Alpha Vantage + RSI + EMA + S/R
// ============================================
let stockChart, rsiChart;
const AV_KEY = "EF98OLFV7JF7WTQD";
let lastCloses = [], lastLabels = [], lastSymbol = "";

// EMA config
let emaLines = [
  { period: 20, color: "#f59e0b" },
  { period: 50, color: "#8b5cf6" }
];

function renderEmaControls() {
  const list = document.getElementById("emaList");
  if (!list) return;
  list.innerHTML = emaLines.map((e, i) => `
    <div class="ema-row">
      <label>Period / คาบ:</label>
      <input type="number" min="2" max="200" value="${e.period}" onchange="emaLines[${i}].period=parseInt(this.value)">
      <label>Color / สี:</label>
      <input type="color" value="${e.color}" onchange="emaLines[${i}].color=this.value">
      <button class="btn-remove" onclick="removeEmaLine(${i})">✕ ลบ</button>
    </div>
  `).join("");
}

window.addEmaLine = function() {
  emaLines.push({ period: 100, color: "#10b981" });
  renderEmaControls();
};
window.removeEmaLine = function(i) {
  emaLines.splice(i, 1);
  renderEmaControls();
  if (lastCloses.length > 0) loadStockChart(lastSymbol, lastLabels, lastCloses);
};
window.applyEmaChanges = function() {
  if (lastCloses.length > 0) loadStockChart(lastSymbol, lastLabels, lastCloses);
};

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
    const diff = prices[i] - prices[i-1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i-1];
    avgGain = (avgGain * (period-1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period-1) + Math.max(-diff, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
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
  // top 3 supports and resistances
  const topSupports = [...new Set(supports)].sort((a,b) => b-a).slice(0, 3);
  const topResistances = [...new Set(resistances)].sort((a,b) => a-b).slice(0, 3);
  return { supports: topSupports, resistances: topResistances };
}

function getRsiLabel(rsi) {
  if (rsi >= 70) return { text: "Overbought / ซื้อมากเกินไป ⚠️", cls: "rsi-ob" };
  if (rsi <= 30) return { text: "Oversold / ขายมากเกินไป 🟢", cls: "rsi-os" };
  return { text: "Neutral / ปกติ", cls: "rsi-neutral" };
}

function getAnalysis(rsi, latestClose, supports, resistances, emaVals) {
  const lines = [];
  const rsiLabel = getRsiLabel(rsi);
  lines.push(`📊 <b>RSI:</b> ${rsi.toFixed(1)} — ${rsiLabel.text}`);

  if (supports.length) lines.push(`🟢 <b>แนวรับ (Support):</b> $${supports.map(s => s.toFixed(2)).join(", $")}`);
  if (resistances.length) lines.push(`🔴 <b>แนวต้าน (Resistance):</b> $${resistances.map(r => r.toFixed(2)).join(", $")}`);

  emaVals.forEach(e => {
    const pos = latestClose > e.val ? "เหนือ EMA (bullish 📈)" : "ต่ำกว่า EMA (bearish 📉)";
    lines.push(`📉 <b>EMA ${e.period}:</b> $${e.val.toFixed(2)} — ราคาอยู่${pos}`);
  });

  // Simple signal
  let signal = "";
  if (rsi <= 30 && supports.length && latestClose <= supports[0] * 1.02) signal = "🟢 <b>สัญญาณซื้อ (Buy Signal):</b> RSI Oversold + ใกล้แนวรับ";
  else if (rsi >= 70 && resistances.length && latestClose >= resistances[0] * 0.98) signal = "🔴 <b>สัญญาณขาย (Sell Signal):</b> RSI Overbought + ใกล้แนวต้าน";
  else signal = "⚪ <b>สัญญาณ:</b> รอดูท่าที (Neutral / Wait)";
  lines.push(signal);

  return lines.join("<br>");
}

window.searchStock = async function() {
  const symbol = document.getElementById("stockSymbol").value.toUpperCase();
  if (!symbol) return alert("กรุณาใส่ชื่อหุ้น");
  document.getElementById("stockInfo").style.display = "none";

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data["Note"]) { alert("API limit reached (25/day). ลองใหม่พรุ่งนี้ครับ"); return; }
    const ts = data["Time Series (Daily)"];
    if (!ts) { alert("ไม่พบหุ้น ลองใช้: AAPL, MSFT, TSLA, GOOGL, META"); return; }

    const dates = Object.keys(ts).sort().slice(-100);
    const closes = dates.map(d => parseFloat(ts[d]["4. close"]));
    const volumes = dates.map(d => parseInt(ts[d]["5. volume"]));
    const labels = dates.map(d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

    lastCloses = closes; lastLabels = labels; lastSymbol = symbol;

    const latestClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const change = latestClose - prevClose;
    const changePct = (change / prevClose) * 100;
    const rsiValues = calcRSI(closes);
    const latestRsi = rsiValues[rsiValues.length - 1];
    const { supports, resistances } = calcSupportResistance(closes);

    document.getElementById("stockName").innerHTML = `${symbol} — ข้อมูลหุ้น <span class="th">Stock Information</span>`;
    document.getElementById("stockPrice").textContent = `$${latestClose.toFixed(2)}`;
    document.getElementById("stockChange").textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`;
    document.getElementById("stockChange").style.color = change >= 0 ? "#10b981" : "#ef4444";
    document.getElementById("stockVolume").textContent = volumes[volumes.length-1].toLocaleString();
    document.getElementById("stockRsi").textContent = latestRsi.toFixed(1);

    const rsiInfo = getRsiLabel(latestRsi);
    document.getElementById("rsiZone").innerHTML = `<span class="rsi-zone ${rsiInfo.cls}">${rsiInfo.text}</span>`;

    // Support/Resistance badges
    const badges = [
      ...resistances.map(r => `<span class="sr-badge sr-resistance">แนวต้าน $${r.toFixed(2)}</span>`),
      ...supports.map(s => `<span class="sr-badge sr-support">แนวรับ $${s.toFixed(2)}</span>`)
    ].join("");
    document.getElementById("srBadges").innerHTML = badges;

    // Analysis
    const emaVals = emaLines.map(e => ({ period: e.period, val: calcEMA(closes, e.period).slice(-1)[0] }));
    document.getElementById("analysisBox").innerHTML = getAnalysis(latestRsi, latestClose, supports, resistances, emaVals);
    document.getElementById("analysisBox").style.display = "block";

    document.getElementById("stockInfo").style.display = "block";
    renderEmaControls();
    loadStockChart(symbol, labels, closes);
    loadRsiChart(labels, rsiValues);
  } catch (err) {
    console.error(err);
    alert("ดึงข้อมูลไม่ได้ กรุณาลองใหม่");
  }
};

function loadStockChart(symbol, labels, closes) {
  const { supports, resistances } = calcSupportResistance(closes);

  const datasets = [{
    label: symbol + " Price",
    data: closes,
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59,130,246,0.07)",
    tension: 0.3, fill: true, borderWidth: 2, pointRadius: 0
  }];

  emaLines.forEach(e => {
    datasets.push({
      label: `EMA ${e.period}`,
      data: calcEMA(closes, e.period),
      borderColor: e.color,
      borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0
    });
  });

  resistances.forEach(r => datasets.push({
    label: `แนวต้าน $${r.toFixed(2)}`,
    data: Array(closes.length).fill(r),
    borderColor: "#ef4444", borderWidth: 1.5, borderDash: [6,4],
    fill: false, pointRadius: 0, tension: 0
  }));

  supports.forEach(s => datasets.push({
    label: `แนวรับ $${s.toFixed(2)}`,
    data: Array(closes.length).fill(s),
    borderColor: "#10b981", borderWidth: 1.5, borderDash: [6,4],
    fill: false, pointRadius: 0, tension: 0
  }));

  if (stockChart) stockChart.destroy();
  stockChart = new Chart(document.getElementById("stockChart").getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "top" } },
      scales: { y: { beginAtZero: false } }
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
        { label: "RSI (14)", data: rsiValues, borderColor: "#6366f1", borderWidth: 2, fill: false, tension: 0.3, pointRadius: 0 },
        { label: "Overbought 70", data: Array(labels.length).fill(70), borderColor: "#ef4444", borderWidth: 1, borderDash: [4,4], fill: false, pointRadius: 0, tension: 0 },
        { label: "Oversold 30", data: Array(labels.length).fill(30), borderColor: "#10b981", borderWidth: 1, borderDash: [4,4], fill: false, pointRadius: 0, tension: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "top" } },
      scales: { y: { min: 0, max: 100 } }
    }
  });
}

// ============================================
// DCA CALCULATOR
// ============================================
let dcaChart;

window.calculateDCA = function() {
  const initial = parseFloat(document.getElementById("dcaInitial").value);
  const monthly = parseFloat(document.getElementById("dcaMonthly").value);
  const years = parseInt(document.getElementById("dcaYears").value);
  const returnRate = parseFloat(document.getElementById("dcaReturn").value) / 100;
  const retireAge = parseInt(document.getElementById("dcaRetireAge").value);

  const monthlyRate = returnRate / 12;
  let balance = initial, totalInvested = initial;
  const balances = [initial], invested = [initial], labels = ["Start"];

  for (let i = 1; i <= years * 12; i++) {
    balance = (balance + monthly) * (1 + monthlyRate);
    totalInvested += monthly;
    if (i % 12 === 0) { balances.push(balance); invested.push(totalInvested); labels.push(`ปีที่ ${i/12}`); }
  }

  const totalGains = balance - totalInvested;
  document.getElementById("dcaFinal").textContent = `$${balance.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("dcaFinalTHB").textContent = (balance * EXCHANGE_RATE).toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById("dcaInvested").textContent = `$${totalInvested.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("dcaGains").textContent = `$${totalGains.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("dcaReturnPercent").textContent = ((totalGains/totalInvested)*100).toFixed(1);
  document.getElementById("retirement1").textContent = `$${((balance * 0.05/12) / (1 - Math.pow(1+0.05/12,-300))).toFixed(0)}`;
  document.getElementById("retirement2").textContent = `$${(balance*0.04/12).toFixed(0)}`;
  document.getElementById("retirement3").textContent = `$${(balance*0.05/12).toFixed(0)}`;
  document.getElementById("depleteAge").textContent = retireAge + 25;
  document.getElementById("dcaResults").style.display = "block";

  if (dcaChart) dcaChart.destroy();
  dcaChart = new Chart(document.getElementById("dcaChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "มูลค่ารวม", data: balances, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", tension: 0.4, fill: true, borderWidth: 3 },
        { label: "เงินลงทุน", data: invested, borderColor: "#10b981", borderDash: [5,5], tension: 0.4, fill: false, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "top" } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => "$" + v.toLocaleString() } } }
    }
  });
};

// ============================================
// DELETE TRANSACTION
// ============================================
window.deleteTransaction = function(id) {
  if (!confirm("ลบรายการนี้?")) return;
  let txs = Storage.getArray("transactions").filter(t => t.id !== id);
  Storage.set("transactions", txs);
  loadTransactions(); updateDashboard();
};

// ============================================
// FINANCE TRACKER (THB primary)
// ============================================
function loadTransactions() {
  const transactions = Storage.getArray("transactions");
  const tbody = document.getElementById("transactionsList");
  if (!transactions.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">ยังไม่มีรายการ</td></tr>';
    return;
  }
  tbody.innerHTML = transactions.slice().reverse().map(tx => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td><span class="badge ${tx.type==="income"?"badge-success":"badge-danger"}">${tx.category}</span></td>
      <td>฿${tx.amountTHB.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td>$${tx.amountUSD.toFixed(2)}</td>
      <td><span class="badge ${tx.type==="income"?"badge-success":"badge-danger"}">${tx.type==="income"?"รายรับ":"รายจ่าย"}</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteTransaction(${tx.id})">ลบ</button></td>
    </tr>
  `).join("");

  const recent = transactions.slice(-5).reverse();
  document.getElementById("recentTransactions").innerHTML = recent.map(tx => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td>${tx.category}</td>
      <td>฿${tx.amountTHB.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td><span class="badge ${tx.type==="income"?"badge-success":"badge-danger"}">${tx.type==="income"?"รายรับ":"รายจ่าย"}</span></td>
    </tr>
  `).join("");
}

// ============================================
// PORTFOLIO
// ============================================
function loadHoldings() {
  const positions = Storage.getArray("positions");
  const holdings = {};
  positions.forEach(pos => {
    if (!holdings[pos.symbol]) holdings[pos.symbol] = { symbol: pos.symbol, shares: 0, totalCost: 0 };
    if (pos.type === "buy") { holdings[pos.symbol].shares += pos.shares; holdings[pos.symbol].totalCost += pos.total; }
    else { holdings[pos.symbol].shares -= pos.shares; holdings[pos.symbol].totalCost -= pos.total; }
  });
  const tbody = document.getElementById("holdingsList");
  const items = Object.values(holdings).filter(h => h.shares > 0);
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">ยังไม่มีหุ้น</td></tr>'; return; }
  tbody.innerHTML = items.map(h => {
    const avgCost = h.totalCost / h.shares;
    const currentPrice = avgCost * (1 + (Math.random() * 0.2 - 0.1));
    const totalValue = h.shares * currentPrice;
    const pl = totalValue - h.totalCost;
    const plPct = (pl / h.totalCost) * 100;
    return `<tr>
      <td><strong>${h.symbol}</strong></td>
      <td>${h.shares}</td>
      <td>$${avgCost.toFixed(2)}</td>
      <td>$${currentPrice.toFixed(2)}</td>
      <td>$${totalValue.toFixed(2)}</td>
      <td style="color:${pl>=0?"#10b981":"#ef4444"}">$${pl.toFixed(2)}</td>
      <td style="color:${pl>=0?"#10b981":"#ef4444"}">${plPct>=0?"+":""}${plPct.toFixed(2)}%</td>
    </tr>`;
  }).join("");
}

// ============================================
// DASHBOARD
// ============================================
let financeChart, portfolioChart;

function updateDashboard() {
  const transactions = Storage.getArray("transactions");
  const positions = Storage.getArray("positions");
  const now = new Date();

  let monthIncomeTHB = 0, monthExpenseTHB = 0;
  transactions.forEach(tx => {
    const d = new Date(tx.date);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      if (tx.type === "income") monthIncomeTHB += tx.amountTHB;
      else monthExpenseTHB += tx.amountTHB;
    }
  });

  let portfolioValue = 0, portfolioCost = 0;
  positions.forEach(pos => { if (pos.type==="buy") { portfolioCost += pos.total; portfolioValue += pos.total * 1.05; } });
  const portfolioReturn = portfolioCost > 0 ? ((portfolioValue - portfolioCost) / portfolioCost) * 100 : 0;
  const portfolioValueTHB = portfolioValue * EXCHANGE_RATE;
  const totalNetWorthTHB = monthIncomeTHB - monthExpenseTHB + portfolioValueTHB;

  document.getElementById("totalNetWorth").textContent = `฿${totalNetWorthTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("totalNetWorthUSD").textContent = (totalNetWorthTHB / EXCHANGE_RATE).toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById("monthIncome").textContent = `฿${monthIncomeTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("monthExpense").textContent = `฿${monthExpenseTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("portfolioValue").textContent = `฿${portfolioValueTHB.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  document.getElementById("portfolioReturn").textContent = portfolioReturn.toFixed(1);
  document.getElementById("incomeChange").textContent = "0";
  document.getElementById("expenseChange").textContent = "0";

  updateDashboardCharts();
}

function updateDashboardCharts() {
  if (financeChart) financeChart.destroy();
  financeChart = new Chart(document.getElementById("financeChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย."],
      datasets: [
        { label: "รายรับ", data: [5000,5200,5100,5300,5400,5500], backgroundColor: "rgba(16,185,129,0.8)" },
        { label: "รายจ่าย", data: [3000,3200,2900,3100,3300,3200], backgroundColor: "rgba(239,68,68,0.8)" }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "top" } } }
  });

  if (portfolioChart) portfolioChart.destroy();
  portfolioChart = new Chart(document.getElementById("portfolioChart").getContext("2d"), {
    type: "line",
    data: {
      labels: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย."],
      datasets: [{ label: "มูลค่าพอร์ต", data: [10000,10500,10300,11000,11500,12000], borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", tension: 0.4, fill: true }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener("DOMContentLoaded", function() {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("txDate").value = today;
  document.getElementById("posDate").value = today;

  renderEmaControls();

  document.getElementById("transactionForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const amountTHB = parseFloat(document.getElementById("txAmount").value);
    const transaction = {
      id: Date.now(),
      date: document.getElementById("txDate").value,
      type: document.getElementById("txType").value,
      category: document.getElementById("txCategory").value,
      amountTHB: amountTHB,
      amountUSD: amountTHB / EXCHANGE_RATE,
      description: document.getElementById("txDescription").value,
      exchangeRate: EXCHANGE_RATE
    };
    const txs = Storage.getArray("transactions");
    txs.push(transaction);
    Storage.set("transactions", txs);
    this.reset();
    document.getElementById("txDate").value = today;
    loadTransactions(); updateDashboard();
    alert("เพิ่มรายการสำเร็จ!");
  });

  document.getElementById("positionForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const position = {
      id: Date.now(),
      date: document.getElementById("posDate").value,
      symbol: document.getElementById("posSymbol").value.toUpperCase(),
      type: document.getElementById("posType").value,
      shares: parseFloat(document.getElementById("posShares").value),
      price: parseFloat(document.getElementById("posPrice").value),
      total: parseFloat(document.getElementById("posTotal").value),
      exchangeRate: EXCHANGE_RATE
    };
    const positions = Storage.getArray("positions");
    positions.push(position);
    Storage.set("positions", positions);
    this.reset();
    document.getElementById("posDate").value = today;
    loadHoldings(); updateDashboard();
    alert("เพิ่มรายการซื้อขายสำเร็จ!");
  });

  ["posShares", "posPrice"].forEach(id => {
    document.getElementById(id).addEventListener("input", function() {
      const shares = parseFloat(document.getElementById("posShares").value) || 0;
      const price = parseFloat(document.getElementById("posPrice").value) || 0;
      document.getElementById("posTotal").value = (shares * price).toFixed(2);
    });
  });

  updateExchangeRate();
  updateDashboard();
  setInterval(updateExchangeRate, 60000);
});
