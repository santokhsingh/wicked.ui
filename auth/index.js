'use strict';

var express = require('express');
var passport = require('passport');
var portalGlobals = require('../portalGlobals');
var debug = require('debug')('portal:auth');

var router = express.Router();

if (portalGlobals.glob.auth.local &&
    portalGlobals.glob.auth.local.useLocal) {
    debug('Activating local authentication');
    require('./local/passport').setup();
    router.use('/local', require('./local'));
}

if (portalGlobals.glob.auth.adfs) {
    require('./adfs/passport').setup();
    router.use('/adfs', require('./adfs'));
}

if (portalGlobals.glob.auth.github) {
    require('./github/passport').setup();
    router.use('/github', require('./github'));
}

if (portalGlobals.glob.auth.google) {
    require('./google/passport').setup();
    router.use('/google', require('./google'));
}

//In case we want to have custom manipulation of the user data that gets stored in the session, for all strategies used.
passport.serializeUser(function(user, done) {
    // var decodedUser = jwt.decode(user);
    done(null, user);
});
passport.deserializeUser(function(user, done) {
    done(null, user);
});

module.exports=router;