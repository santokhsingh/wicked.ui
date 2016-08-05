'use strict';

var express = require('express');
var debug = require('debug')('portal:login');
var router = express.Router();
var passport = require('passport');
var reqUtils = require('./requestUtils');

/* GET home page. */
router.get('/', function (req, res, next) {
    debug("get('/')");
    res.render('login',
        {
            authUser: req.user,
            glob: req.app.portalGlobals,
            route: '/login',
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
