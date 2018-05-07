'use strict';

var express = require('express');
var { debug, info, warn, error } = require('portal-env').Logger('portal:verification');
var router = express.Router();
//var async = require('async');
var request = require('request');
var utils = require('./utils');

router.get('/:verificationId', function (req, res, next) {
    debug("get('/:verificationId')");
    var verificationId = req.params.verificationId;
    if (!/^[a-zA-Z0-9]+$/.test(verificationId))
        return res.status(400).jsonp({ message: 'Invalid verification ID.' });
    utils.getFromAsync(req, res, '/verifications/' + verificationId, 200, function (err, verifInfo) {
        if (err)
            return next(err);
        if ("email" == verifInfo.type)
            return handleEmailVerification(req, res, verifInfo);
        else if ("lostpassword" == verifInfo.type)
            return handleLostPassword(req, res, verifInfo, next);
        // Unknown verification, pass on
        next();
    });
});

// For password updates
router.post('/:verificationId', function (req, res, next) {
    debug("post('/:verificationId')");
    var verificationId = req.params.verificationId;
    var password = req.body.password;
    var password2 = req.body.password2;
    if (!password || password.length < 6 || password.length > 24)
        return res.status(400).jsonp({ message: 'Bad Password patch request.' });
    if (password != password2)
        return res.status(400).jsonp({ message: 'Bad password update request. Passwords do not match.' });
    utils.get(req, '/verifications/' + verificationId, function (err, apiResponse, apiBody) {
        if (err)
            return next(err);
        if (200 != apiResponse.statusCode)
            return utils.handleError(res, apiResponse, apiBody, next);
        var verifInfo = utils.getJson(apiBody);
        // Update the user's password now. Use the verification ID to authorize (special case).
        var apiUrl = req.app.get('api_url');
        request.patch({
            url: apiUrl + '/users/' + verifInfo.userId,
            headers: { 'X-VerificationId': verificationId,
                       'Correlation-Id': req.correlationId },
            json: true,
            body: {
                password: password
            }
        }, function (patchErr, patchResponse, patchBody) {
            if (patchErr)
                return next(patchErr);
            if (patchResponse.statusCode > 299)
                return utils.handleError(res, patchResponse, patchBody, next);
            if (!utils.acceptJson(req)) {
                res.render('verification_update_password_success', {
                    title: 'Password Updated',
                    authUser: req.user,
                    glob: req.app.portalGlobals,
                });
            } else {
                res.json({
                    title: 'Password Updated',
                    success: true
                });
            }

            // And delete the verification
            utils.delete(req, '/verifications/' + verificationId, function (err) {
                if (err) {
                    debug(err);
                    return;
                }
            });
        });
    });
});

function handleEmailVerification(req, res, verifInfo, next) {
    debug('handleEmailVerification()');
    // First validate email by patching the user
    var apiUrl = req.app.get('api_url');
    request.patch({
        url: apiUrl + '/users/' + verifInfo.userId,
        headers: { 'X-VerificationId': verifInfo.id,
                   'Correlation-Id': req.correlationId },
        json: true,
        body: {
            validated: true
        }
    }, function (err, apiResponse, apiBody) {
        if (err)
            return next(err);
        // HACK: Update passport's session state
        if (req.session && req.session.passport && req.session.passport.user)
            req.session.passport.user.validated = true;

        if (!utils.acceptJson(req)) {
            res.render('verification_email_success', {
                title: 'Verification Successful',
                authUser: req.user,
                glob: req.app.portalGlobals,
                email: verifInfo.email
            });
        } else {
            res.json({
                title: 'Verification Successful',
                email: verifInfo.email,
                success: true
            });
        }

        // Delete the verification, but ignore what happens with the result
        utils.delete(req, '/verifications/' + verifInfo.id, function (err, apiResponse, apiBody) {
            // Just log any errors in case we have some.
            if (err) {
                error(err);
            }
        });
    });
}

function handleLostPassword(req, res, verifInfo, next) {
    debug('handleLostPassword()');
    // First we'll have to render a nice little form for the user to update his password on
    res.render('verification_update_password', {
        title: 'Specify New Password',
        authUser: req.user,
        glob: req.app.portalGlobals,
        verificationId: verifInfo.id,
        email: verifInfo.id,
        userId: verifInfo.userId
    });
}

module.exports = router;