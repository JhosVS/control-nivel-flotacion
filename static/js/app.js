const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("plant");
const cv = document.getElementById("chart");
const cx = cv.getContext("2d");

// Geometría (45 cm de altura real = 220 px)
const TANK_X = [110, 380, 650], TANK_Y = 100, TANK_W = 130, TANK_H = 220, H_MAX = 45;
const yOf = h => TANK_Y + TANK_H - (h / H_MAX) * TANK_H;
const DEADBAND = 0.15;   // cm de diferencia con la consigna para considerar "alto" o "bajo"

let data = null, k = 0, timer = null, paused = false;
const el = {};           // elementos SVG que se actualizan en cada cuadro

function mk(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const a in attrs) e.setAttribute(a, attrs[a]);
  svg.appendChild(e);
  return e;
}
function txt(x, y, s, size, color, anchor, weight) {
  const t = mk("text", { x, y, "font-size": size || 13, fill: color || "#1e293b",
                         "text-anchor": anchor || "middle", "font-weight": weight || "normal" });
  t.textContent = s;
  return t;
}

// Estado del sensor: compara el nivel medido con la consigna
function sensorState(i, j) {
  const err = data.hm[i][j] - data.sp[i][j];
  if (err > DEADBAND)  return ["high", "Nivel alto: la bomba saca más"];
  if (err < -DEADBAND) return ["low",  "Nivel bajo: la bomba saca menos"];
  return ["ok", "Nivel en la consigna"];
}

function drawPlant() {
  svg.innerHTML = "";
  mk("defs", {}).innerHTML =
    '<marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">' +
    '<path d="M0,0 L6,3 L0,6 z" fill="#64748b"/></marker>';

  // Entrada al sistema
  mk("line", { x1: 15, y1: 290, x2: TANK_X[0], y2: 290, stroke: "#64748b", "stroke-width": 4, "marker-end": "url(#ar)" });
  txt(15, 268, "Alimentación", 12, "#64748b", "start", "bold");
  el.qin0 = txt(15, 312, "", 12, "#2563eb", "start");

  for (let i = 0; i < 3; i++) {
    const x = TANK_X[i], cxm = x + TANK_W / 2;

    // Agua, contorno del tanque y línea de consigna
    el["water" + i] = mk("rect", { x, y: TANK_Y, width: TANK_W, height: 0, fill: "#38bdf8", opacity: 0.85 });
    mk("rect", { x, y: TANK_Y, width: TANK_W, height: TANK_H, fill: "none", stroke: "#334155", "stroke-width": 3, rx: 4 });
    el["sp" + i] = mk("line", { x1: x - 8, x2: x + TANK_W + 8, y1: 0, y2: 0, stroke: "#dc2626", "stroke-dasharray": "6,4", "stroke-width": 2 });

    // Sensor de nivel (brilla según el estado)
    mk("line", { x1: cxm, x2: cxm, y1: TANK_Y - 22, y2: TANK_Y + 12, stroke: "#64748b", "stroke-width": 2 });
    el["sensor" + i] = mk("rect", { x: cxm - 14, y: TANK_Y - 40, width: 28, height: 18, rx: 4, class: "sensor ok" });
    txt(cxm, TANK_Y - 46, "Sensor de nivel", 11, "#64748b");
    el["status" + i] = txt(cxm, TANK_Y - 62, "", 12, "#15803d", "middle", "bold");

    // Nombre y lecturas
    txt(cxm, TANK_Y + TANK_H + 24, "Tanque " + (i + 1), 15, "#0f172a", "middle", "bold");
    el["lvl" + i]  = txt(cxm, TANK_Y + TANK_H + 44, "", 13);
    el["bits" + i] = txt(cxm, TANK_Y + TANK_H + 61, "", 11, "#64748b");

    // Bomba de salida del tanque
    const px = x + TANK_W + 65, py = 290;
    mk("line", { x1: x + TANK_W, y1: 290, x2: px - 18, y2: 290, stroke: "#64748b", "stroke-width": 4 });
    const xn = i < 2 ? TANK_X[i + 1] : 888;
    mk("line", { x1: px + 18, y1: 290, x2: xn, y2: 290, stroke: "#64748b", "stroke-width": 4, "marker-end": "url(#ar)" });
    mk("circle", { cx: px, cy: py, r: 18, fill: "#fff", stroke: "#ea580c", "stroke-width": 3 });
    el["rot" + i] = mk("line", { x1: px, y1: py, x2: px + 14, y2: py, stroke: "#ea580c", "stroke-width": 3 });
    el["rotc" + i] = { px, py, ang: 0 };
    txt(px, py - 28, "Bomba " + (i + 1), 12, "#ea580c", "middle", "bold");
    el["u" + i] = txt(px, py + 38, "", 12, "#c2410c");
  }
  txt(888, 268, "Salida", 12, "#64748b", "end", "bold");

  // Leyenda
  mk("line", { x1: 15, x2: 45, y1: 24, y2: 24, stroke: "#dc2626", "stroke-dasharray": "6,4", "stroke-width": 2 });
  txt(52, 28, "Nivel deseado (consigna)", 12, "#1e293b", "start");
  mk("rect", { x: 230, y: 17, width: 16, height: 14, fill: "#38bdf8" });
  txt(252, 28, "Nivel real del líquido", 12, "#1e293b", "start");
}

