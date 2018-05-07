'use strict';

var passport = require('passport');
var request = require('request');
var { debug, info, warn, error } = require('portal-env').Logger('portal:auth:google');

var GoogleStrategy = require('passport-google-oauth20').Strategy;

var utils = require('../../routes/utils');
var portalGlobals = require('../../portalGlobals');

var federate = require('../federate');

var googleStrategy = null;

if (portalGlobals.glob.auth.google && 
    portalGlobals.glob.auth.google.useGoogle) {
    debug('Initializing Google Authentication');
    var googleGlob = portalGlobals.glob.auth.google;
    
    googleStrategy = new GoogleStrategy({
        clientID: googleGlob.clientID,
        clientSecret: googleGlob.clientSecret,
        callbackURL: googleGlob.callbackURL,
        passReqToCallback: true
    }, function(req, accessToken, refreshToken, profile, done) {
        debug('Google Authentication');
        debug(profile);
        // Get the email addresses; they are not included in the OAuth profile directly.
        var email = getEmail(profile);
        var userCreateInfo = {
            customId: 'Google:' + profile.id,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            validated: true,
            email: email,
            groups: []
        };
        
        return federate.userLogin(req, userCreateInfo, done);
    });
}

function getEmail(profile) {
    debug('getEmail()');
    if (!profile.emails)
        return null;
    if (profile.emails.length <= 0)
        return null;
    return profile.emails[0].value;
}

module.exports.setup = function() {
    debug('setup()');
    if (googleStrategy)
        passport.use('google', googleStrategy);
};