'use strict';
/* jshint loopfunc: true */

var passport = require('passport');
var request = require('request');
var debug = require('debug')('portal:auth:adfs');
var OAuth2Strategy = require('passport-oauth').OAuth2Strategy;
//var refresh = require('passport-oauth2-refresh');
var jwt = require('jsonwebtoken');
var fs = require('fs');
var reqUtils = require('../../routes/requestUtils');
var portalGlobals = require('../../portalGlobals');
var federate = require('../federate');

var adfsStrategy = null;

if (portalGlobals.glob.auth.adfs &&
    portalGlobals.glob.auth.adfs.useAdfs) {
    debug('Initializing ADFS Authentication');
    var adfsGlob = portalGlobals.glob.auth.adfs;

    adfsStrategy = new OAuth2Strategy({
        authorizationURL: adfsGlob.authorizationURL,
        tokenURL: adfsGlob.tokenURL,
        clientID: adfsGlob.clientID, // This is the ID of the ADFSClient created in ADFS via PowerShell
        clientSecret: adfsGlob.clientSecret, // This is ignored but required by the OAuth2Strategy
        callbackURL: adfsGlob.callbackURL,
        passReqToCallback: true
    }, function (req, accessToken, refreshToken, profile, done) {
        debug('ADFS Authentication');
        var decodedProfile = null;
        // Verify Token with Certificate?
        if (portalGlobals.glob.auth.adfs.verifyCert) {
            try {
                //Decode Oauth token and verify that it has been signed by identity.haufe.com
                decodedProfile = jwt.verify(accessToken, portalGlobals.glob.auth.adfs.publicCert);
                debug('Verified JWT successfully.');
            } catch (ex) {
                debug('JWT Verification failed.');
                return done(null, false, { message: ex });
            }
        }

        debug(decodedProfile);

        reqUtils.get(req, '/groups', function (err, apiResponse, apiBody) {
            if (err) {
                debug('Could not retrieve groups.');
                return done(null, false, { message: err.message });
            }
            if (200 != apiResponse.statusCode)
                return done(null, false, { message: 'Could not retrieve Group information from API. Login not possible. Status: ' + apiResponse.statusCode });

            var apiGroups = reqUtils.getJson(apiBody).groups;
            // Group matching?
            var defaultGroups = matchGroups(decodedProfile.group, apiGroups);

            var userCreateInfo = {
                customId: decodedProfile[adfsGlob.customIdField],
                firstName: decodedProfile[adfsGlob.firstNameField],
                lastName: decodedProfile[adfsGlob.lastNameField],
                validated: true, // In ADFS we trust
                groups: defaultGroups,
                email: decodedProfile[adfsGlob.emailField]
            };

            debug('Calling federate.userLogin()');
            return federate.userLogin(req, userCreateInfo, done);
        });

    });

    adfsStrategy.authorizationParams = function (option) {
        return {
            resource: portalGlobals.glob.auth.adfs.resource //This is the id of the Relying Party Trust in ADFS, it dictates what claims we will receive from the idp.
        };
    };

    adfsStrategy.userProfile = function (accessToken, done) {
        done(null, accessToken);
    };
}

function matchGroups(adfsGroups, apiGroups) {
    debug('matchGroups()');
    var defaultGroups = [];
    if (adfsGroups) {
        for (var i = 0; i < adfsGroups.length; ++i) {
            for (var j = 0; j < apiGroups.length; ++j) {
                var foundAdfsGroup = apiGroups[j].alt_ids.find(function (alt_id) { return alt_id.toLowerCase() == adfsGroups[i].toLowerCase(); });
                if (!foundAdfsGroup)
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

module.exports.setup = function () {
    debug('setup()');
    if (adfsStrategy)
        passport.use('adfs', adfsStrategy);
};