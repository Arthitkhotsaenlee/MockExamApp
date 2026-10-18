# Mock Exam Question Processing and Study Application

This project converts OCR-generated text files into structured question banks and provides one dependency-free browser application in [`app/`](./app/).

- **Data pipeline:** Python utilities under [`src/`](./src/) convert source text into CSV and JSON.
- **Study application:** Vanilla HTML, CSS, and JavaScript under [`app/`](./app/); no framework, npm installation, or build step is required.

Question data is not bundled into the application. Users select a compatible JSON file from their device, and processing remains in the browser.

## Project structure

```text
.
├── app/                      Browser application
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── README.md
├── src/
│   ├── extract_questions.py  OCR text-to-CSV pipeline
│   └── csv_to_json.py        CSV-to-JSON converter
├── tests/
│   └── test_extract_questions.py
├── raw_data/                 Source OCR text files (ignored by Git)
├── data/                     Generated question banks (ignored by Git)
└── SUMMARY.md                Implementation summary
```

## Data pipeline

Place OCR `.txt` files in `raw_data/`, then run:

```bash
python src/extract_questions.py --output data/question.csv
python src/csv_to_json.py --input data/question.csv --output data/question.json
```

Run the extraction tests with:

```bash
python -m unittest discover -s tests
```

## Question-bank schema

The CSV and JSON records use these fields:

| Field | Description |
| --- | --- |
| `question` | Question text |
| `A`, `B`, `C`, `D` | Answer choices, displayed in this order |
| `key answer` | Correct choice: `A`, `B`, `C`, or `D` |
| `justification` | Explanation, with choice explanations separated by newlines |
| `domain` | Domain title |
| `domaina_index` | Domain number stored as a string from `1` through `5` |

Example JSON:

```json
[
  {
    "question": "Question text",
    "A": "First choice",
    "B": "Second choice",
    "C": "Third choice",
    "D": "Fourth choice",
    "key answer": "A",
    "justification": "A: Explanation\nB: Explanation\nC: Explanation\nD: Explanation",
    "domain": "Domain title",
    "domaina_index": "1"
  }
]
```

## Run the application

Open [`app/index.html`](./app/index.html) directly in a modern browser, or serve the folder locally:

```bash
cd app
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Application behavior

- All available domains are selected by default.
- Mock-exam and learning questions are randomized.
- Answer choices always remain in their source A–D order in both modes.
- Mock exams use weighted domain allocation, a configurable timer, navigation, flags, scoring, and a per-question answer review after submission.
- Learning mode provides immediate feedback and explanations without repeating questions in a session, with an elapsed timer that resets for each question.
- Question banks and active sessions persist in browser local storage.
- Top-bar −/+ controls adjust and save the application text size.
- Reset clears the loaded question bank and saved progress.

Uploaded files remain on the user's device. Because answer keys are available client-side, the application is intended for personal study rather than secure or proctored examinations.

See [`app/README.md`](./app/README.md) for application details and [`SUMMARY.md`](./SUMMARY.md) for the implementation summary.
