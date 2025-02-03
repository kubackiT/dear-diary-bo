const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
require("dotenv").config();

const authConfig = require("./app/config/auth.config");
const dbConfig = require("./app/config/db.config");

const app = express();
const corsOptions = {
  credentials: true,
  origin: [authConfig.CORS_ORIGIN],
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: ["Content-Type", "Authorization"],
  enablePreflight: true
}

app.use(
  cors(corsOptions)
);

app.options('*', cors(corsOptions));

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: "dear-diary-session",
    keys: [authConfig.COOKIE_SECRET], // should use as secret environment variable
    httpOnly: true
  })
);

const db = require("./app/models");
const Role = db.role;

db.mongoose
  .connect(`mongodb+srv://${dbConfig.LOGIN}:${dbConfig.PASSWORD}@${dbConfig.DB}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log("Successfully connect to MongoDB.");
    initial();
  })
  .catch(err => {
    console.error("Connection error", err);
    process.exit();
  });

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to dear diary application." });
});

// routes
require("./app/routes/auth.routes")(app);
require("./app/routes/user.routes")(app);
require("./app/routes/notes.routes")(app);

// set port, listen for requests
const PORT = authConfig.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

function initial() {
  Role.estimatedDocumentCount((err, count) => {
    if (!err && count === 0) {
      new Role({
        name: "user"
      }).save(err => {
        if (err) {
          console.log("error", err);
        }

        console.log("added 'user' to roles collection");
      });

      new Role({
        name: "admin"
      }).save(err => {
        if (err) {
          console.log("error", err);
        }

        console.log("added 'admin' to roles collection");
      });
    }
  });
}