import csv
import tempfile
import unittest
from pathlib import Path

from extract_questions import CSV_FIELDS, extract_file, write_csv_atomic


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
        self.assertEqual("1", records[0].row["domaina_index"])
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
        self.assertEqual("1", rows[0]["domaina_index"])
        self.assertEqual(2, len(rows))


if __name__ == "__main__":
    unittest.main()
