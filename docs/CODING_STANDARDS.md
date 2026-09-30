# Coding Standards

Rules for any code written in this repo, by humans or agents.

## Comments

- No inline comments. Explanations go in a JSDoc block (`/** ... */`) above the function, constant, or module they describe.
- Comments state the ground truth: what the code does and why it has to. No iteration history ("previously...", "this fixes the bug where...", "the model kept doing X"). That belongs in the commit message.
- Document `@param` / `@returns` when the signature isn't obvious from the names.
- Match the surrounding code's naming and idiom.

## Simplicity (ponytail)

The best code is the code never written. Stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative need = skip it. (YAGNI)
2. **Already in this codebase?** Reuse the helper, util, or pattern that already lives here. Look before you write.
3. **Node stdlib does it?** Use it.
4. **Native platform feature covers it?** CSS over JS, native HTML element over a lib, DB constraint over app code.
5. **Already-installed dependency solves it?** Use it. Never add a dependency for what a few lines can do.
6. **Can it be one line?** One line.
7. **Only then:** the minimum code that works.

The ladder runs *after* you understand the problem, not instead of it. Read the task and trace the real flow end to end first.

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No scaffolding "for later".
- Deletion over addition. Boring over clever.
- Fewest files, shortest working diff, but only in the right place. The smallest change in the wrong place is a second bug.
- Two options of the same size: take the one that's correct on edge cases.
- A deliberate simplification with a known ceiling (global lock, O(n²) scan, naive heuristic) gets a `ponytail:` line in the JSDoc above it, naming the ceiling and the upgrade path.

## Bug fixes

Fix the root cause, not the symptom. Before editing a function, find every caller. One guard in the shared function beats a guard in every caller, and patching only the reported path leaves the sibling callers broken.

## Verification

There's no test framework in this repo. Non-trivial logic (a branch, a loop, a parser, a security or money path) still leaves one runnable check behind: the smallest thing that fails if the logic breaks, like a `node -e` / `assert` script or a curl against the running service. Trivial one-liners need none.

## Never simplify away

Input validation at trust boundaries, error handling that prevents data loss, security measures (guardrails, approvals), accessibility basics, and anything explicitly requested.
