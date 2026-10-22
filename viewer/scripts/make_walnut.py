"""Generate tileable walnut textures (albedo, normal, roughness) and the MDF
backer texture for the viewer.

Grain runs along +x (texture u). All noise is built in the frequency domain, so
every layer tiles seamlessly. Run: python3 scripts/make_walnut.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

N = 2048
OUT = Path(__file__).resolve().parent.parent / "public" / "tex"
OUT.mkdir(parents=True, exist_ok=True)

ky = np.fft.fftfreq(N)[:, None] * N
kx = np.fft.fftfreq(N)[None, :] * N


def noise(fx, fy, power=2.0, seed=0):
    """Periodic gaussian noise, low-passed; fx/fy are corner frequencies in cycles per tile."""
    w = np.random.default_rng(seed).standard_normal((N, N))
    k = np.sqrt((kx / fx) ** 2 + (ky / fy) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(w) / (1.0 + k ** power)))
    return (out - out.mean()) / out.std()


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


y = (np.arange(N)[:, None] / N) * np.ones((1, N))
G = 1 / 0.6  # grain scale: features are 40% smaller than the first pass (tile size unchanged)

# growth rings, warped so the stripes wander like straight-grained walnut
warp = noise(0.7 * G, 1.6 * G, 4.0, seed=1) * 1.1 + noise(1.5 * G, 5 * G, 4.0, seed=2) * 0.12
spacing = noise(0.01, 3 * G, 4.0, seed=10)                # uneven ring spacing, varies across the board only
phase = y * round(26 * G) + warp + spacing * 1.2
r = phase - np.floor(phase)
late = smoothstep(0.35, 0.93, r) * (1 - smoothstep(0.93, 1.0, r))  # dark latewood band, soft lead-in, crisp edge
late *= 0.55 + 0.45 * smoothstep(-1.0, 1.0, noise(2 * G, 6 * G, 2, seed=3))

fiber = noise(3 * G, 560, 1.6, seed=4)                   # fine long streaks
streak = smoothstep(0.6, 2.4, noise(1.5 * G, 60 * G, 2.0, seed=5))  # occasional dark mineral streaks
blotch = noise(1.0 * G, 2.5 * G, 3.0, seed=6)               # broad colour drift
pores_raw = noise(40, 700, 1.4, seed=7)
pores = smoothstep(1.7, 2.8, pores_raw)                    # short dark dashes along the grain
figure = 0.5 + 0.5 * np.sin(2 * np.pi * (np.arange(N)[None, :] / N * round(23 * G) + noise(G, 3 * G, 2, seed=8) * 0.8))
figure = figure * smoothstep(0.2, 1.4, noise(1.5 * G, 2 * G, 2, seed=9))  # fiddleback shimmer in patches

t = 0.40 + 0.10 * blotch + 0.32 * late + 0.06 * fiber + 0.25 * streak + 0.35 * pores - 0.06 * figure
t = np.clip(t, 0, 1)

stops = np.array([0.0, 0.35, 0.7, 1.0])
cols = np.array([
    [118, 86, 64],
    [88, 62, 46],
    [56, 39, 29],
    [29, 20, 15],
], dtype=float)
albedo = np.stack([np.interp(t, stops, cols[:, c]) for c in range(3)], axis=-1)
# slight purple-grey cast in the darkest wood, typical of black walnut
albedo[..., 2] += 6 * smoothstep(0.6, 1.0, t)
Image.fromarray(np.clip(albedo, 0, 255).astype(np.uint8)).save(OUT / "walnut_albedo.jpg", quality=93)

h = -0.9 * late - 0.08 * fiber - 1.4 * pores - 0.3 * streak
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
s = 1.6
n = np.stack([-dx * s, dy * s, np.ones_like(h)], axis=-1)  # +y up in texture space (OpenGL convention)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(OUT / "walnut_normal.png")

rough = 0.5 + 0.08 * late + 0.25 * pores + 0.05 * fiber - 0.08 * figure
Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(OUT / "walnut_rough.jpg", quality=92)

# MDF backer: flat brown with only a faint pressed-fibre speckle
speck = noise(700, 700, 1.2, seed=11) * 0.6 + noise(60, 60, 2.0, seed=12) * 0.4
flecks = smoothstep(2.2, 3.2, noise(500, 500, 1.0, seed=13))
mdf = np.array([112, 80, 55], dtype=float)[None, None, :] * (1 + 0.025 * speck - 0.12 * flecks)[..., None]
Image.fromarray(np.clip(mdf, 0, 255).astype(np.uint8)).save(OUT / "mdf_albedo.jpg", quality=92)
print("wrote", OUT)
