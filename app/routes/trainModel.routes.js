const controller = require("../controllers/trainModel.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/train/verify", controller.verifySample);

  app.get("/api/model/:userId", controller.getModel);

  app.post("/api/train/:userId", controller.trainModel);
};
