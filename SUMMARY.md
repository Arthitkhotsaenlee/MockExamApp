# Mock Exam Application Summary

## Current architecture

The project contains one browser application under [`app/`](./app/). It uses plain HTML, CSS, and JavaScript and has no framework, npm dependency, build process, backend, or database.

The supporting Python utilities are under [`src/`](./src/):

- [`extract_questions.py`](./src/extract_questions.py) parses OCR text files into a validated CSV question bank.
- [`csv_to_json.py`](./src/csv_to_json.py) converts the CSV question bank into the JSON format accepted by the application.

Question data is not bundled into the browser application. A user selects a local JSON file, and the question bank and study state remain in that browser.

## Question processing

The extractor reads `.txt` files under `raw_data/`, recognizes questions, choices A–D, answer keys, justifications, and domains, removes known OCR noise, rejects incomplete records, detects conflicting duplicates, and writes its CSV output atomically.

Run the pipeline from the project root:

```bash
python src/extract_questions.py --output data/question.csv
python src/csv_to_json.py --input data/question.csv --output data/question.json
```

Run its automated tests with:

```bash
python -m unittest discover -s tests
```

## Browser application

The application consists of:

- [`index.html`](./app/index.html): application shell and navigation.
- [`styles.css`](./app/styles.css): responsive desktop, tablet, and mobile presentation.
- [`app.js`](./app/app.js): validation, state, question selection, exam, learning, scoring, persistence, and rendering logic.

It validates the uploaded JSON schema, creates stable question IDs, removes duplicate IDs, calculates domain availability, and safely escapes uploaded content before rendering it.

### Default domain selection

Domains 1 through 5 are selected by default. Resetting the application restores the same all-domain selection.

### Question and choice order

Questions remain randomized in mock-exam and learning sessions. Answer choices are not randomized: they are displayed in their original A, B, C, D order in both modes, including when an older saved session is restored.

### Mock-exam mode

Mock exams provide configurable question counts and duration, weighted domain allocation, randomized question selection, a persistent countdown timer, automatic submission, question navigation, flags, and score results. After submission, the result page reveals each question's selected answer, correct answer, highlighted choices, and explanation. Answers remain hidden while the exam is active.

### Learning mode

Learning mode randomizes eligible questions without repeating a question during the session. It provides immediate correct or incorrect feedback, shows the correct answer, preserves explanation line breaks, and tracks progress and answer counts.

### Browser persistence

The application uses these local-storage keys:

- `mock-exam-app-question-bank-v1`
- `mock-exam-app-active-exam-v1`
- `mock-exam-app-learning-v1`

Reset removes the question bank and saved sessions and returns the configuration to its defaults.

## Run and deploy

The application can be opened directly through `app/index.html` or served as static files:

```bash
cd app
python -m http.server 8080
```

The complete `app/` folder can be copied to any static web host. Since correct answers are stored client-side, the application is intended for study and not secure or proctored examinations.
