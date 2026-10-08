# Reviewing a pull request

Every change is reviewed by a teammate before it joins `main`. A good review makes the project better and helps the author learn. Aim to review within the same working day.

## What to check

1. **Does it do what the issue asks?** Read the linked issue first.
2. **Does it work?** Try it yourself, on a phone and on a computer where it matters, in Sinhala, Tamil and English.
3. **Is it small and clear?** One idea; easy to follow. If not, ask for it to be split.
4. **Is it tested?** Tests added or updated, or a good reason why not.
5. **Is it safe?** No real data, no passwords or keys, nothing that should not be public.
6. **Can everyone use it?** Large text, screen readers, clear colours, one-handed use on a phone.
7. **Is the documentation updated** if something people use has changed?
8. **Are the commit messages and the title in the agreed format?** See [docs/WORKFLOW.md](docs/WORKFLOW.md).

## How to comment

- **Be kind and specific.** Talk about the work, never the person.
- **Say what is good,** not only what to fix.
- **Ask, do not order,** when it is a matter of taste.
- **Mark how important a comment is:**
  - **Must:** has to change before merging.
  - **Suggestion:** would be better, author decides.
  - **Question:** you want to understand.
  - **Nit:** tiny thing, optional.

| Helpful | Not helpful |
|---|---|
| "**Must:** the Tamil text overflows the button on a small phone. Could we shorten it or let it wrap? Screenshot attached." | "Broken." |
| "**Suggestion:** this check appears twice; one shared place would make it easier to change later." | "Do it properly." |
| "**Question:** why does the link expire after ten minutes? Is that from the issue?" | "Why?" |
| "Nice, the retake flow is really clear. One **nit**: the button text ends with a full stop." | "LGTM" (and nothing else) |

## Deciding

- **Approve** when it is ready, even if a few nits remain.
- **Request changes** when there is at least one "must".
- **Comment** when you only have questions.
- When new commits arrive after your approval, the approval is cleared: look again.

## For the author

- Answer every comment, even with "done".
- If you disagree, explain why politely; if you cannot agree, ask the project maintainers.
- Do not take it personally: the review is about the work.
