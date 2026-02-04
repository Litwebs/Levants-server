function getSetCookieHeader(res) {
  return res.headers["set-cookie"] || [];
}

function getCookieValueFromSetCookie(setCookie, name) {
  const row = setCookie.find((c) => String(c).startsWith(`${name}=`));
  if (!row) return null;
  return row.split(";")[0].slice(name.length + 1);
}

module.exports = {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
};
