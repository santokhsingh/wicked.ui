'use strict';

var express = require('express');
var passport = require('passport');

var router = express.Router();

router.get('/', 
    passport.authenticate('google', { scope: [ 'profile', 'email' ] }) );

module.exports= router;
