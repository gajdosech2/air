/* ============================================================
   AIR — Air Quality Dashboard · Application Logic
   ============================================================ */

(() => {
  "use strict";

  // ── Metric definitions ──────────────────────────────────────
  const METRICS = {
    pm25:     { label: "PM2.5",     unit: "µg/m³", color: "#f472b6", icon: "🫁", key: "pm25" },
    temp:     { label: "Temp",      unit: "°C",    color: "#fb923c", icon: "🌡️", key: "temp" },
    humidity: { label: "Humidity",  unit: "%",     color: "#38bdf8", icon: "💧", key: "humidity" },
    eco2:     { label: "eCO₂",     unit: "ppm",   color: "#a78bfa", icon: "☁️", key: "eco2" },
    tvoc:     { label: "TVOC",     unit: "ppb",   color: "#34d399", icon: "🧪", key: "tvoc" },
    ch2o:     { label: "CH₂O",     unit: "µg/m³", color: "#fbbf24", icon: "⚗️", key: "ch2o_value" },
  };

  const QUALITY_ICONS = {
    great: '<i class="fa-solid fa-leaf"></i>',
    good: '<i class="fa-solid fa-thumbs-up"></i>',
    ok: '<i class="fa-solid fa-face-meh"></i>',
    poor: '<i class="fa-solid fa-smog"></i>',
    bad: '<i class="fa-solid fa-skull-crossbones"></i>',
  };

  // ── State ───────────────────────────────────────────────────
  let readings = [];
  let activeMetric = "pm25";
  let activeRange = "24h";
  let chart = null;
  let refreshTimer = null;

  // ── DOM refs ────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const loadingOverlay = $("loadingOverlay");
  const errorBanner = $("errorBanner");
  const errorText = $("errorText");
  const statusDot = $("statusDot");
  const statusText = $("statusText");
  const aqBanner = $("aqBanner");
  const aqBadge = $("aqBadge");
  const aqValue = $("aqValue");
  const aqTimestamp = $("aqTimestamp");
  const chartTitle = $("chartTitle");
  const chartCanvas = $("mainChart");
  const noData = $("noData");
  const chartSection = $("chartSection");

  // ── API ─────────────────────────────────────────────────────
  const API_BASE = "/api/readings";

  async function fetchReadings(range) {
    const url = `${API_BASE}?range=${range}&limit=5000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  // ── Data loading ────────────────────────────────────────────
  async function loadData() {
    try {
      hideError();
      readings = await fetchReadings(activeRange);

      if (readings.length === 0) {
        showNoData();
        setStatus(false);
        hideLoading();
        return;
      }

      hideNoData();
      setStatus(true);
      updateCurrentValues();
      updateChart();
      hideLoading();
    } catch (err) {
      console.error("Failed to load data:", err);
      showError(err.message);
      setStatus(false);
      hideLoading();
    }
  }

  // ── Update current values (latest reading) ─────────────────
  function updateCurrentValues() {
    const latest = readings[readings.length - 1];
    if (!latest) return;

    const data = latest.data;

    // Update metric cards
    for (const [id, meta] of Object.entries(METRICS)) {
      const el = $(`val-${id}`);
      if (el) {
        const raw = data[meta.key];
        el.textContent = raw !== undefined && raw !== null ? raw : "—";
      }
    }

    // Update air quality banner
    const quality = (data.air_quality || "").toLowerCase();
    const normalizedQuality = normalizeQuality(quality);
    aqValue.textContent = quality || "—";
    aqBanner.dataset.quality = normalizedQuality;
    aqBadge.dataset.quality = normalizedQuality;
    aqBadge.innerHTML = QUALITY_ICONS[normalizedQuality] || '<i class="fa-solid fa-leaf"></i>';

    // Timestamp
    const ts = new Date(latest.recorded_at);
    aqTimestamp.textContent = formatTimestamp(ts);
  }

  function normalizeQuality(q) {
    if (["great", "excellent"].includes(q)) return "great";
    if (["good"].includes(q)) return "good";
    if (["ok", "moderate", "medium"].includes(q)) return "ok";
    if (["poor"].includes(q)) return "poor";
    if (["bad", "unhealthy", "hazardous"].includes(q)) return "bad";
    return "great";
  }

  // ── Chart ───────────────────────────────────────────────────
  function updateChart() {
    const meta = METRICS[activeMetric];
    chartTitle.textContent = `${meta.label} — History`;

    const dataPoints = readings
      .map((r) => ({
        x: new Date(r.recorded_at),
        y: r.data[meta.key],
      }))
      .filter((d) => d.y !== undefined && d.y !== null);

    if (chart) {
      chart.data.datasets[0].data = dataPoints;
      chart.data.datasets[0].label = meta.label;
      chart.data.datasets[0].borderColor = meta.color;
      chart.data.datasets[0].backgroundColor = hexToRgba(meta.color, 0.08);
      chart.data.datasets[0].pointBackgroundColor = meta.color;
      chart.options.scales.y.title.text = meta.unit;
      chart.update("none");
    } else {
      createChart(dataPoints, meta);
    }
  }

  function createChart(dataPoints, meta) {
    const ctx = chartCanvas.getContext("2d");

    chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: meta.label,
            data: dataPoints,
            borderColor: meta.color,
            backgroundColor: hexToRgba(meta.color, 0.08),
            borderWidth: 2,
            pointRadius: dataPoints.length > 100 ? 0 : 3,
            pointHoverRadius: 5,
            pointBackgroundColor: meta.color,
            pointBorderColor: "transparent",
            fill: true,
            tension: 0.35,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(17, 24, 39, 0.95)",
            titleColor: "#f1f5f9",
            bodyColor: "#94a3b8",
            borderColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            titleFont: { family: "'Inter', sans-serif", size: 13, weight: "600" },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
            callbacks: {
              title: (items) => {
                const d = new Date(items[0].parsed.x);
                return d.toLocaleString(undefined, {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                });
              },
              label: (item) => ` ${item.dataset.label}: ${item.parsed.y} ${meta.unit}`,
            },
          },
        },
        scales: {
          x: {
            type: "time",
            time: {
              tooltipFormat: "MMM d, HH:mm",
              displayFormats: {
                minute: "HH:mm",
                hour: "HH:mm",
                day: "MMM d",
                week: "MMM d",
                month: "MMM yyyy",
              },
            },
            grid: {
              color: "rgba(255,255,255,0.04)",
              drawBorder: false,
            },
            ticks: {
              color: "#64748b",
              font: { size: 11, family: "'Inter', sans-serif" },
              maxTicksLimit: 8,
              maxRotation: 0,
            },
            border: { display: false },
          },
          y: {
            grid: {
              color: "rgba(255,255,255,0.04)",
              drawBorder: false,
            },
            ticks: {
              color: "#64748b",
              font: { size: 11, family: "'JetBrains Mono', monospace" },
              padding: 8,
            },
            title: {
              display: true,
              text: meta.unit,
              color: "#64748b",
              font: { size: 11, family: "'Inter', sans-serif" },
            },
            border: { display: false },
          },
        },
        animation: {
          duration: 400,
          easing: "easeOutQuart",
        },
      },
    });
  }

  // ── Event handlers ──────────────────────────────────────────

  // Range buttons
  document.getElementById("rangeControls").addEventListener("click", (e) => {
    const btn = e.target.closest(".range-btn");
    if (!btn) return;
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeRange = btn.dataset.range;
    showLoading();
    loadData();
  });

  // Metric card clicks
  document.getElementById("metricsGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".metric-card");
    if (!card) return;
    const metric = card.dataset.metric;
    if (!metric || !METRICS[metric]) return;

    document.querySelectorAll(".metric-card").forEach((c) => c.classList.remove("active"));
    card.classList.add("active");
    activeMetric = metric;
    updateChart();
  });

  // ── UI helpers ──────────────────────────────────────────────
  function showLoading() {
    loadingOverlay.classList.remove("hidden");
  }

  function hideLoading() {
    loadingOverlay.classList.add("hidden");
  }

  function showError(msg) {
    errorText.textContent = msg;
    errorBanner.classList.add("visible");
  }

  function hideError() {
    errorBanner.classList.remove("visible");
  }

  function setStatus(online) {
    if (online) {
      statusDot.classList.remove("offline");
      statusText.textContent = "Live";
    } else {
      statusDot.classList.add("offline");
      statusText.textContent = "Offline";
    }
  }

  function showNoData() {
    noData.style.display = "";
    chartSection.style.display = "none";
    document.getElementById("metricsGrid").style.display = "none";
    aqBanner.style.display = "none";
  }

  function hideNoData() {
    noData.style.display = "none";
    chartSection.style.display = "";
    document.getElementById("metricsGrid").style.display = "";
    aqBanner.style.display = "";
  }

  function formatTimestamp(d) {
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ── Auto-refresh ────────────────────────────────────────────
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      loadData();
    }, 60000); // every 60 seconds
  }

  // ── Init ────────────────────────────────────────────────────
  loadData();
  startAutoRefresh();
})();
