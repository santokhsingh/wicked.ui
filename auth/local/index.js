'use strict';

var express = require('express');
var passport = require('passport');

var router = express.Router();

router.post('/', passport.authenticate('local-signin', {
        failureFlash: true,
        successRedirect: '/signup',
        failureRedirect: '/login'
     })
);

module.exports = router;