const { authJwt } = require("../middlewares");
const controller = require("../controllers/research.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Accept"
    );
    next();
  });

  app.get("/api/research/runtime-config", [authJwt.verifyToken], controller.getRuntimeConfig);
  app.get("/api/research/users", [authJwt.verifyToken, authJwt.isAdmin], controller.getUsers);
  app.get("/api/research/config", [authJwt.verifyToken, authJwt.isAdmin], controller.getConfig);
  app.put("/api/research/config", [authJwt.verifyToken, authJwt.isAdmin], controller.updateConfig);
  app.put("/api/research/users/:userId/settings", [authJwt.verifyToken, authJwt.isAdmin], controller.updateUserResearchSettings);
  app.post("/api/research/freeze-profile", [authJwt.verifyToken, authJwt.isAdmin], controller.freezeProfile);
  app.get("/api/research/stats", [authJwt.verifyToken, authJwt.isAdmin], controller.getStats);
};
