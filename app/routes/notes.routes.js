const { authJwt } = require("../middlewares");
const controller = require("../controllers/notes.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Accept"
    );
    next();
  });

  app.get("/api/notes", controller.getAllNotes);

  app.post("/api/notes", controller.addNewNote);

  app.get("/api/notes/:id", controller.getNote);

  app.put(
    "/api/notes/:id",
    controller.editNote
  );

  app.delete(
    "/api/notes/:id",
    controller.deleteNote
  );
};
