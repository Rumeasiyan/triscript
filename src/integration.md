# TRISCRIPT Integration Contract

## Purpose

A host page can use TRISCRIPT to start a scan session and receive the
results from a phone.

## Integration flow

1. The host page starts a TRISCRIPT session.
2. TRISCRIPT creates a short-lived session.
3. The host page displays the session QR code.
4. The user scans the QR code with a phone.
5. The phone captures a test letter photo.
6. TRISCRIPT processes the photo.
7. The host page receives the extracted fields and photo.
8. The person checks and corrects the values before saving.

## Result

A successful result contains:

* extracted letter fields
* field confidence values
* the captured photo

The host page must allow the person to review and correct the values before
saving.

## Test data

Only invented test letters and forms are used.

No real personal information, official documents, passwords, or secrets are
used.
