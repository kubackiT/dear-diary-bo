exports.allAccess = (req, res) => {
  res.status(200).send("Treść publiczna.");
};

exports.userBoard = (req, res) => {
  res.status(200).send("Panel użytkownika.");
};

exports.adminBoard = (req, res) => {
  res.status(200).send("Zarządzanie badaniem i użytkownikami.");
};
