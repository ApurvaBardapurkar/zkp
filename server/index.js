const { createApp } = require("./app");

const app = createApp();

const port = Number(process.env.SERVER_PORT || "8787");
app.listen(port, () => console.log(`Pinata proxy server on http://localhost:${port}`));

