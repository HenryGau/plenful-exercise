const express = require("express");
const { getGreeting } = require("./db");

const app = express();

app.get("/helloworld", async (req, res, next) => {
  try {
    const message = await getGreeting();
    res.json({ message });
  } catch (err) {
    next(err);
  }
});

if (require.main === module) {
  const { initDatabase } = require("./db");
  const port = process.env.PORT || 3000;

  initDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
      });
    })
    .catch((err) => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
}

module.exports = app;
