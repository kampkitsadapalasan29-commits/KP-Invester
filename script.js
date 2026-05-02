// ============================================
// DATA STORAGE (LocalStorage)
// ============================================

const Storage = {
  get(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  getArray(key) {
    return this.get(key) || [];
  }
};

// ============================================
// EXCHANGE RATE
// ============================================

let EXCHANGE_RATE = 35.02;

async function updateExchangeRate() {
  try {
    const response = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    const data = await response.json();
    EXCHANGE_RATE = data.rates.THB;
    document.getElementById(
      "exchangeRate"
    ).textContent = `1 USD = ${EXCHANGE_RATE.toFixed(2)} THB`;
    document.getElementById(
      "exchangeTime"
    ).textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    console.error("Exchange rate fetch failed:", error);
    document.getElementById(
      "exchangeRate"
    ).textContent = `1 USD = ${EXCHANGE_RATE} THB`;
    document.getElementById("exchangeTime").textContent = "Using cached rate";
  }
}

// ============================================
// NAVIGATION (ย้ายมาไว้บนสุด)
// ============================================

window.showSection = function (sectionId) {
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.remove("active"));

  document.getElementById(sectionId).classList.add("active");
  event.target.classList.add("active");

  if (sectionId === "dashboard") updateDashboard();
  if (sectionId === "finance") loadTransactions();
  if (sectionId === "portfolio") loadHoldings();
};

// ============================================
// STOCKS — Alpha Vantage + EMA + Support/Resistance
// ============================================

let stockChart;
const AV_KEY = "EF98OLFV7JF7WTQD";

function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcSupportResistance(prices, window = 5) {
  const supports = [];
  const resistances = [];
  for (let i = window; i < prices.length - window; i++) {
    const slice = prices.slice(i - window, i + window + 1);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    if (prices[i] === min) supports.push(prices[i]);
    if (prices[i] === max) resistances.push(prices[i]);
  }
  const support = supports.length ? Math.min(...supports) : null;
  const resistance = resistances.length ? Math.max(...resistances) : null;
  return { support, resistance };
}

window.searchStock = async function () {
  const symbol = document.getElementById("stockSymbol").value.toUpperCase();
  if (!symbol) return alert("Please enter a stock symbol");

  document.getElementById("stockInfo").style.display = "none";
  document.getElementById("stockPrice").textContent = "Loading...";

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data["Note"]) {
      alert("API limit reached (25/day). Please try again later.");
      return;
    }

    const ts = data["Time Series (Daily)"];
    if (!ts) {
      alert("Stock not found. Try: AAPL, MSFT, TSLA, GOOGL, META");
      return;
    }

    const dates = Object.keys(ts).sort().slice(-60);
    const closes = dates.map(d => parseFloat(ts[d]["4. close"]));
    const volumes = dates.map(d => parseInt(ts[d]["5. volume"]));
    const labels = dates.map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    const latestClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const change = latestClose - prevClose;
    const changePct = (change / prevClose) * 100;
    const latestVolume = volumes[volumes.length - 1];

    document.getElementById("stockName").textContent = `${symbol} - Stock Information`;
    document.getElementById("stockPrice").textContent = `$${latestClose.toFixed(2)}`;
    document.getElementById("stockChange").textContent =
      `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`;
    document.getElementById("stockChange").style.color = change >= 0 ? "#10b981" : "#ef4444";
    document.getElementById("stockVolume").textContent = latestVolume.toLocaleString();
    document.getElementById("stockMarketCap").textContent = "-";
    document.getElementById("stockInfo").style.display = "block";

    await loadStockChart(symbol, labels, closes);
  } catch (error) {
    console.error("Stock fetch failed:", error);
    alert("Failed to fetch stock data.");
  }
};

