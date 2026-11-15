#!/usr/bin/env python3
"""Combine JSON question arrays embedded in OCR text files."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

REQUIRED_FIELDS = (
    "question",
    "A",
    "B",
    "C",
    "D",
    "key answer",
    "justification",
    "domain",
    "domain_index",
)
SOURCE_REQUIRED_FIELDS = REQUIRED_FIELDS[:-1]
JSON_BLOCK_RE = re.compile(r"```json\s*(.*?)```", re.IGNORECASE | re.DOTALL)
DOMAIN_INDEX_MARKERS = (
    ("governance", "1"),
    ("risk management", "2"),
    ("program", "3"),
    ("incident management", "4"),
)


def natural_path_key(path: Path) -> tuple[int, str]:
    match = re.match(r"(\d+)", path.name)
    return (int(match.group(1)) if match else sys.maxsize, path.name.casefold())


def domain_index(domain: str, location: str) -> str:
    normalized = domain.casefold()
    for marker, index in DOMAIN_INDEX_MARKERS:
        if marker in normalized:
            return index
    raise ValueError(f"{location}: unrecognized domain {domain!r}")


def validate_question(value: Any, source: Path, block_number: int, row_number: int) -> dict[str, str]:
    location = f"{source} JSON block {block_number}, row {row_number}"
    if not isinstance(value, dict):
        raise ValueError(f"{location}: expected an object")

    missing = [field for field in SOURCE_REQUIRED_FIELDS if not isinstance(value.get(field), str) or not value[field].strip()]
    if missing:
        raise ValueError(f"{location}: missing or invalid fields: {', '.join(missing)}")
    if value["key answer"] not in {"A", "B", "C", "D"}:
        raise ValueError(f"{location}: invalid key answer {value['key answer']!r}")

    question = {field: value[field].strip() for field in SOURCE_REQUIRED_FIELDS}
    question["domain_index"] = domain_index(question["domain"], location)
    return question


def extract_questions(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    questions: list[dict[str, str]] = []
    for block_number, match in enumerate(JSON_BLOCK_RE.finditer(text), start=1):
        try:
            rows = json.loads(match.group(1))
        except json.JSONDecodeError as error:
            raise ValueError(f"{path} JSON block {block_number}: {error.msg} at line {error.lineno}") from error
        if not isinstance(rows, list):
            raise ValueError(f"{path} JSON block {block_number}: expected an array")
        questions.extend(
            validate_question(row, path, block_number, row_number)
            for row_number, row in enumerate(rows, start=1)
        )
    return questions


def deduplicate(questions: Iterable[dict[str, str]]) -> tuple[list[dict[str, str]], int, int]:
    unique: list[dict[str, str]] = []
    seen: dict[tuple[str, ...], dict[str, str]] = {}
    duplicate_count = 0
    conflict_count = 0
    for question in questions:
        identity = tuple(question[field].casefold() for field in ("question", "A", "B", "C", "D"))
        previous = seen.get(identity)
        if previous is None:
            seen[identity] = question
            unique.append(question)
            continue
        if previous["key answer"] != question["key answer"]:
            conflict_count += 1
        duplicate_count += 1
    return unique, duplicate_count, conflict_count


def write_json_atomic(path: Path, questions: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as output:
            json.dump(questions, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def combine_question_files(input_dir: Path, output_path: Path) -> tuple[int, int, int, int]:
    paths = sorted(input_dir.glob("*.txt"), key=natural_path_key)
    if not paths:
        raise ValueError(f"no .txt files found in {input_dir}")

    questions: list[dict[str, str]] = []
    files_with_json = 0
    for path in paths:
        extracted = extract_questions(path)
        if extracted:
            files_with_json += 1
            questions.extend(extracted)
    if not questions:
        raise ValueError(f"no fenced JSON question arrays found in {input_dir}")

    unique, duplicate_count, conflict_count = deduplicate(questions)
    write_json_atomic(output_path, unique)
    return len(unique), duplicate_count, conflict_count, files_with_json


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Combine JSON question arrays from OCR text files.")
    parser.add_argument("--input-dir", type=Path, default=Path("raw_data/set-b"))
    parser.add_argument("--output", type=Path, default=Path("data/question-set-b.json"))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        count, duplicate_count, conflict_count, files_with_json = combine_question_files(args.input_dir, args.output)
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(f"Wrote {count} questions from {files_with_json} files to {args.output}")
    if duplicate_count:
        print(f"Removed {duplicate_count} duplicate question(s)", file=sys.stderr)
    if conflict_count:
        print(f"Kept the earliest copy of {conflict_count} duplicate(s) with conflicting answers", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())