'use strict';

var express = require('express');
var passport = require('passport');

var router = express.Router();

router.get('/', 
    passport.authenticate('github', { scope: [ 'user:email' ] }) );

module.exports= router;