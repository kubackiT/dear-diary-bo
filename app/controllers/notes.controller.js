const db = require("../models");
const Note = db.note;

exports.addNewNote = (req, res) => {
  const note = new Note({
    userId: req.body.userId,
    title: req.body.title,
    content: req.body.content,
  });

  note.save((err, note) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }
    if(note){
      res.status(200).send({ message: 'Note has been saved' });
      return;
    }
  });
};

exports.getAllNotes = (req, res) => {
  Note.find({
    userId: req.query.userId,
  })
  .exec((err, notes) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }

    res.status(200).send(notes);
  });
};

exports.getNote = (req, res) => {
  Note.findById(req.params.id)
  .exec((err, note) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }

    res.status(200).send(note);
  });
};

exports.editNote = (req, res) => {
  Note.findByIdAndUpdate(req.params.id, {...req.body, updatedAt: Date.now()})
  .exec((err, note) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }

    res.status(200).send({ message: 'Note has been saved' });
  });
};

exports.deleteNote = (req, res) => {
  Note.findByIdAndDelete(req.params.id)
  .exec((err) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }

    res.status(200).send({ message: 'Note has been deleted' });
  });
};

