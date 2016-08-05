'use strict';

var express = require('express');
var debug = require('debug')('portal:swagger-ui');
var router = express.Router();
//var request = require('request');
//var reqUtils = require('./requestUtils');
//var passport = require('passport');

/* GET home page. */
router.get('/', function (req, res, next) {
    debug("get('/')");
    res.render('swagger-ui',
        {
            title: req.app.portalGlobals.title + ' - Swagger UI',
            route: '/swagger-ui',
            glob: req.app.portalGlobals,
        });
});

module.exports = router;