function update() {
  const d = data;
  document.getElementById("tLabel").textContent = k * d.dt;
  el.qin0.textContent = d.qin[0][k].toFixed(1) + " L/min";

  for (let i = 0; i < 3; i++) {
    const hh = d.h[i][k];
    el["water" + i].setAttribute("y", yOf(hh));
    el["water" + i].setAttribute("height", TANK_Y + TANK_H - yOf(hh));
    el["sp" + i].setAttribute("y1", yOf(d.sp[i][k]));
    el["sp" + i].setAttribute("y2", yOf(d.sp[i][k]));

    const [state, msg] = sensorState(i, k);
    el["sensor" + i].setAttribute("class", "sensor " + state);
    el["status" + i].setAttribute("class", "status-" + state);
    el["status" + i].textContent = msg;

    el["lvl" + i].textContent = "Nivel medido: " + d.hm[i][k].toFixed(1) + " cm";
    el["bits" + i].textContent = "Lectura del sensor: " + d.bits_lvl[i][k] + " bits";
    el["u" + i].textContent = "Saca " + d.u[i][k].toFixed(1) + " L/min";

    // La bomba gira más rápido cuanto más caudal entrega
    const r = el["rotc" + i];
    r.ang += d.u[i][k] * 0.5;
    const a = (r.ang * Math.PI) / 180;
    el["rot" + i].setAttribute("x2", r.px + 14 * Math.cos(a));
    el["rot" + i].setAttribute("y2", r.py + 14 * Math.sin(a));
  }
  drawChart();
}

