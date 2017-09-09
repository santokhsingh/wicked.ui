'use strict';

var passport = require('passport');
var request = require('request');
var debug = require('debug')('portal:auth:oauth2');

var OAuth2Strategy = require('passport-oauth').OAuth2Strategy;

var utils = require('../../routes/utils');
var portalGlobals = require('../../portalGlobals');

var federate = require('../federate');

var oauth2Strategy = null;

if (portalGlobals.glob.auth.oauth2 && 
    portalGlobals.glob.auth.oauth2.useOauth2) {
    debug('Initializing Oauth2 Authentication');
    var oauth2Glob = portalGlobals.glob.auth.oauth2;
    
    oauth2Strategy = new OAuth2Strategy({
        authorizationURL: oauth2Glob.authorizationURL,
        tokenURL: oauth2Glob.tokenURL,
        clientID: oauth2Glob.clientID,
        clientSecret: oauth2Glob.clientSecret,
        callbackURL: oauth2Glob.callbackURL,
        passReqToCallback: true
    }, function(req, accessToken, refreshToken, profile, done) {
        debug('Oauth2 Authentication');
        debug(profile);
        // Get the email addresses; they are not included in the OAuth profile directly.
        var email = getEmail(profile);
        var userCreateInfo = {
            customId: 'Oauth2:' + profile.id,
            firstName: profile.name.firstName,
            lastName: profile.name.lastName,
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
    if (oauth2Strategy)
        passport.use('oauth2', oauth2Strategy);
};