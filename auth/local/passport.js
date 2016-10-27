'use strict';

var passport = require('passport');
var debug = require('debug')('portal:auth:local');
var LocalStrategy = require('passport-local').Strategy;
var utils = require('../../routes/utils');
var portalGlobals = require('../../portalGlobals');

var localStrategy = new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
},
    function (req, email, password, done) {
        debug('Local Authentication');
        
        utils.post(req, '/login', { email: email, password: password }, function (err, res, body) {
            var userLoadFinished = function (userResponse, callback) {
                var user = userResponse[0];
                debug('User logged in locally successfully.');
                debug(user);
                return callback(null, user);
            };
            if (err) {
                debug(err);
                return done(err);
            }
            // User known?
            if (res.statusCode === 200) {
                var findUserResponse = utils.getJson(body); // Make sure it's JSON
                debug(findUserResponse);
                // Yes, pass this to the callback:
                userLoadFinished(findUserResponse, done);
            } else {
                debug('Status code not 200 when logging in locally. User probably unknown oder password wrong.');
                return done(null, false, { message: utils.getJson(res.body).message });
            }
        });
    }
);


var signupStrategy = new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
},
    function (req, email, password, done) {
        debug('signupStrategy()');
        var requireValidation = !portalGlobals.glob.auth.local.trustLocal;
        if (portalGlobals.glob.auth.local.trustLocal)
            req.body.validated = !requireValidation;
        utils.post(req, '/users', req.body, function (err, res, body) {
            if (err) {
                return done(err);
            }

            if (res.statusCode === 201) {
                if (requireValidation) {
                    var newVerif = {
                        type: 'email',
                        email: req.body.email
                    };
                    utils.post(req, '/verifications', newVerif, function(err2, res2, body2) {
                        if (err2)
                            return done(err2);
                        if (204 != res2.statusCode) {
                            debug('Strange status code: ' + res2.statusCode);
                            debug(res2);
                            // Hmmm? What should we do here?
                        }
                        return done(null, res.body);
                    });
                } else {
                    return done(null, res.body);
                }
                
            }
            else {
                return done(null, false, { message: utils.getJson(res.body).message });
            }
        });
    }
);

module.exports.setup = function () {
    debug('setup()');
    passport.use('local-signin', localStrategy);
    passport.use('local-signup', signupStrategy);
};