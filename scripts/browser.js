/** Browser tools use Playwright's installed Chromium, or an explicit override. */
export function browserOptions() {
  const { CHROME_PATH, BROWSER_CHANNEL } = process.env;
  return {
    headless: true,
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : BROWSER_CHANNEL ? { channel: BROWSER_CHANNEL } : {}),
  };
}
