'use strict';

var express = require('express');
var { debug, info, warn, error } = require('portal-env').Logger('portal:login');
var router = express.Router();
var request = require('request');
var qs = require('querystring');
// var passport = require('passport');
var utils = require('./utils');
var wicked = require('wicked-sdk');

/* GET login page. */
router.get('/', function (req, res, next) {
    debug("get('/')");
    var displayRedirectMessage = null;
    if (utils.getLoggedInUserId(req)) {
        req.session.redirectAfterLogin = null;
    } else if (req.query.redirect) {
        // URL has a redirect query parameter
        const redirect = req.query.redirect;
        req.session.redirectAfterLogin = redirect;
        displayRedirectMessage = true;
    }
    debug(JSON.stringify(req.app.authConfig));
    const nonce = utils.createRandomId();
    req.session.authNonce = nonce;
    debug('authNonce: ' + nonce);
    res.render('login', {
        authUser: req.user,
        glob: req.app.portalGlobals,
        route: '/login',
        nonce: nonce,
        authConfig: req.app.authConfig,
        clientId: req.app.clientCredentials.clientId,
        displayRedirectMessage: displayRedirectMessage,
        // error: req.flash().error
    });
});

// router.use('/', require('../auth'));

router.get('/callback', function (req, res, next) {
    debug('callback()');
    const authCode = req.query.code;
    const state = req.query.state;
    debug(req.session);

    if (!authCode)
        return utils.fail(400, 'Callback missing code query parameter.', next);
    if (!state)
        return utils.fail(400, 'Callback missing state.', next);
    if (state.indexOf('-') < 0)
        return utils.fail(400, 'Callback state invalid.', next);
    const stateList = state.split('-');
    if (stateList.length !== 2)
        return utils.fail(400, 'Callback state has an invalid format.', next);
    const authMethodId = stateList[0];
    const authNonce = stateList[1];
    if (authNonce !== req.session.authNonce) {
        debug('nonce mismatch: ' + authNonce + ' vs. ' + req.session.authNonce);
        return utils.fail(403, 'Callback state has an invalid nonce, access denied.', next);
    }

    const authMethod = req.app.authConfig.authMethods.find(am => am.name === authMethodId);
    if (!authMethod)
        return utils.fail(400, 'Callback received an invalid authentication method in state.', next);
    const authServerBase = req.app.authConfig.authServerUrl;
    const tokenUrl = authServerBase + authMethod.config.tokenEndpoint;
    debug('Retrieving token at ' + tokenUrl);
    request.post({
        url: tokenUrl,
        json: true,
        body: {
            grant_type: 'authorization_code',
            client_id: utils.CLIENT_ID,
            client_secret: utils.CLIENT_SECRET,
            code: authCode
        }
    }, function (err, apiRes, apiBody) {
        if (err)
            return next(err);
        const tokenResult = utils.getJson(apiBody);
        debug(tokenResult);
        if (apiRes.statusCode !== 200)
            return utils.fail(apiRes.statusCode, tokenResult.message || 'Could not retrieve an access token.', next);
        // Now also retrieve the profile via the OIDC Profile end point, and
        // the user profile directly from wicked as well please.
        const profileUrl = authServerBase + authMethod.config.profileEndpoint;
        request.get({
            url: profileUrl,
            headers: { Authorization: tokenResult.access_token }
        }, function (err, apiRes, apiBody) {
            if (err)
                return next(err);
            if (apiRes.statusCode !== 200)
                return utils.fail(apiRes.statusCode, 'Could not retrieve the user profile', next);
            debug('Retrieved user profile.');
            const profile = utils.getJson(apiBody);
            debug(profile);
            const userId = profile.sub;
            wicked.apiGet(`/users/${userId}`, userId, function (err, userInfo) {
                if (err) {
                    const statusCode = err.statusCode || 500;
                    return utils.fail(statusCode, 'Failed getting user data from API.', err, next);
                }

                debug('Wicked user profile:');
                debug(userInfo);

                // Note that this is only to make sure the UI behaves; there are some specialties
                // for admins and approvers. There are backend checks for all of these things as well
                // so that this is not very security relevant.
                profile.admin = userInfo.admin;
                profile.approver = userInfo.approver;

                req.session.user = {
                    authMethodId: authMethodId,
                    profile: profile,
                    token: tokenResult
                };
                res.redirect('/');
            });
        });
    });
});

router.get('/logout', function (req, res, next) {
    debug("get('/logout')");
    utils.logoutUser(req, function (err) {
        if (err)
            return next(err);
        const authServerUrl = req.app.authConfig.authServerUrl;
        const portalUrl = qs.escape(wicked.getExternalPortalUrl());

        res.redirect(`${authServerUrl}/logout?redirect_uri=${portalUrl}`);
    });
});

module.exports = router;
