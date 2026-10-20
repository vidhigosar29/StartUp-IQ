const express = require("express");
const router = express.Router();

const {
  getTree,
} = require("../controllers/schemeFinderController");

router.get("/tree", getTree);

module.exports = router;