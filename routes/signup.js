'use strict';

var express = require('express');
var { debug, info, warn, error } = require('portal-env').Logger('portal:signup');
var router = express.Router();
var request = require('request');
var utils = require('./utils');
var passport = require('passport');

/* GET home page. */
router.get('/', function (req, res, next) {
    debug("get('/')");
    debug(req.session);
    // redirect after login active?
    if (utils.getLoggedInUserId(req) &&
        req.session.redirectAfterLogin) {
        const redirectTarget = req.session.redirectAfterLogin;
        // Reset redirect target so that we don't get nasty loops
        req.session.redirectAfterLogin = null;
        res.redirect(redirectTarget);
    } else {
        res.render('signup',
            {
                route: '/signup',
                authUser: req.user,
                glob: req.app.portalGlobals,
                error: req.flash().error
            });
    }
});

router.post('/', function (req, res, next) {
    debug("post('/')");
    if (!(req.app.portalGlobals.auth.local &&
        req.app.portalGlobals.auth.local.useLocal)) {
        return next();
    }

    var signupLocal = function () {
        // These kinds of lines is why I both love and totally hate JavaScript.
        // passport.authenticate returns a function which takes the below parameters.
        passport.authenticate('local-signup', {
            failureFlash: true,
            failureRedirect: '/login',
            successRedirect: '/signup'
        })(req, res, next);
    };
    // Recaptcha?
    if (req.app.portalGlobals.recaptcha && req.app.portalGlobals.recaptcha.useRecaptcha) {
        var secretKey = req.app.portalGlobals.recaptcha.secretKey;
        var recaptchaResponse = req.body['g-recaptcha-response'];
        request.post({
            url: 'https://www.google.com/recaptcha/api/siteverify',
            formData: {
                secret: secretKey,
                response: recaptchaResponse
            }
        }, function (err, apiResponse, apiBody) {
            if (err)
                return next(err);
            var recaptchaBody = utils.getJson(apiBody);
            if (!recaptchaBody.success) {
                let err = new Error('ReCAPTCHA response invalid - Please try again');
                err.status = 403;
                return next(err);
            }

            signupLocal();
        });
    }
    else {
        signupLocal();
    }
});

/*
router.post('/', passport.authenticate('local-signup', {
        failureFlash: true,
        successRedirect: '/login',
        failureRedirect: '/signup'
     })
);
*/

module.exports = router;
