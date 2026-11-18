# TRISCRIPT User Guide

TRISCRIPT reads a letter locally, suggests editable values, and saves a
confirmed record only after a person reviews and confirms it. The interface
supports English, Sinhala, and Tamil. It is not an official government
recording system, and generated test data is explicitly marked as invalid.

## Start the application

Follow the Windows, Linux, or Docker Compose instructions in the repository
[README](../README.md). For phone capture, use the computer's LAN address and
keep the phone and computer on the same trusted Wi-Fi. A `localhost` QR link
works only on the computer itself.

## Scan a letter

1. Select the language for the computer interface.
2. Scan the displayed QR code with the phone camera.
3. Photograph the whole page in good light. If the letter has multiple pages,
   select **Add this page** until the final page; then select **Finish letter
   with this page**.
4. If the image is too dark, blurred, or appears cropped, retake it as
   instructed. Each page photo is deleted after its OCR pass.
5. On the computer, compare and edit every suggested value. Confidence is an
   OCR estimate, not proof of correctness. Empty values were not safely
   detected.
6. Select **Confirm details**, review the summary, select the explicit
   confirmation checkbox, and then select **Save confirmed form**.

If the database is unavailable, the application reports that the save failed
and does not show a success state. No record is saved before explicit
confirmation.

## Privacy

The backend processes the uploaded image locally. The original and
preprocessed image are temporary files and are removed after the OCR request,
including on failure. Only fields from confirmed submissions are stored in
PostgreSQL. There are no cloud OCR or analytics requests.

## Sinhala and Tamil guides

- Sinhala user guide: **placeholder — translation not yet provided.**
- தமிழ் பயனர் வழிகாட்டி: **placeholder — translation not yet provided.**
