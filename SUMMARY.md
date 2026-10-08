# CISA Question Processing and Exam Application Summary

## Project overview

This project now contains two connected but independent parts:

1. A local Python pipeline that converts OCR text files into validated CSV and JSON question banks.
2. A client-only React, TypeScript, and Vite application that lets a user load a compatible JSON file and practise in mock-exam or learning mode.

The web application does not bundle or automatically import the generated question bank. The user chooses a local JSON file, and all processing and saved progress remain in the browser.

## 1. OCR question extraction

### Source processing

[`extract_questions.py`](./extract_questions.py) was created to process the `.txt` files under `raw_data/`.

The extractor:

- Sorts and processes each source file once.
- Reads files in 64 KiB chunks with an 8 KiB overlap.
- Preserves parser carry-over between chunks so questions split across boundaries are not lost.
- Removes duplicated overlap content before parsing.
- Recognizes question numbers, choices A–D, answer keys, justification sections, domain headings, Markdown formatting, page markers, and OCR noise.
- Removes page footers, copyright lines, separators, and unrelated source noise.
- Normalizes whitespace while retaining meaningful justification line breaks.
- Rejects incomplete records rather than silently producing invalid rows.
- Reports malformed records with their source file and question number.
- Writes output atomically so an interrupted run does not leave a partial CSV file.

### CSV schema

The generated [`data/question.csv`](./data/question.csv) contains one question per row with these columns:

1. `question`
2. `A`
3. `B`
4. `C`
5. `D`
6. `key answer`
7. `justification`
8. `domain`
9. `domaina_index`

`domaina_index` is stored as a single-character string from `1` through `5`.

### Justification formatting

The justification cleaner was updated so explanations for choices A, B, C, and D remain separated by newline characters. This formatting is preserved in both CSV and JSON output and displayed with line breaks in the learning interface.

### Extraction result

The completed extraction generated 456 valid questions. One malformed source record—question 59 in `02_ocr_output.txt`—was intentionally excluded because choice D was absent.

The observed generated question distribution was:

| Domain | Questions |
| --- | ---: |
| Domain 1 | 160 |
| Domain 2 | 162 |
| Domain 3 | 118 |
| Domain 4 | 16 |
| Domain 5 | 0 |
| **Total** | **456** |

## 2. Extraction tests

[`tests/test_extract_questions.py`](./tests/test_extract_questions.py) was added with tests covering:

- Complete question extraction and field normalization.
- Correct full domain titles and domain indices.
- Removal of source noise from justifications.
- Newline separation between choice explanations.
- Identical parsing results with small and large chunk sizes.
- Diagnostic reporting for incomplete questions.
- Atomic CSV generation with the exact expected header.

The extraction output was also checked for deterministic results and duplicate records.

Run the tests from the project root:

```bash
python3 -m unittest discover -s tests
```

Generate the CSV again with:

```bash
python3 extract_questions.py
```

## 3. CSV-to-JSON conversion

[`csv_to_json.py`](./csv_to_json.py) was created to convert the generated CSV into UTF-8 JSON.

The converter:

- Reads every CSV record using the header names.
- Preserves all field values, including newline-separated justifications.
- Produces a formatted JSON array.
- Writes [`data/question.json`](./data/question.json).

The converter was executed successfully and generated 456 JSON objects.

Run it again with:

```bash
python3 csv_to_json.py
```

## 4. Client-only exam application

The application was scaffolded in [`app/`](./app/) using:

- React 19
- TypeScript
- Vite
- Oxlint

No backend or database server is required. The production output is a static site.

### Question-bank loading

The application accepts a user-selected JSON file with this structure:

```json
[
  {
    "question": "Question text",
    "A": "Choice A",
    "B": "Choice B",
    "C": "Choice C",
    "D": "Choice D",
    "key answer": "A",
    "justification": "A. Explanation\nB. Explanation\nC. Explanation\nD. Explanation",
    "domain": "Domain title",
    "domaina_index": "1"
  }
]
```

[`app/src/lib.ts`](./app/src/lib.ts) validates that:

- The JSON root is an array.
- Every row is an object.
- All required text fields are present and nonempty.
- `key answer` is A, B, C, or D.
- `domaina_index` is a string from `1` through `5`.

Each valid question receives a stable hash-based ID. Duplicate IDs are removed, and domain names and counts are derived from the loaded data.

### Upload error correction

The original upload implementation used `FileReader`, which produced a runtime failure in the user's browser. The upload handler in [`app/src/App.tsx`](./app/src/App.tsx) was rewritten to:

- Use the modern asynchronous `file.text()` API.
- Parse and validate the complete file in one `try/catch` block.
- Display the selected filename in validation errors.
- Log the original error for browser diagnostics.
- Reset the file input so the same file can be selected again.
- Clear incompatible active sessions after a new bank is loaded.

The generated 456-record JSON file was manually loaded successfully after this change.

## 5. Exam application behavior

### Mock-exam mode

The mock-exam workflow supports:

- User-defined question count.
- User-defined duration in minutes.
- Selection of one or more available domains.
- Weighted question allocation using the configured domain weights.
- Redistribution when a selected domain does not contain enough questions.
- Seeded question randomization.
- Shuffled answer choices.
- A persistent countdown timer.
- Automatic submission when time expires.
- Previous and next question navigation.
- A numbered question navigator.
- Answered and current-question states.
- Flagging questions for later review.
- Submission confirmation.
- Correct, incorrect, unanswered, total, and percentage result calculations.
- Per-domain and per-question result data in the scoring service.

