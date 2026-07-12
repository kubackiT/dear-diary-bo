module.exports = {
  PORT: process.env.PORT,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  JWT_SECRET: process.env.JWT_SECRET,
  COOKIE_SECRET: process.env.COOKIE_SECRET,
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE
};
