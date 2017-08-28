'use strict';

var express = require('express');
var passport = require('passport');

var router = express.Router();

router.get('/', 
    passport.authenticate('oauth2', { scope: [ 'profile', 'email' ] }) );

module.exports= router;