### Learning mode

The learning workflow supports:

- Domain selection before starting.
- Randomized questions without repetition during the session.
- Shuffled choices.
- Immediate correct or incorrect feedback.
- Highlighting the selected and correct choices.
- Displaying the correct answer after an incorrect response.
- Newline-preserving justification display.
- Correct and incorrect counters.
- Session progress information.
- A completed-session screen and restart action.

### Browser persistence

The loaded question bank and active sessions are stored in local storage under these versioned keys:

- `cisa-app-question-bank-v1`
- `cisa-app-active-exam-v1`
- `cisa-app-learning-v1`

This allows state to survive a page refresh. Since answer keys are stored client-side, the application is intended for study and is not suitable for secure or proctored testing.

### Reset application button

A **Reset app** button was added to the header. It asks for confirmation and then:

- Removes the loaded question bank.
- Removes active mock-exam state.
- Removes learning-session state.
- Clears the application local-storage keys.
- Restores the default selected domains.
- Restores the default question count and duration.
- Clears errors.
- Returns to the initial dashboard.

The button is disabled when the application already has no saved state.

## 6. User-interface redesign

The original Vite starter interface and styles were replaced with a responsive application layout in [`app/src/App.tsx`](./app/src/App.tsx), [`app/src/App.css`](./app/src/App.css), and [`app/src/index.css`](./app/src/index.css).

The redesigned interface includes:

- A branded top bar with question-bank status.
- Desktop sidebar navigation.
- Compact mobile bottom navigation.
- A dashboard with question-bank upload and study-mode cards.
- Question coverage cards by domain.
- Accessible form labels and focus states.
- Styled error alerts with dismissal controls.
- Mock-exam setup cards and domain selectors.
- A visible countdown timer.
- Exam progress, numbered navigation, flags, and selected-choice states.
- Learning progress counters and feedback panels.
- Correct and incorrect answer colors.
- A score summary with a percentage ring.
- Responsive desktop, tablet, and mobile layouts.
- A session-complete screen.

A reported domain-card overflow issue was corrected by:

- Giving flex children a constrained minimum width.
- Using responsive grid columns.
- Wrapping long domain titles.
- Limiting titles to two readable lines.
- Adding safe word wrapping.

The corrected layout was checked programmatically at 712 px and 390 px viewport widths. In both cases, the document and domain cards reported no horizontal overflow.

[`app/index.html`](./app/index.html) was also updated with an application title, description, and theme color.

## 7. Application documentation

[`app/README.md`](./app/README.md) was rewritten to document:

- Node.js and npm requirements.
- Installation and development commands.
- The exact JSON question-bank schema.
- Linting and production build commands.
- Local production preview.
- Static-site deployment.
- Dependency maintenance.
- Routine manual checks.
- Browser-storage behavior.
- Troubleshooting guidance.

## 8. Running the application

From the project root:

```bash
cd app
npm install
npm run dev
```

Open the URL displayed by Vite, normally `http://localhost:5173`.

To validate and build a production release:

```bash
npm run lint
npm run build
npm run preview
```

The deployable static files are generated in `app/dist/`.

## 9. Validation completed

The following validation has been completed during development:

- Python extraction tests passed.
- CSV and JSON outputs contain 456 valid records.
- JSON fields were checked against the application's expected schema.
- The JSON file was manually uploaded in the browser.
- Mock-exam setup and active-exam screens were manually inspected.
- Desktop and mobile layout widths were checked for horizontal overflow.
- The latest `npm run build` completed successfully.
- `npm run lint` completed without errors; it currently reports two React advisory warnings concerning `Date.now()` purity and state updates inside the timer effect.

## 10. Dependency-free HTML, CSS, and JavaScript application

A second implementation was created in [`app2/`](./app2/) with the same core study workflows and no Node.js, npm, build process, framework, or external dependencies.

It includes:

- Local JSON upload and schema validation.
- Responsive dashboard and domain selection.
- Weighted mock-exam question allocation, shuffled choices, countdown timer, navigation, flags, scoring, and results.
- Learning mode with no-repeat questions, immediate feedback, and newline-preserved justification.
- Versioned browser persistence and a confirmed full reset.
- Safe HTML escaping for uploaded content.

Run it from the project root with:

```bash
cd app2
python3 -m http.server 8080
```

Then open `http://localhost:8080`. It can also be opened directly through [`app2/index.html`](./app2/index.html), although a local static server is recommended. Detailed instructions are in [`app2/README.md`](./app2/README.md).

The vanilla JavaScript passed `node --check`. Browser validation covered loading all 456 questions, completing and scoring a mock exam, learning feedback and progress, persistence, responsive layout, and reset behavior.

## 11. Current limitations and recommended next work

The application is functional, but these improvements remain useful:

- Add automated TypeScript unit tests for allocation, shuffling, scoring, validation, and persistence.
- Add React component tests for upload, mock-exam, timer, learning, and reset workflows.
- Add filterable per-question result review using the detailed scoring data already produced by the service.
- Display per-domain results in the results interface.
- Add a dedicated pre-submission review showing unanswered and flagged questions.
- Validate restored local-storage objects before using them as application state.
- Review the weighted allocation algorithm with focused tests, especially when only a subset of domains is selected or a domain has too few questions.
- Resolve the two current lint warnings.
- Perform broader cross-browser and accessibility testing.
