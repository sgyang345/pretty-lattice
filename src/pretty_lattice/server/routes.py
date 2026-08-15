from __future__ import annotations

import time
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query, Request

from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene_builder import build_scene_response
from pretty_lattice.structures.schema import (
    UnsupportedBondAlgorithmError,
    normalize_bond_algorithm,
)

router = APIRouter()
MAX_STRUCTURE_UPLOAD_BYTES = 1 * 1024 * 1024
MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024
MAX_GENERATED_FILE_BYTES = 50 * 1024 * 1024
STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview."
SAFE_GENERATED_FILE_SUFFIXES = {
    ".cif",
    ".jpg",
    ".jpeg",
    ".pdf",
    ".png",
    ".prl",
    ".stru",
    ".vasp",
    ".zip",
}


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/session-heartbeat")
def session_heartbeat(request: Request) -> dict[str, str]:
    request.app.state.session_heartbeat_seen = True
    request.app.state.session_last_heartbeat = time.monotonic()
    return {"status": "ok"}


@router.post("/structure-preview")
async def create_structure_preview(
    request: Request,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
) -> dict[str, object]:
    filename = _uploaded_filename(request)
    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    try:
        payload = await _uploaded_payload(request)
        structure = read_structure_bytes(payload, filename=filename)
        return build_scene_response(structure, bond_algorithm=normalized_bond_algorithm)
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.get("/startup-structure-preview")
def get_startup_structure_preview(
    request: Request,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
) -> dict[str, object]:
    structure_path = _startup_structure_path(request)
    if structure_path is None:
        raise HTTPException(status_code=404, detail={"message": "No startup structure file."})
    if not structure_path.is_file():
        raise HTTPException(
            status_code=404,
            detail={"message": f"Startup structure file not found: {structure_path}"},
        )

    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    try:
        structure = read_structure(structure_path)
        return {
            "fileName": structure_path.name,
            "scene": build_scene_response(structure, bond_algorithm=normalized_bond_algorithm),
        }
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.get("/startup-project")
async def get_startup_project(request: Request) -> dict[str, str]:
    project_path = _startup_project_path(request)
    if project_path is None:
        raise HTTPException(status_code=404, detail={"message": "No startup project file."})
    if not project_path.is_file():
        raise HTTPException(
            status_code=404,
            detail={"message": f"Startup project file not found: {project_path}"},
        )

    try:
        return {
            "fileName": project_path.name,
            "text": project_path.read_text(encoding="utf-8"),
        }
    except OSError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Could not read startup project file: {project_path}"},
        ) from exc


@router.post("/startup-project")
async def save_startup_project(request: Request) -> dict[str, str]:
    project_path = _startup_project_save_path(request)
    if project_path is None:
        raise HTTPException(
            status_code=404,
            detail={"message": "No startup file directory is available."},
        )

    payload = await request.json()
    project_text = payload.get("text") if isinstance(payload, dict) else None
    overwrite = payload.get("overwrite") is True if isinstance(payload, dict) else False
    if not isinstance(project_text, str) or not project_text:
        raise HTTPException(status_code=400, detail={"message": "Project text is required."})
    if len(project_text.encode("utf-8")) > MAX_PROJECT_FILE_BYTES:
        raise HTTPException(status_code=413, detail={"message": "Project file is too large."})
    if project_path.exists() and not overwrite:
        raise HTTPException(
            status_code=409,
            detail={
                "fileName": project_path.name,
                "message": f"Project file already exists: {project_path}",
                "path": str(project_path),
            },
        )

    try:
        project_path.write_text(project_text, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Could not save project file: {project_path}"},
        ) from exc

    return {
        "fileName": project_path.name,
        "path": str(project_path),
    }


