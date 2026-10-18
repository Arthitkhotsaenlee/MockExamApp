# Mock Exam Study — Vanilla HTML, CSS, and JavaScript

This dependency-free exam practice application provides mock-exam and learning workflows using only HTML, CSS, and JavaScript, with no npm installation or build step.

Question data is not bundled. Each user selects a compatible JSON question bank from their own device, and all data remains in browser local storage.

## Run the application

### Simplest option

Open `index.html` in a modern browser. Most current browsers support the required local file and storage APIs.

### Recommended local server

From the `app` directory, use any static HTTP server. For example, with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

No npm installation or build command is required.

## Files

- `index.html` — static page structure and application shell.
- `styles.css` — responsive desktop and mobile presentation.
- `app.js` — validation, state, question randomization, exam, scoring, learning, storage, and rendering logic.

All three files must remain together when the application is copied or deployed.

## Question-bank format

The JSON root must be an array. Every question requires the following string fields:

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

`key answer` must be `A`, `B`, `C`, or `D`. `domaina_index` must be a string from `1` through `5`.

## Features

- Local JSON upload and row validation
- Stable question IDs and duplicate removal
- Domain counts and selection, with all domains selected by default
- Configurable mock-exam size and duration
- Weighted, randomized question selection
- Answer choices retained in A–D order in mock-exam and learning modes
- Persistent timer with automatic submission
- Question navigation, answered indicators, and flags
- Score summary with correct, incorrect, and unanswered counts
- Post-exam review with each question, selected answer, correct answer, and explanation
- Randomized no-repeat learning sessions
- Per-question learning timer showing elapsed time in minutes and seconds
- Immediate answer feedback and explanations
- Browser persistence across refreshes
- Confirmed application reset
- Responsive desktop, tablet, and mobile interface

## Browser storage

This version uses these local-storage keys:

- `mock-exam-app-question-bank-v1`
- `mock-exam-app-active-exam-v1`
- `mock-exam-app-learning-v1`

Use **Reset app** to remove the question bank and all saved progress.

## Share or deploy

Copy the complete `app` folder, or upload its three application files to any static web host. A recipient only needs a modern browser and does not need npm.

Because answer keys are available in browser storage, this application is intended for study rather than secure or proctored examinations.
