const {
  getSessionExpiryDate,
  generate6DigitCode,
  sessionLabelFromUserAgent,
} = require("../../utils/authSession.util");

// ---------------------------------------------------------------------------
// getSessionExpiryDate
// ---------------------------------------------------------------------------
describe("getSessionExpiryDate", () => {
  test("returns ~7 days in the future when rememberMe=true", () => {
    const before = Date.now();
    const expiry = getSessionExpiryDate(true);
    const after = Date.now();

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 100);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 100);
  });

  test("returns ~1 day in the future when rememberMe=false", () => {
    const before = Date.now();
    const expiry = getSessionExpiryDate(false);
    const after = Date.now();

    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + oneDayMs - 100);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + oneDayMs + 100);
  });

  test("rememberMe=false produces earlier expiry than rememberMe=true", () => {
    const short = getSessionExpiryDate(false);
    const long = getSessionExpiryDate(true);
    expect(long.getTime()).toBeGreaterThan(short.getTime());
  });

  test("returns a Date object", () => {
    expect(getSessionExpiryDate(true)).toBeInstanceOf(Date);
    expect(getSessionExpiryDate(false)).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// generate6DigitCode
// ---------------------------------------------------------------------------
describe("generate6DigitCode", () => {
  test("returns a string of exactly 6 characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generate6DigitCode();
      expect(typeof code).toBe("string");
      expect(code).toHaveLength(6);
    }
  });

  test("all characters are numeric digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(/^\d{6}$/.test(generate6DigitCode())).toBe(true);
    }
  });

  test("pads codes with leading zeros so they are always 6 chars", () => {
    // Verify the padding contract — monkey-patch Math.random to produce a low value
    const original = Math.random;
    Math.random = () => 0.000001; // ~floor gives 1
    const code = generate6DigitCode();
    Math.random = original;

    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sessionLabelFromUserAgent
// ---------------------------------------------------------------------------
describe("sessionLabelFromUserAgent", () => {
  const cases = [
    // [description, ua, ip, expected]
    [
      "Chrome on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "1.2.3.4",
      "Windows · Chrome",
    ],
    [
      "Firefox on Mac",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:122.0) Gecko/20100101 Firefox/122.0",
      "1.2.3.4",
      "Mac · Firefox",
    ],
    [
      "Safari on Mac",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
      "1.2.3.4",
      "Mac · Safari",
    ],
    [
      "Edge on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
      "1.2.3.4",
      "Windows · Edge",
    ],
    [
      "Opera on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0",
      "1.2.3.4",
      "Windows · Opera",
    ],
    [
      "iPhone Safari",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "1.2.3.4",
      "iPhone · Safari",
    ],
    [
      "Android Chrome",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36",
      "1.2.3.4",
      "Android · Chrome",
    ],
    ["Postman", "PostmanRuntime/7.36.0", "1.2.3.4", "Postman · API Client"],
    ["cURL", "curl/8.4.0", "1.2.3.4", "cURL · API Client"],
    ["Insomnia", "insomnia/8.6.1", "1.2.3.4", "Insomnia · API Client"],
    ["Axios", "axios/1.6.2", "1.2.3.4", "Axios · API Client"],
    ["Local IPv6 loopback", "", "::1", "Local · Unknown"],
    ["Local IPv4 loopback", "", "127.0.0.1", "Local · Unknown"],
    ["No UA and no local IP", "", "8.8.8.8", "Unknown · Unknown"],
    [
      "Linux desktop Chrome",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "1.2.3.4",
      "Linux · Chrome",
    ],
    [
      "iPad Safari",
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "1.2.3.4",
      "iPad · Safari",
    ],
  ];

  test.each(cases)("%s", (_desc, ua, ip, expected) => {
    expect(sessionLabelFromUserAgent(ua, ip)).toBe(expected);
  });

  test("handles null/undefined UA gracefully", () => {
    expect(() => sessionLabelFromUserAgent(null, "1.2.3.4")).not.toThrow();
    expect(() => sessionLabelFromUserAgent(undefined, "1.2.3.4")).not.toThrow();
  });

  test("handles null/undefined IP gracefully", () => {
    expect(() => sessionLabelFromUserAgent("Mozilla/5.0", null)).not.toThrow();
  });
});
