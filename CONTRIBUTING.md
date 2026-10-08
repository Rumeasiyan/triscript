# Contributing to TRISCRIPT

Thank you for helping. Everyone is welcome, whatever your experience. This page explains how we work together so that every change is easy to review and safe to merge.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first. By taking part you agree to follow it.

## 1. Pick an issue

- Look through the [issues](../../issues). If you are new, start with one labelled `good first issue`.
- Each issue says what the person using TRISCRIPT needs and how we will know it is done (the acceptance criteria).
- If something is missing, or you have found a problem, open a new issue using one of the templates. One issue for one thing.

## 2. Talk about it in the issue first

- Before you start, leave a comment on the issue saying you would like to take it and how you plan to do it.
- Wait for a maintainer or a teammate to agree, so two people do not do the same work and nobody spends days on an approach that will not be accepted.
- If you get stuck, say so in the issue. Asking early is always better than asking late.

## 3. One branch per issue

- Never work directly on `main`. It is protected and will refuse direct pushes.
- Create a new branch for each issue, named with the issue number and a few words, for example `12-retake-photo`.
- Keep the branch short-lived. Merge it within a few days, then start a fresh branch for the next issue.

## 4. Keep pull requests small

- One pull request does one thing. If it grows, split it.
- Aim for a change a reviewer can read carefully in about fifteen minutes.
- Open a draft pull request early if you want feedback before you finish.

## 5. Describe your change

Every pull request uses the template and says:

- **What** changed.
- **Why** it changed.
- **Which issue** it closes, written as `Closes #12`, so the issue closes when the pull request is merged.
- **How you tested it**, so the reviewer can try it too.
- **Screenshots** for anything people will see on a screen.

## 6. Reviews

- Every pull request needs **one approving review** from someone other than the author before it can be merged.
- Reviewers: read the whole change, try it where you can, and be kind and specific. Say what is good as well as what needs to change.
- Authors: answer every comment, either by changing the code or by explaining why not. Thank your reviewer.
- If new commits are pushed after an approval, the approval is cleared and the change is reviewed again.
- Pull requests are squash-merged, so the pull request title becomes the commit on `main`. Make it a good one.

## 7. Tests

- Add or update tests with your change wherever it is possible.
- If something cannot be tested automatically, explain in the pull request how you checked it by hand.
- Do not merge a change that breaks existing tests.

## 8. Test data only, never real data

This is the most important rule in the project.

- **Never commit real data.** No real letters, forms, names, addresses, ID numbers, phone numbers, asset lists, office layouts, letterheads, emblems or seals. Not even ones that look public.
- Use only invented test data. Test letters, forms and other test data are provided by the project maintainers; every test item is clearly marked "TEST", and reference numbers start with `TEST`.
- Do not take photos that show people, screens or real office papers.
- If you find anything in the repository that looks like real data, do not copy it or share it. Tell the project maintainers at once so it can be removed.

## 9. Never commit passwords or keys

- Never commit passwords, keys, tokens or any other secret, not even for testing.
- Secret scanning is turned on and may block a push that contains one. If a secret is ever committed by mistake, tell the project maintainers straight away: the secret must be changed, not just deleted from the file.

## 10. How to write commits

- Short and clear: one line of about 50 characters or fewer, then a blank line and more detail if it helps.
- Present tense, as an instruction: "Add retake button", not "Added retake button" or "Adding retake button".
- Say what the change does and, if it is not obvious, why.
- One idea per commit. Avoid messages like "update", "fix" or "changes".
- If you paired with someone, credit them with a `Co-authored-by:` line.

## 11. Choices about how to build it

The team chooses how TRISCRIPT is built and writes down each important choice, with the options it compared and the reasons, in the `docs/` folder. If you want to change one of those choices, open an issue and discuss it first.

## Questions

Ask in the issue you are working on, or open a new issue. There are no silly questions.
