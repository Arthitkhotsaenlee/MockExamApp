#!/usr/bin/env python3
"""Extract CISA OCR question records into a validated CSV file.

Usage:
    python3 extract_questions.py
    python3 extract_questions.py --input-dir raw_data --output question.csv
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

CSV_FIELDS = ["question", "A", "B", "C", "D", "key answer", "justification", "domain", "domaina_index"]
DOMAIN_TITLES = {
    "1": "Domain 1—Information System Auditing Process",
    "2": "Domain 2—Governance and Management of IT",
    "3": "Domain 3—Information Systems Acquisition, Development and Implementation",
    "4": "Domain 4—Information Systems Operations and Business Resilience",
    "5": "Domain 5—Protection of Information Assets",
}

DOMAIN_RE = re.compile(r"\bDOMAIN\s*([1-5])\b", re.IGNORECASE)
QUESTION_RE = re.compile(r"(?m)^\s*(\d{1,4})\.\s+(?=\S)")
OPTION_RE = re.compile(r"(?m)^\s*(?:-\s*)?([A-D])\.\s+(?=\S)")
ANSWER_RE = re.compile(r"(?im)^\s*([A-D])\s+is\s+the\s+correct\s+answer\s*\.?")
JUSTIFICATION_RE = re.compile(r"(?im)^\s*Justification\s*:\s*")

MARKDOWN_EDGE_RE = re.compile(r"^\s*(?:#{1,6}\s*)?(.*?)(?:\s{2,})?\s*$")
PAGE_RE = re.compile(r"^\[Page\s+\d+\]$", re.IGNORECASE)
STANDALONE_PAGE_RE = re.compile(r"^(?:Page reference:\s*)?\d+\.?$", re.IGNORECASE)


@dataclass(frozen=True)
class ExtractedRecord:
    source: Path
    question_number: str
    row: dict[str, str]

    @property
    def identity(self) -> str:
        normalized = "\x1f".join(
            normalize_for_identity(self.row[field]) for field in ("question", "A", "B", "C", "D")
        )
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def iter_overlapping_chunks(
    path: Path, chunk_size: int = 64 * 1024, overlap: int = 8 * 1024
) -> Iterator[tuple[str, int]]:
    """Yield `(window, overlap_prefix_length)` while reading the file once."""
    if chunk_size <= 0 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("chunk_size must be positive and overlap must be smaller than chunk_size")

    carry = ""
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as source:
        while fresh := source.read(chunk_size):
            yield carry + fresh, len(carry)
            carry = (carry + fresh)[-overlap:] if overlap else ""


def read_once_with_overlap(path: Path, chunk_size: int, overlap: int) -> str:
    """Reconstruct source text from overlapping windows without duplicating overlap."""
    parts: list[str] = []
    for window, prefix_length in iter_overlapping_chunks(path, chunk_size, overlap):
        parts.append(window[prefix_length:])
    return "".join(parts)


def strip_markdown(text: str) -> str:
    lines: list[str] = []
    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        match = MARKDOWN_EDGE_RE.match(raw_line)
        line = match.group(1) if match else raw_line
        line = re.sub(r"^\s*(?:\*\*|__|\*|_)\s*", "", line)
        line = re.sub(r"\s*(?:\*\*|__|\*|_)\s*$", "", line)
        line = line.replace("**", "").replace("__", "")
        lines.append(line.rstrip())
    return "\n".join(lines)


def is_noise_line(line: str) -> bool:
    stripped = line.strip(" *_")
    if not stripped:
        return False
    lowered = stripped.casefold()
    return bool(
        PAGE_RE.fullmatch(stripped)
        or STANDALONE_PAGE_RE.fullmatch(stripped)
        or re.fullmatch(r"-{3,}", stripped)
        or lowered == "page footer:"
        or lowered == "extracted text"
        or re.fullmatch(r"\(?page\s+\d+\)?", lowered)
        or lowered == "page intentionally left blank"
        or DOMAIN_RE.search(stripped)
        or lowered in {"cisa®", "cisa", "certified information", "systems auditor", "certified information systems auditor"}
        or "©isaca" in lowered
        or "© isaca" in lowered
        or "cisa® official questions, answers" in lowered
        or "cisa official questions, answers" in lowered
        or "cisa © official questions, answers" in lowered
        or ("cisa" in lowered and "certified information systems auditor" in lowered)
    )


def clean_field(text: str) -> str:
    kept: list[str] = []
    for line in text.splitlines():
        if is_noise_line(line):
            continue
        stripped = line.strip()
        if stripped:
            kept.append(stripped)
    return re.sub(r"\s+", " ", " ".join(kept)).strip()


def clean_justification(text: str) -> str:
    kept: list[str] = []
    for line in text.splitlines():
        if is_noise_line(line):
            continue
        stripped = line.strip()
        if not stripped:
            continue
        normalized = re.sub(r"\s+", " ", stripped)
        if re.match(r"^(?:-\s*)?[A-D]\.\s+", normalized) and kept:
            kept.append("\n" + normalized)
        else:
            kept.append(normalized)
    result = " ".join(kept).replace(" \n", "\n").strip()
    return result


def normalize_for_identity(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def domain_at(text: str, position: int) -> tuple[str, str] | None:
    matches = list(DOMAIN_RE.finditer(text, 0, position))
    if not matches:
        return None
    domain_index = matches[-1].group(1)
    return DOMAIN_TITLES[domain_index], domain_index


def parse_candidate(source: Path, text: str, start: re.Match[str], end: int) -> ExtractedRecord | None:
    block = text[start.start():end]
    answer_match = ANSWER_RE.search(block)
    justification_match = JUSTIFICATION_RE.search(block)
    if not answer_match or not justification_match or justification_match.start() < answer_match.end():
        return None

    option_matches = [match for match in OPTION_RE.finditer(block, 0, answer_match.start())]
    if [match.group(1) for match in option_matches] != ["A", "B", "C", "D"]:
        return None

    question_start = start.end() - start.start()
    question = clean_field(block[question_start:option_matches[0].start()])
    options: dict[str, str] = {}
    for index, match in enumerate(option_matches):
        option_end = option_matches[index + 1].start() if index < 3 else answer_match.start()
        options[match.group(1)] = clean_field(block[match.end():option_end])

    justification = clean_justification(block[justification_match.end():])
    domain_info = domain_at(text, start.start())
    if not question or not all(options.values()) or not justification or domain_info is None:
        return None
    domain, domaina_index = domain_info

    row = {
        "question": question,
        "A": options["A"],
        "B": options["B"],
        "C": options["C"],
        "D": options["D"],
        "key answer": answer_match.group(1).upper(),
        "justification": justification,
        "domain": domain,
        "domaina_index": domaina_index,
    }
    return ExtractedRecord(source=source, question_number=start.group(1), row=row)


def extract_file(path: Path, chunk_size: int, overlap: int) -> tuple[list[ExtractedRecord], list[str]]:
    text = strip_markdown(read_once_with_overlap(path, chunk_size, overlap))
    starts = list(QUESTION_RE.finditer(text))
    records: list[ExtractedRecord] = []
    diagnostics: list[str] = []

    for index, start in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
        record = parse_candidate(path, text, start, end)
        if record is not None:
            records.append(record)
        elif ANSWER_RE.search(text, start.start(), end):
            line_number = text.count("\n", 0, start.start()) + 1
            diagnostics.append(
                f"{path}:{line_number}: excluded malformed question {start.group(1)}"
            )

    answer_count = len(ANSWER_RE.findall(text))
    if len(records) + len(diagnostics) != answer_count:
        diagnostics.append(
            f"{path}: parsed {len(records)} rows from {answer_count} detected answer markers"
        )
    return records, diagnostics


def validate_records(records: Iterable[ExtractedRecord]) -> list[str]:
    diagnostics: list[str] = []
    seen: dict[str, ExtractedRecord] = {}
    for record in records:
        row = record.row
        missing = [field for field in CSV_FIELDS if not row.get(field, "").strip()]
        if missing:
            diagnostics.append(f"{record.source} question {record.question_number}: missing {', '.join(missing)}")
        if row["key answer"] not in {"A", "B", "C", "D"}:
            diagnostics.append(f"{record.source} question {record.question_number}: invalid answer key")
        if row["domain"] not in DOMAIN_TITLES.values():
            diagnostics.append(f"{record.source} question {record.question_number}: invalid domain")
        if row.get("domaina_index") not in DOMAIN_TITLES:
            diagnostics.append(f"{record.source} question {record.question_number}: invalid domaina_index")
        previous = seen.get(record.identity)
        if previous:
            diagnostics.append(
                f"duplicate question: {record.source} question {record.question_number} matches "
                f"{previous.source} question {previous.question_number}"
            )
        else:
            seen[record.identity] = record
    return diagnostics


def duplicate_keys(record: ExtractedRecord) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Return stable source/number and normalized-content keys for a record."""
    source = os.path.normcase(os.path.abspath(record.source))
    return (
        ("source-question", source, record.row.get("domaina_index", ""), record.question_number),
        ("content", record.identity),
    )