async function loadStockChart(symbol, labels, closes) {
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const { support, resistance } = calcSupportResistance(closes);

  const annotations = {};
  if (support) {
    annotations.support = {
      type: "line",
      yMin: support, yMax: support,
      borderColor: "#10b981", borderWidth: 1.5,
      borderDash: [6, 4],
      label: { content: `Support $${support.toFixed(2)}`, display: true, position: "start", color: "#10b981", font: { size: 11 } }
    };
  }
  if (resistance) {
    annotations.resistance = {
      type: "line",
      yMin: resistance, yMax: resistance,
      borderColor: "#ef4444", borderWidth: 1.5,
      borderDash: [6, 4],
      label: { content: `Resistance $${resistance.toFixed(2)}`, display: true, position: "start", color: "#ef4444", font: { size: 11 } }
    };
  }

  if (stockChart) stockChart.destroy();

  const ctx = document.getElementById("stockChart").getContext("2d");
  stockChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: symbol,
          data: closes,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.08)",
          tension: 0.3,
          fill: true,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "EMA 20",
          data: ema20,
          borderColor: "#f59e0b",
          borderWidth: 1.5,
          tension: 0.3,
          fill: false,
          pointRadius: 0
        },
        {
          label: "EMA 50",
          data: ema50,
          borderColor: "#8b5cf6",
          borderWidth: 1.5,
          tension: 0.3,
          fill: false,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top" },
        annotation: annotations
      },
      scales: {
        y: { beginAtZero: false }
      }
    }
  });
}

// ============================================
// DCA CALCULATOR (ย้ายมาไว้บนสุดด้วย)
// ============================================

let dcaChart;

window.calculateDCA = function () {
  const initial = parseFloat(document.getElementById("dcaInitial").value);
  const monthly = parseFloat(document.getElementById("dcaMonthly").value);
  const years = parseInt(document.getElementById("dcaYears").value);
  const returnRate =
    parseFloat(document.getElementById("dcaReturn").value) / 100;
  const currentAge = parseInt(document.getElementById("dcaAge").value);
  const retireAge = parseInt(document.getElementById("dcaRetireAge").value);

  const monthlyRate = returnRate / 12;
  const months = years * 12;

  let balance = initial;
  let totalInvested = initial;
  const balances = [initial];
  const invested = [initial];
  const labels = ["Start"];

  for (let i = 1; i <= months; i++) {
    balance += monthly;
    totalInvested += monthly;
    balance *= 1 + monthlyRate;

    if (i % 12 === 0) {
      balances.push(balance);
      invested.push(totalInvested);
      labels.push(`Year ${i / 12}`);
    }
  }

  const totalGains = balance - totalInvested;
  const totalReturnPercent = (totalGains / totalInvested) * 100;

  document.getElementById("dcaFinal").textContent = `$${balance.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 0
    }
  )}`;
  document.getElementById("dcaFinalTHB").textContent = (
    balance * EXCHANGE_RATE
  ).toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById(
    "dcaInvested"
  ).textContent = `$${totalInvested.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;
  document.getElementById(
    "dcaGains"
  ).textContent = `$${totalGains.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;
  document.getElementById(
    "dcaReturnPercent"
  ).textContent = totalReturnPercent.toFixed(1);

  const monthlyRateRetire = 0.05 / 12;
  const retirement1 =
    (balance * monthlyRateRetire) /
    (1 - Math.pow(1 + monthlyRateRetire, -25 * 12));
  const retirement2 = (balance * 0.04) / 12;
  const retirement3 = (balance * 0.05) / 12;

  document.getElementById("retirement1").textContent = `$${retirement1.toFixed(
    0
  )}`;
  document.getElementById("retirement2").textContent = `$${retirement2.toFixed(
    0
  )}`;
  document.getElementById("retirement3").textContent = `$${retirement3.toFixed(
    0
  )}`;
  document.getElementById("depleteAge").textContent = retireAge + 25;

  document.getElementById("dcaResults").style.display = "block";

  if (dcaChart) dcaChart.destroy();

  const ctx = document.getElementById("dcaChart").getContext("2d");
  dcaChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Value",
          data: balances,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.4,
          fill: true,
          borderWidth: 3
        },
        {
          label: "Total Invested",
          data: invested,
          borderColor: "#10b981",
          borderDash: [5, 5],
          tension: 0.4,
          fill: false,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top"
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return "$" + value.toLocaleString();
            }
          }
        }
      }
    }
  });
};