// Gráfica de nivel medido y consigna hasta el instante actual
function drawChart() {
  const W = cv.width, H = cv.height, L = 50, B = 32, T = 22, R = 12;
  const ymin = 28, ymax = 44, n = data.h[0].length;
  const X = j => L + (j / (n - 1)) * (W - L - R);
  const Y = v => T + ((ymax - v) / (ymax - ymin)) * (H - T - B);
  const total = n * data.dt;

  cx.clearRect(0, 0, W, H);
  cx.font = "11px Arial";
  cx.lineWidth = 1;
  cx.strokeStyle = "#e2e8f0";
  cx.fillStyle = "#64748b";
  for (let v = ymin; v <= ymax; v += 2) {
    cx.beginPath(); cx.moveTo(L, Y(v)); cx.lineTo(W - R, Y(v)); cx.stroke();
    cx.fillText(v, 26, Y(v) + 4);
  }
  for (let t = 0; t <= total; t += 300) cx.fillText(t, X(t / data.dt) - 8, H - 14);
  cx.fillText("Tiempo [s]", W - 62, H - 2);
  cx.fillText("Nivel [cm]", 4, 12);

  // consigna
  cx.strokeStyle = "#dc2626"; cx.lineWidth = 2; cx.setLineDash([6, 4]); cx.beginPath();
  for (let j = 0; j <= k; j++) j ? cx.lineTo(X(j), Y(data.sp[0][j])) : cx.moveTo(X(0), Y(data.sp[0][0]));
  cx.stroke(); cx.setLineDash([]);

  // niveles de los tanques
  const colors = ["#2563eb", "#16a34a", "#ea580c"];
  colors.forEach((c, i) => {
    cx.strokeStyle = c; cx.lineWidth = 1.8; cx.beginPath();
    for (let j = 0; j <= k; j++) j ? cx.lineTo(X(j), Y(data.h[i][j])) : cx.moveTo(X(0), Y(data.h[i][0]));
    cx.stroke();
    cx.fillStyle = c; cx.fillText("Tanque " + (i + 1), L + 10 + i * 80, 14);
  });
  cx.fillStyle = "#dc2626"; cx.fillText("Consigna", L + 10 + 3 * 80, 14);
}

let events = [];   // cambios de caudal hechos con la barra: [[tiempo_s, caudal_L/min], ...]

async function loadData() {
  const ff = document.getElementById("mode").value;
  const ev = events.map(e => e[0] + ":" + e[1]).join(";");
  data = await (await fetch("/api/simulate?ff=" + ff + "&events=" + encodeURIComponent(ev))).json();
  showIAE();
}

function showIAE() {
  const fb = data.iae_fb, ff = data.iae_ff;
  for (let i = 0; i < 3; i++) {
    document.getElementById("i0" + (i + 1)).textContent = fb[i];
    document.getElementById("i1" + (i + 1)).textContent = ff[i];
  }
  const sumFb = fb.reduce((a, b) => a + b, 0), sumFf = ff.reduce((a, b) => a + b, 0);
  const msg = document.getElementById("iaeVerdict");
  if (Math.abs(sumFb - sumFf) < 1) {
    msg.textContent = "Las dos estrategias dieron prácticamente lo mismo. Mueve el caudal de entrada para ver la diferencia.";
  } else {
    const mejor = sumFf < sumFb ? "Feedback + Feedforward" : "Solo Feedback";
    msg.textContent = mejor + " mantuvo mejor el nivel (error total " +
      Math.min(sumFb, sumFf).toFixed(0) + " frente a " + Math.max(sumFb, sumFf).toFixed(0) + " cm·s).";
  }
}

function tick() {
  if (paused) return;
  update();
  k += Number(document.getElementById("speed").value);   // segundos simulados por cuadro
  if (k >= data.h[0].length) {
    k = data.h[0].length - 1;
    update();
    clearInterval(timer);
  }
}

async function run() {
  clearInterval(timer);
  paused = false;
  document.getElementById("btnPause").textContent = "Pausa";
  events = [];
  document.getElementById("flow").value = 45;
  document.getElementById("flowVal").textContent = 45;

  await loadData();
  drawPlant();
  k = 0;
  timer = setInterval(tick, 50);
}

// Barra de caudal: al soltarla se agrega un cambio en el instante actual y se recalcula
document.getElementById("flow").oninput = e => {
  document.getElementById("flowVal").textContent = e.target.value;
};
document.getElementById("flow").onchange = async e => {
  if (!data) return;
  events.push([k * data.dt, Number(e.target.value)]);
  await loadData();
};
// Cambiar de estrategia a mitad de la simulación: misma perturbación, otro controlador
document.getElementById("mode").onchange = () => { if (data) loadData(); };

document.getElementById("btnRun").onclick = run;
document.getElementById("btnPause").onclick = e => {
  paused = !paused;
  e.target.textContent = paused ? "Continuar" : "Pausa";
};
run();