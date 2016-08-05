'use strict';

var express = require('express');
var passport = require('passport');

var router = express.Router();

router.get('/', passport.authenticate('adfs', {
        failureFlash: true,
        successRedirect: '/signup',
        failureRedirect: '/login'
     })
);

module.exports= router;