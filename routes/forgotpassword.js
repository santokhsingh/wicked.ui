'use strict';

var express = require('express');
var debug = require('debug')('portal:forgotpassword');
var router = express.Router();
var passport = require('passport');
var request = require('request');
var reqUtils = require('./requestUtils');

/* GET home page. */
router.get('/', function (req, res, next) {
    debug("get('/')");
    res.render('forgotpassword',
        {
            authUser: req.user,
            glob: req.app.portalGlobals,
            route: '/forgotpassword',
            error: req.flash().error
        });
});

router.post('/', function (req, res, next) {
    debug("post('/')");
    var email = req.body.email;
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
            var recaptchaBody = reqUtils.getJson(apiBody);
            if (!recaptchaBody.success) {
                let err = new Error('ReCAPTCHA response invalid - Please try again');
                err.status = 403;
                return next(err);
            }

            return postEmailAndRenderConfirm(req, res, email, next);
        });
    }
    else {
        postEmailAndRenderConfirm(req, res, email, next);
    }
});

function postEmailAndRenderConfirm(req, res, email, next) {
    debug("postEmailAndRenderConfirm()");
    var verif = {
        type: 'lostpassword',
        email: email
    };
    reqUtils.post(req, '/verifications', verif, function (err, apiResponse, apiBody) {
        if (err)
            return next(err);
        if (204 != apiResponse.statusCode)
            return reqUtils.handleError(res, apiResponse, apiBody);
            
        res.render('forgotpassword_confirm',
            {
                authUser: req.user,
                glob: req.app.portalGlobals,
                route: '/forgotpassword',
                error: req.flash().error,
                email: email
            });
    });
}

module.exports = router;
