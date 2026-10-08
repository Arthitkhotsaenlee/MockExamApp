# CISA Question Processing and Study Applications

This project converts OCR-generated text files into structured CISA-style question banks and provides two browser-based study applications.

- **Data pipeline:** Python scripts convert source text into CSV and JSON.
- **React application:** A React, TypeScript, and Vite implementation in [`app/`](./app/).
- **Vanilla application:** A dependency-free HTML, CSS, and JavaScript implementation in [`app2/`](./app2/).

Question data is not bundled into either application. Users select a JSON file from their device, and processing remains in the browser.

## Project structure

```text
.
├── raw_data/                 Source OCR text files
├── data/
│   ├── question.csv          Structured CSV question bank
│   └── question.json         JSON question bank for the applications
├── tests/
│   └── test_extract_questions.py
├── app/                      React + TypeScript + Vite application
├── app2/                     Vanilla HTML + CSS + JavaScript application
├── extract_questions.py      Text-to-CSV extraction pipeline
├── csv_to_json.py            CSV-to-JSON converter
├── plan.md                   Original data-processing plan
└── SUMMARY.md                Detailed implementation summary
```

## Data pipeline

### 1. Extract questions from text

Place OCR `.txt` files in `raw_data/`, then run:

```bash
python3 extract_questions.py
```

The extractor processes each source file once using overlapping chunks to preserve questions that cross chunk boundaries. It writes one question per row to `data/question.csv`.

### 2. Convert CSV to JSON

```bash
python3 csv_to_json.py
```

The generated `data/question.json` can be loaded into either study application.

### 3. Run extraction tests

```bash
python3 -m unittest discover -s tests
```

## Question-bank schema

The CSV and JSON records use these fields:

| Field | Description |
| --- | --- |
| `question` | Question text |
| `A`, `B`, `C`, `D` | Answer choices |
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

## Run the React application

Requirements:

- Node.js 20.19+ or 22.12+
- npm

```bash
cd app
npm install
npm run dev
```

Open the URL displayed by Vite, normally `http://localhost:5173`.

Validate and build:

```bash
npm run lint
npm run build
npm run preview
```

The deployable production files are written to `app/dist/`. See [`app/README.md`](./app/README.md) for maintenance and deployment details.

## Run the dependency-free application

No npm installation or build is required.

```bash
cd app2
python3 -m http.server 8080
```

Open `http://localhost:8080`. The application may also be opened directly through `app2/index.html`, but a local server is recommended.

To share it, copy the complete `app2/` directory. See [`app2/README.md`](./app2/README.md) for details.

## Application features

Both applications provide:

- Local JSON upload and validation
- Domain selection and question counts
- Configurable mock exams
- Randomized questions and answer choices
- Countdown timer and automatic submission
- Question navigation and flags
- Score results
- Learning mode with immediate feedback
- Browser persistence across refreshes
- Responsive desktop and mobile layouts
- A confirmed reset to the initial state

## Privacy and limitations

- Uploaded question files remain on the user's device.
- Question banks and active sessions are stored in browser local storage.
- No backend or database server is required.
- Answer keys are available client-side, so the applications are intended for personal study, not secure or proctored examinations.

For a detailed record of the implementation and validation work, see [`SUMMARY.md`](./SUMMARY.md).
