import csv
import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from src.extract_questions import (
    CSV_FIELDS,
    ExtractedRecord,
    deduplicate,
    extract_file,
    main,
    validate_duplicate_consistency,
    write_csv_atomic,
)


SAMPLE = """[Page 1]
**DOMAIN 1—INFORMATION SYSTEM AUDITING PROCESS (18%)**

**1. Which control is BEST?**
A. First option.
B. Second option.
C. Third option.
D. Fourth option.

**B is the correct answer.**

**Justification:**
A. First rationale.
B. Second rationale.
C. Third rationale.
D. Fourth rationale.

---
©ISACA. All Rights Reserved.

2. What should the auditor do FIRST?
**A.** Review evidence.
**B.** Ignore evidence.
**C.** Delete evidence.
**D.** Guess.

**A is the correct answer.**
**Justification:**
A. Correct rationale.
B. Incorrect rationale.
C. Incorrect rationale.
D. Incorrect rationale.
"""


class ExtractionTests(unittest.TestCase):
    def write_sample(self, directory: Path, content: str = SAMPLE) -> Path:
        path = directory / "sample.txt"
        path.write_text(content, encoding="utf-8")
        return path

    def test_extracts_rows_and_normalizes_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.write_sample(Path(temporary))
            records, diagnostics = extract_file(path, chunk_size=80, overlap=24)

        self.assertEqual([], diagnostics)
        self.assertEqual(2, len(records))
        self.assertEqual("Which control is BEST?", records[0].row["question"])
        self.assertEqual("Second option.", records[0].row["B"])
        self.assertEqual("B", records[0].row["key answer"])
        self.assertEqual("Domain 1—Information System Auditing Process", records[0].row["domain"])
        self.assertEqual("1", records[0].row["domain_index"])
        self.assertNotIn("©ISACA", records[0].row["justification"])
        self.assertNotIn("DOMAIN 1", records[0].row["justification"])
        self.assertTrue(records[0].row["justification"].startswith("A. First rationale."))
        self.assertIn("\nB. Second rationale.", records[0].row["justification"])

    def test_chunking_does_not_change_results(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.write_sample(Path(temporary))
            small, small_diagnostics = extract_file(path, chunk_size=80, overlap=24)
            large, large_diagnostics = extract_file(path, chunk_size=4096, overlap=512)

        self.assertEqual([], small_diagnostics)
        self.assertEqual([], large_diagnostics)
        self.assertEqual([record.row for record in large], [record.row for record in small])

    def test_reports_incomplete_question(self):
        incomplete = SAMPLE.replace("D. Fourth option.\n", "")
        with tempfile.TemporaryDirectory() as temporary:
            path = self.write_sample(Path(temporary), incomplete)
            records, diagnostics = extract_file(path, chunk_size=128, overlap=32)

        self.assertEqual(1, len(records))
        self.assertEqual(1, len(diagnostics))
        self.assertIn("excluded malformed question 1", diagnostics[0])

    def test_atomic_csv_has_exact_header(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = self.write_sample(directory)
            records, diagnostics = extract_file(source, chunk_size=128, overlap=32)
            output = directory / "question.csv"
            write_csv_atomic(output, records)
            with output.open(encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                rows = list(reader)

        self.assertEqual([], diagnostics)
        self.assertEqual(CSV_FIELDS, reader.fieldnames)
        self.assertEqual("1", rows[0]["domain_index"])
        self.assertEqual(2, len(rows))

    def test_deduplicate_prefers_clean_ocr_copy(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.write_sample(Path(temporary))
            records, diagnostics = extract_file(path, chunk_size=128, overlap=32)

        clean = records[0]
        contaminated_row = dict(clean.row)
        contaminated_row["justification"] += (
            "\nA. Text from the following question."
            "\nB. More unrelated text."
            "\nC. More unrelated text."
            "\nD. More unrelated text."
        )
        contaminated = ExtractedRecord(clean.source, clean.question_number, contaminated_row)

        self.assertEqual([], diagnostics)
        self.assertEqual([clean], deduplicate([contaminated, clean]))

    def test_deduplicate_handles_ocr_wording_variants_by_source_number(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.write_sample(Path(temporary))
            records, diagnostics = extract_file(path, chunk_size=128, overlap=32)

        original = records[0]
        variant_row = dict(original.row)
        variant_row["question"] = "Which control is the BEST choice?"
        variant = ExtractedRecord(original.source, original.question_number, variant_row)

        self.assertEqual([], diagnostics)
        self.assertNotEqual(original.identity, variant.identity)
        self.assertEqual(1, len(deduplicate([original, variant])))

    def test_duplicate_conflicting_answer_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.write_sample(Path(temporary))
            records, diagnostics = extract_file(path, chunk_size=128, overlap=32)

        original = records[0]
        conflicting_row = dict(original.row)
        conflicting_row["key answer"] = "D"
        conflicting = ExtractedRecord(original.source, original.question_number, conflicting_row)
        conflicts = validate_duplicate_consistency([original, conflicting])

        self.assertEqual([], diagnostics)
        self.assertEqual(1, len(conflicts))
        self.assertIn("key answer", conflicts[0])

    def test_main_deduplicates_repeated_input(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            input_directory = directory / "raw"
            input_directory.mkdir()
            self.write_sample(input_directory, SAMPLE + "\n" + SAMPLE)
            output = directory / "question.csv"
            stdout = io.StringIO()
            stderr = io.StringIO()

            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = main(
                    [
                        "--input-dir",
                        str(input_directory),
                        "--output",
                        str(output),
                        "--chunk-size",
                        "128",
                        "--overlap",
                        "32",
                    ]
                )

            with output.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(0, result)
        self.assertEqual(2, len(rows))
        self.assertIn("Wrote 2 questions", stdout.getvalue())
        self.assertIn("Removed 2 repeated question occurrence(s)", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