def validate_duplicate_consistency(records: Iterable[ExtractedRecord]) -> list[str]:
    """Report duplicate questions whose answer key or domain disagrees."""
    diagnostics: list[str] = []
    seen: dict[tuple[str, ...], tuple[int, ExtractedRecord]] = {}
    reported_pairs: set[tuple[int, int]] = set()
    consistency_fields = ("key answer", "domaina_index")

    for index, record in enumerate(records):
        for key in duplicate_keys(record):
            previous_entry = seen.get(key)
            if previous_entry is None:
                seen[key] = (index, record)
                continue

            previous_index, previous = previous_entry
            pair = (previous_index, index)
            conflicts = [
                field
                for field in consistency_fields
                if record.row.get(field) != previous.row.get(field)
            ]
            if conflicts and pair not in reported_pairs:
                diagnostics.append(
                    f"conflicting duplicate question: {record.source} question "
                    f"{record.question_number} differs from {previous.source} question "
                    f"{previous.question_number} in {', '.join(conflicts)}"
                )
                reported_pairs.add(pair)

    return diagnostics


def record_quality(record: ExtractedRecord) -> tuple[bool, int, int, int]:
    """Return a deterministic quality score used to select among OCR duplicates."""
    justification_labels = [
        line[0]
        for line in record.row["justification"].splitlines()
        if len(line) >= 3 and line[0] in "ABCD" and line[1:3] == ". "
    ]
    combined_text = "\n".join(record.row.values())
    lowered = combined_text.casefold()
    noise_count = sum(
        lowered.count(marker)
        for marker in ("extracted text:", "page footer:", "page intentionally left blank")
    )
    replacement_count = combined_text.count("\ufffd")
    return (
        justification_labels == ["A", "B", "C", "D"],
        -noise_count,
        -replacement_count,
        -abs(len(justification_labels) - 4),
    )


