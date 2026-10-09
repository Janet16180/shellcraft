# Contributing

Use Node.js 24 or newer. Install the locked dependencies with `npm ci --ignore-scripts`, then run:

```sh
npm run lint
npm test
npm run bundle
```

Browser checks use Playwright's Chromium:

```sh
npx playwright-core install --with-deps chromium
node test/ui/shots.js .scratch/screenshots --published
node test/ui/layouts.js .scratch/layouts
```

To use another browser installation, set `CHROME_PATH` to its executable or `BROWSER_CHANNEL` to a Playwright browser channel. No machine-specific browser path is built into the tools.

`npm run difftest` compares the simulated shell with Bash in an isolated Docker reference container. It needs Docker access; it does not publish the image.

Open a pull request against `main` with a description of the change and the checks you ran. Explain any AI assistance and how you reviewed its output. Changes need passing CI, CodeQL, and the repository owner's approval. GitHub does not allow authors to approve their own pull requests; owner-authored changes are blocked by the same rule.

CI checks source code, Git history for credentials, browser behavior, the build, and the Bash reference cases. It does not upload artifacts, publish containers, or deploy the game.

The reference comparisons keep stdout, stderr, and exit status exact. Three explicitly listed recursive directory operations compare one stream without line ordering, because Linux directory enumeration depends on the filesystem. They still check every line and duplicate. See [readdir(3)](https://man7.org/linux/man-pages/man3/readdir.3.html).
