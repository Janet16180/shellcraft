# Security

Report suspected vulnerabilities through this repository's private vulnerability reporting form on GitHub. Do not post credentials or an exploit containing private data in a public issue.

Shellcraft runs a simulated shell in the browser. Game commands change its in-memory world; they do not run on your computer. Progress is stored locally in your browser. The page loads fonts from Google Fonts.

The development server binds to `127.0.0.1`. Keep it local. Differential tests execute fixed test cases inside a Docker reference container; review changes to those cases before running them.

The public repository requires passing tests, CodeQL, resolved review discussions, and owner code review for changes to `main`. Force pushes and branch deletion are blocked, with no bypass actors. Actions have read-only default permissions, pinned action references, and approval requirements for external contributors. CI does not publish or deploy anything.

These controls help review changes; they are not a claim that the game has had a complete security audit.
