'use strict';

var passport = require('passport');
var request = require('request');
var debug = require('debug')('portal:auth:oauth2');
var jwt = require('jsonwebtoken');

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
        var decodedProfile = jwt.decode(accessToken);
        utils.get(req, '/groups', function (err, apiResponse, apiBody) {
            if (err) {
                debug('Could not retrieve groups.');
                return done(null, false, { message: err.message });
            }
            if (200 != apiResponse.statusCode)
                return done(null, false, { message: 'Could not retrieve Group information from API. Login not possible. Status: ' + apiResponse.statusCode });

            var apiGroups = utils.getJson(apiBody).groups;
            // Group matching?
            var defaultGroups = matchGroups(decodedProfile.group, apiGroups);
            var userCreateInfo = {
                customId: decodedProfile[oauth2Glob.customIdField],
                firstName: decodedProfile[oauth2Glob.firstNameField],
                lastName: decodedProfile[oauth2Glob.lastNameField],
                validated: true, // In Oauth2 we trust
                groups: defaultGroups,
                email: decodedProfile[oauth2Glob.emailField]
            };
        return federate.userLogin(req, userCreateInfo, done);
    });
  });
}

function matchGroups(oauthGroups, apiGroups) {
    debug('matchGroups()');
    var defaultGroups = [];
    if (oauthGroups) {
        for (var i = 0; i < oauthGroups.length; ++i) {
            for (var j = 0; j < apiGroups.length; ++j) {
                var foundOauthGroup = apiGroups[j].alt_ids.find(function (alt_id) { return alt_id.toLowerCase() == oauthGroups[i].toLowerCase(); });
                if (!foundOauthGroup)
                    continue;
                var thisGroupId = apiGroups[j].id;
                if (!defaultGroups.find(function (g) { return g == thisGroupId; }))
                    defaultGroups.push(thisGroupId);
            }
        }
    }
    debug(defaultGroups);
    return defaultGroups;
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