// ============================================
// DELETE TRANSACTION
// ============================================

window.deleteTransaction = function (id) {
  if (!confirm("Delete this transaction?")) return;

  let transactions = Storage.getArray("transactions");
  transactions = transactions.filter((tx) => tx.id !== id);
  Storage.set("transactions", transactions);
  loadTransactions();
  updateDashboard();
};

// ============================================
// FINANCE TRACKER
// ============================================

function loadTransactions() {
  const transactions = Storage.getArray("transactions");
  const tbody = document.getElementById("transactionsList");

  if (transactions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; color: #999;">No transactions yet</td></tr>';
    return;
  }

  tbody.innerHTML = transactions
    .slice()
    .reverse()
    .map(
      (tx) => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td><span class="badge ${
        tx.type === "income" ? "badge-success" : "badge-danger"
      }">${tx.category}</span></td>
      <td>$${tx.amount.toFixed(2)}</td>
      <td>฿${tx.amountTHB.toFixed(2)}</td>
      <td><span class="badge ${
        tx.type === "income" ? "badge-success" : "badge-danger"
      }">${tx.type}</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteTransaction(${
        tx.id
      })">Delete</button></td>
    </tr>
  `
    )
    .join("");

  const recent = transactions.slice(-5).reverse();
  document.getElementById("recentTransactions").innerHTML = recent
    .map(
      (tx) => `
    <tr>
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td>${tx.category}</td>
      <td>$${tx.amount.toFixed(2)}</td>
      <td><span class="badge ${
        tx.type === "income" ? "badge-success" : "badge-danger"
      }">${tx.type}</span></td>
    </tr>
  `
    )
    .join("");
}

// ============================================
// PORTFOLIO
// ============================================

function loadHoldings() {
  const positions = Storage.getArray("positions");
  const holdings = {};

  positions.forEach((pos) => {
    if (!holdings[pos.symbol]) {
      holdings[pos.symbol] = {
        symbol: pos.symbol,
        shares: 0,
        totalCost: 0
      };
    }

    if (pos.type === "buy") {
      holdings[pos.symbol].shares += pos.shares;
      holdings[pos.symbol].totalCost += pos.total;
    } else {
      holdings[pos.symbol].shares -= pos.shares;
      holdings[pos.symbol].totalCost -= pos.total;
    }
  });

  const tbody = document.getElementById("holdingsList");

  if (Object.keys(holdings).length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; color: #999;">No holdings yet</td></tr>';
    return;
  }

  tbody.innerHTML = Object.values(holdings)
    .filter((h) => h.shares > 0)
    .map((h) => {
      const avgCost = h.totalCost / h.shares;
      const currentPrice = avgCost * (1 + (Math.random() * 0.2 - 0.1));
      const totalValue = h.shares * currentPrice;
      const pl = totalValue - h.totalCost;
      const plPercent = (pl / h.totalCost) * 100;

      return `
        <tr>
          <td><strong>${h.symbol}</strong></td>
          <td>${h.shares}</td>
          <td>$${avgCost.toFixed(2)}</td>
          <td>$${currentPrice.toFixed(2)}</td>
          <td>$${totalValue.toFixed(2)}</td>
          <td style="color: ${pl >= 0 ? "#10b981" : "#ef4444"}">$${pl.toFixed(
        2
      )}</td>
          <td style="color: ${pl >= 0 ? "#10b981" : "#ef4444"}">
            ${plPercent >= 0 ? "+" : ""}${plPercent.toFixed(2)}%
          </td>
        </tr>
      `;
    })
    .join("");
}

// ============================================
// DASHBOARD
// ============================================

let financeChart, portfolioChart;

function updateDashboard() {
  const transactions = Storage.getArray("transactions");
  const positions = Storage.getArray("positions");

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let monthIncome = 0;
  let monthExpense = 0;

  transactions.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear) {
      if (tx.type === "income") {
        monthIncome += tx.amount;
      } else {
        monthExpense += tx.amount;
      }
    }
  });

  let portfolioValue = 0;
  let portfolioCost = 0;

  positions.forEach((pos) => {
    if (pos.type === "buy") {
      portfolioCost += pos.total;
      portfolioValue += pos.total * 1.05;
    }
  });

  const portfolioReturn =
    portfolioCost > 0
      ? ((portfolioValue - portfolioCost) / portfolioCost) * 100
      : 0;
  const totalNetWorth = monthIncome - monthExpense + portfolioValue;

  document.getElementById(
    "totalNetWorth"
  ).textContent = `$${totalNetWorth.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;
  document.getElementById("totalNetWorthTHB").textContent = (
    totalNetWorth * EXCHANGE_RATE
  ).toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById(
    "monthIncome"
  ).textContent = `$${monthIncome.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;
  document.getElementById(
    "monthExpense"
  ).textContent = `$${monthExpense.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;
  document.getElementById(
    "portfolioValue"
  ).textContent = `$${portfolioValue.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })}`;
  document.getElementById(
    "portfolioReturn"
  ).textContent = portfolioReturn.toFixed(1);

  updateDashboardCharts();
}

function updateDashboardCharts() {
  if (financeChart) financeChart.destroy();

  const ctx1 = document.getElementById("financeChart").getContext("2d");
  financeChart = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      datasets: [
        {
          label: "Income",
          data: [5000, 5200, 5100, 5300, 5400, 5500],
          backgroundColor: "rgba(16, 185, 129, 0.8)"
        },
        {
          label: "Expenses",
          data: [3000, 3200, 2900, 3100, 3300, 3200],
          backgroundColor: "rgba(239, 68, 68, 0.8)"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top"
        }
      }
    }
  });

  if (portfolioChart) portfolioChart.destroy();

  const ctx2 = document.getElementById("portfolioChart").getContext("2d");
  portfolioChart = new Chart(ctx2, {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      datasets: [
        {
          label: "Portfolio Value",
          data: [10000, 10500, 10300, 11000, 11500, 12000],
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener("DOMContentLoaded", function () {
  // Set default dates
  document.getElementById("txDate").value = new Date()
    .toISOString()
    .split("T")[0];
  document.getElementById("posDate").value = new Date()
    .toISOString()
    .split("T")[0];

  // Transaction Form
  document
    .getElementById("transactionForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();

      const transaction = {
        id: Date.now(),
        date: document.getElementById("txDate").value,
        type: document.getElementById("txType").value,
        category: document.getElementById("txCategory").value,
        amount: parseFloat(document.getElementById("txAmount").value),
        amountTHB:
          parseFloat(document.getElementById("txAmount").value) * EXCHANGE_RATE,
        description: document.getElementById("txDescription").value,
        exchangeRate: EXCHANGE_RATE
      };

      const transactions = Storage.getArray("transactions");
      transactions.push(transaction);
      Storage.set("transactions", transactions);

      this.reset();
      document.getElementById("txDate").value = new Date()
        .toISOString()
        .split("T")[0];
      loadTransactions();
      updateDashboard();

      alert("Transaction added successfully!");
    });

  // Position Form
  document
    .getElementById("positionForm")
    .addEventListener("submit", function (e) {
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
      document.getElementById("posDate").value = new Date()
        .toISOString()
        .split("T")[0];
      loadHoldings();
      updateDashboard();

      alert("Position added successfully!");
    });

  // Auto-calculate position total
  ["posShares", "posPrice"].forEach((id) => {
    document.getElementById(id).addEventListener("input", function () {
      const shares =
        parseFloat(document.getElementById("posShares").value) || 0;
      const price = parseFloat(document.getElementById("posPrice").value) || 0;
      document.getElementById("posTotal").value = (shares * price).toFixed(2);
    });
  });

  // Initialize
  updateExchangeRate();
  updateDashboard();
  setInterval(updateExchangeRate, 60000);
});