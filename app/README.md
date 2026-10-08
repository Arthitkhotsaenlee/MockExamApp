# CISA Exam Practice Application

A client-side React application with mock-exam and learning modes. Question data is not bundled; users load a compatible JSON file from their device. Data and active sessions remain in browser local storage.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A compatible JSON question bank

## Install and run

From the `app` directory:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Select **Load Data**, choose a compatible JSON file, and start Mock Exam or Learning mode. Stop the server with **Ctrl+C**.

## Question-bank format

The JSON root must be an array. Every question requires these string fields:

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

## Validate changes

Run before deployment:

```bash
npm run lint
npm run build
```

The production build is written to `dist/`. Test it locally with:

```bash
npm run preview
```

## Deploy

Deploy the contents of `dist/` to any static web host. Rebuild after every source-code or dependency change. No backend, database server, or runtime environment variables are required.

## Maintenance

### Update dependencies

```bash
npm outdated
npm update
npm run lint
npm run build
```

Commit `package.json` and `package-lock.json` together when dependencies change. For major-version upgrades, review release notes and test both application modes manually.

### Routine manual checks

1. Load a valid question bank and confirm invalid JSON shows an error.
2. Start, answer, and submit a mock exam.
3. Confirm scoring and answer explanations.
4. Start learning mode and verify immediate feedback.
5. Refresh and verify active state restoration.
6. Check desktop and mobile layouts.

### Browser storage

The application stores its question bank and session state under keys beginning with `cisa-app-`. To reset the application, clear the site's local storage in browser developer tools and reload.

Uploaded files never leave the browser. Answers are stored client-side, so this application is suitable for study but not for secure or proctored exams.

## Troubleshooting

- **JSON does not load:** Verify the root is an array and all fields use the exact names and allowed values above.
- **Old session causes unexpected behavior:** Clear local storage and reload.
- **Port 5173 is unavailable:** Use Vite's alternate URL or run `npm run dev -- --port 5174`.
- **Production build fails:** Run `npm install`, then resolve errors from `npm run lint` and `npm run build`.
