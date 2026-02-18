const path = require("path");
const axios = require("axios");
const { GoogleAuth } = require("google-auth-library");

const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

const keyPath = path.resolve(
  __dirname,
  "../keys/levan-487614-d7b7d1383186.json",
);

const auth = new GoogleAuth({
  keyFile: keyPath,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

async function optimizeRoutes(requestBody) {
  const accessToken = await getAccessToken();

  const response = await axios.post(
    `https://routeoptimization.googleapis.com/v1/projects/${PROJECT_ID}:optimizeTours`,
    requestBody,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

module.exports = {
  optimizeRoutes,
};
