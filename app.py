"""
Simulación del control de nivel feedback-feedforward en un banco de flotación
de 3 tanques en serie con bombas peristálticas
"""
from collections import deque

import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# ----------------------------------------------------------------------------
# PARÁMETROS (todos tomados del artículo, salvo los marcados como supuesto)
# ----------------------------------------------------------------------------
DT = 1.0            # tiempo de muestreo [s]
T_TOTAL = 1800      # duración de la simulación [s] (30 min)
H_MAX = 45.0        # altura del tanque [cm]                       (Fig. 2)
MEDFILT_WIN = 10    # ventana del filtro de mediana [muestras]     (medfilt1)
NOISE_BITS = 40     # ruido del sensor [bits]                      (supuesto)

K_PRIME = 0.001018  # |k'| ganancia del proceso integrador [cm s^-1 L/min^-1] (Tabla 2)
BASE_FEED = 45.0

CELLS = [
    # theta: retardo [s] | Kc: (L/min)/cm | ti: s | Kff: ganancia feedforward
    # a, b: calibración del sensor  h = a*bits + b                (Fig. 11)
    # slope: calibración de la bomba  Q[L/min] = slope*bits       (Fig. 9)
    # qmax: caudal máximo de la bomba
    dict(theta=7, Kc=-62, ti=56, Kff=0.8, a=-0.0018, b=40.1363, slope=0.0029, qmax=81),
    dict(theta=6, Kc=-76, ti=30, Kff=0.8, a=-0.0019, b=43.8823, slope=0.0033, qmax=92),
    dict(theta=3, Kc=-85, ti=44, Kff=1.0, a=-0.0020, b=41.2930, slope=0.0033, qmax=92),
]


# ----------------------------------------------------------------------------
# ESCENARIO (perturbación y consigna)
# ----------------------------------------------------------------------------
def feed_flow(t, events):
    """Caudal que entra al tanque 1 [L/min]. events = [(tiempo_s, caudal), ...] hechos con la barra."""
    q = BASE_FEED
    for t_evento, q_evento in events:
        if t >= t_evento:
            q = q_evento
    return q

def parse_events(raw):
    """Convierte '300:60;600:30' en [(300.0, 60.0), (600.0, 30.0)]."""
    events = []
    for part in raw.split(";"):
        try:
            t, q = part.split(":")
            events.append((float(t), min(max(float(q), 0.0), 100.0)))
        except ValueError:
            continue
    return sorted(events)

def setpoint(t):
    """Nivel deseado de pulpa [cm] (igual para los 3 tanques)."""
    return 36.0 # if t < 900 else 34.0


# ----------------------------------------------------------------------------
# SIMULACIÓN (Y FÓRMULAS MATEMÁTICAS UTILIZADAS)
# ----------------------------------------------------------------------------
def simulate(use_ff: bool, events=(), seed: int = 1):
    """
    Modelo de cada tanque (proceso integrador, Tabla 2 del artículo):

        Balance de masa:  dh/dt = k' * ( Q_in(t) - Q_out(t - theta) )          (1)

    Q_out es el caudal que saca la bomba (llega con retardo theta).
    Integración de Euler:  h[k+1] = h[k] + dt * dh/dt

    Controlador PI en forma incremental (Eq. 1 y 7 del artículo):

        e[k]  = y_sp - y_medido[k]                                             (2)
        dU_PI = Kc * ( (e[k] - e[k-1]) + dt/ti * e[k] )                        (3)
        dQ    = Q_in[k] - Q_in[k-1]                (Eq. 8, feedforward)        (4)
        u[k]  = u[k-1] + dU_PI + Kff * dQ          (limitado al rango bomba)   (5)

    Kc es negativo: si el nivel sube (e < 0) hay que aumentar el caudal de salida.

    Error acumulado:  IAE = integral de |y_sp - h| dt                          (6)
    """
    rng = np.random.default_rng(seed)
    n = int(T_TOTAL / DT)
    nc = len(CELLS)

    h = [setpoint(0)] * nc                       # nivel real [cm]
    u = [BASE_FEED] * nc                         # caudal pedido a la bomba [L/min]
    e_prev = [0.0] * nc
    qin_prev = [BASE_FEED] * nc
    delay = [deque([BASE_FEED] * c["theta"]) for c in CELLS]   # retardo theta
    raw_hist = [[] for _ in range(nc)]           # lecturas del sensor para la mediana

    out = {k: [[] for _ in range(nc)] for k in
           ("h", "hm", "sp", "u", "qin", "bits_lvl")}
    iae = [0.0] * nc

    for k in range(n):
        t = k * DT
        sp = setpoint(t)

        # 1) caudal real que sacan las bombas (sale de la cola con retardo)
        qout = [delay[i].popleft() for i in range(nc)]
        # 2) caudal de entrada: alimentación al tanque 1; salida del tanque anterior al resto
        qin = [feed_flow(t, events)] + [qout[i - 1] for i in range(1, nc)]

        for i, c in enumerate(CELLS):
            # Sensor simulado: nivel -> bits (INT de 16 bits) + ruido
            bits = (h[i] - c["b"]) / c["a"] + rng.normal(0, NOISE_BITS)
            bits = int(np.clip(round(bits), 0, 32767))
            # Bits -> cm y filtro de mediana móvil
            raw_hist[i].append(c["a"] * bits + c["b"])
            hm = float(np.median(raw_hist[i][-MEDFILT_WIN:]))

            # Controlador PI + feedforward (ecuaciones 2 a 5)
            e = sp - hm
            du_pi = c["Kc"] * ((e - e_prev[i]) + DT / c["ti"] * e)
            dq = qin[i] - qin_prev[i]
            du_ff = c["Kff"] * dq if use_ff else 0.0
            u[i] = float(np.clip(u[i] + du_pi + du_ff, 0.0, c["qmax"]))
            e_prev[i], qin_prev[i] = e, qin[i]

            # La bomba aplica el caudal con retardo y el tanque cambia de nivel (ec. 1)
            delay[i].append(u[i])
            h[i] = float(np.clip(h[i] + DT * K_PRIME * (qin[i] - qout[i]), 0, H_MAX))

            iae[i] += abs(sp - h[i]) * DT        # ecuación 6

            out["h"][i].append(round(h[i], 3))
            out["hm"][i].append(round(hm, 3))
            out["sp"][i].append(sp)
            out["u"][i].append(round(u[i], 2))
            out["qin"][i].append(round(qin[i], 2))
            out["bits_lvl"][i].append(bits)

    out["iae"] = [round(v, 1) for v in iae]
    return out


# ----------------------------------------------------------------------------
# RUTAS FLASK
# ----------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/simulate")
def api_simulate():
    use_ff = request.args.get("ff", "0") == "1"
    events = parse_events(request.args.get("events", ""))
    sin_ff = simulate(False, events)
    con_ff = simulate(True, events)
    elegido = con_ff if use_ff else sin_ff
    return jsonify(dict(dt=DT, ff=use_ff, h_max=H_MAX, **elegido, iae_fb=sin_ff["iae"], iae_ff=con_ff["iae"]))


if __name__ == "__main__":
    app.run(debug=True)