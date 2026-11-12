# Contributing to TRISCRIPT

Thank you for helping improve a privacy-first, trilingual document workflow.
Contributions should preserve the following invariants:

- Never store an uploaded photograph. Delete temporary image files when OCR
  finishes or fails.
- Never persist a record without the person's explicit confirmation.
- Keep processing on the user's local network; do not add hosted OCR or
  analytics services.
- Use only invented examples marked `TEST LETTER, NOT VALID` and `TEST/`.
- Leave uncertain extracted fields empty and preserve their confidence values.

## Development

Install the requirements in the README, then run the backend and frontend
locally. Do not commit credentials, `.env` files, sample letters, or generated
OCR content.

Before submitting a change, run the relevant checks:

```powershell
cd .\backend
go test -count=1 ./...
go vet ./...
```

```powershell
cd .\frontend
npm run typecheck
npm run build
```

Changes to OCR extraction should add focused tests with synthetic `TEST`
content. Changes to browser messages should update English, Sinhala, and Tamil
dictionaries together. Form layouts belong in `frontend/forms/` and must use
the field keys and message keys supported by the frontend.

Describe the behavior changed, commands run, results, and remaining untested
paths in a pull request. Never claim phone, PostgreSQL, or Docker behavior was
tested unless it was exercised in that environment.
