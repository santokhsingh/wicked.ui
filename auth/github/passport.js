'use strict';

var passport = require('passport');
var request = require('request');
var { debug, info, warn, error } = require('portal-env').Logger('portal:auth:github');

var GithubStrategy = require('passport-github2');

var utils = require('../../routes/utils');
var portalGlobals = require('../../portalGlobals');

var federate = require('../federate');

var githubStrategy = null;
if (portalGlobals.glob.auth.github &&
    portalGlobals.glob.auth.github.useGithub) {
    debug('Initializing Github Authentication');
    var githubGlob = portalGlobals.glob.auth.github;

    githubStrategy = new GithubStrategy({
        clientID: githubGlob.clientID,
        clientSecret: githubGlob.clientSecret,
        callbackURL: githubGlob.callbackURL,
        passReqToCallback: true
    }, function (req, accessToken, refreshToken, profile, done) {
        debug('Github Authentication');
        debug(profile);
        // Get the email addresses; they are not included in the OAuth profile directly.
        request.get({
            url: 'https://api.github.com/user/emails',
            headers: {
                'User-Agent': 'wicked API Portal',
                'Authorization': 'Bearer ' + accessToken,
                'Accept': 'application/json'
            }
        }, function (err, apiResponse, apiBody) {
            if (err)
                return done(err);
            debug('Github Email retrieved.');
            debug(apiBody);

            var nameGuess = splitName(profile.displayName, profile.username);
            var email = getEmailData(utils.getJson(apiBody));
            var userCreateInfo = {
                customId: 'Github:' + profile.id,
                firstName: nameGuess.firstName,
                lastName: nameGuess.lastName,
                validated: email.validated,
                email: email.email,
                groups: []
            };

            return federate.userLogin(req, userCreateInfo, done);
        });

    });
}

function splitName(fullName, username) {
    debug('splitName()');
    var name = {
        firstName: null,
        lastName: fullName
    };
    if (!fullName) {
        if (username)
            name.lastName = username;
        else
            name.lastName = 'Unknown';
    } else {
        var spaceIndex = fullName.indexOf(' ');
        if (spaceIndex < 0)
            return name;
        name.firstName = fullName.substring(0, spaceIndex);
        name.lastName = fullName.substring(spaceIndex + 1);
    }
    return name;
}

function getEmailData(emailResponse) {
    debug('getEmailData()');
    var email = {
        email: null,
        validated: false
    };
    var primaryEmail = emailResponse.find(function (emailItem) { return emailItem.primary; });
    if (primaryEmail) {
        email.email = primaryEmail.email;
        email.validated = primaryEmail.verified;
        return email;
    }
    var validatedEmail = emailResponse.find(function (emailItem) { return emailItem.verified; });
    if (validatedEmail) {
        email.email = validatedEmail.email;
        email.validated = validatedEmail.verified;
        return email;
    }
    if (emailResponse.length > 0) {
        var firstEmail = emailResponse[0];
        email.email = firstEmail.email;
        email.validated = firstEmail.verified;
        return email;
    }

    return email;
}

module.exports.setup = function () {
    debug('setup()');
    if (githubStrategy)
        passport.use('github', githubStrategy);
};