@router.post("/startup-file")
async def save_startup_file(request: Request) -> dict[str, str]:
    save_directory = _startup_save_directory(request)
    if save_directory is None:
        raise HTTPException(
            status_code=404,
            detail={"message": "No startup file directory is available."},
        )

    payload = await request.json()
    file_text = payload.get("text") if isinstance(payload, dict) else None
    file_name = payload.get("fileName") if isinstance(payload, dict) else None
    overwrite = payload.get("overwrite") is True if isinstance(payload, dict) else False
    if not isinstance(file_text, str) or not file_text:
        raise HTTPException(status_code=400, detail={"message": "File text is required."})
    if len(file_text.encode("utf-8")) > MAX_PROJECT_FILE_BYTES:
        raise HTTPException(status_code=413, detail={"message": "File is too large."})
    if not isinstance(file_name, str):
        raise HTTPException(status_code=400, detail={"message": "File name is required."})

    try:
        save_path = _safe_generated_file_path(save_directory, file_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    if save_path.exists() and not overwrite:
        raise HTTPException(
            status_code=409,
            detail={
                "fileName": save_path.name,
                "message": f"File already exists: {save_path}",
                "path": str(save_path),
            },
        )

    try:
        save_path.write_text(file_text, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Could not save file: {save_path}"},
        ) from exc

    return {
        "fileName": save_path.name,
        "path": str(save_path),
    }


@router.post("/startup-binary-file")
async def save_startup_binary_file(
    request: Request,
    overwrite: bool = Query(default=False),
) -> dict[str, str]:
    save_directory = _startup_save_directory(request)
    if save_directory is None:
        raise HTTPException(
            status_code=404,
            detail={"message": "No startup file directory is available."},
        )

    file_name = _uploaded_filename(request)
    try:
        save_path = _safe_generated_file_path(save_directory, file_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    payload = await _generated_file_payload(request)
    if not payload:
        raise HTTPException(status_code=400, detail={"message": "File content is required."})

    if save_path.exists() and not overwrite:
        raise HTTPException(
            status_code=409,
            detail={
                "fileName": save_path.name,
                "message": f"File already exists: {save_path}",
                "path": str(save_path),
            },
        )

    try:
        save_path.write_bytes(payload)
    except OSError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Could not save file: {save_path}"},
        ) from exc

    return {
        "fileName": save_path.name,
        "path": str(save_path),
    }


async def _uploaded_payload(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            upload_size = int(content_length)
        except ValueError:
            upload_size = None
        if upload_size is not None and upload_size > MAX_STRUCTURE_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"message": STRUCTURE_FILE_TOO_LARGE_MESSAGE},
            )

    payload = await request.body()
    if len(payload) > MAX_STRUCTURE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail={"message": STRUCTURE_FILE_TOO_LARGE_MESSAGE})
    return payload


async def _generated_file_payload(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            upload_size = int(content_length)
        except ValueError:
            upload_size = None
        if upload_size is not None and upload_size > MAX_GENERATED_FILE_BYTES:
            raise HTTPException(status_code=413, detail={"message": "File is too large."})

    payload = await request.body()
    if len(payload) > MAX_GENERATED_FILE_BYTES:
        raise HTTPException(status_code=413, detail={"message": "File is too large."})
    return payload


def _uploaded_filename(request: Request) -> str:
    encoded_name = request.headers.get("x-pretty-lattice-filename")
    if encoded_name:
        return unquote(encoded_name)
    return "uploaded structure"


def _startup_structure_path(request: Request) -> Path | None:
    structure_path = getattr(request.app.state, "startup_structure_path", None)
    if structure_path is None:
        return None
    return Path(structure_path)


def _startup_project_path(request: Request) -> Path | None:
    project_path = getattr(request.app.state, "startup_project_path", None)
    if project_path is None:
        return None
    return Path(project_path)


def _startup_project_save_path(request: Request) -> Path | None:
    project_path = _startup_project_path(request)
    if project_path is not None:
        return project_path

    structure_path = _startup_structure_path(request)
    if structure_path is None:
        return None
    return structure_path.with_suffix(".prl")


def _startup_save_directory(request: Request) -> Path | None:
    structure_path = _startup_structure_path(request)
    if structure_path is not None:
        return structure_path.parent

    project_path = _startup_project_path(request)
    if project_path is not None:
        return project_path.parent

    return None


def _safe_generated_file_path(directory: Path, file_name: str) -> Path:
    name = Path(file_name).name
    if name in {"", ".", ".."} or name != file_name:
        raise ValueError("A simple file name is required.")
    suffix = Path(name).suffix.lower()
    if suffix not in SAFE_GENERATED_FILE_SUFFIXES:
        raise ValueError(f"Unsupported generated file suffix: {suffix or '(none)'}")
    return directory / name
