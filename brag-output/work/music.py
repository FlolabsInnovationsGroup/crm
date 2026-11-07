import json
import wave
from pathlib import Path

import numpy as np

WORK = Path(__file__).resolve().parent
SR = 44100
DUR = 90.0
N = int(SR * DUR)
BEAT = 60 / 96
BAR = BEAT * 4
rng = np.random.default_rng(7)


def hz(note):
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    return 440.0 * 2 ** ((names[note[0]] + 12 * (int(note[1:]) - 4)) / 12)


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tone(freq, length, partials=((1, 1.0), (2, 0.25), (3, 0.08)), detune=0.0):
    t = np.arange(int(length * SR)) / SR
    out = np.zeros_like(t)
    for mult, amp in partials:
        out += amp * np.sin(2 * np.pi * freq * mult * (1 + detune) * t)
    return out


def pluck(freq, length=1.2, decay=0.28, bright=0.35):
    t = np.arange(int(length * SR)) / SR
    body = np.sin(2 * np.pi * freq * t) + bright * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / (decay * 0.4))
    attack = np.minimum(1, t / 0.004)
    return body * np.exp(-t / decay) * attack


def add(buf, sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i + len(sig) <= 0:
        return
    s = sig[: max(0, N - i)]
    left, right = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    buf[0, i:i + len(s)] += s * gain * left
    buf[1, i:i + len(s)] += s * gain * right


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def reverb(buf, seconds=2.2, mix=0.22):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.empty_like(buf)
    size = 1 << int(np.ceil(np.log2(buf.shape[1] + n)))
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (seconds / 6.5))
        ir[: int(0.02 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        wet = np.fft.irfft(np.fft.rfft(buf[ch], size) * np.fft.rfft(ir, size), size)[: buf.shape[1]]
        out[ch] = buf[ch] * (1 - mix) + wet * mix
    return out


CHORDS = [["A2", "A3", "C4", "E4"], ["F2", "F3", "A3", "C4"], ["C3", "G3", "C4", "E4"], ["G2", "G3", "B3", "D4"]]
ARP = [["A4", "C5", "E5", "A5"], ["F4", "A4", "C5", "F5"], ["E4", "G4", "C5", "E5"], ["D4", "G4", "B4", "D5"]]


def intensity(t):
    if t < 6.6:
        return 0.0
    if t < 84.4:
        return 1.0
    return 0.0


music = np.zeros((2, N))

# pads: one chord per bar, soft attack, overlapping release
bar = 0
while bar * BAR < DUR:
    start = bar * BAR
    chord = CHORDS[bar % 4] if start < 84.4 else ["A2", "A3", "C4", "E4", "B4"]
    length = BAR + 1.2 if start < 84.4 else DUR - start
    for k, note in enumerate(chord):
        for det, pan in ((-0.0018, -0.5), (0.0018, 0.5)):
            sig = tone(hz(note), length, detune=det) * env_adsr(int(length * SR), 0.8 if start > 0 else 2.5, 1.2)
            add(music, sig, start, 0.05 if k == 0 else 0.032, pan)
    bar += 1

# arpeggio and percussion from the reveal on
step = BEAT / 2
i = 0
while i * step < DUR:
    t = i * step
    if intensity(t) > 0:
        chord_index = int(t // BAR) % 4
        note = ARP[chord_index][[0, 1, 2, 3, 2, 1, 2, 3][i % 8]]
        accent = 1.0 if i % 2 == 0 else 0.7
        add(music, pluck(hz(note), decay=0.22), t, 0.06 * accent, -0.35 if i % 2 else 0.35)
        if i % 4 == 0 and t > 12.4:
            kn = int(0.35 * SR)
            kt = np.arange(kn) / SR
            kick = np.sin(2 * np.pi * (45 * kt + 75 * 0.06 * (1 - np.exp(-kt / 0.06)))) * np.exp(-kt / 0.13)
            add(music, kick, t, 0.16)
        if i % 2 == 1 and t > 12.4:
            sn = int(0.05 * SR)
            shaker = np.diff(rng.standard_normal(sn + 1)) * np.exp(-np.arange(sn) / SR / 0.012)
            add(music, shaker, t, 0.012, 0.3)
    i += 1

# hook: low pulse that builds into the reveal
for k in range(10):
    t = k * BEAT
    n = int(0.5 * SR)
    kt = np.arange(n) / SR
    pulse = np.sin(2 * np.pi * hz("A1") * kt) * np.exp(-kt / 0.25)
    add(music, pulse, t, 0.06 + 0.012 * k)

sfx = np.zeros((2, N))
CUES = json.loads((WORK / "sfx.json").read_text())
for cue in CUES:
    t, kind = cue["t"], cue["k"]
    if kind == "pop":
        add(sfx, pluck(hz("E5"), 0.8, 0.12, 0.2), t, 0.10)
    elif kind == "tick":
        add(sfx, pluck(hz("A5"), 0.5, 0.06, 0.1), t, 0.06, 0.2)
    elif kind == "low":
        add(sfx, pluck(hz("C4"), 1.0, 0.25, 0.2) + 0.6 * pluck(hz("A3"), 1.0, 0.25, 0.2), t, 0.10)
    elif kind == "mic":
        add(sfx, pluck(hz("E5"), 0.3, 0.05), t, 0.07)
        add(sfx, pluck(hz("A5"), 0.3, 0.05), t + 0.08, 0.07)
    elif kind == "click":
        n = int(0.03 * SR)
        add(sfx, rng.standard_normal(n) * np.exp(-np.arange(n) / SR / 0.004), t, 0.05)
    elif kind == "success":
        add(sfx, pluck(hz("E5"), 1.0, 0.2, 0.2), t, 0.09)
        add(sfx, pluck(hz("A5"), 1.4, 0.35, 0.2), t + 0.11, 0.09)
    elif kind == "alert":
        add(sfx, pluck(hz("E5"), 0.8, 0.18, 0.2), t, 0.08)
        add(sfx, pluck(hz("C5"), 1.0, 0.25, 0.2), t + 0.12, 0.08)
    elif kind == "chime":
        add(sfx, pluck(hz("A5"), 1.6, 0.5, 0.15) + 0.5 * pluck(hz("E6"), 1.6, 0.4, 0.1), t, 0.08)
    elif kind == "reveal":
        bell = sum(pluck(hz(n), 3.0, 0.9, 0.12) for n in ("A4", "E5", "A5", "C6"))
        add(sfx, bell, t, 0.07)
    elif kind == "swell":
        n = int(1.0 * SR)
        noise = lowpass(rng.standard_normal(n), 1800)
        shape = np.sin(np.linspace(0, np.pi, n)) ** 2
        add(sfx, noise * shape, t - 0.55, 0.05, -0.2)
        add(sfx, noise[::-1] * shape, t - 0.55, 0.05, 0.2)

mix = reverb(music, 2.4, 0.28) + reverb(sfx, 1.6, 0.25)
fade = np.ones(N)
fade[: int(0.3 * SR)] = np.linspace(0, 1, int(0.3 * SR))
tail = int(3.0 * SR)
fade[-tail:] = np.linspace(1, 0, tail) ** 1.5
mix *= fade
mix /= np.max(np.abs(mix)) / 0.89

with wave.open(str(WORK / "music.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype(np.int16).tobytes())
print("music.wav written")
