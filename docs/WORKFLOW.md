# How we work, step by step

This guide shows exactly how a piece of work moves from an issue to `main`, with a worked example from this project. Read it with [CONTRIBUTING.md](../CONTRIBUTING.md) and [REVIEWING.md](../REVIEWING.md).

## New to GitHub? The words you will see

| Word | What it means |
|---|---|
| **Repository** | This project's folder on GitHub, with its full history |
| **Issue** | One piece of work or one problem, written down and numbered |
| **Branch** | Your own copy of the project where you make a change without touching `main` |
| **Commit** | A saved step in your work, with a short message saying what it does |
| **Pull request (PR)** | A request to bring your branch into `main`, where others review it |
| **Review** | A teammate reads and tries your change, then approves it or asks for changes |
| **Merge** | Your reviewed change joins `main` |
| **`main`** | The shared, always-working version. Nobody changes it directly |

## The steps

1. **Pick an issue** and comment that you are taking it, with a few lines on how you plan to do it.
2. **Create a branch** named `<type>/<issue number>-<short-name>`.
3. **Commit little and often**, each commit one idea, in the agreed format.
4. **Push your branch** at least once a day.
5. **Open a pull request** when ready (or as a draft for early feedback). Fill in the template.
6. **A teammate reviews.** Answer every comment; change or explain.
7. **Merge after approval** (squash). The branch is deleted. The issue closes.

## Branch names

`<type>/<issue number>-<short-name>`, lower case, words joined with hyphens.

| Good | Not good |
|---|---|
| `feat/6-three-language-screens` | `my-branch` |
| `fix/31-date-read-wrong` | `fix` |
| `docs/24-how-to-guide` | `Yaswini-work` |

## Commit messages

Format: **`<type>: <what it does, present tense> (#<issue>)`**

| Type | Use it for |
|---|---|
| `feat` | Something new people can use |
| `fix` | Correcting something broken |
| `docs` | Documentation only |
| `test` | Adding or improving tests |
| `refactor` | Better code, same behaviour |
| `style` | Formatting only, no change in behaviour |
| `chore` | Housekeeping (settings, tidying) |

| Good | Not good | Why |
|---|---|---|
| `feat: add retake button to the capture screen (#12)` | `update` | Says nothing |
| `fix: read dates written as 08.10.2026 (#31)` | `fixed bug` | Which bug? Past tense |
| `docs: explain how to pair a phone (#24)` | `Added docs and fixed stuff and tests` | Several ideas in one commit |

**Set up the template once** so every commit starts with a reminder of the format:

```
git config commit.template .gitmessage
```

## Pull request titles

Pull requests are squash-merged, so **the title becomes the commit on `main`**. Use the same format: `<type>: <what it does> (#<issue>)`.

## A worked example from this project

**Issue #6: Screen text in Sinhala, Tamil and English**

1. **Take it.** Comment on the issue: "I'll take this. Plan: ... Should be ready by Thursday." A teammate replies "Sounds good."
2. **Branch:** `feat/6-three-language-screens`
3. **Commits**, one idea each:
```
feat: add Sinhala and Tamil text for the capture screen (#6)
feat: add language switch to the capture screen (#6)
test: check every screen has text in all three languages (#6)
```
4. **Pull request** title: `feat: screen text in Sinhala, Tamil and English (#6)`. In the template: *What:* the capture screen shows its text in the language the person chooses. *Why:* closes #6. *How tested:* tried each language on a phone and a laptop; screenshots attached. Checklist ticked.
5. **Review.** The reviewer tries it, leaves two comments (one question, one suggestion), and asks for one change. The author makes the change in a new commit and replies to both comments.
6. **Approve and merge.** The reviewer approves; the author squash-merges. `main` now has one clean commit with the pull request title, and issue #6 closes by itself.

## When things go wrong

| Problem | What to do |
|---|---|
| Your branch is behind `main` | Update it from `main` before asking for review, and check it still works |
| Two people changed the same lines (a conflict) | Ask the other person, decide together, then resolve it. Never just keep your own version |
| You committed something you should not have (real data, a password) | Stop and tell the project maintainers at once. Do not try to hide it |
| Stuck for more than an hour | Ask your team in the issue or pull request |
