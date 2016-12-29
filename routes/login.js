'use strict';

var express = require('express');
var debug = require('debug')('portal:login');
var router = express.Router();
var passport = require('passport');
var utils = require('./utils');

/* GET home page. */
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
    res.render('login',
        {
            authUser: req.user,
            glob: req.app.portalGlobals,
            route: '/login',
            displayRedirectMessage: displayRedirectMessage,
            error: req.flash().error
        });
});

router.use('/', require('../auth'));

router.get('/logout', function (req, res) {
    debug("get('/logout')");
    req.logout();
    res.redirect('/');
});

module.exports = router;
