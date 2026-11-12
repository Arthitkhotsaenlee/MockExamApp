import json
import tempfile
import unittest
from pathlib import Path

from src.combine_json_questions import combine_question_files, deduplicate, extract_questions


def question(answer: str = "B", domain_index: str = "99") -> dict[str, str]:
    return {
        "question": "Which choice is correct?",
        "A": "First",
        "B": "Second",
        "C": "Third",
        "D": "Fourth",
        "key answer": answer,
        "justification": "B is correct.",
        "domain": "Information Security Governance",
        "domaina_index": domain_index,
    }


class CombineJsonQuestionsTests(unittest.TestCase):
    def test_extracts_fenced_arrays_and_derives_domain_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.txt"
            path.write_text(
                "OCR text\n```json\n" + json.dumps([question()]) + "\n```\nmore OCR",
                encoding="utf-8",
            )
            rows = extract_questions(path)

        self.assertEqual(1, len(rows))
        self.assertEqual("1", rows[0]["domaina_index"])

    def test_deduplicate_keeps_first_conflicting_answer(self):
        first = question(answer="A")
        second = question(answer="B")

        unique, duplicate_count, conflict_count = deduplicate([first, second])

        self.assertEqual([first], unique)
        self.assertEqual(1, duplicate_count)
        self.assertEqual(1, conflict_count)

    def test_combines_files_in_numeric_order(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            later = question()
            later["question"] = "Later"
            earlier = question()
            earlier["question"] = "Earlier"
            (directory / "31-60.txt").write_text(
                "```json\n" + json.dumps([later]) + "\n```", encoding="utf-8"
            )
            (directory / "1-30.txt").write_text(
                "```json\n" + json.dumps([earlier]) + "\n```", encoding="utf-8"
            )
            output = directory / "questions.json"

            count, duplicates, conflicts, files = combine_question_files(directory, output)
            rows = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual((2, 0, 0, 2), (count, duplicates, conflicts, files))
        self.assertEqual(["Earlier", "Later"], [row["question"] for row in rows])


if __name__ == "__main__":
    unittest.main()