def select_best_by_key(
    records: Iterable[ExtractedRecord], key_index: int
) -> list[ExtractedRecord]:
    unique: list[ExtractedRecord] = []
    positions: dict[tuple[str, ...], int] = {}
    for record in records:
        key = duplicate_keys(record)[key_index]
        position = positions.get(key)
        if position is None:
            positions[key] = len(unique)
            unique.append(record)
        elif record_quality(record) > record_quality(unique[position]):
            unique[position] = record
    return unique


def deduplicate(records: Iterable[ExtractedRecord]) -> list[ExtractedRecord]:
    """Keep one record per question, preferring the cleanest OCR copy."""
    source_unique = select_best_by_key(records, key_index=0)
    return select_best_by_key(source_unique, key_index=1)


def write_csv_atomic(path: Path, records: Iterable[ExtractedRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8-sig", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=CSV_FIELDS, extrasaction="raise")
            writer.writeheader()
            writer.writerows(record.row for record in records)
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract CISA OCR questions into a validated CSV file.")
    parser.add_argument("--input-dir", type=Path, default=Path("raw_data"))
    parser.add_argument("--output", type=Path, default=Path("question.csv"))
    parser.add_argument("--chunk-size", type=int, default=64 * 1024)
    parser.add_argument("--overlap", type=int, default=8 * 1024)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    paths = sorted(args.input_dir.rglob("*.txt"))
    if not paths:
        print(f"No .txt files found under {args.input_dir}", file=sys.stderr)
        return 2

    all_records: list[ExtractedRecord] = []
    warnings: list[str] = []
    for path in paths:
        records, file_warnings = extract_file(path, args.chunk_size, args.overlap)
        all_records.extend(records)
        warnings.extend(file_warnings)

    unique_records = deduplicate(all_records)
    duplicate_count = len(all_records) - len(unique_records)
    errors = validate_records(unique_records)
    errors.extend(validate_duplicate_consistency(all_records))
    if errors:
        print("Extraction validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    if duplicate_count:
        warnings.append(
            f"Removed {duplicate_count} repeated question occurrence(s); "
            f"kept {len(unique_records)} unique questions"
        )
    write_csv_atomic(args.output, unique_records)
    print(f"Wrote {len(unique_records)} questions from {len(paths)} files to {args.output}")
    if warnings:
        print("Warnings:", file=sys.stderr)
        for warning in warnings:
            print(f"- {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
