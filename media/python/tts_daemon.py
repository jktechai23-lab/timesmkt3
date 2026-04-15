#!/usr/bin/env python3
"""
tts_daemon.py — Daemon TTS do timesmkt3 (Chatterbox VC + Edge TTS)

Pipeline por requisição:
  1. edge_tts (pt-BR-FranciscaNeural) gera fala nativa PT-BR em mp3
  2. ChatterboxVC converte o timbre para a voz do voice-ref escolhido
  3. ffmpeg converte wav → mp3 e devolve os bytes na resposta HTTP

Por que um daemon em vez de subprocess por chamada:
  O batch de narrações do timesmkt3 roda várias gerações em série. Cada
  `python3 -c "import torch; ChatterboxVC.from_pretrained(...)"` custa ~10s
  de cold start. O daemon carrega o modelo uma vez na inicialização e
  mantém em VRAM, baixando o overhead por chamada para ~3s.

Uso:
  uvicorn tts_daemon:app --host 127.0.0.1 --port 7860

Roda no conda env 'chatterbox' (precisa de fastapi, uvicorn, edge-tts,
chatterbox + suas deps).
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel

# ── Configuração ────────────────────────────────────────────────────────────

THIS_DIR = Path(__file__).resolve().parent
VOICE_REFS_DIR = THIS_DIR.parent / "voice-refs"
EDGE_VOICE_DEFAULT = "pt-BR-FranciscaNeural"

EDGE_VOICES = {
    "pt":    "pt-BR-FranciscaNeural",
    "pt-br": "pt-BR-FranciscaNeural",
    "en":    "en-US-JennyNeural",
    "es":    "es-MX-DaliaNeural",
    "fr":    "fr-FR-DeniseNeural",
    "de":    "de-DE-KatjaNeural",
    "it":    "it-IT-ElsaNeural",
}

# ── Estado do daemon (carregado uma vez) ────────────────────────────────────

_state: dict = {
    "model": None,
    "device": None,
    "sr": None,
    "loaded_at": None,
    "voices": {},  # nome → Path do .wav
}


def _discover_voices() -> dict[str, Path]:
    if not VOICE_REFS_DIR.exists():
        return {}
    return {
        p.stem: p
        for p in sorted(VOICE_REFS_DIR.glob("*.wav"))
        if p.is_file()
    }


def _pick_device() -> str:
    if not torch.cuda.is_available():
        return "cpu"
    try:
        free_bytes, _ = torch.cuda.mem_get_info()
        if free_bytes / 1e9 < 1.5:
            print(f"[daemon] VRAM insuficiente, caindo para CPU", flush=True)
            return "cpu"
    except Exception:
        pass
    return "cuda"


def _load_model():
    t0 = time.time()
    device = _pick_device()
    print(f"[daemon] carregando ChatterboxVC (device={device})...", flush=True)

    from chatterbox.vc import ChatterboxVC
    try:
        model = ChatterboxVC.from_pretrained(device=device)
    except Exception as e:
        if device == "cuda":
            print(f"[daemon] falha em CUDA ({e}), tentando CPU", flush=True)
            torch.cuda.empty_cache()
            model = ChatterboxVC.from_pretrained(device="cpu")
            device = "cpu"
        else:
            raise

    _state["model"] = model
    _state["device"] = device
    _state["sr"] = model.sr
    _state["loaded_at"] = time.time()
    _state["voices"] = _discover_voices()

    print(
        f"[daemon] modelo carregado em {time.time() - t0:.1f}s "
        f"(device={device}, sr={model.sr}, "
        f"voices={list(_state['voices'].keys())})",
        flush=True,
    )


# ── FastAPI app ─────────────────────────────────────────────────────────────

app = FastAPI(title="timesmkt3 TTS Daemon", version="1.0.0")


@app.on_event("startup")
def _startup():
    _load_model()


class TTSRequest(BaseModel):
    text: str
    voice: str = "rachel"
    lang: str = "pt"
    # Parâmetros opcionais de override (hoje só bitrate do mp3 final)
    bitrate: str = "128k"


@app.get("/health")
def health():
    return {
        "ok": _state["model"] is not None,
        "device": _state["device"],
        "sr": _state["sr"],
        "loaded_at": _state["loaded_at"],
        "voices_available": list(_state["voices"].keys()),
        "voice_refs_dir": str(VOICE_REFS_DIR),
    }


@app.get("/voices")
def voices():
    return {
        "voices": [
            {"name": name, "ref": str(path), "size_bytes": path.stat().st_size}
            for name, path in _state["voices"].items()
        ]
    }


@app.post("/tts/vc")
async def tts_vc(req: TTSRequest):
    if _state["model"] is None:
        raise HTTPException(503, "model not loaded")

    # Re-scan voices se o conjunto mudar sem restart (dev-friendly)
    if req.voice not in _state["voices"]:
        _state["voices"] = _discover_voices()
    if req.voice not in _state["voices"]:
        raise HTTPException(
            404,
            f"voice '{req.voice}' not found. available: "
            f"{list(_state['voices'].keys())}",
        )

    ref_path = _state["voices"][req.voice]
    edge_voice = EDGE_VOICES.get(req.lang.lower(), EDGE_VOICE_DEFAULT)

    with tempfile.TemporaryDirectory(prefix="ttsdaemon_") as tmp:
        tmp_dir = Path(tmp)
        edge_mp3 = tmp_dir / "edge.mp3"
        out_wav = tmp_dir / "out.wav"
        out_mp3 = tmp_dir / "out.mp3"

        # Passo 1: Edge TTS (PT-BR nativo)
        t0 = time.time()
        try:
            import edge_tts
            communicate = edge_tts.Communicate(req.text, edge_voice)
            await communicate.save(str(edge_mp3))
        except Exception as e:
            raise HTTPException(502, f"edge_tts failed: {e}")
        t_edge = time.time() - t0

        if not edge_mp3.exists() or edge_mp3.stat().st_size < 1000:
            raise HTTPException(502, "edge_tts produced empty file")

        # Passo 2: Chatterbox VC (transfere o timbre)
        t1 = time.time()
        try:
            wav_tensor = _state["model"].generate(
                audio=str(edge_mp3),
                target_voice_path=str(ref_path),
            )
        except Exception as e:
            raise HTTPException(500, f"chatterbox vc failed: {e}")
        t_vc = time.time() - t1

        audio_np = wav_tensor.squeeze().cpu().numpy()
        sf.write(str(out_wav), audio_np, _state["sr"])

        # Passo 3: wav → mp3 (bitrate controlável via req.bitrate)
        t2 = time.time()
        proc = subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(out_wav),
                "-codec:a", "libmp3lame", "-b:a", req.bitrate,
                str(out_mp3),
            ],
            capture_output=True,
            timeout=60,
        )
        if proc.returncode != 0:
            raise HTTPException(
                500,
                f"ffmpeg failed: {proc.stderr.decode('utf-8', 'ignore')[-400:]}",
            )
        t_mp3 = time.time() - t2

        audio_bytes = out_mp3.read_bytes()
        duration_audio = len(audio_np) / _state["sr"]
        total = time.time() - t0

        print(
            f"[daemon] tts voice={req.voice} lang={req.lang} "
            f"chars={len(req.text)} audio={duration_audio:.1f}s "
            f"edge={t_edge:.1f}s vc={t_vc:.1f}s mp3={t_mp3:.1f}s total={total:.1f}s",
            flush=True,
        )

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "X-TTS-Voice": req.voice,
                "X-TTS-Lang": req.lang,
                "X-TTS-Device": _state["device"],
                "X-TTS-Duration-Seconds": f"{duration_audio:.2f}",
                "X-TTS-Elapsed-Edge-S":   f"{t_edge:.2f}",
                "X-TTS-Elapsed-VC-S":     f"{t_vc:.2f}",
                "X-TTS-Elapsed-Total-S":  f"{total:.2f}",
            },
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("TTS_DAEMON_PORT", "7860"))
    host = os.environ.get("TTS_DAEMON_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, log_level="info")
