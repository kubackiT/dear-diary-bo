const controller = require("../controllers/trainingData.controller");
const { authJwt } = require("../middlewares");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Accept"
    );
    next();
  });


  app.post("/api/train/training-data", [authJwt.verifyToken], controller.trainingData);

};
