"use strict";

function getSessionExpiryDate(rememberMe) {
  const days = rememberMe ? 7 : 1;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function generate6DigitCode() {
  // 000000 - 999999, padded
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
}

function sessionLabelFromUserAgent(userAgent, ip) {
  const ua = String(userAgent || "").trim();
  const ipStr = String(ip || "").trim();

  const isLocal =
    ipStr === "::1" ||
    ipStr === "127.0.0.1" ||
    ipStr === "localhost" ||
    ipStr.startsWith("192.168.") ||
    ipStr.startsWith("10.") ||
    ipStr.startsWith("172.16.");

  // Non-browser clients (common)
  const lower = ua.toLowerCase();
  if (!ua) return isLocal ? "Local · Unknown" : "Unknown · Unknown";
  if (lower.includes("postmanruntime")) return "Postman · API Client";
  if (lower.startsWith("curl/")) return "cURL · API Client";
  if (lower.includes("insomnia")) return "Insomnia · API Client";
  if (lower.includes("axios")) return "Axios · API Client";
  if (lower.includes("node-fetch") || lower.includes("undici"))
    return "Node · HTTP Client";
  if (lower.includes("okhttp")) return "Android · HTTP Client";

  // OS
  let os = "Unknown";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) os = "Mac";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser (order matters)
  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua))
    browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  return `${os} · ${browser}`;
}

module.exports = {
  getSessionExpiryDate,
  generate6DigitCode,
  sessionLabelFromUserAgent,
};
