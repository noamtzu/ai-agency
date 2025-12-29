from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def strip_exif_and_resize_to_square_1024(src_path: Path, dst_path: Path) -> tuple[int, int]:
    """Loads an image, removes EXIF by re-encoding, fixes orientation, and resizes to 1024x1024."""
    with Image.open(src_path) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("RGB")
        im = ImageOps.fit(im, (1024, 1024), method=Image.Resampling.LANCZOS)
        ensure_dir(dst_path.parent)
        im.save(dst_path, format="JPEG", quality=92, optimize=True)
        return im.size


def save_upload_to_tmp(upload_bytes: bytes, tmp_dir: Path, suffix: str) -> Path:
    ensure_dir(tmp_dir)
    tmp_path = tmp_dir / f"upload-{uuid.uuid4().hex}{suffix}"
    tmp_path.write_bytes(upload_bytes)
    return tmp_path


def safe_suffix(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return ext
    return ".jpg"


def make_public_rel_path(*parts: str) -> str:
    return "/".join(parts)


def storage_path(storage_dir: str, rel_path: str) -> Path:
    # rel_path always uses forward slashes
    return Path(storage_dir) / Path(rel_path)
