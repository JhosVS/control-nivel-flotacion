# Simulación de control de nivel feedback-feedforward en un banco de flotación

Simulación en Python (Flask) del control de nivel de un banco de **3 tanques en serie** con **bombas peristálticas**, basada en el artículo:

> Quintanilla, P., Navia, D., Moreno, F., Neethling, S. J., Brito-Parada, P. R. (2023).
> *A methodology to implement a closed-loop feedback-feedforward level control in a laboratory-scale flotation bank using peristaltic pumps.*
> MethodsX 10, 102081. https://doi.org/10.1016/j.mex.2023.102081 (licencia CC BY 4.0)

La simulación se ve en el navegador: tanques dibujados, sensores de nivel que cambian de color, bombas que giran y una gráfica del nivel en el tiempo.

## Qué hace

- Simula cada tanque como un proceso integrador (el nivel solo se estabiliza si hay un controlador).
- Simula los sensores de nivel: convierte el nivel a bits de 16 bits, agrega ruido y lo filtra con una mediana móvil.
- Controla el nivel con un PI sintonizado con las reglas SIMC del artículo.
- Permite comparar dos estrategias:
  - **Solo Feedback:** corrige cuando el nivel ya se alejó de la consigna.
  - **Feedback + Feedforward:** además mide el caudal que entra y ajusta la bomba de inmediato.
- Permite cambiar el caudal de entrada al Tanque 1 mientras corre la simulación (esto **no** está en el artículo; es un añadido nuestro).
- Muestra el error acumulado (IAE) de ambas estrategias bajo el mismo escenario.

## Estructura

```
proyecto_flotacion/
├── app.py                  # Simulación (modelo, sensores, control) y API Flask
├── templates/
│   └── index.html          # Estructura de la página
└── static/
    ├── css/style.css       # Estilos
    └── js/app.js           # Dibujo de los tanques, animación y gráfica
```

## Cómo ejecutarlo

Requisitos: Python 3.9 o superior.

```bash
pip install flask numpy
python app.py
```

Abre http://127.0.0.1:5000 en el navegador.

## Uso

1. Elige la estrategia de control (por defecto, **Solo reacciona**).
2. Pulsa **Simular**. La velocidad se ajusta con el selector de velocidad.
3. Mueve la barra de **Caudal de entrada al Tanque 1** durante la simulación y suéltala para ver cómo se adaptan las bombas.
4. Cambia de estrategia a mitad de la simulación para comparar el mismo escenario con otro controlador.
5. Revisa la tabla de error acumulado al final.

### Colores del sensor de nivel

| Color | Significado |
|-------|-------------|
| Verde | El nivel está en la consigna (36 cm) |
| Rojo  | Nivel alto: la bomba saca más líquido |
| Azul  | Nivel bajo: la bomba saca menos líquido |

## Modelo matemático

Las ecuaciones también están comentadas en `simulate()` de `app.py`.

Proceso (balance de masa de cada tanque, con retardo `θ` de la bomba):

```
dh/dt = k' · ( Q_in(t) − Q_out(t − θ) )
h[k+1] = h[k] + Δt · dh/dt            (Euler explícito)
```

Controlador PI en forma incremental, con feedforward:

```
e[k]   = y_sp − y_medido[k]
ΔU_PI  = Kc · ( (e[k] − e[k−1]) + Δt/τi · e[k] )
ΔQ     = Q_in[k] − Q_in[k−1]
u[k]   = u[k−1] + ΔU_PI + Kff · ΔQ        (limitado al rango de la bomba)
```

`Kc` es negativo: si el nivel sube, hay que aumentar el caudal de salida.

Sensor de nivel (calibración lineal del artículo) y bomba:

```
h = a · bits + b            bits = 0 … 32767
Q = pendiente · bits
```

Error acumulado:

```
IAE = ∫ |y_sp − h| dt
```

### Parámetros tomados del artículo

| Parámetro | Tanque 1 | Tanque 2 | Tanque 3 |
|-----------|----------|----------|----------|
| θ (retardo, s) | 7 | 6 | 3 |
| Kc ((L/min)/cm) | −62 | −76 | −85 |
| τi (s) | 56 | 30 | 44 |
| Kff | 0.8 | 0.8 | 1.0 |

`k' = 0.001018 cm·s⁻¹·(L/min)⁻¹` (Tabla 2), tamaño del tanque 30 × 30 × 45 cm (Fig. 2), calibraciones de sensores y bombas de las Figs. 9 y 11, muestreo de 1 s y filtro de mediana de 10 muestras.

## Diferencias respecto al artículo

- El artículo es experimental; aquí todo es simulado, incluido el ruido del sensor (40 bits, valor supuesto).
- El feedforward se implementó en **forma incremental** (`u[k] = u[k−1] + ΔU_PI + Kff·ΔQ`). Aplicar `Kff·ΔQ` tal cual solo daría un pulso y no corregiría una perturbación sostenida.
- Se usa el mismo `k'` para el efecto del caudal de entrada y de salida.
- La consigna es fija en 36 cm y el caudal de entrada por defecto es 45 L/min.
- El control manual del caudal de entrada es un añadido propio, no parte del artículo.
- No se simulan el aire, la espuma ni las cámaras; solo el control de nivel.

## Autores

[Nombres del equipo] — [Curso / Universidad] — [Año]